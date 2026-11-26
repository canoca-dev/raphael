import { app, BrowserWindow, globalShortcut, ipcMain, screen } from 'electron';
import path from 'node:path';
import type { AppState, ChampSelectState, LiveGameState } from '../shared/types';
import { buildChampSelect } from './champselect';
import { DDragon } from './ddragon';
import { isUsableKey, loadEnv } from './env';
import { findLcu, Lcu, type LcuChampSelectSession, type LcuSummoner } from './lcu';
import { buildLiveState, fetchLiveData } from './live';
import { RiotApi } from './riot';
import { StatsService } from './stats';

const POLL_MS = 2000;

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let overlayEnabled = true;

let lcu: Lcu | null = null;
let stats: StatsService | null = null;
let riotApi: RiotApi | null = null;
let apiError: string | undefined;
let lolPath: string | undefined;
const ddragon = new DDragon();

const summonerNames = new Map<string, string>(); // puuid -> Ad#Etiket
const pendingNames = new Set<string>();
const riotIdToPuuid = new Map<string, string | null>(); // null: bulunamadı
const pendingRiotIds = new Set<string>();

let state: AppState = { client: 'disconnected', phase: 'None', hasApiKey: false };

function configure() {
  const env = loadEnv([app.getAppPath(), process.cwd(), app.getPath('userData')]);
  lolPath = env.LOL_PATH;
  apiError = undefined;
  const key = env.RIOT_API_KEY ?? process.env.RIOT_API_KEY;
  if (isUsableKey(key)) {
    const api = new RiotApi(key, env.RIOT_PLATFORM || 'tr1', env.RIOT_REGION || 'europe');
    stats = new StatsService(api, () => void tick(false), (msg) => (apiError = msg));
    riotApi = api;
  } else {
    stats = null;
    riotApi = null;
  }
  state = { ...state, hasApiKey: !!stats, apiError };
}

function push() {
  for (const w of [mainWindow, overlayWindow]) {
    if (w && !w.isDestroyed()) w.webContents.send('state', state);
  }
}

function resolveName(puuid: string) {
  if (!lcu || summonerNames.has(puuid) || pendingNames.has(puuid)) return;
  pendingNames.add(puuid);
  lcu
    .get<LcuSummoner>(`/lol-summoner/v2/summoners/puuid/${puuid}`)
    .then((s) => {
      if (s.gameName) summonerNames.set(puuid, `${s.gameName}#${s.tagLine ?? ''}`);
    })
    .catch(() => undefined)
    .finally(() => pendingNames.delete(puuid));
}

function resolveRiotId(riotId: string) {
  if (!riotApi || riotIdToPuuid.has(riotId) || pendingRiotIds.has(riotId)) return;
  const [name, tag] = riotId.split('#');
  if (!name || !tag) return void riotIdToPuuid.set(riotId, null);
  pendingRiotIds.add(riotId);
  riotApi
    .accountByRiotId(name, tag)
    .then((a) => riotIdToPuuid.set(riotId, a.puuid))
    .catch(() => riotIdToPuuid.set(riotId, null))
    .finally(() => {
      pendingRiotIds.delete(riotId);
      void tick(false);
    });
}

async function readChampSelect(): Promise<ChampSelectState | undefined> {
  if (!lcu) return undefined;
  const session = await lcu.get<LcuChampSelectSession>('/lol-champ-select/v1/session');
  for (const p of session.myTeam) if (p.puuid) resolveName(p.puuid);
  const cs = buildChampSelect(session, ddragon, summonerNames);
  if (stats) {
    for (const p of [...cs.myTeam, ...cs.theirTeam]) {
      if (p.puuid) p.stats = stats.get(p.puuid, p.championId || undefined);
    }
  }
  return cs;
}

async function readLiveGame(): Promise<LiveGameState | undefined> {
  let data;
  try {
    data = await fetchLiveData();
  } catch {
    return undefined; // oyun açık değil
  }
  if (!data.allPlayers?.length) return undefined;
  const live = buildLiveState(data, ddragon);
  if (stats) {
    for (const p of live.players) {
      resolveRiotId(p.riotId);
      const puuid = riotIdToPuuid.get(p.riotId);
      const champ = p.championKey ? ddragon.championFromLive(undefined, p.championKey) : undefined;
      if (puuid) p.stats = stats.get(puuid, champ?.id);
    }
  }
  return live;
}

let ticking = false;
async function tick(poll = true) {
  if (ticking) return;
  ticking = true;
  try {
    if (!lcu && poll) {
      const creds = await findLcu(lolPath);
      if (creds) lcu = new Lcu(creds);
    }

    let phase = 'None';
    let client: AppState['client'] = 'disconnected';
    if (lcu) {
      try {
        phase = await lcu.get<string>('/lol-gameflow/v1/gameflow-phase');
        client = 'connected';
      } catch {
        lcu = null; // client kapandı ya da yeniden başladı
      }
    }

    let champSelect: ChampSelectState | undefined;
    if (phase === 'ChampSelect') {
      champSelect = await readChampSelect().catch(() => undefined);
    }
    const liveGame = await readLiveGame();

    state = {
      client,
      phase,
      hasApiKey: !!stats,
      apiError,
      ddragonVersion: ddragon.version,
      champSelect,
      liveGame,
    };
    updateOverlay();
    push();
  } finally {
    ticking = false;
  }
}

function updateOverlay() {
  if (!overlayWindow) return;
  const shouldShow = overlayEnabled && !!state.liveGame;
  if (shouldShow && !overlayWindow.isVisible()) overlayWindow.showInactive();
  if (!shouldShow && overlayWindow.isVisible()) overlayWindow.hide();
}

function loadPage(win: BrowserWindow, query: Record<string, string> = {}) {
  win.loadFile(path.join(__dirname, '../../dist/index.html'), { query });
}

function createWindows() {
  const webPreferences = {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
  };

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 760,
    minHeight: 520,
    backgroundColor: '#0f1419',
    title: 'Raphael',
    autoHideMenuBar: true,
    webPreferences,
  });
  loadPage(mainWindow);
  mainWindow.on('closed', () => {
    mainWindow = null;
    app.quit();
  });

  // Oyun içi pencere: her zaman üstte, tıklamaları oyuna geçirir.
  // Not: tam ekran modda görünmeyebilir, oyunu "Kenarlıksız" modda aç.
  const { workArea } = screen.getPrimaryDisplay();
  const width = 340;
  overlayWindow = new BrowserWindow({
    width,
    height: 470,
    x: workArea.x + workArea.width - width - 12,
    y: workArea.y + 120,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    focusable: false,
    show: false,
    alwaysOnTop: true,
    webPreferences,
  });
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setIgnoreMouseEvents(true);
  loadPage(overlayWindow, { overlay: '1' });
}

app.whenReady().then(async () => {
  configure();
  ipcMain.handle('state:get', () => state);
  ipcMain.handle('env:reload', async () => {
    configure();
    await tick();
    return state;
  });

  createWindows();

  globalShortcut.register('Control+Shift+R', () => {
    overlayEnabled = !overlayEnabled;
    updateOverlay();
  });

  ddragon
    .load()
    .catch(() => undefined) // internet yoksa adlar boş kalır, uygulama yine çalışır
    .finally(() => void tick());

  setInterval(() => void tick(), POLL_MS);
});

app.on('will-quit', () => globalShortcut.unregisterAll());
