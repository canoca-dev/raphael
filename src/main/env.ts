import fs from 'node:fs';
import path from 'node:path';

export function parseEnv(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of content.replace(/^﻿/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** İlk bulunan .env dosyasını okur. Bulunamazsa boş döner. */
export function loadEnv(dirs: string[]): { values: Record<string, string>; file?: string; raw?: string } {
  for (const dir of dirs) {
    const file = path.join(dir, '.env');
    try {
      const raw = fs.readFileSync(file, 'utf8');
      return { values: parseEnv(raw), file, raw };
    } catch {
      // sıradaki klasör
    }
  }
  return { values: {} };
}

export function isUsableKey(key: string | undefined): key is string {
  if (!key) return false;
  const k = key.trim();
  return /^RGAPI-[A-Za-z0-9-]{10,}$/.test(k) && !k.includes('buraya');
}

// Riot anahtarları "RGAPI-" + UUID biçimindedir.
const KEY_IN_TEXT = /RGAPI-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Metnin içindeki anahtarı bulur. Anahtar örnek yazının sonuna eklenmiş, başka bir satıra
 * yapıştırılmış ya da etrafında fazladan karakter kalmış olsa da çalışır. Birden fazlaysa
 * en son yazılanı alır.
 */
export function cleanKey(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const found = text.match(KEY_IN_TEXT);
  if (found) return found[found.length - 1];
  const k = text.trim();
  return isUsableKey(k) ? k : undefined;
}

export interface Config {
  apiKey?: string;
  platform: string;
  region: string;
  lolPath?: string;
  hotkey: string;
  debug: boolean;
  envFile?: string;
}

export const DEFAULT_HOTKEY = 'Control+Shift+F10';

export function buildConfig(env: Record<string, string>, processEnv: NodeJS.ProcessEnv, envFile?: string, raw?: string): Config {
  return {
    // Önce RIOT_API_KEY satırı, sonra dosyanın tamamı (anahtar ayrı satıra yapıştırılmışsa).
    apiKey: cleanKey(env.RIOT_API_KEY) ?? cleanKey(raw) ?? cleanKey(processEnv.RIOT_API_KEY),
    platform: (env.RIOT_PLATFORM || 'tr1').toLowerCase(),
    region: (env.RIOT_REGION || 'europe').toLowerCase(),
    lolPath: env.LOL_PATH || processEnv.LOL_PATH || undefined,
    hotkey: env.OVERLAY_HOTKEY || DEFAULT_HOTKEY,
    debug: env.RAPHAEL_DEBUG === '1' || processEnv.RAPHAEL_DEBUG === '1',
    envFile,
  };
}
