import type { LiveGameState, LivePlayer, ObjectiveTimer, TeamSide } from '../shared/types';
import type { DDragon } from './ddragon';
import { localGet } from './http';

// Live Client Data API: oyun açıkken Riot'un kendi bilgisayarında açtığı salt okunur API.
export const LIVE_PORT = 2999;

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
  activePlayer: { riotId?: string; summonerName?: string };
  allPlayers: LiveApiPlayer[];
  events: { Events: LiveEvent[] };
  gameData: { gameTime: number; gameMode?: string };
}

export function fetchLiveData(): Promise<LiveAllGameData> {
  return localGet<LiveAllGameData>(LIVE_PORT, '/liveclientdata/allgamedata', undefined, 1500);
}

// Tahmini değerler: Riot bunları yamalarla değiştirebiliyor, gerekirse buradan güncelle.
export const OBJECTIVE_RULES = {
  dragon: { firstSpawn: 5 * 60, respawn: 5 * 60 },
  baron: { firstSpawn: 20 * 60, respawn: 6 * 60 },
};

export function objectiveTimers(events: LiveEvent[], gameTime: number): ObjectiveTimer[] {
  const last = (name: string) =>
    events.filter((e) => e.EventName === name).reduce<number | null>((t, e) => Math.max(t ?? 0, e.EventTime), null);
  const next = (rule: { firstSpawn: number; respawn: number }, lastKill: number | null) => {
    const at = lastKill === null ? rule.firstSpawn : lastKill + rule.respawn;
    return at > gameTime ? at : null; // null: şu an haritada (ya da zamanı geçti)
  };
  return [
    { name: 'Ejderha', nextSpawnAt: next(OBJECTIVE_RULES.dragon, last('DragonKill')) },
    { name: 'Baron', nextSpawnAt: next(OBJECTIVE_RULES.baron, last('BaronKill')) },
  ];
}

export function playerRiotId(p: { riotId?: string; riotIdGameName?: string; riotIdTagLine?: string; summonerName?: string }) {
  if (p.riotId) return p.riotId;
  if (p.riotIdGameName && p.riotIdTagLine) return `${p.riotIdGameName}#${p.riotIdTagLine}`;
  return p.summonerName ?? '';
}

export function buildLiveState(data: LiveAllGameData, ddragon?: DDragon): LiveGameState {
  const meId = playerRiotId(data.activePlayer);
  const players: LivePlayer[] = data.allPlayers.map((p) => {
    const riotId = playerRiotId(p);
    const champ = ddragon?.championFromLive(p.rawChampionName, p.championName);
    return {
      riotId,
      championName: champ?.name ?? p.championName,
      championKey: champ?.key,
      team: p.team,
      level: p.level,
      kills: p.scores.kills,
      deaths: p.scores.deaths,
      assists: p.scores.assists,
      cs: p.scores.creepScore,
      wardScore: Math.round(p.scores.wardScore),
      // Tahmin: "price" alanının eşyanın toplam fiyatı olduğunu varsayıyoruz.
      itemGold: p.items.reduce((s, i) => s + i.price * Math.max(1, i.count), 0),
      isMe: riotId === meId || p.summonerName === data.activePlayer.summonerName,
      isDead: p.isDead,
      respawnTimer: p.respawnTimer,
      position: p.position || undefined,
    };
  });
  const me = players.find((p) => p.isMe);
  const sum = (team: TeamSide, f: (p: LivePlayer) => number) =>
    players.filter((p) => p.team === team).reduce((s, p) => s + f(p), 0);
  return {
    gameTime: data.gameData.gameTime,
    myTeam: me?.team ?? 'ORDER',
    players,
    itemGold: { ORDER: sum('ORDER', (p) => p.itemGold), CHAOS: sum('CHAOS', (p) => p.itemGold) },
    kills: { ORDER: sum('ORDER', (p) => p.kills), CHAOS: sum('CHAOS', (p) => p.kills) },
    objectives: objectiveTimers(data.events?.Events ?? [], data.gameData.gameTime),
  };
}
