import type { AppState, ChampSelectState, GameState } from '../shared/types';
import { buildChampSelect } from './champselect';
import type { DDragon } from './ddragon';
import { buildGameState, rosterFromSpectator } from './game';
import type { LcuChampSelectSession, LcuCredentials, LcuGameflowSession, LcuLobby, LcuSummoner } from './lcu';
import { playerRiotId, type LiveAllGameData } from './live';
import { dumpJson, log } from './log';
import { RiotError, type RiotApi, type SpectatorGame } from './riot';
import type { MatchStore } from './matchstore';
import { Cached, MY_MATCH_COUNT, OTHERS_MATCH_COUNT, StatsService } from './stats';

// Uygulamanın beyni: client'ı, oyunu ve Riot API'yi okur, arayüze gidecek durumu üretir.
// Electron'dan bağımsızdır; testlerde sahte client ve sahte API ile çalıştırılır.

export interface LcuLike {
  get<T>(path: string): Promise<T>;
}

export interface EngineDeps {
  ddragon: DDragon;
  findLcu: (allowProcessQuery: boolean) => Promise<LcuCredentials | null>;
  makeLcu: (c: LcuCredentials) => LcuLike;
  fetchLive: () => Promise<LiveAllGameData>;
  onState: (s: AppState) => void;
  matchStore?: MatchStore;
  debugDir?: string;
  now?: () => number;
}

const GAME_PHASES = new Set(['GameStart', 'InProgress', 'Reconnect']);
const SPECTATOR_RETRY_MS = 10_000;

export class Engine {
  private lcu: LcuLike | null = null;
  private riot: RiotApi | null = null;
  private stats: StatsService | null = null;
  private apiError?: string;

  private phase = 'None';
  private me?: { puuid: string; riotId?: string };
  private meChecked = false;
  private queueId?: number;
  private champSelect?: LcuChampSelectSession;
  private partyPuuids = new Set<string>();
  private names = new Map<string, string>(); // yalnızca açık oyuncular: puuid -> Riot ID
  private nameLookups = new Cached<string | null>(60 * 60_000, () => this.scheduleRender());
  private live?: LiveAllGameData;
  private spectator?: { puuid: string; game: SpectatorGame | null; checkedAt: number; pending: boolean };
  private riotIdPuuid = new Cached<string | null>(60 * 60_000, () => this.scheduleRender());

  private polling = false;
  private renderTimer?: ReturnType<typeof setTimeout>;
  private now: () => number;
  state: AppState = { client: 'disconnected', phase: 'None', hasApiKey: false };

  constructor(private deps: EngineDeps) {
    this.now = deps.now ?? Date.now;
  }

  get inGame() {
    return GAME_PHASES.has(this.phase) || !!this.live;
  }

  setRiot(riot: RiotApi | null) {
    this.riot = riot;
    this.apiError = undefined;
    this.riotIdPuuid.clear();
    this.spectator = undefined;
    this.stats = riot
      ? new StatsService(riot, () => this.scheduleRender(), (id) => this.deps.ddragon.champion(id)?.key, this.deps.matchStore)
      : null;
    this.render();
  }

  /** RiotApi her yanıttan sonra bunu çağırır. */
  reportApiResult(err?: RiotError) {
    const next = err && err.status !== 404 ? err.message : undefined;
    if (next !== this.apiError) {
      if (next) log('warn', `Riot API: ${err!.status} ${next}`);
      this.apiError = next;
      this.scheduleRender();
    }
  }

