import type { MasteryInfo, PlayerStats, PlayerTag, RankInfo, RecentMatch } from '../shared/types';
import type { MatchStore } from './matchstore';
import type { LeagueEntry, Match, RiotApi } from './riot';

// Kişisel anahtarın sınırı 2 dakikada 100 istek. Yükleme ekranında 10 oyuncu için
// (rank + ustalık + maç listesi + maçlar) bu sınıra sığmak için başkalarına daha az maç bakılır.
export const MY_MATCH_COUNT = 10;
export const OTHERS_MATCH_COUNT = 5;
const TTL_MS = 10 * 60_000;
const MASTERY_TTL_MS = 30 * 60_000;
const ERROR_RETRY_MS = 30_000;
const MAX_CACHED_MATCHES = 600;

export const QUEUE = { SOLO: 420, FLEX: 440, ARAM: 450 } as const;

/** Son maçları hangi kuyruğa göre filtreleyeceğimiz. undefined: tüm kuyruklar. */
export function statsQueueFor(queueId: number | undefined): number | undefined {
  return queueId === QUEUE.SOLO || queueId === QUEUE.FLEX || queueId === QUEUE.ARAM ? queueId : undefined;
}

export function toRecentMatch(puuid: string, match: Match, championKey?: (id: number) => string | undefined): RecentMatch | null {
  const p = match.info.participants.find((x) => x.puuid === puuid);
  if (!p) return null;
  return {
    matchId: match.metadata.matchId,
    championId: p.championId,
    championKey: championKey?.(p.championId),
    win: p.win,
    remake: !!p.gameEndedInEarlySurrender || match.info.gameDuration < 300,
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
    queueId: match.info.queueId,
    durationSec: match.info.gameDuration,
    endTime: match.info.gameEndTimestamp,
  };
}

export function toRank(entries: LeagueEntry[] | undefined, queue: string): RankInfo | undefined {
  const e = entries?.find((x) => x.queueType === queue);
  if (!e) return undefined;
  return { queue, tier: e.tier, division: e.rank, lp: e.leaguePoints, wins: e.wins, losses: e.losses };
}

export function summarizeRecent(recent: RecentMatch[], championId?: number) {
  const played = recent.filter((m) => !m.remake);
  const wins = played.filter((m) => m.win).length;
  const k = played.reduce((s, m) => s + m.kills, 0);
  const d = played.reduce((s, m) => s + m.deaths, 0);
  const a = played.reduce((s, m) => s + m.assists, 0);
  const onChamp = championId ? played.filter((m) => m.championId === championId) : [];
  return {
    recentGames: played.length,
    recentWins: wins,
    recentKda: played.length ? (k + a) / Math.max(1, d) : 0,
    championGames: onChamp.length,
    championWins: onChamp.filter((m) => m.win).length,
  };
}

/** Bir oyuncu için kısa etiketler. Basit kurallar: ipucu verir, karar dikte etmez. */
export function buildTags(input: {
  recent: RecentMatch[];
  mastery?: MasteryInfo | null;
  rank?: RankInfo;
  rankedQueue: boolean;
  championId?: number;
}): PlayerTag[] {
  const tags: PlayerTag[] = [];
  const { mastery, rank, rankedQueue, championId } = input;
  const played = input.recent.filter((m) => !m.remake); // en yeni maç başta

  if (championId) {
    if (mastery === null) tags.push({ kind: 'bad', text: 'Bu şampiyonu hiç oynamamış' });
    else if (mastery && mastery.points < 10_000) tags.push({ kind: 'bad', text: 'Bu şampiyonda az deneyim' });
    else if (mastery && mastery.points >= 100_000)
      tags.push({ kind: 'good', text: `Main (${Math.round(mastery.points / 1000)}k puan)` });
  }

  const streak = (win: boolean) => {
    let n = 0;
    for (const m of played) {
      if (m.win !== win) break;
      n++;
    }
    return n;
  };
  const losses = streak(false);
  const wins = streak(true);
  if (losses >= 3) tags.push({ kind: 'bad', text: `Son ${losses} maçını kaybetti` });
  if (wins >= 3) tags.push({ kind: 'good', text: `${wins} galibiyet serisi` });

  if (played.length >= 5) {
    const s = summarizeRecent(played);
    if (s.recentKda >= 4) tags.push({ kind: 'good', text: `Yüksek KDA (${s.recentKda.toFixed(1)})` });
    else if (s.recentKda < 1.5) tags.push({ kind: 'bad', text: `Düşük KDA (${s.recentKda.toFixed(1)})` });
  }

  if (rank) {
    const games = rank.wins + rank.losses;
    const wr = games ? rank.wins / games : 0;
    if (games >= 20 && wr >= 0.58) tags.push({ kind: 'good', text: `Sezonda %${Math.round(wr * 100)} kazanıyor` });
    if (games >= 20 && wr <= 0.42) tags.push({ kind: 'bad', text: `Sezonda %${Math.round(wr * 100)} kazanıyor` });
    if (games < 10) tags.push({ kind: 'info', text: 'Bu sezon az dereceli oynamış' });
  } else if (rankedQueue) {
    tags.push({ kind: 'info', text: 'Bu kuyrukta derecesi yok' });
  }

  return tags;
}

