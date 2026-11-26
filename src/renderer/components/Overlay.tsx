import type { AppState } from '../../shared/types';
import { clock, formatRank, goldK, tierClass } from '../format';
import { enemyOf } from './GameView';

// Oyunun üstünde duran küçük pencere. Normalde tıklanamaz; taşıma modunda sürüklenebilir.
export function Overlay({ state }: { state: AppState }) {
  const game = state.game;
  const moving = !!state.overlayMoving;

  if (!game || game.stage !== 'live') {
    return moving ? (
      <div className="overlay moving">
        <div className="drag">Taşımak için sürükle · bitince Ctrl + Shift + F11</div>
        <div className="muted">Oyun başlayınca bilgiler burada görünecek.</div>
      </div>
    ) : null;
  }

  const enemy = enemyOf(game.myTeam);
  const goldDiff = (game.itemGold?.[game.myTeam] ?? 0) - (game.itemGold?.[enemy] ?? 0);
  const t = game.gameTime ?? 0;
  return (
    <div className={`overlay ${moving ? 'moving' : ''}`}>
      {moving && <div className="drag">Taşımak için sürükle · bitince Ctrl + Shift + F11</div>}
      <div className="ov-row">
        <b>{clock(t)}</b>
        <span>
          {game.kills?.[game.myTeam] ?? 0} - {game.kills?.[enemy] ?? 0}
        </span>
        <span className={goldDiff >= 0 ? 'good' : 'bad'} title="Eşya altını farkı">
          {goldDiff >= 0 ? '+' : ''}
          {goldK(goldDiff)}
        </span>
      </div>
      {game.objectives?.map((o) => (
        <div key={o.name} className="ov-row">
          <span>{o.name}</span>
          <span>{o.nextSpawnAt === null ? 'haritada' : clock(o.nextSpawnAt - t)}</span>
        </div>
      ))}
      <div className="ov-title">Rakipler</div>
      {game.players
        .filter((p) => p.team === enemy)
        .map((p) => {
          const rank = game.queueId === 440 ? p.stats?.rankFlex : p.stats?.rankSolo;
          return (
            <div key={p.riotId + p.championId} className={`ov-row ${p.live?.isDead ? 'dead' : ''}`}>
              <span className="ov-champ">{p.championName ?? '?'}</span>
              <span className={tierClass(rank?.tier)}>{p.stats && !p.stats.loading ? formatRank(rank, false) : ''}</span>
              <span className="ov-kda">
                {p.live?.isDead ? `${Math.ceil(p.live.respawnTimer)} sn` : p.live ? `${p.live.kills}/${p.live.deaths}/${p.live.assists}` : ''}
              </span>
            </div>
          );
        })}
    </div>
  );
}
