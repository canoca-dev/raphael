import { describe, expect, it } from 'vitest';
import { buildGameState, rosterFromSpectator } from '../src/main/game';
import { findActivePlayer, itemGold, objectiveTimers, type LiveAllGameData, type LiveApiPlayer } from '../src/main/live';
import { testDDragon } from './helpers';

const dd = testDDragon();

function player(riotId: string, team: 'ORDER' | 'CHAOS', raw: string, name: string, items: [number, number, number][], kills: number): LiveApiPlayer {
  return {
    riotId,
    summonerName: riotId.split('#')[0],
    championName: name,
    rawChampionName: `game_character_displayname_${raw}`,
    team,
    level: 6,
    isDead: false,
    respawnTimer: 0,
    items: items.map(([itemID, count, price]) => ({ itemID, count, price })),
    scores: { kills, deaths: 0, assists: 0, creepScore: 50, wardScore: 3.7 },
  };
}

const live: LiveAllGameData = {
  activePlayer: { riotId: 'ben#tr1' },
  allPlayers: [
    player('O#TR1', 'ORDER', 'Ahri', 'Ahri', [[1055, 1, 450]], 1),
    player('Ben#TR1', 'CHAOS', 'MonkeyKing', 'Wukong', [[3031, 1, 900], [2055, 2, 75]], 4),
  ],
  events: { Events: [] },
  gameData: { gameTime: 100 },
};

describe('canlı veri', () => {
  it('aktif oyuncuyu Riot ID ile bulur (büyük/küçük harf duyarsız)', () => {
    expect(findActivePlayer(live)?.riotId).toBe('Ben#TR1');
  });

  it('aktif oyuncu bilinmiyorsa kimseyi "ben" saymaz', () => {
    const noNames = { ...live, activePlayer: {}, allPlayers: live.allPlayers.map((p) => ({ ...p, summonerName: undefined })) };
    expect(findActivePlayer(noNames)).toBeUndefined();
  });

  it('eşya altını Data Dragon toplam fiyatından, bilinmiyorsa API fiyatından', () => {
    expect(itemGold([{ itemID: 3031, count: 1, price: 900 }, { itemID: 2055, count: 2, price: 75 }], dd)).toBe(3450 + 150);
    expect(itemGold([{ itemID: 9999, count: 1, price: 1234 }], dd)).toBe(1234);
  });

  it('objektif zamanlayıcıları: ilk doğma, yeniden doğma, ruh sonrası Kadim', () => {
    const team = () => 'ORDER' as const;
    expect(objectiveTimers([], 60, team)).toEqual([
      { name: 'Ejderha', nextSpawnAt: 300 },
      { name: 'Baron', nextSpawnAt: 1200 },
    ]);
    expect(objectiveTimers([{ EventName: 'DragonKill', EventTime: 400, KillerName: 'x' }], 500, team)[0].nextSpawnAt).toBe(700);
    expect(objectiveTimers([], 400, team)[0].nextSpawnAt).toBeNull(); // ilk ejderha haritada
    const four = [1, 2, 3, 4].map((i) => ({ EventName: 'DragonKill', EventTime: i * 400, DragonType: 'Fire', KillerName: 'x' }));
    expect(objectiveTimers(four, 1700, team)[0]).toEqual({ name: 'Kadim Ejderha', nextSpawnAt: 1600 + 360 });
    expect(objectiveTimers([{ EventName: 'BaronKill', EventTime: 1300 }], 1400, team)[1].nextSpawnAt).toBe(1660);
  });
});

describe('oyun durumu', () => {
  const spectator = {
    gameId: 1,
    gameQueueConfigId: 420,
    participants: [
      { puuid: 'p-o', riotId: 'O#TR1', teamId: 100, championId: 103 },
      { puuid: 'me', riotId: 'Ben#TR1', teamId: 200, championId: 62 },
      { puuid: null, riotId: 'Bot', teamId: 200, championId: 86, bot: true },
    ],
  };

  it('yükleme ekranı: spectator listesinden kurulur', () => {
    const roster = rosterFromSpectator(spectator, 'me');
    expect(roster).toHaveLength(2);
    const built = buildGameState({ roster, ddragon: dd, queueId: 420, puuidForRiotId: () => undefined })!;
    expect(built.state).toMatchObject({ stage: 'loading', myTeam: 'CHAOS' });
    expect(built.lookups).toEqual([
      { index: 0, puuid: 'p-o', championId: 103 },
      { index: 1, puuid: 'me', championId: 62 },
    ]);
    expect(JSON.stringify(built.state)).not.toContain('p-o'); // puuid arayüze gitmez
  });

  it('oyun başlayınca canlı veriyle birleşir', () => {
    const built = buildGameState({ roster: rosterFromSpectator(spectator, 'me'), live, ddragon: dd, puuidForRiotId: () => undefined })!;
    expect(built.state.stage).toBe('live');
    expect(built.state.kills).toEqual({ ORDER: 1, CHAOS: 4 });
    expect(built.state.itemGold).toEqual({ ORDER: 450, CHAOS: 3600 });
    expect(built.state.players[1]).toMatchObject({ isMe: true, championName: 'Wukong', live: { wardScore: 4 } });
    expect(built.state.players).toHaveLength(2);
  });

  it('spectator yoksa canlı veriden kurulur, puuid Riot ID ile bulunur', () => {
    const built = buildGameState({ roster: [], live, ddragon: dd, puuidForRiotId: (id) => (id === 'O#TR1' ? 'p-o' : undefined) })!;
    expect(built.state.myTeam).toBe('CHAOS');
    expect(built.lookups).toEqual([{ index: 0, puuid: 'p-o', championId: 103 }]);
    expect(built.state.players.map((p) => p.championName)).toEqual(['Ahri', 'Wukong']);
  });

  it('hiç veri yoksa oyun durumu yok', () => {
    expect(buildGameState({ roster: [], puuidForRiotId: () => undefined })).toBeUndefined();
  });
});