interface Entry<T> {
  at: number;
  data?: T;
  error?: string;
  pending: boolean;
}

/** Anahtar başına tek istek; süre dolunca yeniler, hatada kısa süre sonra yeniden dener. */
export class Cached<T> {
  private entries = new Map<string, Entry<T>>();

  constructor(
    private ttl: number,
    private onChange: () => void,
    private now: () => number = Date.now,
  ) {}

  get(key: string, load: () => Promise<T>): Entry<T> {
    const cur = this.entries.get(key);
    const age = cur ? this.now() - cur.at : Infinity;
    const fresh = cur && (cur.pending || age < (cur.error ? ERROR_RETRY_MS : this.ttl));
    if (!fresh) {
      this.entries.set(key, { at: this.now(), data: cur?.data, pending: true });
      load()
        .then(
          (data) => this.entries.set(key, { at: this.now(), data, pending: false }),
          (e: Error) => this.entries.set(key, { at: this.now(), data: cur?.data, error: e.message, pending: false }),
        )
        .finally(() => this.onChange());
    }
    return this.entries.get(key)!;
  }

  clear() {
    this.entries.clear();
  }
}

/**
 * Oyuncu istatistiklerini önbellekli çeker. get() senkron çalışır ve eldeki veriyi
 * döndürür; eksik veri arka planda çekilir, gelince onChange çağrılır.
 */
export class StatsService {
  private league: Cached<LeagueEntry[]>;
  private recent: Cached<RecentMatch[]>;
  private mastery: Cached<MasteryInfo | null>;
  private matches = new Map<string, Promise<Match>>();

  constructor(
    private api: RiotApi,
    onChange: () => void,
    private championKey: (id: number) => string | undefined = () => undefined,
    private store?: MatchStore,
  ) {
    this.league = new Cached(TTL_MS, onChange);
    this.recent = new Cached(TTL_MS, onChange);
    this.mastery = new Cached(MASTERY_TTL_MS, onChange);
  }

  get(puuid: string, championId: number | undefined, queueId: number | undefined, matchCount = OTHERS_MATCH_COUNT): PlayerStats {
    const statsQueue = statsQueueFor(queueId);
    const league = this.league.get(puuid, () => this.api.leagueEntries(puuid));
    const recent = this.recent.get(`${puuid}|${statsQueue ?? 'all'}`, () => this.loadRecent(puuid, statsQueue, matchCount));
    const mastery = championId
      ? this.mastery.get(`${puuid}|${championId}`, async () => {
          const m = await this.api.masteryByChampion(puuid, championId);
          return m && { championId: m.championId, level: m.championLevel, points: m.championPoints, lastPlayTime: m.lastPlayTime };
        })
      : undefined;

    const matches = recent.data ?? [];
    const rankSolo = toRank(league.data, 'RANKED_SOLO_5x5');
    const rankFlex = toRank(league.data, 'RANKED_FLEX_SR');
    const rankedQueue = queueId === QUEUE.SOLO || queueId === QUEUE.FLEX;
    return {
      loading: league.pending && !league.data,
      recentLoading: recent.pending && !recent.data,
      error: league.error ?? recent.error ?? mastery?.error,
      rankSolo,
      rankFlex,
      mastery: mastery?.data,
      recentQueueId: statsQueue,
      recent: matches,
      ...summarizeRecent(matches, championId),
      tags:
        league.data && recent.data
          ? buildTags({
              recent: matches,
              mastery: mastery && !mastery.pending ? mastery.data : undefined,
              rank: queueId === QUEUE.FLEX ? rankFlex : rankSolo,
              rankedQueue,
              championId,
            })
          : [],
    };
  }

  private async loadRecent(puuid: string, queueId: number | undefined, count: number): Promise<RecentMatch[]> {
    const ids = await this.api.matchIds(puuid, count, queueId);
    const matches = await Promise.all(ids.map((id) => this.getMatch(id)));
    return matches.map((m) => toRecentMatch(puuid, m, this.championKey)).filter((m): m is RecentMatch => !!m);
  }

  private getMatch(id: string): Promise<Match> {
    const stored = this.store?.get(id);
    if (stored) return Promise.resolve(stored);
    let p = this.matches.get(id);
    if (!p) {
      if (this.matches.size >= MAX_CACHED_MATCHES) {
        const oldest = this.matches.keys().next().value;
        if (oldest) this.matches.delete(oldest);
      }
      p = this.api.match(id);
      p.then(
        (m) => this.store?.put(m),
        () => this.matches.delete(id),
      );
      this.matches.set(id, p);
    }
    return p;
  }
}
