import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findKeyInText } from '../src/main/env';
import { LcuLocator } from '../src/main/lcu';
import { RiotApi } from '../src/main/riot';
import { maskKey, SettingsStore, type Encryptor } from '../src/main/settings';
import { PERSONAL_KEY_DESCRIPTION } from '../src/shared/riot';
import { acceleratorFromEvent, DEFAULT_OVERLAY_HOTKEY, formatHotkey, hotkeyProblem, MOVE_HOTKEY, normalizeHotkey, type KeyLike } from '../src/shared/hotkey';
import { json } from './helpers';

const KEY = 'RGAPI-12345678-abcd-ef01-2345-6789abcdef01';
const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'raphael-test-')), 'settings.json');

// Sahte şifreleme: tersine çevirip işaret ekler; gerçek DPAPI yerine.
function fakeCrypto(available = true, opts: { failDecrypt?: boolean; rotate?: boolean } = {}): Encryptor & { encrypted: number } {
  const c = {
    encrypted: 0,
    available: async () => available,
    encrypt: async (s: string) => {
      c.encrypted++;
      return Buffer.from('ENC:' + [...s].reverse().join(''));
    },
    decrypt: async (b: Buffer) => {
      if (opts.failDecrypt) throw new Error('çözülemedi');
      const t = b.toString();
      return { result: [...t.slice(4)].reverse().join(''), shouldReEncrypt: !!opts.rotate };
    },
  };
  return c;
}

describe('ayar dosyası', () => {
  it('ayarları saklar ve yeniden okur; boş değerleri siler', () => {
    const file = tmpFile();
    const s = new SettingsStore(file);
    s.set({ hotkey: 'Control+Z', openAtLogin: false, lolDir: 'E:/LoL' });
    s.set({ lolDir: undefined });
    const again = new SettingsStore(file);
    expect(again.get('hotkey')).toBe('Control+Z');
    expect(again.get('openAtLogin')).toBe(false);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).not.toHaveProperty('lolDir');
    expect(fs.existsSync(file + '.tmp')).toBe(false);
  });

  it('bozuk dosyada varsayılanlarla açılır', () => {
    const file = tmpFile();
    fs.writeFileSync(file, '{bozuk');
    expect(new SettingsStore(file).get('hotkey')).toBeUndefined();
  });

  it('anahtarı şifreli saklar, dosyada açık hali görünmez', async () => {
    const file = tmpFile();
    const crypto = fakeCrypto();
    const s = new SettingsStore(file, crypto, undefined, () => 1234);
    await s.setApiKey(KEY);
    const raw = fs.readFileSync(file, 'utf8');
    expect(raw).not.toContain(KEY);
    expect(JSON.parse(raw).apiKey).toMatchObject({ encrypted: true, savedAt: 1234 });
    expect(await new SettingsStore(file, crypto).getApiKey()).toBe(KEY);
  });

  it('şifreleme yoksa şifresiz saklar, anahtar silinebilir', async () => {
    const file = tmpFile();
    const s = new SettingsStore(file, fakeCrypto(false));
    await s.setApiKey(KEY);
    expect(s.get('apiKey')).toMatchObject({ value: KEY, encrypted: false });
    await s.setApiKey(undefined);
    expect(await s.getApiKey()).toBeUndefined();
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).not.toHaveProperty('apiKey');
  });

  it('çözülemeyen anahtarı yok sayar ve hata bildirir', async () => {
    const file = tmpFile();
    await new SettingsStore(file, fakeCrypto()).setApiKey(KEY);
    const errors: string[] = [];
    const s = new SettingsStore(file, fakeCrypto(true, { failDecrypt: true }), (m) => errors.push(m));
    expect(await s.getApiKey()).toBeUndefined();
    expect(errors[0]).toMatch(/çözülemedi/);
    expect(errors.join()).not.toContain(KEY);
  });

  it('şifreleme anahtarı değiştiyse yeniden şifreler', async () => {
    const file = tmpFile();
    await new SettingsStore(file, fakeCrypto()).setApiKey(KEY);
    const crypto = fakeCrypto(true, { rotate: true });
    expect(await new SettingsStore(file, crypto).getApiKey()).toBe(KEY);
    expect(crypto.encrypted).toBe(1);
  });

  it("README'deki başvuru metni uygulamadakiyle aynı", () => {
    const readme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    expect(readme).toContain(PERSONAL_KEY_DESCRIPTION);
  });

  it('anahtarı ekranda kısaltarak gösterir', () => {
    expect(maskKey(KEY)).toBe('RGAPI-1234…ef01');
    expect(maskKey(undefined)).toBeUndefined();
  });

  it('panodaki yazıda yalnız tam biçimli anahtarı bulur', () => {
    expect(findKeyInText(`Anahtarın: ${KEY} (24 saat)`)).toBe(KEY);
    expect(findKeyInText('RGAPI-buraya-anahtarin')).toBeUndefined();
    expect(findKeyInText('herhangi bir yazı')).toBeUndefined();
    expect(findKeyInText('')).toBeUndefined();
  });
});

const ev = (key: string, code: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key,
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});

