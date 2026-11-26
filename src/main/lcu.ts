import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { localGet } from './http';

// LCU: LoL client'ının kendi bilgisayarında açtığı yerel API.
// Riot bunu resmi olarak desteklemiyor ama okumaya izin veriyor; yalnızca GET kullanıyoruz.

export interface LcuCredentials {
  port: number;
  token: string;
  installDir?: string;
}

/** LeagueClientUx.exe komut satırından port, şifre ve kurulum klasörünü çıkarır. */
export function parseCommandLine(cmd: string): LcuCredentials | null {
  const port = /--app-port=["']?(\d+)/.exec(cmd);
  const token = /--remoting-auth-token=["']?([\w-]+)/.exec(cmd);
  if (!port || !token) return null;
  const dir = /--install-directory=["']?([^"]+?)["']?(?=\s+--|\s*$|")/.exec(cmd);
  return { port: Number(port[1]), token: token[1], installDir: dir?.[1]?.trim() || undefined };
}

/** lockfile biçimi: isim:pid:port:şifre:protokol */
export function parseLockfile(content: string): LcuCredentials | null {
  const parts = content.trim().split(':');
  if (parts.length < 5) return null;
  const port = Number(parts[2]);
  if (!Number.isInteger(port) || port <= 0 || !parts[3]) return null;
  return { port, token: parts[3] };
}

export const DEFAULT_INSTALL_DIRS = ['C:\\Riot Games\\League of Legends', 'D:\\Riot Games\\League of Legends'];
const PROCESS_QUERY_INTERVAL_MS = 15_000;

/**
 * Client'ı bulur. Önce ucuz yol olan lockfile dosyasına bakar; bulamazsa en fazla
 * 15 saniyede bir PowerShell ile çalışan client'ın komut satırını okur (oyun sırasında
 * işlemciyi yormamak için). Bulunan kurulum klasörü sonraki aramalar için hatırlanır.
 */
export class LcuLocator {
  private knownDirs: string[];
  private lastProcessQuery = -Infinity;

  constructor(
    installDir: string | undefined,
    private readFile: (p: string) => Promise<string> = (p) => fs.readFile(p, 'utf8'),
    private queryProcess: () => Promise<string | null> = queryClientCommandLine,
    private now: () => number = Date.now,
  ) {
    this.knownDirs = [...new Set([installDir, ...DEFAULT_INSTALL_DIRS].filter((d): d is string => !!d))];
  }

  /** allowProcessQuery=false: yalnızca lockfile'a bak (ör. oyun sırasında işlemciyi hiç yormamak için). */
  async find(allowProcessQuery = true): Promise<LcuCredentials | null> {
    for (const dir of this.knownDirs) {
      try {
        const creds = parseLockfile(await this.readFile(path.join(dir, 'lockfile')));
        if (creds) return { ...creds, installDir: dir };
      } catch {
        // bu klasörde yok
      }
    }
    if (!allowProcessQuery || this.now() - this.lastProcessQuery < PROCESS_QUERY_INTERVAL_MS) return null;
    this.lastProcessQuery = this.now();
    const cmd = await this.queryProcess();
    const creds = cmd ? parseCommandLine(cmd) : null;
    if (creds?.installDir && !this.knownDirs.includes(creds.installDir)) this.knownDirs.unshift(creds.installDir);
    return creds;
  }
}

function queryClientCommandLine(): Promise<string | null> {
  if (process.platform !== 'win32') return Promise.resolve(null);
  const ps =
    "Get-CimInstance Win32_Process -Filter \"name='LeagueClientUx.exe'\" | Select-Object -ExpandProperty CommandLine";
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 8000 }, (err, stdout) =>
      resolve(err || !stdout ? null : stdout),
    );
  });
}

export class Lcu {
  constructor(readonly creds: LcuCredentials) {}

  get<T>(p: string): Promise<T> {
    return localGet<T>(this.creds.port, p, this.creds.token);
  }
}

// ---- LCU yanıtlarından kullandığımız alanlar (diğer alanlar yok sayılır) ----

export interface LcuSummoner {
  puuid: string;
  gameName?: string;
  tagLine?: string;
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

export interface LcuChampSelectAction {
  actorCellId: number;
  championId: number;
  type: string; // pick | ban | ten_bans_reveal ...
  completed: boolean;
}

export interface LcuChampSelectSession {
  localPlayerCellId: number;
  myTeam: LcuCellPlayer[];
  theirTeam: LcuCellPlayer[];
  bans?: { myTeamBans?: number[]; theirTeamBans?: number[] };
  actions?: LcuChampSelectAction[][];
}

export interface LcuGameflowSession {
  gameData?: { queue?: { id?: number } };
}

export interface LcuLobby {
  members?: { puuid?: string }[];
}
