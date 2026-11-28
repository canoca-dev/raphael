import {
  app,
  BrowserWindow,
  clipboard,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  safeStorage,
  screen,
  shell,
  Tray,
  type NativeImage,
  type Rectangle,
} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_OVERLAY_HOTKEY, hotkeyProblem, MOVE_HOTKEY, normalizeHotkey } from '../shared/hotkey';
import { RIOT_PORTAL_URL } from '../shared/riot';
import type { ActionResult, AppInfo, AppOptions, AppState, KeyStatus } from '../shared/types';
import { DDragon } from './ddragon';
import { Engine } from './engine';
import { buildConfig, cleanKey, findKeyInText, loadEnv, type Config } from './env';
import { Lcu, LcuLocator } from './lcu';
import { fetchLiveData } from './live';
import { initLog, log, logFile } from './log';
import { MatchStore } from './matchstore';
import { RiotApi, type RiotError } from './riot';
import { maskKey, SettingsStore } from './settings';

const APP_ID = 'com.canoca.raphael';
const OVERLAY_SIZE = { width: 340, height: 470 };
const KEY_CHECK_INTERVAL_MS = 30 * 60_000;
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60_000;
// Windows açılışında --hidden ile başlatılır: pencere açılmaz, sistem tepsisinde bekler.
const startHidden = process.argv.includes('--hidden');

let settings: SettingsStore;
let envConfig: Config;
let locator: LcuLocator;
const ddragon = new DDragon();
let lastDdragonAttempt = -Infinity;
let engine: Engine;
let matchStore: MatchStore | undefined;

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let overlayEnabled = true;
let overlayMoving = false;
let wasInGame = false;
let lastPhase = 'None';
let lastClient: AppState['client'] = 'disconnected';

// Riot API anahtarı
let riot: RiotApi | null = null;
let apiKey: string | undefined;
let keySource: 'settings' | 'env' | undefined;
let keySavedAt: number | undefined;
let keyStatus: KeyStatus = 'none';
let keyNotice: string | undefined;
let keyNoticeTimer: ReturnType<typeof setTimeout> | undefined;
let notifiedInvalidKey: string | undefined;
let rejectedClipboardKey: string | undefined;
let clipboardBusy = false;

// Oyun içi pencere kısayolu: yalnızca oyun sırasında kaydedilir, böylece Ctrl+Z
// oyun dışında diğer programlarda geri alma olarak çalışmaya devam eder.
let hotkey = DEFAULT_OVERLAY_HOTKEY;
let hotkeyActive = false;
let hotkeyError: string | undefined;
let hotkeyRetryAt = 0;

let update: AppInfo['update'];
let installUpdate: () => void = () => undefined;

// ---- Ayarlar ve anahtar ----

function loadEnvConfig() {
  const { values, file, raw } = loadEnv([app.getAppPath(), process.cwd(), app.getPath('userData')]);
  envConfig = buildConfig(values, process.env, file, raw);
  log('info', `.env: ${file ?? 'yok'}, bölge ${envConfig.platform}/${envConfig.region}`);
}

function makeRiot(key: string, report: boolean): RiotApi {
  const testBase = process.env.RAPHAEL_RIOT_BASE_URL; // yalnızca otomatik testler için
  return new RiotApi(key, {
    platform: envConfig.platform,
    region: envConfig.region,
    baseUrl: testBase ? () => testBase : undefined,
    onResult: report ? onRiotResult : undefined,
  });
}

function onRiotResult(err?: RiotError) {
  engine.reportApiResult(err);
  if (!err || err.status === 404) setKeyStatus('ok');
  else if (err.status === 401 || err.status === 403) setKeyStatus('invalid');
}

/** Ayarlardaki anahtar önceliklidir; yoksa .env (geliştirme) kullanılır. */
async function loadKey() {
  const stored = await settings.getApiKey();
  if (stored) applyKey(stored, 'settings', settings.get('apiKey')?.savedAt);
  else applyKey(envConfig.apiKey, envConfig.apiKey ? 'env' : undefined);
}

