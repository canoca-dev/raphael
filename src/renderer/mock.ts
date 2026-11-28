// Yalnızca geliştirme önizlemesi için sahte veri (npm run preview:mock).
// Adresler: ?mock=champ, ?mock=loading, ?mock=live, ?mock=idle, ?mock=nokey, ?mock=expired;
// oyun içi pencere için &overlay=1, ayarlar için &view=settings
import type { AppInfo, AppState, GamePlayer, PlayerStats, RaphaelBridge, RecentMatch, TeamSide } from '../shared/types';

const V = '15.23.1'; // örnek sürüm; gerçek uygulamada Data Dragon'dan gelir

function recent(pattern: string, key: string, champId: number): RecentMatch[] {
  return [...pattern].map((c, i) => ({
    matchId: `m${key}${i}`,
    championId: i % 2 ? 103 : champId,
    championKey: i % 2 ? 'Ahri' : key,
    win: c === 'W',
    remake: c === 'R',
    kills: 3 + i,
    deaths: 2 + (i % 3),
    assists: 5 + i,
    queueId: 420,
    durationSec: 1800,
  }));
}

function stats(tier: string, div: string, pattern: string, key: string, champId: number, mastery: number, tags: PlayerStats['tags']): PlayerStats {
  const r = recent(pattern, key, champId);
  const played = r.filter((m) => !m.remake);
  return {
    loading: false,
    recentLoading: false,
    rankSolo: { queue: 'RANKED_SOLO_5x5', tier, division: div, lp: 47, wins: 61, losses: 52 },
    rankFlex: { queue: 'RANKED_FLEX_SR', tier: 'SILVER', division: 'II', lp: 12, wins: 8, losses: 9 },
    mastery: mastery ? { championId: champId, level: 7, points: mastery, lastPlayTime: 0 } : null,
    recentQueueId: 420,
    recent: r,
    recentGames: played.length,
    recentWins: played.filter((m) => m.win).length,
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
    queueId: 420,
    anonymous: true,
    myTeam: [
      { cellId: 0, label: 'Takım arkadaşı 1', revealed: false, isMe: false, championId: 266, championKey: 'Aatrox', championName: 'Aatrox', position: 'TOP' },
      {
        cellId: 1, label: 'cankut#TR1', revealed: true, isMe: true, championId: 64, championKey: 'LeeSin', championName: 'Lee Sin', position: 'JUNGLE',
        stats: stats('PLATINUM', 'IV', 'WWWLWRLW', 'LeeSin', 64, 64000, [{ kind: 'good', text: '3 galibiyet serisi' }]),
      },
      {
        cellId: 2, label: 'Duo#TR1', revealed: true, isMe: false, championId: 103, championKey: 'Ahri', championName: 'Ahri', position: 'MIDDLE',
        stats: stats('GOLD', 'I', 'LLLWLWWL', 'Ahri', 103, 4000, [{ kind: 'bad', text: 'Bu şampiyonda az deneyim' }, { kind: 'bad', text: 'Son 3 maçını kaybetti' }]),
      },
      { cellId: 3, label: 'Takım arkadaşı 4', revealed: false, isMe: false, championId: 0, position: 'BOTTOM' },
      { cellId: 4, label: 'Takım arkadaşı 5', revealed: false, isMe: false, championId: 412, championKey: 'Thresh', championName: 'Thresh', position: 'UTILITY' },
    ],
    theirPicks: [
      { cellId: 5, championId: 86, championKey: 'Garen', championName: 'Garen' },
      { cellId: 6, championId: 0 },
      { cellId: 7, championId: 238, championKey: 'Zed', championName: 'Zed' },
      { cellId: 8, championId: 0 },
      { cellId: 9, championId: 0 },
    ],
    bans: [{ championId: 157, championKey: 'Yasuo', championName: 'Yasuo' }],
  },
};

