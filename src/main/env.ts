import fs from 'node:fs';
import path from 'node:path';

export function parseEnv(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of content.split(/\r?\n/)) {
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

/** .env dosyasını proje klasöründen okur. Bulunamazsa boş döner. */
export function loadEnv(dirs: string[]): Record<string, string> {
  for (const dir of dirs) {
    try {
      return parseEnv(fs.readFileSync(path.join(dir, '.env'), 'utf8'));
    } catch {
      // sıradaki klasör
    }
  }
  return {};
}

export function isUsableKey(key: string | undefined): key is string {
  return !!key && key.startsWith('RGAPI-') && !key.includes('buraya');
}
