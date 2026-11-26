import type { RankInfo } from '../shared/types';

const TIERS: Record<string, string> = {
  IRON: 'Demir',
  BRONZE: 'Bronz',
  SILVER: 'Gümüş',
  GOLD: 'Altın',
  PLATINUM: 'Platin',
  EMERALD: 'Zümrüt',
  DIAMOND: 'Elmas',
  MASTER: 'Ustalık',
  GRANDMASTER: 'Büyük Ustalık',
  CHALLENGER: 'Şampiyonluk',
};

const POSITIONS: Record<string, string> = {
  TOP: 'Üst',
  JUNGLE: 'Orman',
  MIDDLE: 'Orta',
  MID: 'Orta',
  BOTTOM: 'Alt',
  UTILITY: 'Destek',
  SUPPORT: 'Destek',
};

const QUEUES: Record<number, string> = {
  420: 'Dereceli Tek/Çift',
  440: 'Dereceli Esnek',
  400: 'Normal Seçmeli',
  430: 'Normal Kapalı Seçim',
  490: 'Hızlı Oyun',
  450: 'ARAM',
  1700: 'Arena',
};

export const queueName = (id?: number) => (id ? QUEUES[id] ?? `Kuyruk ${id}` : '');

export const tierClass = (tier?: string) => (tier ? `tier-${tier.toLowerCase()}` : 'tier-none');

const APEX = ['MASTER', 'GRANDMASTER', 'CHALLENGER'];

export function formatRank(r?: RankInfo, withLp = true): string {
  if (!r) return 'Derecesiz';
  const name = `${TIERS[r.tier] ?? r.tier}${APEX.includes(r.tier) ? '' : ' ' + r.division}`;
  return withLp ? `${name} · ${r.lp} LP` : name;
}

export function winRate(wins: number, games: number): string {
  return games ? `%${Math.round((wins / games) * 100)}` : '-';
}

export const positionName = (p?: string) => (p ? POSITIONS[p.toUpperCase()] ?? '' : '');

export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const goldK = (g: number) => `${g < 0 ? '-' : ''}${(Math.abs(g) / 1000).toFixed(1)}k`;

export function championIcon(version?: string, key?: string): string | undefined {
  if (!version || !key) return undefined;
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${key}.png`;
}
