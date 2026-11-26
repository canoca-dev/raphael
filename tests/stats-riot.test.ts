import { describe, expect, it } from 'vitest';
import { RateLimiter, RiotApi, RiotError } from '../src/main/riot';
import { buildTags, Cached, statsQueueFor, StatsService, summarizeRecent, toRank, toRecentMatch } from '../src/main/stats';
import type { RecentMatch } from '../src/shared/types';
import { fakeRiot, json, match, wait } from './helpers';

const m = (win: boolean, championId = 103, k = 5, d = 2, a = 5, remake = false): RecentMatch => ({
  matchId: Math.random().toString(),
  championId,
  win,
  remake,
  kills: k,
  deaths: d,
  assists: a,
  queueId: 420,
  durationSec: 1800,
});

describe('istatistik hesapları', () => {
  it('maçtan oyuncuyu çıkarır, remake işaretler', () => {
    const r = toRecentMatch('p1', match('TR1_1', 420, [{ puuid: 'p2', championId: 1, win: false }, { puuid: 'p1', championId: 103, win: true, k: 7, d: 1, a: 3 }]), (id) => (id === 103 ? 'Ahri' : undefined));
    expect(r).toMatchObject({ matchId: 'TR1_1', championKey: 'Ahri', win: true, kills: 7, remake: false });
    expect(toRecentMatch('p1', match('TR1_2', 420, [{ puuid: 'p1', championId: 1, win: false }], 200))!.remake).toBe(true);
    expect(toRecentMatch('yok', match('x', 420, []))).toBeNull();
  });

  it('remake maçlar kazanma oranına ve KDA\'ya girmez', () => {
    const s = summarizeRecent([m(true), m(false, 1), m(true), m(false, 103, 0, 9, 0, true)], 103);
    expect(s).toMatchObject({ recentGames: 3, recentWins: 2, championGames: 2, championWins: 2 });
    expect(s.recentKda).toBeCloseTo(30 / 6);
    expect(summarizeRecent([]).recentKda).toBe(0);
  });

  it('kuyruk filtresi yalnızca dereceli ve ARAM için', () => {
    expect(statsQueueFor(420)).toBe(420);
    expect(statsQueueFor(440)).toBe(440);
    expect(statsQueueFor(450)).toBe(450);
    expect(statsQueueFor(400)).toBeUndefined();
    expect(statsQueueFor(undefined)).toBeUndefined();
  });

  it('rank seçer', () => {
    const entries = [{ queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', rank: 'II', leaguePoints: 40, wins: 10, losses: 9 }];
    expect(toRank(entries, 'RANKED_SOLO_5x5')).toMatchObject({ tier: 'GOLD', division: 'II', lp: 40 });
    expect(toRank(entries, 'RANKED_FLEX_SR')).toBeUndefined();
    expect(toRank(undefined, 'RANKED_SOLO_5x5')).toBeUndefined();
  });

  it('etiketler: hiç oynamamış, kayıp serisi, derecesiz', () => {
    const texts = buildTags({ recent: [m(false), m(false), m(false), m(true)], mastery: null, championId: 103, rankedQueue: true }).map((t) => t.text);
    expect(texts).toEqual(['Bu şampiyonu hiç oynamamış', 'Son 3 maçını kaybetti', 'Bu kuyrukta derecesi yok']);
  });

  it('etiketler: main, seri, KDA, sezon oranı; remake seriyi bozmaz', () => {
    const tags = buildTags({
      recent: [m(true), m(false, 103, 0, 0, 0, true), m(true), m(true), m(true), m(true)],
      mastery: { championId: 103, level: 7, points: 250_000, lastPlayTime: 0 },
      rank: { queue: 'RANKED_SOLO_5x5', tier: 'GOLD', division: 'I', lp: 0, wins: 30, losses: 15 },
      rankedQueue: true,
      championId: 103,
    });
    expect(tags.map((t) => t.text)).toEqual(['Main (250k puan)', '5 galibiyet serisi', 'Yüksek KDA (5.0)', 'Sezonda %67 kazanıyor']);
  });

  it('normal kuyrukta derecesiz olmak etiket üretmez', () => {
    expect(buildTags({ recent: [], rankedQueue: false })).toEqual([]);
  });
});

describe('önbellek', () => {
  it('aynı anahtar için tek istek atar, hatadan 30 sn sonra yeniden dener', async () => {
    let now = 0;
    let calls = 0;
    let fail = true;
    const c = new Cached<number>(60_000, () => undefined, () => now);
    const load = async () => {
      calls++;
      if (fail) throw new Error('hata');
      return 42;
    };
    c.get('a', load);
    c.get('a', load);
    await wait(0);
    expect(calls).toBe(1);
    expect(c.get('a', load).error).toBe('hata');
    now += 10_000;
    c.get('a', load);
    expect(calls).toBe(1);
    now += 25_000;
    fail = false;
    c.get('a', load);
    await wait(0);
    expect(calls).toBe(2);
    expect(c.get('a', load).data).toBe(42);
  });
});

describe('Riot API istemcisi', () => {
  it('hız sınırını aşınca bekler', async () => {
    let now = 0;
    const waits: number[] = [];
    const rl = new RateLimiter(2, 100, () => now, async (ms) => {
      waits.push(ms);
      now += ms;
    });
    await rl.take();
    await rl.take();
    await rl.take();
    expect(waits.length).toBe(1);
    expect(now).toBeGreaterThanOrEqual(1000);
  });

  it('anahtar hatasını anlaşılır mesaja çevirir ve bildirir', async () => {
    const { fetchImpl } = fakeRiot({ failAll: 403 });
    const results: (RiotError | undefined)[] = [];
    const api = new RiotApi('RGAPI-x', { fetchImpl, baseUrl: () => 'http://riot.test', onResult: (e) => results.push(e) });
    await expect(api.leagueEntries('p')).rejects.toThrow(/anahtarı geçersiz/);
    expect(results[0]?.status).toBe(403);
  });

  it('429 alınca bekleyip tekrar dener', async () => {
    let n = 0;
    const fetchImpl = (async () => (n++ === 0 ? json({}, 429, { 'retry-after': '0.01' }) : json([]))) as typeof fetch;
    const api = new RiotApi('RGAPI-x', { fetchImpl, baseUrl: () => 'http://riot.test' });
    await expect(api.leagueEntries('p')).resolves.toEqual([]);
    expect(n).toBe(2);
  });

  it('404: ustalık yoksa null, aktif maç yoksa null', async () => {
    const { fetchImpl, calls } = fakeRiot();
    const api = new RiotApi('RGAPI-x', { fetchImpl, baseUrl: () => 'http://riot.test' });
    expect(await api.masteryByChampion('p', 86)).toBeNull();
    expect(await api.activeGame('p')).toBeNull();
    await api.matchIds('p', 8, 420);
    expect(calls.at(-1)).toBe('/lol/match/v5/matches/by-puuid/p/ids?start=0&count=8&queue=420');
  });

  it('istatistik servisi kuyruğa göre çeker ve maçları paylaşır', async () => {
    const { fetchImpl, calls } = fakeRiot();
    const api = new RiotApi('RGAPI-x', { fetchImpl, baseUrl: () => 'http://riot.test' });
    let updates = 0;
    const svc = new StatsService(api, () => updates++, (id) => (id === 103 ? 'Ahri' : undefined));
    expect(svc.get('p1', 103, 420).loading).toBe(true);
    await wait(50);
    const s = svc.get('p1', 103, 420);
    expect(s).toMatchObject({ loading: false, recentGames: 2, recentWins: 1, championGames: 2, recentQueueId: 420 });
    expect(s.rankSolo?.tier).toBe('GOLD');
    expect(s.mastery?.points).toBe(120000);
    expect(s.recent[0].championKey).toBe('Ahri');
    expect(updates).toBeGreaterThan(0);
    expect(calls.filter((c) => c.includes('/ids?')).every((c) => c.endsWith('&queue=420'))).toBe(true);
    const before = calls.length;
    svc.get('p1', 103, 420);
    expect(calls.length).toBe(before); // önbellekten
  });
});
