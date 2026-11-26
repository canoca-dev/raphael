// Riot Games resmi API istemcisi.
// Development ve Personal key sınırları (bölge başına): 20 istek/1 sn, 100 istek/2 dk.

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class RiotError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface RiotAccount {
  puuid: string;
  gameName: string;
  tagLine: string;
}

export interface LeagueEntry {
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
}

export interface ChampionMastery {
  championId: number;
  championLevel: number;
  championPoints: number;
  lastPlayTime: number;
}

export interface MatchParticipant {
  puuid: string;
  championId: number;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  gameEndedInEarlySurrender?: boolean;
}

export interface Match {
  metadata: { matchId: string };
  info: {
    queueId: number;
    gameDuration: number;
    gameEndTimestamp?: number;
    participants: MatchParticipant[];
  };
}

export interface SpectatorParticipant {
  puuid?: string | null;
  riotId?: string;
  teamId: number; // 100 mavi, 200 kırmızı
  championId: number;
  bot?: boolean;
}

export interface SpectatorGame {
  gameId: number;
  gameQueueConfigId?: number;
  participants: SpectatorParticipant[];
}

/** Kayan pencereli hız sınırlayıcı. Sınırların biraz altında kalır. */
export class RateLimiter {
  private stamps: number[] = [];
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private perSecond = 18,
    private perTwoMin = 95,
    private now: () => number = Date.now,
    private wait: (ms: number) => Promise<void> = sleep,
  ) {}

  take(): Promise<void> {
    const run = async () => {
      for (;;) {
        const t = this.now();
        this.stamps = this.stamps.filter((s) => t - s < 120_000);
        const lastSec = this.stamps.filter((s) => t - s < 1000);
        if (this.stamps.length < this.perTwoMin && lastSec.length < this.perSecond) {
          this.stamps.push(t);
          return;
        }
        const waitMs =
          this.stamps.length >= this.perTwoMin ? 120_000 - (t - this.stamps[0]) : 1000 - (t - lastSec[0]);
        await this.wait(Math.max(waitMs, 0) + 25);
      }
    };
    const p = this.chain.then(run);
    this.chain = p.catch(() => undefined);
    return p;
  }

  /** 429 alındığında herkesin beklemesi için. */
  pause(ms: number) {
    const p = this.chain.then(() => this.wait(ms));
    this.chain = p.catch(() => undefined);
  }
}

export interface RiotApiOptions {
  platform?: string; // tr1
  region?: string; // europe
  /** Testler için: istekleri başka bir adrese yönlendirir. */
  baseUrl?: (host: string) => string;
  /** Her yanıttan sonra çağrılır; arayüzdeki hata mesajını güncellemek için. */
  onResult?: (error?: RiotError) => void;
  fetchImpl?: typeof fetch;
}

export class RiotApi {
  private limiter = new RateLimiter();
  private platform: string;
  private region: string;
  private baseUrl: (host: string) => string;
  private fetchImpl: typeof fetch;

  constructor(
    private key: string,
    private opts: RiotApiOptions = {},
  ) {
    this.platform = opts.platform ?? 'tr1';
    this.region = opts.region ?? 'europe';
    this.baseUrl = opts.baseUrl ?? ((host) => `https://${host}.api.riotgames.com`);
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async get<T>(host: string, path: string, attempt = 0): Promise<T> {
    await this.limiter.take();
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl(host)}${path}`, {
        headers: { 'X-Riot-Token': this.key },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      const err = new RiotError(0, "Riot API'ye ulaşılamadı. İnternet bağlantını kontrol et.");
      this.opts.onResult?.(err);
      throw err;
    }
    if (res.status === 429 && attempt < 3) {
      const retryAfter = Number(res.headers.get('retry-after'));
      this.limiter.pause((Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 5) * 1000);
      return this.get<T>(host, path, attempt + 1);
    }
    if (res.status === 404) {
      this.opts.onResult?.();
      throw new RiotError(404, 'Bulunamadı');
    }
    if (!res.ok) {
      const err =
        res.status === 401 || res.status === 403
          ? new RiotError(res.status, 'Riot API anahtarı geçersiz ya da süresi dolmuş. Yeni anahtarı .env dosyasına yazıp "Anahtarı yenile"ye bas.')
          : new RiotError(res.status, `Riot API hatası (${res.status})`);
      this.opts.onResult?.(err);
      throw err;
    }
    this.opts.onResult?.();
    return (await res.json()) as T;
  }

  accountByRiotId(gameName: string, tagLine: string) {
    return this.get<RiotAccount>(
      this.region,
      `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
    );
  }

  leagueEntries(puuid: string) {
    return this.get<LeagueEntry[]>(this.platform, `/lol/league/v4/entries/by-puuid/${encodeURIComponent(puuid)}`);
  }

  async masteryByChampion(puuid: string, championId: number): Promise<ChampionMastery | null> {
    try {
      return await this.get<ChampionMastery>(
        this.platform,
        `/lol/champion-mastery/v4/champion-masteries/by-puuid/${encodeURIComponent(puuid)}/by-champion/${championId}`,
      );
    } catch (e) {
      if (e instanceof RiotError && e.status === 404) return null; // bu şampiyonu hiç oynamamış
      throw e;
    }
  }

  matchIds(puuid: string, count: number, queueId?: number) {
    const q = queueId ? `&queue=${queueId}` : '';
    return this.get<string[]>(
      this.region,
      `/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?start=0&count=${count}${q}`,
    );
  }

  match(matchId: string) {
    return this.get<Match>(this.region, `/lol/match/v5/matches/${encodeURIComponent(matchId)}`);
  }

  /** Oyuncunun şu anki maçı. Maçta değilse null. */
  async activeGame(puuid: string): Promise<SpectatorGame | null> {
    try {
      return await this.get<SpectatorGame>(
        this.platform,
        `/lol/spectator/v5/active-games/by-summoner/${encodeURIComponent(puuid)}`,
      );
    } catch (e) {
      if (e instanceof RiotError && e.status === 404) return null;
      throw e;
    }
  }
}