function applyKey(key: string | undefined, source: 'settings' | 'env' | undefined, savedAt?: number, knownStatus?: KeyStatus) {
  apiKey = key;
  keySource = key ? source : undefined;
  keySavedAt = key ? savedAt : undefined;
  riot = key ? makeRiot(key, true) : null;
  engine.setRiot(riot);
  log('info', `Riot API anahtarı: ${key ? (source === 'settings' ? 'ayarlarda' : '.env içinde') : 'yok'}`);
  if (!key) setKeyStatus('none');
  else if (knownStatus) setKeyStatus(knownStatus);
  else void checkActiveKey(true);
}

async function checkActiveKey(showChecking = false) {
  if (!riot) return;
  const current = riot;
  if (showChecking) setKeyStatus('checking');
  const r = await current.checkKey();
  if (current !== riot) return; // bu sırada anahtar değişti
  setKeyStatus(r === 'ok' ? 'ok' : r === 'invalid' ? 'invalid' : r === 'offline' ? 'offline' : 'unknown');
}

function setKeyStatus(s: KeyStatus) {
  if (s === keyStatus) return;
  keyStatus = s;
  log('info', `Anahtar durumu: ${s}`);
  if (s === 'invalid' && apiKey && notifiedInvalidKey !== apiKey) {
    notifiedInvalidKey = apiKey;
    notify('Riot API anahtarı çalışmıyor', 'Süresi dolmuş olabilir. Yenilemek için tıkla.', () => showMain(true));
  }
  pushApp();
}

function setKeyNotice(text: string | undefined) {
  keyNotice = text;
  clearTimeout(keyNoticeTimer);
  if (text) keyNoticeTimer = setTimeout(() => setKeyNotice(undefined), 20_000);
  pushApp();
}

async function saveKey(input: string): Promise<ActionResult> {
  const key = cleanKey(input);
  if (!key) return { ok: false, message: 'Bu bir Riot API anahtarına benzemiyor. Anahtar "RGAPI-" ile başlar.' };
  const probe = await makeRiot(key, false).checkKey();
  if (probe === 'invalid') {
    return { ok: false, message: 'Riot bu anahtarı kabul etmedi: geçersiz ya da süresi dolmuş. Riot sitesinden yeni anahtar al.' };
  }
  await settings.setApiKey(key);
  rejectedClipboardKey = undefined;
  applyKey(key, 'settings', settings.get('apiKey')?.savedAt, probe === 'ok' ? 'ok' : probe === 'offline' ? 'offline' : 'unknown');
  if (probe === 'offline') return { ok: true, message: "Anahtar kaydedildi. Riot'a şu an ulaşılamadı; internet gelince kullanılacak." };
  if (probe === 'error') return { ok: true, message: 'Anahtar kaydedildi. Riot şu an hata veriyor, birazdan tekrar denenecek.' };
  return { ok: true, message: 'Anahtar çalışıyor ve kaydedildi.' };
}

/**
 * Panodaki anahtarı alır. Anahtar yokken ya da süresi dolmuşken pencere her öne geldiğinde
 * kendiliğinden denenir: kullanıcı Riot sitesinde anahtarı kopyalayıp geri dönünce yeter.
 */
async function takeKeyFromClipboard(manual: boolean): Promise<ActionResult> {
  let text = '';
  try {
    text = await clipboard.readText();
  } catch {
    // pano okunamadı
  }
  const key = findKeyInText(text);
  if (!key) return { ok: false, message: 'Panoda Riot API anahtarı yok. Riot sitesinde anahtarın yanındaki kopyala düğmesine bas.' };
  if (!manual && (key === apiKey || key === rejectedClipboardKey)) return { ok: false };
  if (manual && key === apiKey) return { ok: true, message: 'Panodaki anahtar zaten kullanılıyor.' };
  const result = await saveKey(key);
  if (!result.ok) rejectedClipboardKey = key;
  log('info', `Panodaki anahtar ${result.ok ? 'alındı' : 'çalışmadı'}`);
  if (!manual) setKeyNotice(result.ok ? 'Panodaki yeni anahtar alındı ve çalışıyor.' : 'Panodaki anahtar çalışmıyor; süresi dolmuş olabilir.');
  return result;
}

