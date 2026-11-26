// Riot Games resmi API istemcisi. Development key sınırları: 20 istek/sn, 100 istek/2 dk.

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class RiotError extends Error {
  constructor(public status: number, message: string) {
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
  championName: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
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

/** Kayan pencereli basit hız sınırlayıcı. Sınırların biraz altında kalır. */
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
}

export class RiotApi {
  private limiter = new RateLimiter();

  constructor(
    private key: string,
    private platform = 'tr1',
    private region = 'europe',
  ) {}

  private async get<T>(host: string, path: string, attempt = 0): Promise<T> {
    await this.limiter.take();
    const res = await fetch(`https://${host}.api.riotgames.com${path}`, {
      headers: { 'X-Riot-Token': this.key },
    });
    if (res.status === 429 && attempt < 3) {
      const retryAfter = Number(res.headers.get('retry-after') ?? '2');
      await sleep((Number.isFinite(retryAfter) ? retryAfter : 2) * 1000);
      return this.get<T>(host, path, attempt + 1);
    }
    if (res.status === 401 || res.status === 403) {
      throw new RiotError(res.status, 'Riot API anahtarı geçersiz ya da süresi dolmuş. Yeni anahtar alıp .env dosyasına yaz.');
    }
    if (!res.ok) throw new RiotError(res.status, `Riot API hatası (${res.status})`);
    return (await res.json()) as T;
  }

  accountByRiotId(gameName: string, tagLine: string) {
    return this.get<RiotAccount>(
      this.region,
      `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
    );
  }

  leagueEntries(puuid: string) {
    return this.get<LeagueEntry[]>(this.platform, `/lol/league/v4/entries/by-puuid/${puuid}`);
  }

  async masteryByChampion(puuid: string, championId: number): Promise<ChampionMastery | null> {
    try {
      return await this.get<ChampionMastery>(
        this.platform,
        `/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/by-champion/${championId}`,
      );
    } catch (e) {
      if (e instanceof RiotError && e.status === 404) return null; // bu şampiyonu hiç oynamamış
      throw e;
    }
  }

  matchIds(puuid: string, count: number) {
    return this.get<string[]>(this.region, `/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${count}`);
  }

  match(matchId: string) {
    return this.get<Match>(this.region, `/lol/match/v5/matches/${matchId}`);
  }
}
