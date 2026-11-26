import fs from 'node:fs';
import path from 'node:path';

// Basit dosya günlüğü. Sorun olduğunda raphael.log dosyasına bakılır.
// API anahtarı ya da başka gizli bilgi buraya yazılmaz.

const MAX_BYTES = 1_000_000;
let file: string | undefined;

export function initLog(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
  file = path.join(dir, 'raphael.log');
  try {
    if (fs.statSync(file).size > MAX_BYTES) fs.renameSync(file, file + '.1');
  } catch {
    // dosya yok
  }
}

export function logFile() {
  return file;
}

export function log(level: 'info' | 'warn' | 'error', msg: string) {
  const line = `${new Date().toISOString()} ${level.toUpperCase()} ${msg}`;
  if (level === 'error') console.error(line);
  else console.log(line);
  if (!file) return;
  try {
    fs.appendFileSync(file, line + '\n');
  } catch {
    // günlük yazılamazsa uygulama çalışmaya devam eder
  }
}

/** RAPHAEL_DEBUG=1 iken ham verileri debug klasörüne yazar (alan adlarını kontrol etmek için). */
export function dumpJson(dir: string | undefined, name: string, data: unknown) {
  if (!dir) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(data, null, 2));
  } catch {
    // önemsiz
  }
}
