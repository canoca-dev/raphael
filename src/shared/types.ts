// Ana süreç (Electron main) ile arayüz arasında paylaşılan tipler.

export type TeamSide = 'ORDER' | 'CHAOS'; // ORDER = mavi taraf (100), CHAOS = kırmızı taraf (200)

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
  championKey?: string; // Data Dragon görsel adı
  win: boolean;
  remake: boolean;
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
  loading: boolean; // rank henüz gelmedi
  recentLoading: boolean; // son maçlar henüz gelmedi
  error?: string;
  rankSolo?: RankInfo;
  rankFlex?: RankInfo;
  mastery?: MasteryInfo | null; // null: bu şampiyonu hiç oynamamış; undefined: bilinmiyor
  recentQueueId?: number; // son maçlar bu kuyruğa göre filtrelendiyse
  recent: RecentMatch[]; // en yeni maç başta
  recentGames: number; // remake'ler hariç
  recentWins: number;
  recentKda: number;
  championGames: number; // son maçlarda bu şampiyonla
  championWins: number;
  tags: PlayerTag[];
}

/** Seçim ekranındaki bir oyuncu. Riot'un gizlediği oyuncuların kimliği ve verisi hiç tutulmaz. */
export interface ChampSelectPlayer {
  cellId: number;
  label: string; // Riot ID ya da "Takım arkadaşı 3"
  revealed: boolean;
  isMe: boolean;
  championId: number;
  championKey?: string;
  championName?: string;
  position?: string;
  stats?: PlayerStats;
}

export interface ChampSelectState {
  queueId?: number;
  anonymous: boolean; // dereceli kuyruk: yalnızca sen ve grubun görünür
  myTeam: ChampSelectPlayer[];
  theirPicks: { cellId: number; championId: number; championKey?: string; championName?: string }[];
  bans: { championId: number; championKey?: string; championName?: string }[];
}

export interface LivePlayerStats {
  level: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  wardScore: number;
  itemGold: number;
  isDead: boolean;
  respawnTimer: number;
}

export interface GamePlayer {
  riotId: string;
  team: TeamSide;
  isMe: boolean;
  championId: number;
  championKey?: string;
  championName?: string;
  position?: string;
  stats?: PlayerStats;
  live?: LivePlayerStats;
}

export interface ObjectiveTimer {
  name: string;
  // Oyun saniyesi cinsinden bir sonraki doğma zamanı. null: haritada ya da bilinmiyor.
  nextSpawnAt: number | null;
}

export interface GameState {
  stage: 'loading' | 'live'; // loading: yükleme ekranı, live: oyun başladı
  queueId?: number;
  myTeam: TeamSide;
  players: GamePlayer[];
  gameTime?: number;
  itemGold?: Record<TeamSide, number>;
  kills?: Record<TeamSide, number>;
  objectives?: ObjectiveTimer[];
}

/**
 * none: anahtar yok, checking: deneniyor, ok: çalışıyor, invalid: Riot reddetti (geçersiz ya da süresi dolmuş),
 * offline: Riot'a ulaşılamadı, unknown: Riot hata verdi, sonuç belli değil.
 */
export type KeyStatus = 'none' | 'checking' | 'ok' | 'invalid' | 'offline' | 'unknown';

/** Uygulamanın kendi durumu ve ayarları (client ve oyundan bağımsız). */
export interface AppInfo {
  version: string;
  packaged: boolean; // kurulum dosyasıyla kurulmuş mu (otomatik başlatma ve güncelleme yalnız bunda çalışır)
  key: {
    status: KeyStatus;
    masked?: string; // RGAPI-1234…abcd
    source?: 'settings' | 'env';
    savedAt?: number;
    notice?: string; // ör. "Panodaki yeni anahtar alındı"
  };
  hotkey: string; // oyun içi pencereyi aç/kapat (Electron biçimi)
  hotkeyActive: boolean; // şu an kayıtlı mı (yalnız oyun sırasında kaydedilir)
  hotkeyError?: string;
  openAtLogin: boolean;
  showOnChampSelect: boolean;
  update?: { state: 'downloading' | 'ready'; version: string };
}

export interface AppState {
  client: 'connected' | 'disconnected';
  phase: string;
  hasApiKey: boolean;
  apiError?: string;
  ddragonVersion?: string;
  overlayMoving?: boolean; // oyun içi pencere taşıma modunda
  champSelect?: ChampSelectState;
  game?: GameState;
  app?: AppInfo;
}

export interface ActionResult {
  ok: boolean;
  message?: string;
}

export interface AppOptions {
  openAtLogin?: boolean;
  showOnChampSelect?: boolean;
}

export interface RaphaelBridge {
  getState(): Promise<AppState>;
  onState(cb: (s: AppState) => void): () => void;
  /** Sistem tepsisindeki "Ayarlar" ya da bildirime tıklanınca. */
  onOpenSettings(cb: () => void): () => void;
  saveKey(key: string): Promise<ActionResult>;
  pasteKey(): Promise<ActionResult>;
  clearKey(): Promise<void>;
  recheckKey(): Promise<void>;
  setHotkey(accelerator: string): Promise<ActionResult>;
  setOptions(options: AppOptions): Promise<void>;
  openRiotPortal(): Promise<void>;
  toggleOverlayMove(): Promise<void>;
  installUpdate(): Promise<void>;
  openLog(): Promise<void>;
}
