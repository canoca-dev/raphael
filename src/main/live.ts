import type { LivePlayerStats, ObjectiveTimer, TeamSide } from '../shared/types';
import type { DDragon } from './ddragon';
import { localGet } from './http';

// Live Client Data API: oyun açıkken Riot'un 127.0.0.1:2999 üzerinde açtığı salt okunur API.
export const LIVE_PORT = Number(process.env.RAPHAEL_LIVE_PORT) || 2999;

export interface LiveItem {
  itemID: number;
  count: number;
  price: number;
}

export interface LiveApiPlayer {
  riotId?: string;
  riotIdGameName?: string;
  riotIdTagLine?: string;
  summonerName?: string;
  championName: string;
  rawChampionName?: string;
  team: TeamSide;
  level: number;
  isBot?: boolean;
  isDead: boolean;
  respawnTimer: number;
  position?: string;
  items: LiveItem[];
  scores: { kills: number; deaths: number; assists: number; creepScore: number; wardScore: number };
}

export interface LiveEvent {
  EventName: string;
  EventTime: number;
  DragonType?: string;
  KillerName?: string;
}

export interface LiveAllGameData {
  activePlayer?: { riotId?: string; riotIdGameName?: string; riotIdTagLine?: string; summonerName?: string };
  allPlayers: LiveApiPlayer[];
  events?: { Events?: LiveEvent[] };
  gameData: { gameTime: number; gameMode?: string };
}

export function fetchLiveData(): Promise<LiveAllGameData> {
  return localGet<LiveAllGameData>(LIVE_PORT, '/liveclientdata/allgamedata', undefined, 1500);
}

export function playerRiotId(p: { riotId?: string; riotIdGameName?: string; riotIdTagLine?: string; summonerName?: string } | undefined) {
  if (!p) return '';
  if (p.riotId) return p.riotId;
  if (p.riotIdGameName && p.riotIdTagLine) return `${p.riotIdGameName}#${p.riotIdTagLine}`;
  return p.summonerName ?? '';
}

export const sameRiotId = (a: string | undefined, b: string | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

// Tahmini değerler (2026 sezonu): Riot bunları sezonlarla değiştirebiliyor, gerekirse buradan güncelle.
export const OBJECTIVE_RULES = {
  dragon: { firstSpawn: 5 * 60, respawn: 5 * 60 },
  elder: { respawn: 6 * 60 }, // ruh alındıktan ya da Kadim öldükten sonra
  baron: { firstSpawn: 20 * 60, respawn: 6 * 60 },
};

/** Ejderha ve Baron için sıradaki doğma zamanı. Ruh alındıysa ejderha yerine Kadim Ejderha gelir. */
export function objectiveTimers(events: LiveEvent[], gameTime: number, teamOf: (killer: string) => TeamSide | undefined): ObjectiveTimer[] {
  const dragons = events.filter((e) => e.EventName === 'DragonKill');
  const lastAt = (list: LiveEvent[]) => (list.length ? Math.max(...list.map((e) => e.EventTime)) : null);

  const elemental = dragons.filter((e) => (e.DragonType ?? '').toLowerCase() !== 'elder');
  const perTeam: Record<TeamSide, number> = { ORDER: 0, CHAOS: 0 };
  for (const d of elemental) {
    const t = d.KillerName ? teamOf(d.KillerName) : undefined;
    if (t) perTeam[t]++;
  }
  const soulTaken = perTeam.ORDER >= 4 || perTeam.CHAOS >= 4;

  const future = (at: number) => (at > gameTime ? at : null);
  const lastDragon = lastAt(dragons);
  const dragon: ObjectiveTimer = soulTaken
    ? { name: 'Kadim Ejderha', nextSpawnAt: lastDragon === null ? null : future(lastDragon + OBJECTIVE_RULES.elder.respawn) }
    : {
        name: 'Ejderha',
        nextSpawnAt: future(lastDragon === null ? OBJECTIVE_RULES.dragon.firstSpawn : lastDragon + OBJECTIVE_RULES.dragon.respawn),
      };

  const lastBaron = lastAt(events.filter((e) => e.EventName === 'BaronKill'));
  const baron: ObjectiveTimer = {
    name: 'Baron',
    nextSpawnAt: future(lastBaron === null ? OBJECTIVE_RULES.baron.firstSpawn : lastBaron + OBJECTIVE_RULES.baron.respawn),
  };
  return [dragon, baron];
}

export function itemGold(items: LiveItem[], ddragon?: DDragon): number {
  return items.reduce((sum, i) => {
    // Data Dragon'daki toplam maliyet; bilinmiyorsa API'nin verdiği fiyat.
    const each = ddragon?.itemTotalGold(i.itemID) ?? i.price ?? 0;
    return sum + each * Math.max(1, i.count || 1);
  }, 0);
}

export function toLiveStats(p: LiveApiPlayer, ddragon?: DDragon): LivePlayerStats {
  return {
    level: p.level,
    kills: p.scores?.kills ?? 0,
    deaths: p.scores?.deaths ?? 0,
    assists: p.scores?.assists ?? 0,
    cs: p.scores?.creepScore ?? 0,
    wardScore: Math.round(p.scores?.wardScore ?? 0),
    itemGold: itemGold(p.items ?? [], ddragon),
    isDead: !!p.isDead,
    respawnTimer: p.respawnTimer ?? 0,
  };
}

/** Aktif oyuncuyu bulur. Eşleşme yoksa undefined (asla herkes "ben" sayılmaz). */
export function findActivePlayer(data: LiveAllGameData): LiveApiPlayer | undefined {
  const me = playerRiotId(data.activePlayer);
  if (me) {
    const byRiotId = data.allPlayers.find((p) => sameRiotId(playerRiotId(p), me));
    if (byRiotId) return byRiotId;
  }
  const name = data.activePlayer?.summonerName;
  return name ? data.allPlayers.find((p) => p.summonerName === name) : undefined;
}