function maybeTakeKeyFromClipboard() {
  if (clipboardBusy || (keyStatus !== 'none' && keyStatus !== 'invalid')) return;
  clipboardBusy = true;
  void takeKeyFromClipboard(false).finally(() => (clipboardBusy = false));
}

function appInfo(): AppInfo {
  return {
    version: app.getVersion(),
    packaged: app.isPackaged,
    key: { status: keyStatus, masked: maskKey(apiKey), source: keySource, savedAt: keySavedAt, notice: keyNotice },
    hotkey,
    hotkeyActive,
    hotkeyError,
    openAtLogin: settings.get('openAtLogin') ?? true,
    showOnChampSelect: settings.get('showOnChampSelect') ?? true,
    update,
  };
}

// ---- Arayüze durum gönderme ----

function push(state: AppState) {
  const full: AppState = { ...state, overlayMoving, app: appInfo() };
  for (const w of [mainWindow, overlayWindow]) {
    if (w && !w.isDestroyed()) w.webContents.send('state', full);
  }
  updateOverlay(state);
  onTransitions(state);
}

function pushApp() {
  if (engine) push(engine.state);
}

function onTransitions(state: AppState) {
  // Client açıldı: oynamaya başlamadan anahtarı kontrol et, süresi dolduysa hemen haber ver.
  if (state.client === 'connected' && lastClient !== 'connected') void checkActiveKey();
  if (state.phase === 'ChampSelect' && lastPhase !== 'ChampSelect') revealMainWindow();
  lastClient = state.client;
  lastPhase = state.phase;
}

function updateOverlay(state: AppState) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const shouldShow = overlayMoving || (overlayEnabled && state.game?.stage === 'live');
  if (shouldShow && !overlayWindow.isVisible()) overlayWindow.showInactive();
  if (!shouldShow && overlayWindow.isVisible()) overlayWindow.hide();
}

function toggleOverlay() {
  overlayEnabled = !overlayEnabled;
  updateOverlay(engine.state);
}

// ---- Oyun içi pencere kısayolu ----

/** Electron geçersiz bir kısayolda hata fırlatır; bu durumda da yalnızca false döner. */
function registerShortcut(acc: string, cb: () => void): boolean {
  try {
    return globalShortcut.register(acc, cb);
  } catch (e) {
    log('warn', `Kısayol geçersiz: ${acc} (${(e as Error).message})`);
    return false;
  }
}

function syncOverlayHotkey() {
  const want = engine.inGame;
  if (want && !hotkeyActive && Date.now() >= hotkeyRetryAt) {
    hotkeyActive = registerShortcut(hotkey, toggleOverlay);
    const error = hotkeyActive ? undefined : 'Kısayol kaydedilemedi; başka bir program kullanıyor olabilir. Ayarlar\'dan başka bir tuş seç.';
    if (error && error !== hotkeyError) log('warn', `Kısayol kaydedilemedi: ${hotkey}`);
    hotkeyError = error;
    if (!hotkeyActive) hotkeyRetryAt = Date.now() + 10_000;
    pushApp();
  } else if (!want && hotkeyActive) {
    globalShortcut.unregister(hotkey);
    hotkeyActive = false;
    pushApp();
  }
}

