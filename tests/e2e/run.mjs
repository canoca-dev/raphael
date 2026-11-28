// Uçtan uca deneme: gerçek Electron uygulamasını sahte LoL client'ı, sahte oyun
// (Live Client Data) ve sahte Riot API ile çalıştırır, ekran görüntüsü alır.
// Kullanım: npm run build && npm run e2e   (Linux'ta: xvfb-run -a npm run e2e)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'tests/e2e/output');
fs.mkdirSync(outDir, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'raphael-e2e-'));

// ---- Kendinden imzalı sertifika (LCU ve oyun API'si gibi) ----
// Windows'ta openssl PATH'te olmayabilir; Git for Windows'un getirdiği kullanılır.
const opensslCandidates = ['openssl', 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe', 'C:\\Program Files\\OpenSSL\\bin\\openssl.exe'];
const openssl = opensslCandidates.find((c) => {
  try {
    execFileSync(c, ['version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
});
if (!openssl) throw new Error('openssl bulunamadı');
execFileSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=127.0.0.1',
  '-keyout', path.join(tmp, 'key.pem'), '-out', path.join(tmp, 'cert.pem')], { stdio: 'ignore' });
const tls = { key: fs.readFileSync(path.join(tmp, 'key.pem')), cert: fs.readFileSync(path.join(tmp, 'cert.pem')) };

const listen = (server) => new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port)));
const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

// ---- Senaryo verisi ----
const ME = 'puuid-me';
const team = [
  { puuid: ME, riotId: 'cankut#TR1', championId: 64, teamId: 100 },
  { puuid: 'puuid-duo', riotId: 'Duo#TR1', championId: 103, teamId: 100 },
  { puuid: 'puuid-a3', riotId: 'Kilic#TR1', championId: 266, teamId: 100 },
  { puuid: 'puuid-a4', riotId: 'Ok#TR1', championId: 222, teamId: 100 },
  { puuid: 'puuid-a5', riotId: 'Kanca#TR1', championId: 412, teamId: 100 },
  { puuid: 'puuid-e1', riotId: 'Adalet#TR1', championId: 86, teamId: 200 },
  { puuid: 'puuid-e2', riotId: 'Yumruk#TR1', championId: 254, teamId: 200 },
  { puuid: 'puuid-e3', riotId: 'Golge#TR1', championId: 238, teamId: 200 },
  { puuid: 'puuid-e4', riotId: 'Nisanci#TR1', championId: 51, teamId: 200 },
  { puuid: 'puuid-e5', riotId: 'Isik#TR1', championId: 99, teamId: 200 },
];
const HIDDEN = ['puuid-a3', 'puuid-a4', 'puuid-a5', 'puuid-e1', 'puuid-e2', 'puuid-e3', 'puuid-e4', 'puuid-e5'];
const champKeys = { 64: ['LeeSin', 'Lee Sin'], 103: ['Ahri', 'Ahri'], 266: ['Aatrox', 'Aatrox'], 222: ['Jinx', 'Jinx'], 412: ['Thresh', 'Thresh'], 86: ['Garen', 'Garen'], 254: ['Vi', 'Vi'], 238: ['Zed', 'Zed'], 51: ['Caitlyn', 'Caitlyn'], 99: ['Lux', 'Lux'] };

const world = { phase: 'Lobby', live: false };

