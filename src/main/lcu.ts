import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { localGet } from './http';

export interface LcuCredentials {
  port: number;
  token: string;
}

/** LeagueClientUx.exe komut satırından port ve şifreyi çıkarır. */
export function parseCommandLine(cmd: string): LcuCredentials | null {
  const port = /--app-port=["']?(\d+)/.exec(cmd);
  const token = /--remoting-auth-token=["']?([\w-]+)/.exec(cmd);
  if (!port || !token) return null;
  return { port: Number(port[1]), token: token[1] };
}

/** lockfile biçimi: isim:pid:port:şifre:protokol */
export function parseLockfile(content: string): LcuCredentials | null {
  const parts = content.trim().split(':');
  if (parts.length < 5) return null;
  const port = Number(parts[2]);
  if (!Number.isFinite(port) || !parts[3]) return null;
  return { port, token: parts[3] };
}

function fromProcess(): Promise<LcuCredentials | null> {
  if (process.platform !== 'win32') return Promise.resolve(null);
  const ps = "Get-CimInstance Win32_Process -Filter \"name='LeagueClientUx.exe'\" | Select-Object -ExpandProperty CommandLine";
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-Command', ps], { windowsHide: true, timeout: 5000 }, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      resolve(parseCommandLine(stdout));
    });
  });
}

async function fromLockfile(installDir?: string): Promise<LcuCredentials | null> {
  const dirs = [installDir, 'C:\\Riot Games\\League of Legends', 'D:\\Riot Games\\League of Legends'].filter(
    (d): d is string => !!d,
  );
  for (const dir of dirs) {
    try {
      const parsed = parseLockfile(await fs.readFile(path.join(dir, 'lockfile'), 'utf8'));
      if (parsed) return parsed;
    } catch {
      // bu klasörde yok, sıradakine bak
    }
  }
  return null;
}

export async function findLcu(installDir?: string): Promise<LcuCredentials | null> {
  return (await fromProcess()) ?? (await fromLockfile(installDir));
}

export class Lcu {
  constructor(private creds: LcuCredentials) {}

  get<T>(p: string): Promise<T> {
    return localGet<T>(this.creds.port, p, this.creds.token);
  }
}

// LCU champ select oturumundan kullandığımız alanlar.
export interface LcuChampSelectSession {
  localPlayerCellId: number;
  myTeam: LcuCellPlayer[];
  theirTeam: LcuCellPlayer[];
  bans?: { myTeamBans?: number[]; theirTeamBans?: number[] };
  actions?: { championId: number; type: string; completed: boolean }[][];
}

export interface LcuCellPlayer {
  cellId: number;
  championId: number;
  championPickIntent?: number;
  puuid?: string;
  gameName?: string;
  tagLine?: string;
  assignedPosition?: string;
  nameVisibilityType?: string;
}

export interface LcuSummoner {
  gameName?: string;
  tagLine?: string;
  puuid: string;
}
