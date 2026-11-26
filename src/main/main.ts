import { app, BrowserWindow, globalShortcut, ipcMain, screen, shell, type Rectangle } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { AppState } from '../shared/types';
import { DDragon } from './ddragon';
import { Engine } from './engine';
import { buildConfig, loadEnv, type Config } from './env';
import { Lcu, LcuLocator } from './lcu';
import { fetchLiveData } from './live';
import { initLog, log, logFile } from './log';
import { MatchStore } from './matchstore';
import { RiotApi } from './riot';

const MOVE_HOTKEY = 'Control+Shift+F11';
const OVERLAY_SIZE = { width: 340, height: 470 };

let config: Config;
let locator: LcuLocator;
const ddragon = new DDragon();
let lastDdragonAttempt = -Infinity;
let engine: Engine;
let matchStore: MatchStore | undefined;

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let overlayEnabled = true;
let overlayMoving = false;

function loadConfig() {
  const { values, file } = loadEnv([app.getAppPath(), process.cwd(), app.getPath('userData')]);
  config = buildConfig(values, process.env, file);
  locator = new LcuLocator(config.lolPath);
  log('info', `Ayarlar: ${file ?? '.env bulunamadı'}, anahtar ${config.apiKey ? 'var' : 'yok'}, bölge ${config.platform}/${config.region}`);
}

function makeRiot(): RiotApi | null {
  if (!config.apiKey) return null;
  const testBase = process.env.RAPHAEL_RIOT_BASE_URL; // yalnızca otomatik testler için
  return new RiotApi(config.apiKey, {
    platform: config.platform,
    region: config.region,
    baseUrl: testBase ? () => testBase : undefined,
    onResult: (err) => engine.reportApiResult(err),
  });
}

function push(state: AppState) {
  const full: AppState = { ...state, overlayMoving };
  for (const w of [mainWindow, overlayWindow]) {
    if (w && !w.isDestroyed()) w.webContents.send('state', full);
  }
  updateOverlay(state);
}

function updateOverlay(state: AppState) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const shouldShow = overlayMoving || (overlayEnabled && state.game?.stage === 'live');
  if (shouldShow && !overlayWindow.isVisible()) overlayWindow.showInactive();
  if (!shouldShow && overlayWindow.isVisible()) overlayWindow.hide();
}

// ---- Oyun içi pencerenin konumu (kullanıcı taşıyabilir, konum saklanır) ----

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

function loadOverlayBounds(): Rectangle {
  const { workArea } = screen.getPrimaryDisplay();
  const fallback = {
    ...OVERLAY_SIZE,
    x: workArea.x + workArea.width - OVERLAY_SIZE.width - 12,
    y: workArea.y + 120,
  };
  try {
    const saved = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')).overlayBounds as Rectangle | undefined;
    if (saved && screen.getAllDisplays().some((d) => rectInside(saved, d.workArea))) return { ...saved, ...OVERLAY_SIZE };
  } catch {
    // ayar yok
  }
  return fallback;
}

function rectInside(r: Rectangle, area: Rectangle) {
  return r.x >= area.x - 50 && r.y >= area.y - 50 && r.x + 50 <= area.x + area.width && r.y + 50 <= area.y + area.height;
}

function saveOverlayBounds() {
  if (!overlayWindow) return;
  try {
    let current: Record<string, unknown> = {};
    try {
      current = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    } catch {
      // ilk kayıt
    }
    fs.writeFileSync(settingsFile(), JSON.stringify({ ...current, overlayBounds: overlayWindow.getBounds() }, null, 2));
  } catch (e) {
    log('warn', `Pencere konumu kaydedilemedi: ${(e as Error).message}`);
  }
}

function setOverlayMoving(moving: boolean) {
  if (!overlayWindow) return;
  overlayMoving = moving;
  overlayWindow.setIgnoreMouseEvents(!moving);
  overlayWindow.setFocusable(moving);
  if (!moving) saveOverlayBounds();
  push(engine.state);
}