// ---- Sahte LoL client (LCU) ----
const TOKEN = 'e2e-token';
let lcuUnauthorized = 0;
const lcu = https.createServer(tls, (req, res) => {
  if (req.headers.authorization !== 'Basic ' + Buffer.from(`riot:${TOKEN}`).toString('base64')) {
    lcuUnauthorized++;
    return send(res, 401, {});
  }
  const url = req.url;
  if (url === '/lol-gameflow/v1/gameflow-phase') return send(res, 200, world.phase);
  if (url === '/lol-summoner/v1/current-summoner') return send(res, 200, { puuid: ME, gameName: 'cankut', tagLine: 'TR1' });
  if (url === '/lol-gameflow/v1/session') return send(res, 200, { gameData: { queue: { id: 420 } } });
  if (url === '/lol-lobby/v2/lobby') return send(res, 200, { members: [{ puuid: ME }, { puuid: 'puuid-duo' }] });
  if (url === '/lol-champ-select/v1/session' && world.phase === 'ChampSelect') {
    return send(res, 200, {
      localPlayerCellId: 1,
      myTeam: [
        // Gizli oyuncu, client puuid'i sızdırsa bile uygulama kullanmamalı
        { cellId: 0, championId: 266, puuid: 'puuid-a3', nameVisibilityType: 'HIDDEN', assignedPosition: 'top' },
        { cellId: 1, championId: 64, puuid: ME, gameName: 'cankut', tagLine: 'TR1', assignedPosition: 'jungle', nameVisibilityType: 'VISIBLE' },
        { cellId: 2, championId: 0, championPickIntent: 103, puuid: 'puuid-duo', gameName: 'Duo', tagLine: 'TR1', assignedPosition: 'middle', nameVisibilityType: 'VISIBLE' },
        { cellId: 3, championId: 0, puuid: '', assignedPosition: 'bottom', nameVisibilityType: 'HIDDEN' },
        { cellId: 4, championId: 412, puuid: '', assignedPosition: 'utility', nameVisibilityType: 'HIDDEN' },
      ],
      theirTeam: [
        { cellId: 5, championId: 86, puuid: '' },
        { cellId: 6, championId: 0, puuid: '' },
        { cellId: 7, championId: 238, puuid: '' },
        { cellId: 8, championId: 0, puuid: '' },
        { cellId: 9, championId: 0, puuid: '' },
      ],
      actions: [[{ actorCellId: 1, championId: 157, type: 'ban', completed: true }]],
    });
  }
  if (url.startsWith('/lol-summoner/v2/summoners/puuid/')) return send(res, 200, { puuid: url.split('/').pop(), gameName: 'Sizinti', tagLine: 'X' });
  return send(res, 404, { message: 'yok' });
});
const lcuPort = await listen(lcu);
const lolDir = path.join(tmp, 'lol');
fs.mkdirSync(lolDir);
fs.writeFileSync(path.join(lolDir, 'lockfile'), `LeagueClient:1234:${lcuPort}:${TOKEN}:https`);

// ---- Sahte oyun (Live Client Data) ----
const liveData = () => ({
  activePlayer: { riotId: 'cankut#TR1' },
  allPlayers: team.map((p, i) => ({
    riotId: p.riotId,
    championName: champKeys[p.championId][1],
    rawChampionName: `game_character_displayname_${champKeys[p.championId][0]}`,
    team: p.teamId === 100 ? 'ORDER' : 'CHAOS',
    level: 8 + (i % 4),
    isDead: i === 7,
    respawnTimer: i === 7 ? 12.4 : 0,
    position: '',
    items: [{ itemID: 1055, count: 1, price: 450 }, { itemID: 3031, count: 1, price: 600 }],
    scores: { kills: i % 5, deaths: 2, assists: 3, creepScore: 80 + i * 5, wardScore: 6.2 },
  })),
  events: { Events: [{ EventName: 'GameStart', EventTime: 0 }, { EventName: 'DragonKill', EventTime: 400, DragonType: 'Fire', KillerName: 'cankut' }] },
  gameData: { gameTime: 612.5 },
});
const liveServer = https.createServer(tls, (req, res) => {
  if (!world.live) return send(res, 404, { errorCode: 'RESOURCE_NOT_FOUND' });
  if (req.url === '/liveclientdata/allgamedata') return send(res, 200, liveData());
  return send(res, 404, {});
});
const livePort = await listen(liveServer);

