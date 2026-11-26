// Tarayıcıda önizleme için sahte veri (npm run preview:mock, ?mock=champ veya ?mock=live).
import type { AppState, PlayerStats, RaphaelBridge, RecentMatch } from '../shared/types';

const V = '15.23.1'; // örnek sürüm; gerçek uygulamada Data Dragon'dan gelir

function recent(pattern: string, champ: string, champId: number): RecentMatch[] {
  return [...pattern].map((c, i) => ({
    matchId: `m${champ}${i}`,
    championId: i % 2 ? 0 : champId,
    championName: i % 2 ? 'Ahri' : champ,
    win: c === 'W',
    kills: 3 + i,
    deaths: 2 + (i % 3),
    assists: 5 + i,
    queueId: 420,
    durationSec: 1800,
  }));
}

function stats(tier: string, div: string, pattern: string, champ: string, champId: number, mastery: number, tags: PlayerStats['tags']): PlayerStats {
  const r = recent(pattern, champ, champId);
  const wins = r.filter((m) => m.win).length;
  return {
    puuid: champ,
    loading: false,
    rankSolo: { queue: 'RANKED_SOLO_5x5', tier, division: div, lp: 47, wins: 61, losses: 52 },
    mastery: mastery ? { championId: champId, level: 7, points: mastery, lastPlayTime: 0 } : null,
    recent: r,
    recentGames: r.length,
    recentWins: wins,
    recentKda: 3.2,
    championGames: 3,
    championWins: 2,
    tags,
  };
}

const champState: AppState = {
  client: 'connected',
  phase: 'ChampSelect',
  hasApiKey: true,
  ddragonVersion: V,
  champSelect: {
    bans: [],
    myTeam: [
      { cellId: 0, championId: 266, championKey: 'Aatrox', championName: 'Aatrox', position: 'TOP', isMe: false, hidden: false, riotId: 'Kılıç#TR1',
        stats: stats('GOLD', 'II', 'WLWWL', 'Aatrox', 266, 182000, [{ kind: 'good', text: 'Main (182k puan)' }]) },
      { cellId: 1, championId: 64, championKey: 'LeeSin', championName: 'Lee Sin', position: 'JUNGLE', isMe: true, hidden: false, riotId: 'cankut#TR1',
        stats: stats('PLATINUM', 'IV', 'WWWLW', 'LeeSin', 64, 64000, [{ kind: 'good', text: '3 galibiyet serisi' }]) },
      { cellId: 2, championId: 103, championKey: 'Ahri', championName: 'Ahri', position: 'MIDDLE', isMe: false, hidden: false, riotId: 'Tilki#0001',
        stats: stats('SILVER', 'I', 'LLLWL', 'Ahri', 103, 4000, [{ kind: 'bad', text: 'Bu şampiyonda deneyimsiz' }, { kind: 'bad', text: '3 maçtır kaybediyor' }]) },
      { cellId: 3, championId: 0, position: 'BOTTOM', isMe: false, hidden: true },
      { cellId: 4, championId: 412, championKey: 'Thresh', championName: 'Thresh', position: 'UTILITY', isMe: false, hidden: false, riotId: 'Fener#TR1',
        stats: { ...stats('GOLD', 'IV', 'WL', 'Thresh', 412, 0, [{ kind: 'info', text: 'Bu sezon az dereceli oynamış' }]), loading: true, recent: [] } },
    ],
    theirTeam: [
      { cellId: 5, championId: 86, championKey: 'Garen', championName: 'Garen', isMe: false, hidden: true },
      { cellId: 6, championId: 0, isMe: false, hidden: true },
      { cellId: 7, championId: 238, championKey: 'Zed', championName: 'Zed', isMe: false, hidden: true },
      { cellId: 8, championId: 0, isMe: false, hidden: true },
      { cellId: 9, championId: 0, isMe: false, hidden: true },
    ],
  },
};

const livePlayers = (team: 'ORDER' | 'CHAOS', champs: [string, string][], tiers: string[]) =>
  champs.map(([key, name], i) => ({
    riotId: `${name}Oyuncu#TR${i}`,
    championName: name,
    championKey: key,
    team,
    level: 9 + i,
    kills: i + (team === 'ORDER' ? 2 : 1),
    deaths: 2,
    assists: 4,
    cs: 90 + i * 10,
    wardScore: 8,
    itemGold: 4200 + i * 300,
    isMe: team === 'ORDER' && i === 1,
    isDead: team === 'CHAOS' && i === 2,
    respawnTimer: team === 'CHAOS' && i === 2 ? 17 : 0,
    stats: stats(tiers[i], 'III', 'WLWLW', key, 0, 0, []),
  }));

const liveState: AppState = {
  client: 'connected',
  phase: 'InProgress',
  hasApiKey: true,
  ddragonVersion: V,
  liveGame: {
    gameTime: 14 * 60 + 23,
    myTeam: 'ORDER',
    players: [
      ...livePlayers('ORDER', [['Aatrox', 'Aatrox'], ['LeeSin', 'Lee Sin'], ['Ahri', 'Ahri'], ['Jinx', 'Jinx'], ['Thresh', 'Thresh']], ['GOLD', 'PLATINUM', 'SILVER', 'GOLD', 'GOLD']),
      ...livePlayers('CHAOS', [['Garen', 'Garen'], ['Vi', 'Vi'], ['Zed', 'Zed'], ['Caitlyn', 'Caitlyn'], ['Lux', 'Lux']], ['SILVER', 'GOLD', 'EMERALD', 'GOLD', 'SILVER']),
    ],
    itemGold: { ORDER: 24000, CHAOS: 22800 },
    kills: { ORDER: 15, CHAOS: 10 },
    objectives: [
      { name: 'Ejderha', nextSpawnAt: 15 * 60 + 40 },
      { name: 'Baron', nextSpawnAt: 20 * 60 },
    ],
  },
};

export function mockBridge(kind: string): RaphaelBridge {
  const s = kind === 'live' ? liveState : kind === 'idle' ? { client: 'disconnected', phase: 'None', hasApiKey: false } as AppState : champState;
  return {
    getState: async () => s,
    reloadEnv: async () => s,
    onState: () => () => undefined,
  };
}