function players(team: TeamSide, champs: [string, string, number][], tiers: string[], live: boolean): GamePlayer[] {
  return champs.map(([key, name, id], i) => ({
    riotId: `${name.replace(' ', '')}Oyuncu#TR${i}`,
    team,
    isMe: team === 'ORDER' && i === 1,
    championId: id,
    championKey: key,
    championName: name,
    stats: stats(tiers[i], 'III', 'WLWLWWLW', key, id, i % 2 ? 150000 : 0, i % 2 ? [{ kind: 'good', text: 'Main (150k puan)' }] : [{ kind: 'bad', text: 'Bu şampiyonu hiç oynamamış' }]),
    live: live
      ? {
          level: 9 + i,
          kills: i + (team === 'ORDER' ? 2 : 1),
          deaths: 2,
          assists: 4,
          cs: 90 + i * 10,
          wardScore: 8,
          itemGold: 4200 + i * 300,
          isDead: team === 'CHAOS' && i === 2,
          respawnTimer: team === 'CHAOS' && i === 2 ? 17 : 0,
        }
      : undefined,
  }));
}

const ORDER: [string, string, number][] = [['Aatrox', 'Aatrox', 266], ['LeeSin', 'Lee Sin', 64], ['Ahri', 'Ahri', 103], ['Jinx', 'Jinx', 222], ['Thresh', 'Thresh', 412]];
const CHAOS: [string, string, number][] = [['Garen', 'Garen', 86], ['Vi', 'Vi', 254], ['Zed', 'Zed', 238], ['Caitlyn', 'Caitlyn', 51], ['Lux', 'Lux', 99]];

function gameState(live: boolean): AppState {
  return {
    client: 'connected',
    phase: 'InProgress',
    hasApiKey: true,
    ddragonVersion: V,
    game: {
      stage: live ? 'live' : 'loading',
      queueId: 420,
      myTeam: 'ORDER',
      players: [
        ...players('ORDER', ORDER, ['GOLD', 'PLATINUM', 'SILVER', 'GOLD', 'GOLD'], live),
        ...players('CHAOS', CHAOS, ['SILVER', 'GOLD', 'EMERALD', 'GOLD', 'SILVER'], live),
      ],
      ...(live
        ? {
            gameTime: 14 * 60 + 23,
            itemGold: { ORDER: 24000, CHAOS: 22800 },
            kills: { ORDER: 15, CHAOS: 10 },
            objectives: [
              { name: 'Ejderha', nextSpawnAt: 15 * 60 + 40 },
              { name: 'Baron', nextSpawnAt: 20 * 60 },
            ],
          }
        : {}),
    },
  };
}

const appInfo = (key: AppInfo['key']['status']): AppInfo => ({
  version: '0.2.0',
  packaged: false,
  key: { status: key, masked: key === 'none' ? undefined : 'RGAPI-1234…ef01', source: 'settings', savedAt: Date.now() - 3600_000 },
  hotkey: 'Control+Z',
  hotkeyActive: false,
  openAtLogin: true,
  showOnChampSelect: true,
});

export function mockBridge(kind: string): RaphaelBridge {
  const base: AppState =
    kind === 'live'
      ? gameState(true)
      : kind === 'loading'
        ? gameState(false)
        : kind === 'idle' || kind === 'nokey' || kind === 'expired'
          ? { client: 'disconnected', phase: 'None', hasApiKey: kind !== 'nokey' }
          : champState;
  const s: AppState = { ...base, app: appInfo(kind === 'nokey' ? 'none' : kind === 'expired' ? 'invalid' : 'ok') };
  const ok = async () => ({ ok: true, message: 'Örnek: işlem yapıldı.' });
  return {
    getState: async () => s,
    onState: () => () => undefined,
    onOpenSettings: () => () => undefined,
    saveKey: ok,
    pasteKey: ok,
    clearKey: async () => undefined,
    recheckKey: async () => undefined,
    setHotkey: async () => ({ ok: true }),
    setOptions: async () => undefined,
    openRiotPortal: async () => undefined,
    toggleOverlayMove: async () => undefined,
    installUpdate: async () => undefined,
    openLog: async () => undefined,
  };
}
