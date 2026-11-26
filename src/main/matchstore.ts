import fs from 'node:fs';
import type { Match } from './riot';

// Biten maçlar değişmez; bu yüzden diske yazıp bir sonraki açılışta yeniden kullanırız.
// Kişisel anahtarın sınırı 2 dakikada 100 istek olduğu için bu, yükleme ekranını ciddi hızlandırır.

type CompactParticipant = [puuid: string, championId: number, win: 0 | 1, k: number, d: number, a: number, remake: 0 | 1];
interface CompactMatch {
  q: number; // queueId
  d: number; // süre (sn)
  e?: number; // bitiş zamanı
  p: CompactParticipant[];
}

export class MatchStore {
  private map = new Map<string, CompactMatch>();
  private timer?: ReturnType<typeof setTimeout>;

  constructor(
    private file?: string,
    private max = 3000,
  ) {
    if (!file) return;
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, CompactMatch>;
      for (const [id, m] of Object.entries(raw)) if (m && Array.isArray(m.p)) this.map.set(id, m);
    } catch {
      // ilk açılış ya da bozuk dosya: boş başla
    }
  }

  get size() {
    return this.map.size;
  }

  get(id: string): Match | undefined {
    const m = this.map.get(id);
    if (!m) return undefined;
    return {
      metadata: { matchId: id },
      info: {
        queueId: m.q,
        gameDuration: m.d,
        gameEndTimestamp: m.e,
        participants: m.p.map(([puuid, championId, win, kills, deaths, assists, remake]) => ({
          puuid,
          championId,
          win: win === 1,
          kills,
          deaths,
          assists,
          gameEndedInEarlySurrender: remake === 1,
        })),
      },
    };
  }

  put(match: Match) {
    const id = match.metadata.matchId;
    this.map.delete(id);
    this.map.set(id, {
      q: match.info.queueId,
      d: match.info.gameDuration,
      e: match.info.gameEndTimestamp,
      p: match.info.participants.map((p) => [
        p.puuid,
        p.championId,
        p.win ? 1 : 0,
        p.kills,
        p.deaths,
        p.assists,
        p.gameEndedInEarlySurrender ? 1 : 0,
      ]),
    });
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
    this.scheduleSave();
  }

  private scheduleSave() {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.flush();
    }, 5000);
  }

  flush() {
    if (!this.file) return;
    try {
      fs.writeFileSync(this.file, JSON.stringify(Object.fromEntries(this.map)));
    } catch {
      // önbellek yazılamazsa uygulama yine çalışır
    }
  }
}
