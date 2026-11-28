import fs from 'node:fs';
import path from 'node:path';

// Kullanıcı ayarları: %APPDATA%\raphael\settings.json
// Riot API anahtarı Windows'un kullanıcıya özel şifrelemesiyle (DPAPI, Electron safeStorage)
// şifrelenip saklanır; dosyayı başka bir kullanıcı ya da bilgisayar çözemez.

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StoredKey {
  value: string; // şifreliyse base64
  encrypted: boolean;
  savedAt: number;
}

export interface SettingsData {
  overlayBounds?: Bounds;
  apiKey?: StoredKey;
  hotkey?: string;
  openAtLogin?: boolean;
  showOnChampSelect?: boolean;
  lolDir?: string; // client'ın bulunduğu son kurulum klasörü
  trayHintShown?: boolean;
}

/** Electron safeStorage sarmalayıcısı; testlerde sahtesi kullanılır. */
export interface Encryptor {
  available(): Promise<boolean>;
  encrypt(plain: string): Promise<Buffer>;
  decrypt(encrypted: Buffer): Promise<{ result: string; shouldReEncrypt: boolean }>;
}

export class SettingsStore {
  private data: SettingsData = {};

  constructor(
    private file: string,
    private crypto?: Encryptor,
    private onError: (msg: string) => void = () => undefined,
    private now: () => number = Date.now,
  ) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) this.data = parsed;
    } catch {
      // ilk çalıştırma ya da bozuk dosya: varsayılanlarla devam
    }
  }

  get<K extends keyof SettingsData>(key: K): SettingsData[K] {
    return this.data[key];
  }

  set(patch: Partial<SettingsData>) {
    const next: SettingsData = { ...this.data, ...patch };
    for (const k of Object.keys(next) as (keyof SettingsData)[]) if (next[k] === undefined) delete next[k];
    this.data = next;
    this.save();
  }

  async getApiKey(): Promise<string | undefined> {
    const k = this.data.apiKey;
    if (!k?.value) return undefined;
    if (!k.encrypted) return k.value;
    try {
      const { result, shouldReEncrypt } = await this.crypto!.decrypt(Buffer.from(k.value, 'base64'));
      if (shouldReEncrypt) await this.setApiKey(result, k.savedAt);
      return result;
    } catch (e) {
      this.onError(`Kayıtlı anahtar çözülemedi, yeniden girilmesi gerekecek: ${(e as Error).message}`);
      return undefined;
    }
  }

  async setApiKey(key: string | undefined, savedAt = this.now()) {
    if (!key) return this.set({ apiKey: undefined });
    let stored: StoredKey = { value: key, encrypted: false, savedAt };
    try {
      if (this.crypto && (await this.crypto.available())) {
        stored = { value: (await this.crypto.encrypt(key)).toString('base64'), encrypted: true, savedAt };
      }
    } catch (e) {
      this.onError(`Anahtar şifrelenemedi, şifresiz saklanıyor: ${(e as Error).message}`);
    }
    this.set({ apiKey: stored });
  }

  private save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      // Önce geçici dosyaya yazılır; elektrik kesilse bile ayar dosyası yarım kalmaz.
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (e) {
      this.onError(`Ayarlar kaydedilemedi: ${(e as Error).message}`);
    }
  }
}

/** Ekranda göstermek için: RGAPI-1234…abcd */
export function maskKey(key: string | undefined): string | undefined {
  if (!key) return undefined;
  return key.length > 16 ? `${key.slice(0, 10)}…${key.slice(-4)}` : 'RGAPI-…';
}
