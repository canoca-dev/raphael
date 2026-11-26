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

export const tierClass = (tier?: string) => (tier ? `tier-${tier.toLowerCase()}` : 'tier-none');

export function formatRank(r?: RankInfo): string {
  if (!r) return 'Derecesiz';
  const apex = ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(r.tier);
  return `${TIERS[r.tier] ?? r.tier}${apex ? '' : ' ' + r.division} · ${r.lp} LP`;
}

export function winRate(wins: number, games: number): string {
  return games ? `%${Math.round((wins / games) * 100)}` : '-';
}

export const positionName = (p?: string) => (p ? POSITIONS[p.toUpperCase()] ?? p : '');

export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const goldK = (g: number) => `${(g / 1000).toFixed(1)}k`;

export function championIcon(version?: string, key?: string): string | undefined {
  if (!version || !key) return undefined;
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${key}.png`;
}