// ---- Sahte Riot API + Data Dragon ----
const riotCalls = [];
const riot = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  riotCalls.push(req.url);
  let m;
  if (p === '/api/versions.json') return send(res, 200, ['15.23.1']);
  if (p.endsWith('/champion.json')) {
    return send(res, 200, { data: Object.fromEntries(Object.entries({ ...champKeys, 157: ['Yasuo', 'Yasuo'] }).map(([id, [key, name]]) => [key, { key: id, id: key, name }])) });
  }
  if (p.endsWith('/item.json')) return send(res, 200, { data: { 1055: { gold: { total: 450 } }, 3031: { gold: { total: 3450 } } } });
  if (req.headers['x-riot-token'] !== 'RGAPI-00000000-0000-0000-0000-000000000000') return send(res, 403, {});
  if (p === '/lol/status/v4/platform-data') return send(res, 200, { id: 'TR1', name: 'Turkey', maintenances: [], incidents: [] });
  if ((m = /^\/lol\/league\/v4\/entries\/by-puuid\/(.+)$/.exec(p))) {
    const tiers = ['GOLD', 'PLATINUM', 'SILVER', 'EMERALD', 'DIAMOND'];
    const i = team.findIndex((t) => t.puuid === m[1]);
    return send(res, 200, [{ queueType: 'RANKED_SOLO_5x5', tier: tiers[i % 5], rank: 'II', leaguePoints: 10 + i * 7, wins: 40 + i, losses: 35 }]);
  }
  if ((m = /^\/lol\/match\/v5\/matches\/by-puuid\/(.+)\/ids$/.exec(p))) {
    const count = Number(url.searchParams.get('count') ?? 20);
    return send(res, 200, Array.from({ length: Math.min(count, 9) }, (_, i) => `TR1_${m[1]}_${i}`));
  }
  if ((m = /^\/lol\/match\/v5\/matches\/TR1_(.+)_(\d)$/.exec(p))) {
    const who = team.find((t) => t.puuid === m[1]);
    const i = Number(m[2]);
    return send(res, 200, {
      metadata: { matchId: `TR1_${m[1]}_${i}` },
      info: { queueId: 420, gameDuration: i === 5 ? 200 : 1700, participants: [{ puuid: m[1], championId: i % 3 ? who.championId : 103, win: i % 3 !== 1, kills: 4 + i, deaths: 3, assists: 6, gameEndedInEarlySurrender: i === 5 }] },
    });
  }
  if ((m = /^\/lol\/champion-mastery\/v4\/champion-masteries\/by-puuid\/(.+)\/by-champion\/(\d+)$/.exec(p))) {
    if (m[1] === 'puuid-e2') return send(res, 404, {});
    return send(res, 200, { championId: Number(m[2]), championLevel: 9, championPoints: m[1] === ME ? 182000 : 23000, lastPlayTime: 0 });
  }
  if ((m = /^\/lol\/spectator\/v5\/active-games\/by-summoner\/(.+)$/.exec(p))) {
    if (world.phase !== 'InProgress') return send(res, 404, {});
    return send(res, 200, { gameId: 77, gameQueueConfigId: 420, participants: team.map((t) => ({ ...t, bot: false })) });
  }
  return send(res, 404, {});
});
const riotPort = await listen(riot);
const riotBase = `http://127.0.0.1:${riotPort}`;

// ---- Uygulamayı başlat ----
const userData = path.join(tmp, 'userdata');
const electronPath = (await import('electron')).default;
const app = await electron.launch({
  executablePath: electronPath,
  args: ['--no-sandbox', root],
  env: {
    ...process.env,
    // Anahtar verilmez: kullanıcı gibi ayarlar ekranından girilir.
    RIOT_API_KEY: '',
    LOL_PATH: lolDir,
    RAPHAEL_LIVE_PORT: String(livePort),
    RAPHAEL_RIOT_BASE_URL: riotBase,
    RAPHAEL_DDRAGON_BASE_URL: riotBase,
    RAPHAEL_USER_DATA: userData,
  },
});

const failures = [];
const check = (ok, msg) => {
  console.log(`${ok ? 'OK  ' : 'HATA'} ${msg}`);
  if (!ok) failures.push(msg);
};

