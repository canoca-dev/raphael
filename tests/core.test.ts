import { describe, expect, it } from 'vitest';
import { buildChampSelect } from '../src/main/champselect';
import { DDragon } from '../src/main/ddragon';
import { isUsableKey, parseEnv } from '../src/main/env';
import { parseCommandLine, parseLockfile } from '../src/main/lcu';
import { buildLiveState, objectiveTimers, type LiveAllGameData } from '../src/main/live';
import { RateLimiter } from '../src/main/riot';
import { buildTags, summarizeRecent, toRank, toRecentMatch } from '../src/main/stats';
import type { RecentMatch } from '../src/shared/types';

const dd = new DDragon();
dd.setChampions(
  [
    { id: 62, key: 'MonkeyKing', name: 'Wukong' },
    { id: 103, key: 'Ahri', name: 'Ahri' },
  ],
  '15.1.1',
);

const m = (win: boolean, championId = 103, k = 5, d = 2, a = 5): RecentMatch => ({
  matchId: Math.random().toString(),
  championId,
  championName: 'Ahri',
  win,
  kills: k,
  deaths: d,
  assists: a,
  queueId: 420,
  durationSec: 1800,
});

describe('LCU bağlantı bilgisi', () => {
  it('lockfile okur', () => {
    expect(parseLockfile('LeagueClient:1234:54321:abcDEF-12:https')).toEqual({ port: 54321, token: 'abcDEF-12' });
    expect(parseLockfile('bozuk')).toBeNull();
  });
  it('komut satırından okur', () => {
    const cmd = '"C:/Riot Games/LeagueClientUx.exe" "--remoting-auth-token=Tok_en-1" "--app-port=61234" --other';
    expect(parseCommandLine(cmd)).toEqual({ port: 61234, token: 'Tok_en-1' });
    expect(parseCommandLine('LeagueClientUx.exe')).toBeNull();
  });
});

describe('env', () => {
  it('.env satırlarını ayrıştırır', () => {
    expect(parseEnv('# yorum\nRIOT_API_KEY="RGAPI-x"\r\nRIOT_PLATFORM=tr1\n\nBOS')).toEqual({
      RIOT_API_KEY: 'RGAPI-x',
      RIOT_PLATFORM: 'tr1',
    });
  });
  it('örnek anahtarı geçersiz sayar', () => {
    expect(isUsableKey('RGAPI-buraya-anahtarin')).toBe(false);
    expect(isUsableKey('RGAPI-1234')).toBe(true);
    expect(isUsableKey(undefined)).toBe(false);
  });
});

