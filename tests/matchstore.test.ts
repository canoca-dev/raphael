import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MatchStore } from '../src/main/matchstore';
import { match } from './helpers';

describe('maç önbelleği', () => {
  it('maçları sıkıştırıp diske yazar ve geri okur', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'raphael-')), 'm.json');
    const a = new MatchStore(file);
    const m = match('TR1_1', 420, [{ puuid: 'p1', championId: 103, win: true, k: 7, d: 1, a: 3 }]);
    m.info.participants[0].gameEndedInEarlySurrender = true;
    a.put(m);
    a.flush();
    const b = new MatchStore(file);
    expect(b.size).toBe(1);
    expect(b.get('TR1_1')).toEqual({
      metadata: { matchId: 'TR1_1' },
      info: {
        queueId: 420,
        gameDuration: 1800,
        gameEndTimestamp: undefined,
        participants: [{ puuid: 'p1', championId: 103, win: true, kills: 7, deaths: 1, assists: 3, gameEndedInEarlySurrender: true }],
      },
    });
    expect(b.get('yok')).toBeUndefined();
  });

  it('sınırı aşınca en eski maçı atar, bozuk dosyada boş başlar', () => {
    const s = new MatchStore(undefined, 2);
    for (const id of ['a', 'b', 'c']) s.put(match(id, 420, []));
    expect(s.size).toBe(2);
    expect(s.get('a')).toBeUndefined();
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'raphael-')), 'bozuk.json');
    fs.writeFileSync(file, '{bozuk');
    expect(new MatchStore(file).size).toBe(0);
  });
});
