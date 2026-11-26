// Ana süreç (Electron main) ile arayüz arasında paylaşılan tipler.

export type TeamSide = 'ORDER' | 'CHAOS';

export interface RankInfo {
  queue: string; // RANKED_SOLO_5x5 | RANKED_FLEX_SR
  tier: string; // GOLD, PLATINUM...
  division: string; // I, II, III, IV
  lp: number;
  wins: number;
  losses: number;
}

export interface RecentMatch {
  matchId: string;
  championId: number;
  championName: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  queueId: number;
  durationSec: number;
  endTime?: number;
}

export interface MasteryInfo {
  championId: number;
  level: number;
  points: number;
  lastPlayTime: number;
}

export type PlayerTagKind = 'good' | 'bad' | 'info';
export interface PlayerTag {
  kind: PlayerTagKind;
  text: string;
}

export interface PlayerStats {
  puuid: string;
  loading: boolean;
  rankSolo?: RankInfo;
  rankFlex?: RankInfo;
  mastery?: MasteryInfo | null; // null: bu şampiyonda hiç ustalık yok
  recent: RecentMatch[];
  recentGames: number;
  recentWins: number;
  recentKda: number;
  championGames: number; // son maçlarda seçili şampiyonla oynanan maç
  championWins: number;
  tags: PlayerTag[];
  error?: string;
}

export interface ChampSelectPlayer {
  cellId: number;
  puuid?: string;
  riotId?: string;
  championId: number;
  championKey?: string;
  championName?: string;
  position?: string;
  isMe: boolean;
  hidden: boolean; // Riot ismi gizlediyse (ör. dereceli seçim ekranı)
  stats?: PlayerStats;
}

export interface ChampSelectState {
  myTeam: ChampSelectPlayer[];
  theirTeam: ChampSelectPlayer[];
  bans: number[];
}

export interface LivePlayer {
  riotId: string;
  championName: string;
  championKey?: string;
  team: TeamSide;
  level: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  wardScore: number;
  itemGold: number;
  isMe: boolean;
  isDead: boolean;
  respawnTimer: number;
  position?: string;
  stats?: PlayerStats;
}

export interface ObjectiveTimer {
  name: string;
  // Oyun saniyesi cinsinden bir sonraki doğma zamanı. null: bilinmiyor/artık yok.
  nextSpawnAt: number | null;
}

export interface LiveGameState {
  gameTime: number;
  myTeam: TeamSide;
  players: LivePlayer[];
  itemGold: Record<TeamSide, number>;
  kills: Record<TeamSide, number>;
  objectives: ObjectiveTimer[];
}

export interface AppState {
  client: 'connected' | 'disconnected';
  phase: string;
  hasApiKey: boolean;
  apiError?: string;
  ddragonVersion?: string;
  champSelect?: ChampSelectState;
  liveGame?: LiveGameState;
}

export interface RaphaelBridge {
  getState(): Promise<AppState>;
  onState(cb: (s: AppState) => void): () => void;
  reloadEnv(): Promise<AppState>;
}