function setHotkey(acc: string): ActionResult {
  const problem = hotkeyProblem(acc);
  if (problem) return { ok: false, message: problem };
  if (acc === hotkey) return { ok: true };
  const wasActive = hotkeyActive;
  if (wasActive) globalShortcut.unregister(hotkey);
  hotkeyActive = false;
  // Kaydedilebiliyor mu diye dene; oyunda değilsek hemen bırak.
  if (!registerShortcut(acc, toggleOverlay)) {
    if (wasActive) hotkeyActive = registerShortcut(hotkey, toggleOverlay);
    return { ok: false, message: 'Bu kısayolu başka bir program kullanıyor, başka bir tuş seç.' };
  }
  if (engine.inGame) hotkeyActive = true;
  else globalShortcut.unregister(acc);
  hotkey = acc;
  hotkeyError = undefined;
  hotkeyRetryAt = 0;
  settings.set({ hotkey: acc });
  log('info', `Oyun içi pencere kısayolu: ${acc}`);
  pushApp();
  return { ok: true };
}

// ---- Oyun içi pencerenin konumu (kullanıcı taşıyabilir, konum saklanır) ----

function loadOverlayBounds(): Rectangle {
  const { workArea } = screen.getPrimaryDisplay();
  const fallback = {
    ...OVERLAY_SIZE,
    x: workArea.x + workArea.width - OVERLAY_SIZE.width - 12,
    y: workArea.y + 120,
  };
  const saved = settings.get('overlayBounds');
  if (saved && screen.getAllDisplays().some((d) => rectInside(saved, d.workArea))) return { ...saved, ...OVERLAY_SIZE };
  return fallback;
}

function rectInside(r: Rectangle, area: Rectangle) {
  return r.x >= area.x - 50 && r.y >= area.y - 50 && r.x + 50 <= area.x + area.width && r.y + 50 <= area.y + area.height;
}

function setOverlayMoving(moving: boolean) {
  if (!overlayWindow) return;
  overlayMoving = moving;
  overlayWindow.setIgnoreMouseEvents(!moving);
  overlayWindow.setFocusable(moving);
  if (!moving) settings.set({ overlayBounds: overlayWindow.getBounds() });
  updateTrayMenu();
  pushApp();
}

// ---- Pencereler, sistem tepsisi, bildirimler ----

function assetPath(name: string) {
  return path.join(app.getAppPath(), 'assets', name);
}

