import type { MasteryInfo, PlayerStats, PlayerTag, RankInfo, RecentMatch } from '../shared/types';
import type { LeagueEntry, Match, RiotApi } from './riot';

export const RECENT_MATCH_COUNT = 5;
const BASE_TTL_MS = 10 * 60_000;

export function toRecentMatch(puuid: string, match: Match): RecentMatch | null {
  const p = match.info.participants.find((x) => x.puuid === puuid);
  if (!p) return null;
  return {
    matchId: match.metadata.matchId,
    championId: p.championId,
    championName: p.championName,
    win: p.win,
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
    queueId: match.info.queueId,
    durationSec: match.info.gameDuration,
    endTime: match.info.gameEndTimestamp,
  };
}

export function toRank(entries: LeagueEntry[], queue: string): RankInfo | undefined {
  const e = entries.find((x) => x.queueType === queue);
  if (!e) return undefined;
  return { queue, tier: e.tier, division: e.rank, lp: e.leaguePoints, wins: e.wins, losses: e.losses };
}

export function summarizeRecent(recent: RecentMatch[], championId?: number) {
  const wins = recent.filter((m) => m.win).length;
  const k = recent.reduce((s, m) => s + m.kills, 0);
  const d = recent.reduce((s, m) => s + m.deaths, 0);
  const a = recent.reduce((s, m) => s + m.assists, 0);
  const onChamp = championId ? recent.filter((m) => m.championId === championId) : [];
  return {
    recentGames: recent.length,
    recentWins: wins,
    recentKda: recent.length ? (k + a) / Math.max(1, d) : 0,
    championGames: onChamp.length,
    championWins: onChamp.filter((m) => m.win).length,
  };
}

/** Bir oyuncu için kısa uyarı/övgü etiketleri. Basit kurallar, öneri değil ipucu. */
export function buildTags(input: {
  recent: RecentMatch[];
  mastery?: MasteryInfo | null;
  rankSolo?: RankInfo;
  championId?: number;
}): PlayerTag[] {
  const tags: PlayerTag[] = [];
  const { recent, mastery, rankSolo, championId } = input;

  if (championId) {
    if (mastery === null || (mastery && mastery.points < 10_000)) {
      tags.push({ kind: 'bad', text: 'Bu şampiyonda deneyimsiz' });
    } else if (mastery && mastery.points >= 100_000) {
      tags.push({ kind: 'good', text: `Main (${Math.round(mastery.points / 1000)}k puan)` });
    }
  }

  // recent en yeni maç başta gelir
  const streak = (win: boolean) => {
    let n = 0;
    for (const m of recent) {
      if (m.win !== win) break;
      n++;
    }
    return n;
  };
  const losses = streak(false);
  const wins = streak(true);
  if (losses >= 3) tags.push({ kind: 'bad', text: `${losses} maçtır kaybediyor` });
  if (wins >= 3) tags.push({ kind: 'good', text: `${wins} galibiyet serisi` });

  if (recent.length >= 3) {
    const s = summarizeRecent(recent);
    if (s.recentKda >= 4) tags.push({ kind: 'good', text: `Yüksek KDA (${s.recentKda.toFixed(1)})` });
    else if (s.recentKda < 1.5) tags.push({ kind: 'bad', text: `Düşük KDA (${s.recentKda.toFixed(1)})` });
  }

  if (rankSolo) {
    const games = rankSolo.wins + rankSolo.losses;
    const wr = games ? rankSolo.wins / games : 0;
    if (games >= 20 && wr >= 0.58) tags.push({ kind: 'good', text: `Sezon %${Math.round(wr * 100)} kazanıyor` });
    if (games > 0 && games < 10) tags.push({ kind: 'info', text: 'Bu sezon az dereceli oynamış' });
  } else {
    tags.push({ kind: 'info', text: 'Dereceli sıralaması yok' });
  }

  return tags;
}

interface BaseData {
  rankSolo?: RankInfo;
  rankFlex?: RankInfo;
  recent: RecentMatch[];
}

/**
 * Oyuncu istatistiklerini önbellekli şekilde çeker. get() senkron çalışır ve
 * eldeki veriyi döndürür; eksik veri arka planda çekilir, gelince onUpdate çağrılır.
 */
export class StatsService {
  private base = new Map<string, { at: number; data?: BaseData; error?: string; pending: boolean }>();
  private mastery = new Map<string, { data?: MasteryInfo | null; pending: boolean }>();
  private matches = new Map<string, Promise<Match>>();

  constructor(
    private api: RiotApi,
    private onUpdate: () => void,
    private onApiError: (msg: string) => void,
  ) {}

  get(puuid: string, championId?: number): PlayerStats {
    this.ensureBase(puuid);
    if (championId) this.ensureMastery(puuid, championId);

    const b = this.base.get(puuid);
    const m = championId ? this.mastery.get(`${puuid}:${championId}`) : undefined;
    const recent = b?.data?.recent ?? [];
    const loading = !b?.data && !b?.error ? true : !!(m && m.pending);

    return {
      puuid,
      loading,
      error: b?.error,
      rankSolo: b?.data?.rankSolo,
      rankFlex: b?.data?.rankFlex,
      mastery: m?.data,
      recent,
      ...summarizeRecent(recent, championId),
      tags: b?.data
        ? buildTags({ recent, mastery: m?.pending ? undefined : m?.data, rankSolo: b.data.rankSolo, championId })
        : [],
    };
  }

  private ensureBase(puuid: string) {
    const cur = this.base.get(puuid);
    if (cur && (cur.pending || Date.now() - cur.at < BASE_TTL_MS)) return;
    this.base.set(puuid, { at: Date.now(), data: cur?.data, pending: true });
    this.loadBase(puuid)
      .then((data) => this.base.set(puuid, { at: Date.now(), data, pending: false }))
      .catch((e: Error) => {
        this.base.set(puuid, { at: Date.now(), data: cur?.data, error: e.message, pending: false });
        this.onApiError(e.message);
      })
      .finally(this.onUpdate);
  }

  private async loadBase(puuid: string): Promise<BaseData> {
    const [entries, ids] = await Promise.all([
      this.api.leagueEntries(puuid),
      this.api.matchIds(puuid, RECENT_MATCH_COUNT),
    ]);
    const matches = await Promise.all(ids.map((id) => this.getMatch(id)));
    return {
      rankSolo: toRank(entries, 'RANKED_SOLO_5x5'),
      rankFlex: toRank(entries, 'RANKED_FLEX_SR'),
      recent: matches.map((m) => toRecentMatch(puuid, m)).filter((m): m is RecentMatch => !!m),
    };
  }

  private getMatch(id: string): Promise<Match> {
    let p = this.matches.get(id);
    if (!p) {
      p = this.api.match(id);
      p.catch(() => this.matches.delete(id));
      this.matches.set(id, p);
    }
    return p;
  }

  private ensureMastery(puuid: string, championId: number) {
    const key = `${puuid}:${championId}`;
    if (this.mastery.has(key)) return;
    this.mastery.set(key, { pending: true });
    this.api
      .masteryByChampion(puuid, championId)
      .then((m) =>
        this.mastery.set(key, {
          pending: false,
          data: m && {
            championId: m.championId,
            level: m.championLevel,
            points: m.championPoints,
            lastPlayTime: m.lastPlayTime,
          },
        }),
      )
      .catch((e: Error) => {
        this.mastery.set(key, { pending: false });
        this.onApiError(e.message);
      })
      .finally(this.onUpdate);
  }
}
