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
export function loadEnv(dirs: string[]): { values: Record<string, string>; file?: string } {
  for (const dir of dirs) {
    const file = path.join(dir, '.env');
    try {
      return { values: parseEnv(fs.readFileSync(file, 'utf8')), file };
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

export function buildConfig(env: Record<string, string>, processEnv: NodeJS.ProcessEnv, envFile?: string): Config {
  const key = (env.RIOT_API_KEY || processEnv.RIOT_API_KEY || '').trim();
  return {
    apiKey: isUsableKey(key) ? key : undefined,
    platform: (env.RIOT_PLATFORM || 'tr1').toLowerCase(),
    region: (env.RIOT_REGION || 'europe').toLowerCase(),
    lolPath: env.LOL_PATH || processEnv.LOL_PATH || undefined,
    hotkey: env.OVERLAY_HOTKEY || DEFAULT_HOTKEY,
    debug: env.RAPHAEL_DEBUG === '1' || processEnv.RAPHAEL_DEBUG === '1',
    envFile,
  };
}