// ---- Pencereler ----

function harden(win: BrowserWindow) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

function loadPage(win: BrowserWindow, query: Record<string, string> = {}) {
  void win.loadFile(path.join(__dirname, '../../dist/index.html'), { query });
}

function createWindows() {
  const webPreferences = {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  };

  mainWindow = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 760,
    minHeight: 520,
    backgroundColor: '#0f1419',
    title: 'Raphael',
    autoHideMenuBar: true,
    webPreferences,
  });
  harden(mainWindow);
  loadPage(mainWindow);
  mainWindow.on('closed', () => {
    mainWindow = null;
    app.quit();
  });

  // Oyun içi pencere: her zaman üstte, tıklamalar oyuna geçer.
  // Tam ekran modda oyunun üstünde görünmez; oyunu "Kenarlıksız" modda açmak gerekir.
  overlayWindow = new BrowserWindow({
    ...loadOverlayBounds(),
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    focusable: false,
    show: false,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences,
  });
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setIgnoreMouseEvents(true);
  harden(overlayWindow);
  loadPage(overlayWindow, { overlay: '1' });
}

function registerHotkeys() {
  globalShortcut.unregisterAll();
  const ok = globalShortcut.register(config.hotkey, () => {
    overlayEnabled = !overlayEnabled;
    updateOverlay(engine.state);
  });
  engine.hotkey = ok ? config.hotkey : undefined;
  if (!ok) log('warn', `Kısayol kaydedilemedi (başka bir uygulama kullanıyor olabilir): ${config.hotkey}`);
  if (!globalShortcut.register(MOVE_HOTKEY, () => setOverlayMoving(!overlayMoving))) {
    log('warn', `Taşıma kısayolu kaydedilemedi: ${MOVE_HOTKEY}`);
  }
}

async function maybeLoadDdragon() {
  if (ddragon.loaded || Date.now() - lastDdragonAttempt < 60_000) return;
  lastDdragonAttempt = Date.now();
  try {
    await ddragon.load();
    log('info', `Data Dragon yüklendi (${ddragon.version})`);
    engine.render();
  } catch (e) {
    log('warn', `Data Dragon yüklenemedi, 1 dk sonra tekrar denenecek: ${(e as Error).message}`);
  }
}

async function loop() {
  await engine.poll();
  void maybeLoadDdragon();
  setTimeout(loop, engine.inGame ? 1000 : 2000);
}

// Otomatik testler ayrı bir ayar klasörü kullanır.
if (process.env.RAPHAEL_USER_DATA) app.setPath('userData', process.env.RAPHAEL_USER_DATA);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    initLog(app.getPath('userData'));
    log('info', `Raphael ${app.getVersion()} başladı`);
    loadConfig();

    matchStore = new MatchStore(path.join(app.getPath('userData'), 'match-cache.json'));
    log('info', `Maç önbelleği: ${matchStore.size} maç`);
    engine = new Engine({
      ddragon,
      matchStore,
      findLcu: (allowProcessQuery) => locator.find(allowProcessQuery),
      makeLcu: (c) => new Lcu(c),
      fetchLive: fetchLiveData,
      onState: push,
      debugDir: config.debug ? path.join(app.getPath('userData'), 'debug') : undefined,
    });
    engine.setRiot(makeRiot());

    ipcMain.handle('state:get', () => ({ ...engine.state, overlayMoving }));
    ipcMain.handle('env:reload', async () => {
      loadConfig();
      engine.setRiot(makeRiot());
      registerHotkeys();
      await engine.poll();
      return { ...engine.state, overlayMoving };
    });
    ipcMain.handle('log:open', () => {
      const f = logFile();
      if (f) void shell.openPath(f);
    });

    createWindows();
    registerHotkeys();
    void loop();
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    matchStore?.flush();
  });
}
