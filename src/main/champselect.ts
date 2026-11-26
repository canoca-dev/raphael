import type { ChampSelectPlayer, ChampSelectState } from '../shared/types';
import type { DDragon } from './ddragon';
import type { LcuCellPlayer, LcuChampSelectSession } from './lcu';
import { QUEUE } from './stats';

/**
 * Riot kuralı: Dereceli seçim ekranında oyuncular anonimdir. Uygulamalar gizli
 * oyuncuların ne ismini ne de istatistiğini gösterebilir; yalnızca oyuncunun
 * kendisi ve aynı gruptan sıraya girdiği arkadaşları serbesttir. İsimler yükleme
 * ekranında açılır. Kuyruğu bilemediğimizde de en sıkı kuralı uygularız.
 */
export function isStrictQueue(queueId: number | undefined): boolean {
  return queueId === undefined || queueId === QUEUE.SOLO || queueId === QUEUE.FLEX;
}

export function isRevealed(
  p: LcuCellPlayer,
  ctx: { isMe: boolean; strict: boolean; partyPuuids: ReadonlySet<string> },
): boolean {
  if (!p.puuid) return false;
  if (ctx.isMe) return true;
  if ((p.nameVisibilityType ?? '').toUpperCase() === 'HIDDEN') return false;
  if (ctx.strict) return ctx.partyPuuids.has(p.puuid);
  return true;
}

export interface RevealedPlayer {
  cellId: number;
  puuid: string;
  championId: number;
}

export function buildChampSelect(
  session: LcuChampSelectSession,
  opts: {
    queueId?: number;
    partyPuuids: ReadonlySet<string>;
    ddragon?: DDragon;
    names: ReadonlyMap<string, string>; // puuid -> Riot ID, yalnızca açık oyuncular için
  },
): { state: ChampSelectState; revealed: RevealedPlayer[] } {
  const strict = isStrictQueue(opts.queueId);
  const champ = (id: number) => {
    const c = opts.ddragon?.champion(id);
    return { championKey: c?.key, championName: c?.name };
  };

  const revealed: RevealedPlayer[] = [];
  const sortedTeam = [...session.myTeam].sort((a, b) => a.cellId - b.cellId);
  const myTeam: ChampSelectPlayer[] = sortedTeam.map((p, index) => {
    const isMe = p.cellId === session.localPlayerCellId;
    const open = isRevealed(p, { isMe, strict, partyPuuids: opts.partyPuuids });
    const championId = p.championId || p.championPickIntent || 0;
    let label = `Takım arkadaşı ${index + 1}`;
    if (open && p.puuid) {
      revealed.push({ cellId: p.cellId, puuid: p.puuid, championId });
      const sessionName = p.gameName ? `${p.gameName}${p.tagLine ? '#' + p.tagLine : ''}` : undefined;
      label = sessionName ?? opts.names.get(p.puuid) ?? (isMe ? 'Sen' : label);
    }
    return {
      cellId: p.cellId,
      label,
      revealed: open,
      isMe,
      championId,
      ...champ(championId),
      position: p.assignedPosition || undefined,
    };
  });

  // Rakiplerden yalnızca seçtikleri şampiyon (client'ta da görünen bilgi).
  const theirPicks = [...session.theirTeam]
    .sort((a, b) => a.cellId - b.cellId)
    .map((p) => ({ cellId: p.cellId, championId: p.championId || 0, ...champ(p.championId) }));

  const banIds = new Set<number>([...(session.bans?.myTeamBans ?? []), ...(session.bans?.theirTeamBans ?? [])]);
  for (const group of session.actions ?? []) {
    for (const a of group) if (a.type === 'ban' && a.completed && a.championId > 0) banIds.add(a.championId);
  }

  return {
    state: {
      queueId: opts.queueId,
      anonymous: strict,
      myTeam,
      theirPicks,
      bans: [...banIds].filter((b) => b > 0).map((id) => ({ championId: id, ...champ(id) })),
    },
    revealed,
  };
}
