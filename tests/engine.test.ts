import { describe, expect, it } from 'vitest';
import { Engine } from '../src/main/engine';
import type { LcuChampSelectSession } from '../src/main/lcu';
import type { LiveAllGameData } from '../src/main/live';
import { RiotApi } from '../src/main/riot';
import type { AppState } from '../src/shared/types';
import { fakeRiot, testDDragon, wait } from './helpers';

// Uçtan uca veri akışı: sahte client + sahte Riot API ile motorun ne gösterdiği
// ve hangi oyuncular için Riot'a istek attığı kontrol edilir.

const champSelect: LcuChampSelectSession = {
  localPlayerCellId: 1,
  myTeam: [
    { cellId: 0, championId: 266, puuid: 'gizli-ama-sizdi', nameVisibilityType: 'HIDDEN' },
    { cellId: 1, championId: 64, puuid: 'me', gameName: 'Ben', tagLine: 'TR1' },
    { cellId: 2, championId: 103, puuid: 'duo', gameName: 'Duo', tagLine: 'TR1' },
    { cellId: 3, championId: 0, puuid: '' },
    { cellId: 4, championId: 0, puuid: 'grupta-degil', gameName: 'X', tagLine: '1' },
  ],
  theirTeam: [{ cellId: 5, championId: 86, puuid: 'rakip' }],
};

function fakeClient(state: { phase: string; queue: number; live?: LiveAllGameData }) {
  const lcuCalls: string[] = [];
  const lcu = {
    get: async <T,>(path: string): Promise<T> => {
      lcuCalls.push(path);
      const routes: Record<string, unknown> = {
        '/lol-gameflow/v1/gameflow-phase': state.phase,
        '/lol-summoner/v1/current-summoner': { puuid: 'me', gameName: 'Ben', tagLine: 'TR1' },
        '/lol-gameflow/v1/session': { gameData: { queue: { id: state.queue } } },
        '/lol-champ-select/v1/session': champSelect,
        '/lol-lobby/v2/lobby': { members: [{ puuid: 'me' }, { puuid: 'duo' }] },
      };
      if (path in routes) return routes[path] as T;
      if (path.startsWith('/lol-summoner/v2/summoners/puuid/')) return { puuid: path.split('/').pop(), gameName: 'Isim', tagLine: 'TR1' } as T;
      throw new Error('404 ' + path);
    },
  };
  return { lcu, lcuCalls };
}

function setup(state: { phase: string; queue: number; live?: LiveAllGameData }, spectator?: unknown) {
  const { lcu, lcuCalls } = fakeClient(state);
  const riot = fakeRiot({ spectator });
  const states: AppState[] = [];
  const engine = new Engine({
    ddragon: testDDragon(),
    findLcu: async () => ({ port: 1, token: 't' }),
    makeLcu: () => lcu,
    fetchLive: async () => {
      if (!state.live) throw new Error('oyun yok');
      return state.live;
    },
    onState: (s) => states.push(s),
  });
  engine.setRiot(new RiotApi('RGAPI-x', { fetchImpl: riot.fetchImpl, baseUrl: () => 'http://riot.test', onResult: (e) => engine.reportApiResult(e) }));
  return { engine, riotCalls: riot.calls, lcuCalls, states };
}

describe('motor', () => {
  it('dereceli seçim ekranında gizli oyuncular için hiçbir veri çekmez', async () => {
    const { engine, riotCalls, lcuCalls } = setup({ phase: 'ChampSelect', queue: 420 });
    await engine.poll();
    await wait(100);
    await engine.poll();
    const cs = engine.state.champSelect!;
    expect(cs.anonymous).toBe(true);
    expect(cs.myTeam.filter((p) => p.revealed).map((p) => p.label)).toEqual(['Ben#TR1', 'Duo#TR1']);
    expect(cs.myTeam.find((p) => p.isMe)!.stats).toMatchObject({ loading: false, recentGames: 2 });
    const touched = [...riotCalls, ...lcuCalls].join('\n');
    for (const secret of ['gizli-ama-sizdi', 'grupta-degil', 'rakip']) expect(touched).not.toContain(secret);
    expect(riotCalls.some((c) => c.includes('/by-puuid/duo'))).toBe(true);
  });

  it('normal oyunda client\'ın gösterdiği takım arkadaşları da gelir', async () => {
    const { engine, riotCalls } = setup({ phase: 'ChampSelect', queue: 400 });
    await engine.poll();
    await wait(100);
    expect(riotCalls.some((c) => c.includes('/by-puuid/grupta-degil'))).toBe(true);
    expect(riotCalls.join('\n')).not.toContain('gizli-ama-sizdi');
    expect(engine.state.champSelect!.anonymous).toBe(false);
  });

  it('yükleme ekranında 10 oyuncunun hepsi spectator ile gelir', async () => {
    const spectator = {
      gameId: 9,
      gameQueueConfigId: 420,
      participants: [
        { puuid: 'me', riotId: 'Ben#TR1', teamId: 100, championId: 64 },
        { puuid: 'rakip', riotId: 'Rakip#TR1', teamId: 200, championId: 86 },
      ],
    };
    const { engine, riotCalls, states } = setup({ phase: 'InProgress', queue: 420 }, spectator);
    await engine.poll();
    await wait(100);
    await engine.poll();
    await wait(250);
    const game = states.at(-1)!.game!;
    expect(game.stage).toBe('loading');
    expect(game.players.map((p) => p.riotId)).toEqual(['Ben#TR1', 'Rakip#TR1']);
    expect(game.players[1].stats).toMatchObject({ loading: false });
    expect(game.players[1].stats!.mastery).toBeNull(); // 86 için sahte API 404 döner
    expect(riotCalls.filter((c) => c.includes('/spectator/')).length).toBe(1);
  });

  it('client kapalıyken de oyun verisi gelir ve anahtar hatası gösterilir', async () => {
    const live: LiveAllGameData = {
      activePlayer: { riotId: 'Ben#TR1' },
      allPlayers: [
        { riotId: 'Ben#TR1', championName: 'Ahri', rawChampionName: 'game_character_displayname_Ahri', team: 'ORDER', level: 3, isDead: false, respawnTimer: 0, items: [], scores: { kills: 1, deaths: 0, assists: 0, creepScore: 10, wardScore: 0 } },
      ],
      gameData: { gameTime: 200 },
    };
    const riot = fakeRiot({ failAll: 403 });
    const engine = new Engine({
      ddragon: testDDragon(),
      findLcu: async () => null,
      makeLcu: () => ({ get: async () => undefined as never }),
      fetchLive: async () => live,
      onState: () => undefined,
    });
    engine.setRiot(new RiotApi('RGAPI-x', { fetchImpl: riot.fetchImpl, baseUrl: () => 'http://riot.test', onResult: (e) => engine.reportApiResult(e) }));
    await engine.poll();
    await wait(250);
    await engine.poll();
    await wait(250);
    await engine.poll();
    // Anahtar geçersizken aynı istek döngüye girip API'yi yormamalı.
    expect(riot.calls.filter((c) => c.includes('/accounts/')).length).toBe(1);
    expect(engine.state.client).toBe('disconnected');
    expect(engine.state.game).toMatchObject({ stage: 'live', myTeam: 'ORDER' });
    expect(engine.state.apiError).toMatch(/anahtarı geçersiz/);
  });
});
