import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildConfig, DEFAULT_HOTKEY, isUsableKey, parseEnv } from '../src/main/env';
import { LcuLocator, parseCommandLine, parseLockfile } from '../src/main/lcu';

describe('LCU bağlantı bilgisi', () => {
  it('lockfile okur', () => {
    expect(parseLockfile('LeagueClient:1234:54321:abcDEF-12:https')).toEqual({ port: 54321, token: 'abcDEF-12' });
    expect(parseLockfile('bozuk')).toBeNull();
    expect(parseLockfile('a:b:port:tok:https')).toBeNull();
  });

  it('komut satırından port, şifre ve kurulum klasörünü okur', () => {
    const cmd =
      '"C:/Riot Games/League of Legends/LeagueClientUx.exe" "--riotclient-auth-token=XYZ" "--riotclient-app-port=50000" ' +
      '"--remoting-auth-token=Tok_en-1" "--app-port=61234" "--install-directory=C:/Riot Games/League of Legends/" "--app-name=LeagueClient"';
    expect(parseCommandLine(cmd)).toEqual({ port: 61234, token: 'Tok_en-1', installDir: 'C:/Riot Games/League of Legends/' });
    expect(parseCommandLine('LeagueClientUx.exe --riotclient-app-port=1 --riotclient-auth-token=x')).toBeNull();
  });

  it('client kapalıyken PowerShell sorgusunu sık sık çalıştırmaz', async () => {
    let now = 0;
    let queries = 0;
    const locator = new LcuLocator(
      undefined,
      async () => {
        throw new Error('yok');
      },
      async () => {
        queries++;
        return null;
      },
      () => now,
    );
    await locator.find();
    now += 2000;
    await locator.find();
    expect(queries).toBe(1);
    now += 15_000;
    await locator.find();
    expect(queries).toBe(2);
  });

  it('komut satırından öğrendiği klasörün lockfile dosyasını sonra kullanır', async () => {
    const files: Record<string, string> = {};
    let queries = 0;
    const locator = new LcuLocator(
      undefined,
      async (p) => {
        if (files[p]) return files[p];
        throw new Error('yok');
      },
      async () => {
        queries++;
        return '"--remoting-auth-token=abc" "--app-port=1111" "--install-directory=E:/LoL"';
      },
      () => 0,
    );
    expect(await locator.find()).toMatchObject({ port: 1111, token: 'abc', installDir: 'E:/LoL' });
    files[path.join('E:/LoL', 'lockfile')] = 'LeagueClient:1:2222:yeni:https';
    expect(await locator.find()).toMatchObject({ port: 2222, token: 'yeni' });
    expect(queries).toBe(1);
  });
});

describe('ayarlar', () => {
  it('.env satırlarını ayrıştırır (BOM, tırnak, Windows satır sonu)', () => {
    expect(parseEnv('\uFEFF# yorum\nRIOT_API_KEY="RGAPI-x"\r\nRIOT_PLATFORM=tr1\n\nBOS')).toEqual({
      RIOT_API_KEY: 'RGAPI-x',
      RIOT_PLATFORM: 'tr1',
    });
  });

  it('örnek anahtarı ve bozuk değerleri geçersiz sayar', () => {
    expect(isUsableKey('RGAPI-buraya-anahtarin')).toBe(false);
    expect(isUsableKey('RGAPI-12345678-abcd-ef01-2345-6789abcdef01')).toBe(true);
    expect(isUsableKey(' RGAPI-12345678-abcd-ef01-2345-6789abcdef01 ')).toBe(true);
    expect(isUsableKey('12345')).toBe(false);
    expect(isUsableKey(undefined)).toBe(false);
  });

  it('varsayılanlar TR ve güvenli kısayol', () => {
    const c = buildConfig({ RIOT_API_KEY: 'RGAPI-12345678-abcd-ef01-2345-6789abcdef01 ' }, {});
    expect(c).toMatchObject({ platform: 'tr1', region: 'europe', hotkey: DEFAULT_HOTKEY, debug: false });
    expect(c.apiKey).toBe('RGAPI-12345678-abcd-ef01-2345-6789abcdef01');
    expect(buildConfig({}, {}).apiKey).toBeUndefined();
  });
});
