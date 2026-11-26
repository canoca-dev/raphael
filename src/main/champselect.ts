import type { ChampSelectPlayer, ChampSelectState } from '../shared/types';
import type { DDragon } from './ddragon';
import type { LcuCellPlayer, LcuChampSelectSession } from './lcu';

export function buildChampSelect(
  session: LcuChampSelectSession,
  ddragon: DDragon | undefined,
  names: Map<string, string>,
): ChampSelectState {
  const toPlayer = (p: LcuCellPlayer): ChampSelectPlayer => {
    const championId = p.championId || p.championPickIntent || 0;
    const champ = championId ? ddragon?.champion(championId) : undefined;
    const puuid = p.puuid || undefined;
    const sessionName = p.gameName ? `${p.gameName}${p.tagLine ? '#' + p.tagLine : ''}` : undefined;
    return {
      cellId: p.cellId,
      puuid,
      riotId: sessionName ?? (puuid ? names.get(puuid) : undefined),
      championId,
      championKey: champ?.key,
      championName: champ?.name,
      position: p.assignedPosition || undefined,
      isMe: p.cellId === session.localPlayerCellId,
      hidden: !puuid || p.nameVisibilityType === 'HIDDEN',
    };
  };

  const bans = new Set<number>([...(session.bans?.myTeamBans ?? []), ...(session.bans?.theirTeamBans ?? [])]);
  for (const group of session.actions ?? []) {
    for (const a of group) if (a.type === 'ban' && a.completed && a.championId) bans.add(a.championId);
  }

  return {
    myTeam: session.myTeam.map(toPlayer),
    theirTeam: session.theirTeam.map(toPlayer),
    bans: [...bans].filter((b) => b > 0),
  };
}
