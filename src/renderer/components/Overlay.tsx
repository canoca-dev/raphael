import type { AppState, TeamSide } from '../../shared/types';
import { clock, formatRank, goldK, tierClass } from '../format';

// Oyunun üstünde duran küçük pencere. Tıklanamaz, Ctrl+Shift+R ile gizlenir.
export function Overlay({ state }: { state: AppState }) {
  const live = state.liveGame;
  if (!live) return null;
  const enemy: TeamSide = live.myTeam === 'ORDER' ? 'CHAOS' : 'ORDER';
  const goldDiff = live.itemGold[live.myTeam] - live.itemGold[enemy];
  return (
    <div className="overlay">
      <div className="ov-row">
        <b>{clock(live.gameTime)}</b>
        <span>
          {live.kills[live.myTeam]} - {live.kills[enemy]}
        </span>
        <span className={goldDiff >= 0 ? 'good' : 'bad'}>
          {goldDiff >= 0 ? '+' : ''}
          {goldK(goldDiff)}
        </span>
      </div>
      {live.objectives.map((o) => (
        <div key={o.name} className="ov-row">
          <span>{o.name}</span>
          <span>{o.nextSpawnAt === null ? '—' : clock(o.nextSpawnAt - live.gameTime)}</span>
        </div>
      ))}
      <div className="ov-title">Rakipler</div>
      {live.players
        .filter((p) => p.team === enemy)
        .map((p) => (
          <div key={p.riotId} className={`ov-row ${p.isDead ? 'dead' : ''}`}>
            <span className="ov-champ">{p.championName}</span>
            <span className={tierClass(p.stats?.rankSolo?.tier)}>{p.stats ? formatRank(p.stats.rankSolo).split(' · ')[0] : ''}</span>
            <span>
              {p.isDead ? `${Math.ceil(p.respawnTimer)} sn` : `${p.kills}/${p.deaths}/${p.assists}`}
            </span>
          </div>
        ))}
    </div>
  );
}