  async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      await this.pollClient();
      await this.pollLive();
      this.pollSpectator();
      this.render();
    } catch (e) {
      log('error', `poll: ${(e as Error).stack ?? e}`);
    } finally {
      this.polling = false;
    }
  }

  private async pollClient() {
    if (!this.lcu) {
      // Oyun sürerken client kapalıysa yalnızca lockfile'a bakılır (PowerShell çalıştırılmaz).
      const creds = await this.deps.findLcu(!this.live);
      if (creds) {
        this.lcu = this.deps.makeLcu(creds);
        log('info', `LoL client bulundu (port ${creds.port})`);
      }
    }
    if (!this.lcu) {
      this.setPhase('None');
      this.champSelect = undefined;
      return;
    }

    try {
      this.setPhase(await this.lcu.get<string>('/lol-gameflow/v1/gameflow-phase'));
    } catch {
      log('info', 'LoL client bağlantısı kapandı');
      this.lcu = null;
      this.meChecked = false;
      this.setPhase('None');
      this.champSelect = undefined;
      return;
    }

    // Her yeni bağlantıda bir kez: hangi hesapla girildiğini öğren.
    if (!this.meChecked) {
      try {
        const s = await this.lcu.get<LcuSummoner>('/lol-summoner/v1/current-summoner');
        if (s.puuid) {
          const riotId = s.gameName ? `${s.gameName}#${s.tagLine ?? ''}` : undefined;
          this.me = { puuid: s.puuid, riotId };
          if (riotId) this.names.set(s.puuid, riotId);
          this.meChecked = true;
        }
      } catch {
        // client henüz giriş yapmamış olabilir, bir sonraki turda tekrar denenir
      }
    }

    if (this.phase === 'ChampSelect' || GAME_PHASES.has(this.phase)) {
      try {
        const session = await this.lcu.get<LcuGameflowSession>('/lol-gameflow/v1/session');
        const q = session.gameData?.queue?.id;
        this.queueId = typeof q === 'number' && q > 0 ? q : undefined;
        if (this.deps.debugDir) dumpJson(this.deps.debugDir, 'gameflow-session', session);
      } catch {
        // kuyruğu bilemezsek seçim ekranında en sıkı kural uygulanır
      }
    } else if (!this.live) {
      this.queueId = undefined;
    }

    if (this.phase === 'ChampSelect') {
      try {
        this.champSelect = await this.lcu.get<LcuChampSelectSession>('/lol-champ-select/v1/session');
        if (this.deps.debugDir) dumpJson(this.deps.debugDir, 'champ-select-session', this.champSelect);
      } catch {
        this.champSelect = undefined;
      }
      try {
        const lobby = await this.lcu.get<LcuLobby>('/lol-lobby/v2/lobby');
        this.partyPuuids = new Set((lobby.members ?? []).map((m) => m.puuid).filter((p): p is string => !!p));
      } catch {
        this.partyPuuids = new Set(); // grup bilgisi yoksa yalnızca kendin görünürsün
      }
    } else {
      this.champSelect = undefined;
    }
  }

  private setPhase(phase: string) {
    if (phase !== this.phase) {
      log('info', `Aşama: ${this.phase} -> ${phase}`);
      this.phase = phase;
    }
  }

  private async pollLive() {
    // Client oyun sırasında kapanmış olabilir; o yüzden client yoksa da oyuna bakılır.
    if (this.lcu && !GAME_PHASES.has(this.phase)) {
      this.live = undefined;
      return;
    }
    try {
      const data = await this.deps.fetchLive();
      this.live = data.allPlayers?.length ? data : undefined;
      if (this.live && this.deps.debugDir) dumpJson(this.deps.debugDir, 'live-allgamedata', this.live);
    } catch {
      this.live = undefined; // oyun yok ya da henüz yükleniyor
    }
  }

  private myPuuid(): string | undefined {
    if (this.me?.puuid) return this.me.puuid;
    const riotId = this.live ? playerRiotId(this.live.activePlayer) : '';
    return riotId ? this.lookupRiotId(riotId) : undefined;
  }

  private pollSpectator() {
    if (!this.inGame) {
      this.spectator = undefined;
      this.riotIdPuuid.clear();
      return;
    }
    const riot = this.riot;
    const puuid = this.myPuuid();
    if (!riot || !puuid) return;
    const cur = this.spectator;
    if (cur && cur.puuid === puuid && (cur.pending || cur.game || this.now() - cur.checkedAt < SPECTATOR_RETRY_MS)) return;

    this.spectator = { puuid, game: cur?.game ?? null, checkedAt: this.now(), pending: true };
    riot
      .activeGame(puuid)
      .then((game) => {
        this.spectator = { puuid, game, checkedAt: this.now(), pending: false };
        log('info', game ? `Aktif maç bulundu (${game.participants.length} oyuncu, kuyruk ${game.gameQueueConfigId})` : 'Aktif maç henüz yok');
      })
      .catch((e: Error) => {
        this.spectator = { puuid, game: null, checkedAt: this.now(), pending: false };
        log('warn', `Aktif maç okunamadı: ${e.message}`);
      })
      .finally(() => this.scheduleRender());
  }

  /** Spectator verisi yoksa Riot ID'den puuid bulur (yalnızca oyun sırasında, isimler açıkken). */
  private lookupRiotId(riotId: string): string | undefined {
    const riot = this.riot;
    const [name, tag] = riotId.split('#');
    if (!riot || !name || !tag) return undefined;
    // Hata olursa Cached 30 sn bekleyip yeniden dener; böylece API'ye yüklenmeyiz.
    const entry = this.riotIdPuuid.get(riotId, async () => {
      try {
        return (await riot.accountByRiotId(name, tag)).puuid;
      } catch (e) {
        if (e instanceof RiotError && e.status === 404) return null; // gerçekten yok
        throw e;
      }
    });
    return entry.data ?? undefined;
  }

  /** Yalnızca açık (gizli olmayan) oyuncuların adını client'tan sorar. */
  private resolveName(puuid: string) {
    const lcu = this.lcu;
    if (!lcu || this.names.has(puuid)) return;
    const entry = this.nameLookups.get(puuid, async () => {
      const s = await lcu.get<LcuSummoner>(`/lol-summoner/v2/summoners/puuid/${encodeURIComponent(puuid)}`);
      return s.gameName ? `${s.gameName}#${s.tagLine ?? ''}` : null;
    });
    if (entry.data) this.names.set(puuid, entry.data);
  }

  /** Kendi maçlarına daha çok, başkalarınınkine daha az bakılır (API sınırı). */
  private matchCount(puuid: string) {
    return puuid === this.me?.puuid ? MY_MATCH_COUNT : OTHERS_MATCH_COUNT;
  }

  scheduleRender() {
    if (this.renderTimer) return;
    this.renderTimer = setTimeout(() => {
      this.renderTimer = undefined;
      this.render();
    }, 150);
  }

  render() {
    const ddragon = this.deps.ddragon;
    let champSelect: ChampSelectState | undefined;
    if (this.champSelect) {
      const { state, revealed } = buildChampSelect(this.champSelect, {
        queueId: this.queueId,
        partyPuuids: this.partyPuuids,
        ddragon,
        names: this.names,
      });
      for (const r of revealed) {
        const player = state.myTeam.find((p) => p.cellId === r.cellId)!;
        if (player.label.startsWith('Takım arkadaşı') || player.label === 'Sen') this.resolveName(r.puuid);
        if (this.stats) player.stats = this.stats.get(r.puuid, r.championId || undefined, this.queueId, this.matchCount(r.puuid));
      }
      champSelect = state;
    }

    let game: GameState | undefined;
    if (this.inGame) {
      const roster = this.spectator?.game ? rosterFromSpectator(this.spectator.game, this.myPuuid()) : [];
      const queueId = this.queueId ?? this.spectator?.game?.gameQueueConfigId;
      const built = buildGameState({
        roster,
        live: this.live,
        queueId,
        ddragon,
        puuidForRiotId: (riotId) => (this.riot ? this.lookupRiotId(riotId) : undefined),
      });
      if (built) {
        if (this.stats) {
          for (const l of built.lookups) {
            built.state.players[l.index].stats = this.stats.get(l.puuid, l.championId || undefined, queueId, this.matchCount(l.puuid));
          }
        }
        game = built.state;
      }
    }

    this.state = {
      client: this.lcu ? 'connected' : 'disconnected',
      phase: this.phase,
      hasApiKey: !!this.riot,
      apiError: this.apiError,
      ddragonVersion: ddragon.version,
      champSelect,
      game,
    };
    this.deps.onState(this.state);
  }
}
