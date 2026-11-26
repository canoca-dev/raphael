import { describe, expect, it } from 'vitest';
import { buildChampSelect, isRevealed, isStrictQueue } from '../src/main/champselect';
import type { LcuChampSelectSession } from '../src/main/lcu';
import { testDDragon } from './helpers';

const dd = testDDragon();

// Dereceli seçim ekranı: ben (cell 1), duo arkadaşım (cell 2), client'ın gizlediği
// ama yine de puuid veren bir oyuncu (cell 0) ve tamamen anonim iki oyuncu.
const session: LcuChampSelectSession = {
  localPlayerCellId: 1,
  myTeam: [
    { cellId: 3, championId: 0, puuid: '', assignedPosition: 'bottom', nameVisibilityType: 'HIDDEN' },
    { cellId: 0, championId: 0, championPickIntent: 62, puuid: 'sizan-puuid', assignedPosition: 'top', nameVisibilityType: 'HIDDEN' },
    { cellId: 1, championId: 64, puuid: 'me', gameName: 'Ben', tagLine: 'TR1', assignedPosition: 'jungle', nameVisibilityType: 'VISIBLE' },
    { cellId: 2, championId: 103, puuid: 'duo', gameName: 'Duo', tagLine: 'TR1', nameVisibilityType: 'VISIBLE' },
    { cellId: 4, championId: 0, puuid: 'yabanci', gameName: 'Yabanci', tagLine: 'TR1' },
  ],
  theirTeam: [{ cellId: 5, championId: 86, puuid: 'rakip-puuid', gameName: 'Rakip' }],
  actions: [[{ actorCellId: 1, championId: 266, type: 'ban', completed: true }, { actorCellId: 5, championId: 1, type: 'ban', completed: false }]],
};

describe('seçim ekranı anonimlik kuralı', () => {
  it('dereceli ve bilinmeyen kuyruk sıkı kurala girer', () => {
    expect(isStrictQueue(420)).toBe(true);
    expect(isStrictQueue(440)).toBe(true);
    expect(isStrictQueue(undefined)).toBe(true);
    expect(isStrictQueue(400)).toBe(false);
  });

  it('gizli işaretli oyuncu asla açılmaz, puuid olsa bile', () => {
    expect(isRevealed({ cellId: 0, championId: 0, puuid: 'x', nameVisibilityType: 'HIDDEN' }, { isMe: false, strict: false, partyPuuids: new Set(['x']) })).toBe(false);
  });

  it('dereceli: yalnızca ben ve grubum açılır, rakipler hiç açılmaz', () => {
    const { state, revealed } = buildChampSelect(session, { queueId: 420, partyPuuids: new Set(['me', 'duo']), ddragon: dd, names: new Map() });
    expect(revealed.map((r) => r.puuid).sort()).toEqual(['duo', 'me']);
    expect(state.anonymous).toBe(true);
    const labels = state.myTeam.map((p) => p.label);
    expect(labels).toEqual(['Takım arkadaşı 1', 'Ben#TR1', 'Duo#TR1', 'Takım arkadaşı 4', 'Takım arkadaşı 5']);
    expect(JSON.stringify(state)).not.toContain('sizan-puuid');
    expect(JSON.stringify(state)).not.toContain('Yabanci');
    expect(JSON.stringify(state)).not.toContain('rakip');
    expect(JSON.stringify(state)).not.toContain('Rakip');
    expect(state.theirPicks).toEqual([{ cellId: 5, championId: 86, championKey: 'Garen', championName: 'Garen' }]);
    expect(state.bans.map((b) => b.championName)).toEqual(['Aatrox']);
  });

  it('dereceli ama grup bilgisi yoksa yalnızca ben açılırım', () => {
    const { revealed } = buildChampSelect(session, { queueId: 420, partyPuuids: new Set(), ddragon: dd, names: new Map() });
    expect(revealed.map((r) => r.puuid)).toEqual(['me']);
  });

  it('normal seçmeli: client\'ın gösterdiği takım arkadaşları açılır, gizliler kapalı kalır', () => {
    const { state, revealed } = buildChampSelect(session, { queueId: 400, partyPuuids: new Set(), ddragon: dd, names: new Map() });
    expect(revealed.map((r) => r.puuid).sort()).toEqual(['duo', 'me', 'yabanci']);
    expect(state.anonymous).toBe(false);
    expect(state.myTeam.find((p) => p.cellId === 0)).toMatchObject({ revealed: false, championName: 'Wukong', position: 'top' });
  });

  it('ismi oturumda olmayan açık oyuncu için bilinen ad kullanılır', () => {
    const s: LcuChampSelectSession = { localPlayerCellId: 0, myTeam: [{ cellId: 0, championId: 0, puuid: 'me' }], theirTeam: [] };
    const { state } = buildChampSelect(s, { queueId: 420, partyPuuids: new Set(), ddragon: dd, names: new Map([['me', 'cankut#TR1']]) });
    expect(state.myTeam[0]).toMatchObject({ label: 'cankut#TR1', revealed: true, isMe: true });
  });
});