try {
  // İki pencere var (ana pencere ve oyun içi pencere); ana pencereyi adresinden bul.
  let main;
  for (let i = 0; i < 100 && !main; i++) {
    main = app.windows().find((w) => w.url().includes('index.html') && !w.url().includes('overlay=1'));
    if (!main) await new Promise((r) => setTimeout(r, 200));
  }
  if (!main) throw new Error('Ana pencere açılmadı');
  main.on('console', (m) => m.type() === 'error' && console.log('  [renderer]', m.text()));
  await main.setViewportSize({ width: 1180, height: 800 }).catch(() => undefined);

  // 0) İlk açılış: anahtar yok, ayarlar ekranı kendiliğinden açılır
  const KEY = 'RGAPI-00000000-0000-0000-0000-000000000000';
  await main.locator('.pill', { hasText: 'Anahtar yok' }).waitFor({ timeout: 20_000 });
  check(true, 'Anahtar yokken ayarlar ekranı açıldı');
  const keyInput = main.getByLabel('Riot API anahtarı');
  await keyInput.fill('RGAPI-buraya-anahtarin');
  await main.getByRole('button', { name: 'Kaydet' }).click();
  await main.getByText('Bu bir Riot API anahtarına benzemiyor').waitFor({ timeout: 10_000 });
  check(true, 'Biçimi bozuk anahtar reddedildi');
  await keyInput.fill('RGAPI-11111111-1111-1111-1111-111111111111');
  await main.getByRole('button', { name: 'Kaydet' }).click();
  await main.getByText('Riot bu anahtarı kabul etmedi').waitFor({ timeout: 10_000 });
  check(true, 'Riot\'un reddettiği (süresi dolmuş) anahtar kaydedilmedi');
  await app.evaluate(async ({ clipboard }, key) => clipboard.writeText(`Your key: ${key}`), KEY);
  await main.getByRole('button', { name: 'Panodan yapıştır' }).click();
  await main.locator('.pill', { hasText: 'Çalışıyor' }).waitFor({ timeout: 10_000 });
  check(true, 'Panodaki anahtar alındı ve çalışıyor');
  const saved = JSON.parse(fs.readFileSync(path.join(userData, 'settings.json'), 'utf8'));
  if (saved.apiKey?.encrypted) check(!JSON.stringify(saved).includes(KEY), 'Anahtar ayar dosyasında şifreli');
  else console.log('     (bu ortamda şifreleme yok; Windows\'ta DPAPI ile şifrelenir)');
  check((await main.locator('main').innerText()).includes('Ctrl + Z'), 'Varsayılan oyun içi pencere kısayolu Ctrl + Z');
  await main.screenshot({ path: path.join(outDir, '0-ayarlar.png') });
  await main.getByRole('button', { name: '← Geri' }).click();

  // 1) Lobi
  await main.getByText("Client'a bağlandım").waitFor({ timeout: 20_000 });
  check(true, 'Client bulundu (lockfile ile)');
  const hotkeyRegistered = () => app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('Control+Z'));
  check(!(await hotkeyRegistered()), 'Oyun dışında Ctrl+Z kaydedilmedi (diğer programlarda geri alma çalışır)');

  // 2) Dereceli seçim ekranı
  world.phase = 'ChampSelect';
  await main.getByText('cankut#TR1').waitFor({ timeout: 15_000 });
  await main.getByText('Duo#TR1').waitFor({ timeout: 15_000 });
  await main.getByText('Main (182k puan)').waitFor({ timeout: 15_000 });
  const csText = await main.locator('main').innerText();
  check(csText.includes('Takım arkadaşı 1') && csText.includes('Takım arkadaşı 4'), 'Gizli oyuncular "Takım arkadaşı N" olarak görünüyor');
  check(!csText.includes('Sizinti'), 'Gizli oyuncunun adı client\'tan sorulmadı');
  check(!riotCalls.some((c) => HIDDEN.some((h) => c.includes(h))), 'Seçim ekranında gizli oyuncular için Riot API\'ye hiç istek atılmadı');
  check(csText.includes('Garen') && csText.includes('Zed'), 'Rakip seçimleri görünüyor');
  check(csText.includes('Yasuo'), 'Yasaklar görünüyor');
  await main.screenshot({ path: path.join(outDir, '1-secim-ekrani.png') });

  // 3) Yükleme ekranı (oyun API'si henüz kapalı)
  world.phase = 'InProgress';
  const loadStart = Date.now();
  await main.locator('.notice', { hasText: 'Yükleme ekranı' }).waitFor({ timeout: 15_000 });
  await main.getByText('Golge#TR1').waitFor({ timeout: 15_000 });
  await main.waitForFunction(
    () => !document.body.innerText.includes('Yükleniyor...') && ![...document.querySelectorAll('.stat .value')].some((e) => e.textContent === '...'),
    null,
    { timeout: 60_000 },
  );
  const loadSecs = (Date.now() - loadStart) / 1000;
  check(loadSecs < 30, `10 oyuncunun tüm verisi ${loadSecs.toFixed(1)} sn'de geldi (API sınırına takılmadan)`);
  const loadText = await main.locator('main').innerText();
  check(team.every((t) => loadText.includes(t.riotId)), 'Yükleme ekranında 10 oyuncunun hepsi görünüyor');
  check(loadText.includes('Bu şampiyonu hiç oynamamış'), 'Ustalık 404 ise "hiç oynamamış" etiketi');
  check(riotCalls.filter((c) => c.includes('/spectator/')).length >= 1, 'Spectator ile maç bulundu');
  await main.screenshot({ path: path.join(outDir, '2-yukleme-ekrani.png') });

  // 4) Oyun başladı
  world.live = true;
  await main.getByText('Eşya altını farkı').waitFor({ timeout: 15_000 });
  const liveText = await main.locator('main').innerText();
  check(liveText.includes('10:12'), 'Oyun saati görünüyor');
  // Son ejderha 400. sn'de öldü, 5 dk sonra (700. sn) doğar; oyun 612,5. sn'de: 1:27 kaldı.
  check(liveText.includes('Ejderha: 1:27'), 'Ejderha sayacı doğru (1:27)');
  await main.screenshot({ path: path.join(outDir, '3-oyun-ici.png') });

  // Oyun içi pencere
  await new Promise((r) => setTimeout(r, 1500));
  check(await hotkeyRegistered(), 'Oyun sırasında Ctrl+Z oyun içi pencere için kaydedildi');
  const overlayVisible = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => !w.isFocusable() && w.isVisible()));
  check(overlayVisible, 'Oyun içi pencere oyun başlayınca açıldı');
  const overlay = app.windows().find((w) => w.url().includes('overlay=1'));
  if (overlay) {
    await overlay.getByText('Rakipler').waitFor({ timeout: 10_000 });
    const ovText = await overlay.locator('body').innerText();
    check(ovText.includes('Garen') && ovText.includes('13 sn'), 'Oyun içi pencerede rakipler ve ölüm sayacı (12,4 sn → 13 sn) var');
    await overlay.screenshot({ path: path.join(outDir, '4-oyun-ici-pencere.png') });
  } else check(false, 'Oyun içi pencere bulunamadı');

  // 5) Oyun bitti
  world.live = false;
  world.phase = 'EndOfGame';
  await main.getByText("Client'a bağlandım").waitFor({ timeout: 15_000 });
  const hidden = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().every((w) => w.isFocusable() || !w.isVisible()));
  check(hidden, 'Oyun bitince oyun içi pencere kapandı');
  await new Promise((r) => setTimeout(r, 2500));
  check(!(await hotkeyRegistered()), 'Oyun bitince Ctrl+Z bırakıldı');

  // Pencereyi kapatınca uygulama sistem tepsisinde çalışmaya devam eder (tepsi olan ortamlarda)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.isFocusable())?.close());
  await new Promise((r) => setTimeout(r, 500));
  const mainAlive = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => w.isFocusable()).map((w) => w.isVisible()));
  console.log(`     Ana pencere kapatılınca: ${mainAlive.length ? (mainAlive[0] ? 'açık' : 'gizlendi, tepside çalışıyor') : 'uygulama kapandı (bu ortamda tepsi yok)'}`);

  check(lcuUnauthorized === 0, 'Client\'a her istekte doğru şifre gönderildi');
  const log = fs.readFileSync(path.join(userData, 'raphael.log'), 'utf8');
  check(!log.includes('ERROR'), 'Günlükte hata yok');
  check(!log.includes('RGAPI-'), 'API anahtarı günlüğe yazılmadı');
  console.log(`Riot API isteği: ${riotCalls.filter((c) => c.startsWith('/lol') || c.startsWith('/riot')).length}`);
} catch (e) {
  failures.push(String(e));
  console.error(e);
  try {
    const w = app.windows().find((x) => !x.url().includes('overlay=1'));
    console.log(await w.locator('body').innerText());
    await w.screenshot({ path: path.join(outDir, 'hata.png'), timeout: 5000 });
  } catch {
    // önemsiz
  }
} finally {
  await app.evaluate(({ app: a }) => a.quit()).catch(() => undefined);
  await app.close().catch(() => undefined);
  lcu.close();
  liveServer.close();
  riot.close();
}

console.log(failures.length ? `\n${failures.length} kontrol başarısız` : '\nTüm kontroller geçti');
process.exit(failures.length ? 1 : 0);
