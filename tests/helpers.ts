import { DDragon } from '../src/main/ddragon';
import type { Match } from '../src/main/riot';

export function testDDragon() {
  const dd = new DDragon();
  dd.setData(
    '15.1.1',
    [
      { id: 62, key: 'MonkeyKing', name: 'Wukong' },
      { id: 103, key: 'Ahri', name: 'Ahri' },
      { id: 64, key: 'LeeSin', name: 'Lee Sin' },
      { id: 266, key: 'Aatrox', name: 'Aatrox' },
      { id: 86, key: 'Garen', name: 'Garen' },
    ],
    [
      [1055, 450], // Doran's Blade
      [3031, 3450], // örnek tam eşya
      [2055, 75], // Kontrol totemi
    ],
  );
  return dd;
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });
}

export function match(id: string, queueId: number, players: { puuid: string; championId: number; win: boolean; k?: number; d?: number; a?: number }[], duration = 1800): Match {
  return {
    metadata: { matchId: id },
    info: {
      queueId,
      gameDuration: duration,
      participants: players.map((p) => ({ puuid: p.puuid, championId: p.championId, win: p.win, kills: p.k ?? 5, deaths: p.d ?? 2, assists: p.a ?? 5 })),
    },
  };
}

/** Riot API'nin küçük bir sahtesi. Gelen tüm yolları kaydeder. */
export function fakeRiot(opts: { spectator?: unknown; failAll?: number } = {}) {
  const calls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const path = url.pathname + url.search;
    calls.push(path);
    if (opts.failAll) return json({ status: { message: 'Forbidden' } }, opts.failAll);
    let m: RegExpExecArray | null;
    if ((m = /^\/lol\/league\/v4\/entries\/by-puuid\/([^/?]+)/.exec(url.pathname))) {
      return json([{ queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', rank: 'II', leaguePoints: 40, wins: 30, losses: 20 }]);
    }
    if ((m = /^\/lol\/match\/v5\/matches\/by-puuid\/([^/]+)\/ids$/.exec(url.pathname))) {
      return json([`TR1_${m[1]}_1`, `TR1_${m[1]}_2`]);
    }
    if ((m = /^\/lol\/match\/v5\/matches\/TR1_(.+)_(\d)$/.exec(url.pathname))) {
      return json(match(`TR1_${m[1]}_${m[2]}`, 420, [{ puuid: m[1], championId: 103, win: m[2] === '1' }]));
    }
    if ((m = /^\/lol\/champion-mastery\/v4\/champion-masteries\/by-puuid\/([^/]+)\/by-champion\/(\d+)$/.exec(url.pathname))) {
      if (m[2] === '86') return json({ status: { message: 'not found' } }, 404);
      return json({ championId: Number(m[2]), championLevel: 7, championPoints: 120000, lastPlayTime: 0 });
    }
    if ((m = /^\/lol\/spectator\/v5\/active-games\/by-summoner\/([^/]+)$/.exec(url.pathname))) {
      return opts.spectator ? json(opts.spectator) : json({ status: { message: 'not found' } }, 404);
    }
    if ((m = /^\/riot\/account\/v1\/accounts\/by-riot-id\/([^/]+)\/([^/]+)$/.exec(url.pathname))) {
      return json({ puuid: `acc-${decodeURIComponent(m[1])}`, gameName: decodeURIComponent(m[1]), tagLine: m[2] });
    }
    return json({ status: { message: 'unknown' } }, 404);
  }) as typeof fetch;
  return { calls, fetchImpl };
}

export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