describe('kısayol', () => {
  it('varsayılan kısayol Ctrl+Z', () => {
    expect(DEFAULT_OVERLAY_HOTKEY).toBe('Control+Z');
    expect(hotkeyProblem(DEFAULT_OVERLAY_HOTKEY)).toBeNull();
  });

  it('tuş olayından kısayol üretir', () => {
    expect(acceleratorFromEvent(ev('z', 'KeyZ', { ctrlKey: true }))).toBe('Control+Z');
    expect(acceleratorFromEvent(ev('Z', 'KeyZ', { ctrlKey: true, shiftKey: true }))).toBe('Control+Shift+Z');
    expect(acceleratorFromEvent(ev('F8', 'F8'))).toBe('F8');
    expect(acceleratorFromEvent(ev('!', 'Digit1', { altKey: true, shiftKey: true }))).toBe('Alt+Shift+1');
    // Yalnız Ctrl'e basıldı: asıl tuş bekleniyor
    expect(acceleratorFromEvent(ev('Control', 'ControlLeft', { ctrlKey: true }))).toBeNull();
    // Türkçe harf tuşu: fiziksel tuşa göre
    expect(acceleratorFromEvent(ev('ş', 'Semicolon', { ctrlKey: true }))).toBe('Control+;');
  });

  it('yazıyı bozacak ya da Windows\'un kullandığı kısayolları reddeder', () => {
    expect(hotkeyProblem('Z')).toMatch(/Ctrl ya da Alt/);
    expect(hotkeyProblem('Shift+A')).toMatch(/Ctrl ya da Alt/);
    expect(hotkeyProblem('Alt+F4')).toMatch(/kapatır/);
    expect(hotkeyProblem(MOVE_HOTKEY)).toMatch(/taşımak/);
    expect(hotkeyProblem('Control')).toMatch(/bir tuşa bas/);
    expect(hotkeyProblem('F9')).toBeNull();
    expect(hotkeyProblem('Alt+Q')).toBeNull();
  });

  it('elle yazılmış kısayolu düzeltir', () => {
    expect(normalizeHotkey('ctrl + z')).toBe('Control+Z');
    expect(normalizeHotkey('CommandOrControl+Shift+f9')).toBe('Control+Shift+F9');
    expect(normalizeHotkey('Win+num5')).toBe('Super+num5');
    expect(normalizeHotkey('Control+Z')).toBe('Control+Z');
    expect(hotkeyProblem(normalizeHotkey('Ctrl+Z'))).toBeNull();
  });

  it('kısayolu okunur yazar', () => {
    expect(formatHotkey('Control+Shift+F11')).toBe('Ctrl + Shift + F11');
    expect(formatHotkey('Super+num5')).toBe('Win + Num 5');
  });
});

describe('anahtar kontrolü', () => {
  const api = (respond: () => Response | Promise<Response>) =>
    new RiotApi(KEY, { fetchImpl: (async () => respond()) as typeof fetch, baseUrl: () => 'http://riot.test' });

  it('Riot cevabına göre anahtarın durumunu söyler', async () => {
    expect(await api(() => json({ id: 'TR1' })).checkKey()).toBe('ok');
    expect(await api(() => json({}, 403)).checkKey()).toBe('invalid');
    expect(await api(() => json({}, 401)).checkKey()).toBe('invalid');
    expect(await api(() => json({}, 404)).checkKey()).toBe('ok');
    expect(await api(() => json({}, 503)).checkKey()).toBe('error');
    expect(
      await api(() => {
        throw new TypeError('fetch failed');
      }).checkKey(),
    ).toBe('offline');
  });

  it('sunucu durumu yolunu kullanır', async () => {
    const urls: string[] = [];
    const r = new RiotApi(KEY, {
      fetchImpl: (async (u: string) => {
        urls.push(String(u));
        return json({});
      }) as typeof fetch,
    });
    await r.checkKey();
    expect(urls).toEqual(['https://tr1.api.riotgames.com/lol/status/v4/platform-data']);
  });
});

describe('client arama', () => {
  it('kurulum klasörü biliniyorsa client kapalıyken PowerShell\'i nadiren çalıştırır', async () => {
    let now = 0;
    let queries = 0;
    const locator = new LcuLocator(
      'E:/LoL',
      async () => {
        throw new Error('lockfile yok');
      },
      async () => {
        queries++;
        return null;
      },
      () => now,
      async (p) => p.replace(/\\/g, '/') === 'E:/LoL/LeagueClient.exe',
    );
    await locator.find();
    for (let i = 0; i < 30; i++) {
      now += 15_000;
      await locator.find();
    }
    expect(queries).toBe(2); // ilk arama + 5 dakika sonra bir kez
  });

  it('birden fazla tercih edilen klasörü sırayla dener', async () => {
    const read: string[] = [];
    const locator = new LcuLocator(
      [undefined, 'F:/Oyunlar/LoL'],
      async (p) => {
        read.push(p.replace(/\\/g, '/'));
        if (p.replace(/\\/g, '/') === 'F:/Oyunlar/LoL/lockfile') return 'LeagueClient:1:4444:tok:https';
        throw new Error('yok');
      },
      async () => null,
    );
    expect(await locator.find()).toMatchObject({ port: 4444, installDir: 'F:/Oyunlar/LoL' });
    expect(read[0]).toBe('F:/Oyunlar/LoL/lockfile');
  });
});