describe('istatistikler', () => {
  it('maçtan oyuncuyu çıkarır', () => {
    const r = toRecentMatch('p1', {
      metadata: { matchId: 'TR1_1' },
      info: {
        queueId: 420,
        gameDuration: 1500,
        participants: [
          { puuid: 'p2', championId: 1, championName: 'Annie', win: false, kills: 0, deaths: 0, assists: 0 },
          { puuid: 'p1', championId: 103, championName: 'Ahri', win: true, kills: 7, deaths: 1, assists: 3 },
        ],
      },
    });
    expect(r).toMatchObject({ matchId: 'TR1_1', championName: 'Ahri', win: true, kills: 7 });
    expect(toRecentMatch('yok', { metadata: { matchId: 'x' }, info: { queueId: 1, gameDuration: 1, participants: [] } })).toBeNull();
  });

  it('özet ve şampiyon kazanma oranı', () => {
    const s = summarizeRecent([m(true), m(false, 1), m(true)], 103);
    expect(s).toMatchObject({ recentGames: 3, recentWins: 2, championGames: 2, championWins: 2 });
    expect(s.recentKda).toBeCloseTo(30 / 6);
    expect(summarizeRecent([]).recentKda).toBe(0);
  });

  it('rank seçer', () => {
    const entries = [{ queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', rank: 'II', leaguePoints: 40, wins: 10, losses: 9 }];
    expect(toRank(entries, 'RANKED_SOLO_5x5')).toMatchObject({ tier: 'GOLD', division: 'II', lp: 40 });
    expect(toRank(entries, 'RANKED_FLEX_SR')).toBeUndefined();
  });

  it('etiketler: deneyimsiz ve kayıp serisi', () => {
    const tags = buildTags({ recent: [m(false), m(false), m(false), m(true)], mastery: null, championId: 103 });
    const texts = tags.map((t) => t.text);
    expect(texts).toContain('Bu şampiyonda deneyimsiz');
    expect(texts).toContain('3 maçtır kaybediyor');
    expect(texts).toContain('Dereceli sıralaması yok');
  });

  it('etiketler: main ve seri', () => {
    const tags = buildTags({
      recent: [m(true), m(true), m(true)],
      mastery: { championId: 103, level: 7, points: 250_000, lastPlayTime: 0 },
      rankSolo: { queue: 'RANKED_SOLO_5x5', tier: 'GOLD', division: 'I', lp: 0, wins: 30, losses: 15 },
      championId: 103,
    });
    expect(tags.map((t) => t.text)).toEqual(['Main (250k puan)', '3 galibiyet serisi', 'Yüksek KDA (5.0)', 'Sezon %67 kazanıyor']);
  });
});

describe('şampiyon seçimi', () => {
  it('oturumu dönüştürür, gizli oyuncuları işaretler', () => {
    const cs = buildChampSelect(
      {
        localPlayerCellId: 1,
        myTeam: [
          { cellId: 0, championId: 0, championPickIntent: 62, puuid: 'a', assignedPosition: 'top' },
          { cellId: 1, championId: 103, puuid: 'me', gameName: 'Ben', tagLine: 'TR1' },
          { cellId: 2, championId: 0, puuid: '' },
        ],
        theirTeam: [{ cellId: 5, championId: 103 }],
        actions: [[{ championId: 62, type: 'ban', completed: true }, { championId: 1, type: 'ban', completed: false }]],
      },
      dd,
      new Map([['a', 'Arkadas#TR1']]),
    );
    expect(cs.myTeam[0]).toMatchObject({ championName: 'Wukong', championKey: 'MonkeyKing', riotId: 'Arkadas#TR1', hidden: false });
    expect(cs.myTeam[1]).toMatchObject({ isMe: true, riotId: 'Ben#TR1' });
    expect(cs.myTeam[2]).toMatchObject({ hidden: true, puuid: undefined });
    expect(cs.theirTeam[0].hidden).toBe(true);
    expect(cs.bans).toEqual([62]);
  });
});

describe('oyun içi', () => {
  it('objektif zamanlayıcıları', () => {
    expect(objectiveTimers([], 60)).toEqual([
      { name: 'Ejderha', nextSpawnAt: 300 },
      { name: 'Baron', nextSpawnAt: 1200 },
    ]);
    const t = objectiveTimers([{ EventName: 'DragonKill', EventTime: 400 }], 500);
    expect(t[0].nextSpawnAt).toBe(700);
    expect(objectiveTimers([], 400)[0].nextSpawnAt).toBeNull(); // ilk ejderha haritada
  });

  it('canlı veriyi dönüştürür', () => {
    const player = (riotId: string, team: 'ORDER' | 'CHAOS', raw: string, name: string, price: number, kills: number) => ({
      riotId,
      championName: name,
      rawChampionName: `game_character_displayname_${raw}`,
      team,
      level: 6,
      isDead: false,
      respawnTimer: 0,
      items: [{ itemID: 1, count: 1, price }],
      scores: { kills, deaths: 0, assists: 0, creepScore: 50, wardScore: 3.7 },
    });
    const data: LiveAllGameData = {
      activePlayer: { riotId: 'Ben#TR1' },
      allPlayers: [player('Ben#TR1', 'CHAOS', 'MonkeyKing', 'Wukong', 3000, 4), player('O#TR1', 'ORDER', 'Ahri', 'Ahri', 1000, 1)],
      events: { Events: [] },
      gameData: { gameTime: 100 },
    };
    const s = buildLiveState(data, dd);
    expect(s.myTeam).toBe('CHAOS');
    expect(s.players[0]).toMatchObject({ isMe: true, championKey: 'MonkeyKing', wardScore: 4 });
    expect(s.itemGold).toEqual({ ORDER: 1000, CHAOS: 3000 });
    expect(s.kills).toEqual({ ORDER: 1, CHAOS: 4 });
  });
});

describe('hız sınırlayıcı', () => {
  it('saniyelik sınırı aşınca bekler', async () => {
    let now = 0;
    const waits: number[] = [];
    const rl = new RateLimiter(2, 100, () => now, async (ms) => {
      waits.push(ms);
      now += ms;
    });
    await rl.take();
    await rl.take();
    await rl.take();
    expect(waits.length).toBe(1);
    expect(now).toBeGreaterThanOrEqual(1000);
  });
});