function loadImage(name: string, retina?: string): NativeImage {
  try {
    // fs ile okunur: kurulu uygulamada dosyalar app.asar arşivinin içinde.
    const img = nativeImage.createFromBuffer(fs.readFileSync(assetPath(name)));
    if (retina) img.addRepresentation({ scaleFactor: 2, buffer: fs.readFileSync(assetPath(retina)) });
    return img;
  } catch {
    return nativeImage.createEmpty();
  }
}

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
    show: !startHidden,
    backgroundColor: '#0f1419',
    title: 'Raphael',
    icon: loadImage('icon.png'),
    autoHideMenuBar: true,
    webPreferences,
  });
  harden(mainWindow);
  loadPage(mainWindow);
  // Kapatınca uygulama arka planda (sistem tepsisinde) çalışmaya devam eder.
  mainWindow.on('close', (e) => {
    if (quitting || !tray) return;
    e.preventDefault();
    mainWindow?.hide();
    if (!settings.get('trayHintShown')) {
      settings.set({ trayHintShown: true });
      notify('Raphael arka planda çalışıyor', 'Saatin yanındaki simgeden açabilirsin. Tamamen kapatmak için simgeye sağ tıklayıp Çıkış de.');
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (!quitting) app.quit();
  });
  mainWindow.on('focus', maybeTakeKeyFromClipboard);

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

function showMain(openSettings = false) {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  if (openSettings) mainWindow.webContents.send('ui:open-settings');
}

/** Şampiyon seçimi başlayınca pencereyi öne getirir (odağı client'tan çalmadan). */
function revealMainWindow() {
  if (!mainWindow || !(settings.get('showOnChampSelect') ?? true)) return;
  if (!mainWindow.isVisible() || mainWindow.isMinimized()) {
    mainWindow.showInactive();
    mainWindow.moveTop();
  }
}

function createTray() {
  try {
    tray = new Tray(loadImage('tray.png', 'tray@2x.png'));
  } catch (e) {
    log('warn', `Sistem tepsisi simgesi oluşturulamadı: ${(e as Error).message}`);
    tray = null;
    return;
  }
  tray.setToolTip('Raphael');
  tray.on('click', () => showMain());
  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Raphael'i aç", click: () => showMain() },
      { label: 'Ayarlar', click: () => showMain(true) },
      { label: overlayMoving ? 'Oyun içi pencereyi taşımayı bitir' : 'Oyun içi pencereyi taşı', click: () => setOverlayMoving(!overlayMoving) },
      ...(update?.state === 'ready' ? [{ label: `Güncellemeyi kur (${update.version})`, click: () => installUpdate() }] : []),
      { type: 'separator' as const },
      {
        label: 'Çıkış',
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
}

function notify(title: string, body: string, onClick?: () => void) {
  try {
    if (!Notification.isSupported()) return;
    const n = new Notification({ title, body, icon: loadImage('icon.png') });
    if (onClick) n.on('click', onClick);
    n.show();
  } catch (e) {
    log('warn', `Bildirim gösterilemedi: ${(e as Error).message}`);
  }
}

// ---- Windows açılışında başlama ----

function applyLoginItem() {
  if (!app.isPackaged || process.platform !== 'win32') return;
  const openAtLogin = settings.get('openAtLogin') ?? true;
  try {
    app.setLoginItemSettings({ openAtLogin, path: process.execPath, args: ['--hidden'], name: 'Raphael' });
  } catch (e) {
    log('warn', `Otomatik başlatma ayarlanamadı: ${(e as Error).message}`);
  }
}

function setOptions(o: AppOptions) {
  const patch: Partial<{ openAtLogin: boolean; showOnChampSelect: boolean }> = {};
  if (typeof o?.openAtLogin === 'boolean') patch.openAtLogin = o.openAtLogin;
  if (typeof o?.showOnChampSelect === 'boolean') patch.showOnChampSelect = o.showOnChampSelect;
  settings.set(patch);
  if ('openAtLogin' in patch) applyLoginItem();
  pushApp();
}

// ---- Otomatik güncelleme (GitHub Releases) ----

async function initUpdater() {
  if (!app.isPackaged || process.env.RAPHAEL_NO_UPDATE === '1') return;
  try {
    const { autoUpdater } = await import('electron-updater');
    autoUpdater.logger = {
      info: (m: unknown) => log('info', `Güncelleme: ${String(m)}`),
      warn: (m: unknown) => log('warn', `Güncelleme: ${String(m)}`),
      error: (m: unknown) => log('warn', `Güncelleme hatası: ${String(m)}`),
      debug: () => undefined,
    };
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('update-available', (info) => {
      update = { state: 'downloading', version: info.version };
      pushApp();
    });
    autoUpdater.on('update-downloaded', (info) => {
      update = { state: 'ready', version: info.version };
      updateTrayMenu();
      pushApp();
    });
    installUpdate = () => {
      quitting = true;
      autoUpdater.quitAndInstall(true, true);
    };
    const check = () => void autoUpdater.checkForUpdates().catch((e: Error) => log('warn', `Güncelleme denetlenemedi: ${e.message}`));
    check();
    setInterval(check, UPDATE_CHECK_INTERVAL_MS);
  } catch (e) {
    log('warn', `Güncelleyici başlatılamadı: ${(e as Error).message}`);
  }
}

// ---- Ana döngü ----

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
  try {
    await engine.poll();
    const inGame = engine.inGame;
    if (inGame && !wasInGame) overlayEnabled = true; // her oyunda oyun içi pencere yeniden açık başlar
    wasInGame = inGame;
    syncOverlayHotkey();
    void maybeLoadDdragon();
  } catch (e) {
    log('error', `Döngü: ${(e as Error).stack ?? e}`);
  } finally {
    // Bir hata olsa da izlemeye devam et.
    setTimeout(loop, engine.inGame ? 1000 : engine.state.client === 'connected' ? 2000 : 3000);
  }
}

function registerIpc() {
  const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');
  ipcMain.handle('state:get', () => ({ ...engine.state, overlayMoving, app: appInfo() }));
  ipcMain.handle('key:save', (_e, key: unknown) => saveKey(str(key, 500)));
  ipcMain.handle('key:paste', () => takeKeyFromClipboard(true));
  ipcMain.handle('key:clear', async () => {
    await settings.setApiKey(undefined);
    applyKey(envConfig.apiKey, envConfig.apiKey ? 'env' : undefined);
  });
  ipcMain.handle('key:recheck', async () => {
    if (keySource !== 'settings') {
      loadEnvConfig();
      await loadKey();
    } else await checkActiveKey(true);
  });
  ipcMain.handle('hotkey:set', (_e, acc: unknown) => setHotkey(str(acc, 60)));
  ipcMain.handle('options:set', (_e, o: AppOptions) => setOptions(o));
  ipcMain.handle('portal:open', () => shell.openExternal(RIOT_PORTAL_URL));
  ipcMain.handle('overlay:move', () => setOverlayMoving(!overlayMoving));
  ipcMain.handle('update:install', () => installUpdate());
  ipcMain.handle('log:open', () => {
    const f = logFile();
    if (f) void shell.openPath(f);
  });
}

// Otomatik testler ayrı bir ayar klasörü kullanır.
if (process.env.RAPHAEL_USER_DATA) app.setPath('userData', process.env.RAPHAEL_USER_DATA);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Uygulama zaten çalışırken yeniden açılırsa (ör. masaüstü kısayolu) var olan pencereyi göster.
  app.on('second-instance', () => showMain());

  app.whenReady().then(async () => {
    if (process.platform === 'win32') app.setAppUserModelId(APP_ID); // Windows bildirimleri için
    initLog(app.getPath('userData'));
    log('info', `Raphael ${app.getVersion()} başladı${startHidden ? ' (arka planda)' : ''}`);
    settings = new SettingsStore(
      path.join(app.getPath('userData'), 'settings.json'),
      {
        available: () => safeStorage.isAsyncEncryptionAvailable(),
        encrypt: (s) => safeStorage.encryptStringAsync(s),
        decrypt: (b) => safeStorage.decryptStringAsync(b),
      },
      (msg) => log('warn', msg),
    );
    loadEnvConfig();
    hotkey = normalizeHotkey(settings.get('hotkey') ?? envConfig.hotkey);
    if (hotkeyProblem(hotkey)) {
      log('warn', `Kısayol kullanılamıyor (${hotkey}), varsayılana dönüldü: ${DEFAULT_OVERLAY_HOTKEY}`);
      hotkey = DEFAULT_OVERLAY_HOTKEY;
    }
    locator = new LcuLocator([envConfig.lolPath, settings.get('lolDir')]);

    matchStore = new MatchStore(path.join(app.getPath('userData'), 'match-cache.json'));
    log('info', `Maç önbelleği: ${matchStore.size} maç`);
    engine = new Engine({
      ddragon,
      matchStore,
      findLcu: async (allowProcessQuery) => {
        const creds = await locator.find(allowProcessQuery);
        if (creds?.installDir && creds.installDir !== settings.get('lolDir') && creds.installDir !== envConfig.lolPath) {
          settings.set({ lolDir: creds.installDir });
        }
        return creds;
      },
      makeLcu: (c) => new Lcu(c),
      fetchLive: fetchLiveData,
      onState: push,
      debugDir: envConfig.debug ? path.join(app.getPath('userData'), 'debug') : undefined,
    });
    await loadKey();

    registerIpc();
    createWindows();
    createTray();
    applyLoginItem();
    if (!registerShortcut(MOVE_HOTKEY, () => setOverlayMoving(!overlayMoving))) {
      log('warn', `Taşıma kısayolu kaydedilemedi: ${MOVE_HOTKEY}`);
    }
    setInterval(() => void checkActiveKey(), KEY_CHECK_INTERVAL_MS);
    void initUpdater();
    void loop();
  });

  app.on('before-quit', () => {
    quitting = true;
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    matchStore?.flush();
  });
}
