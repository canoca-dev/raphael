import type { GamePlayer, GameState, TeamSide } from '../shared/types';
import type { DDragon } from './ddragon';
import {
  findActivePlayer,
  objectiveTimers,
  playerRiotId,
  sameRiotId,
  toLiveStats,
  type LiveAllGameData,
  type LiveApiPlayer,
} from './live';
import type { SpectatorGame } from './riot';

// Yükleme ekranından itibaren 10 oyuncunun listesi. İki kaynak birleştirilir:
// - Spectator-v5 (Riot API): oyuncuların puuid'i, şampiyonu ve takımı (yükleme ekranında hazır)
// - Live Client Data: oyun başlayınca skor, eşya, seviye
// Bu aşamada isimler oyunda da göründüğü için gösterilebilir.

export interface RosterPlayer {
  puuid?: string;
  riotId: string;
  team: TeamSide;
  championId: number;
  isMe: boolean;
}

/** state.players[index] için hangi oyuncunun istatistiği çekilecek. puuid arayüze gönderilmez. */
export interface StatsLookup {
  index: number;
  puuid: string;
  championId: number;
}

export const teamFromId = (teamId: number): TeamSide => (teamId === 200 ? 'CHAOS' : 'ORDER');

export function rosterFromSpectator(game: SpectatorGame, myPuuid: string | undefined): RosterPlayer[] {
  return game.participants
    .filter((p) => !p.bot)
    .map((p) => ({
      puuid: p.puuid || undefined,
      riotId: p.riotId ?? '',
      team: teamFromId(p.teamId),
      championId: p.championId,
      isMe: !!myPuuid && p.puuid === myPuuid,
    }));
}

export function buildGameState(input: {
  roster: RosterPlayer[]; // spectator'dan; boş olabilir
  live?: LiveAllGameData;
  queueId?: number;
  ddragon?: DDragon;
  puuidForRiotId: (riotId: string) => string | undefined; // spectator yoksa yedek eşleme
}): { state: GameState; lookups: StatsLookup[] } | undefined {
  const { roster, live, ddragon } = input;
  const livePlayers = live?.allPlayers ?? [];
  if (!roster.length && !livePlayers.length) return undefined;

  const me = live ? findActivePlayer(live) : undefined;
  const players: GamePlayer[] = [];
  const lookups: StatsLookup[] = [];
  const usedLive = new Set<LiveApiPlayer>();

  const champ = (id: number) => {
    const c = ddragon?.champion(id);
    return { championKey: c?.key, championName: c?.name };
  };

  for (const r of roster) {
    const lp = livePlayers.find((p) => !usedLive.has(p) && sameRiotId(playerRiotId(p), r.riotId));
    if (lp) usedLive.add(lp);
    if (r.puuid) lookups.push({ index: players.length, puuid: r.puuid, championId: r.championId });
    players.push({
      riotId: r.riotId || (lp ? playerRiotId(lp) : '?'),
      team: r.team,
      isMe: r.isMe || (!!lp && lp === me),
      championId: r.championId,
      ...champ(r.championId),
      position: lp?.position || undefined,
      live: lp ? toLiveStats(lp, ddragon) : undefined,
    });
  }

  // Spectator verisi yoksa (anahtar yok ya da henüz gelmedi) yalnızca canlı veriden kur.
  for (const lp of livePlayers) {
    if (usedLive.has(lp) || lp.isBot) continue;
    const riotId = playerRiotId(lp);
    const c = ddragon?.championFromLive(lp.rawChampionName, lp.championName);
    const puuid = input.puuidForRiotId(riotId);
    if (puuid) lookups.push({ index: players.length, puuid, championId: c?.id ?? 0 });
    players.push({
      riotId,
      team: lp.team,
      isMe: lp === me,
      championId: c?.id ?? 0,
      championKey: c?.key,
      championName: c?.name ?? lp.championName,
      position: lp.position || undefined,
      live: toLiveStats(lp, ddragon),
    });
  }

  const myTeam: TeamSide = players.find((p) => p.isMe)?.team ?? me?.team ?? 'ORDER';
  const state: GameState = {
    stage: live ? 'live' : 'loading',
    queueId: input.queueId,
    myTeam,
    players,
  };

  if (live) {
    const sum = (team: TeamSide, f: (p: GamePlayer) => number) =>
      players.filter((p) => p.team === team && p.live).reduce((s, p) => s + f(p), 0);
    state.gameTime = live.gameData.gameTime;
    state.itemGold = { ORDER: sum('ORDER', (p) => p.live!.itemGold), CHAOS: sum('CHAOS', (p) => p.live!.itemGold) };
    state.kills = { ORDER: sum('ORDER', (p) => p.live!.kills), CHAOS: sum('CHAOS', (p) => p.live!.kills) };
    const teamOf = (killer: string) =>
      livePlayers.find(
        (p) =>
          sameRiotId(playerRiotId(p), killer) ||
          sameRiotId(p.riotIdGameName, killer) ||
          sameRiotId(p.summonerName, killer),
      )?.team;
    state.objectives = objectiveTimers(live.events?.Events ?? [], live.gameData.gameTime, teamOf);
  }

  return { state, lookups };
}
