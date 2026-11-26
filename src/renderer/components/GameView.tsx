import type { AppState, GamePlayer, GameState, TeamSide } from '../../shared/types';
import { championIcon, clock, formatRank, goldK, queueName, tierClass, winRate } from '../format';
import { PlayerCard } from './PlayerCard';

export const enemyOf = (t: TeamSide): TeamSide => (t === 'ORDER' ? 'CHAOS' : 'ORDER');

export function GameView({ state, game }: { state: AppState; game: GameState }) {
  const enemy = enemyOf(game.myTeam);
  const mine = game.players.filter((p) => p.team === game.myTeam);
  const theirs = game.players.filter((p) => p.team === enemy);

  if (game.stage === 'loading') {
    return (
      <div className="game">
        <div className="notice">Yükleme ekranı{game.queueId ? ` · ${queueName(game.queueId)}` : ''}. Herkesin bilgisi hazırlanıyor.</div>
        <div className="teams">
          <TeamCards title="Takımın" players={mine} state={state} queueId={game.queueId} />
          <TeamCards title="Rakipler" players={theirs} state={state} queueId={game.queueId} />
        </div>
      </div>
    );
  }

  const goldDiff = (game.itemGold?.[game.myTeam] ?? 0) - (game.itemGold?.[enemy] ?? 0);
  return (
    <div className="game">
      <div className="live-head">
        <span className="clock">{clock(game.gameTime ?? 0)}</span>
        <span>
          Skor {game.kills?.[game.myTeam] ?? 0} - {game.kills?.[enemy] ?? 0}
        </span>
        <span className={goldDiff >= 0 ? 'good' : 'bad'}>
          Eşya altını farkı {goldDiff >= 0 ? '+' : ''}
          {goldK(goldDiff)}
        </span>
        <span className="spacer" />
        {game.objectives?.map((o) => (
          <span key={o.name} className="objective">
            {o.name}: {o.nextSpawnAt === null ? 'haritada' : clock(o.nextSpawnAt - (game.gameTime ?? 0))}
          </span>
        ))}
      </div>
      <div className="teams">
        <TeamTable title="Takımın" players={mine} version={state.ddragonVersion} queueId={game.queueId} />
        <TeamTable title="Rakipler" players={theirs} version={state.ddragonVersion} queueId={game.queueId} />
      </div>
    </div>
  );
}

function TeamCards({ title, players, state, queueId }: { title: string; players: GamePlayer[]; state: AppState; queueId?: number }) {
  return (
    <section>
      <h2>{title}</h2>
      <div className="cards single">
        {players.map((p) => (
          <PlayerCard
            key={p.riotId + p.championId}
            version={state.ddragonVersion}
            label={p.riotId}
            championKey={p.championKey}
            championName={p.championName}
            position={p.position}
            isMe={p.isMe}
            stats={p.stats}
            hasApiKey={state.hasApiKey}
            queueId={queueId}
          />
        ))}
      </div>
    </section>
  );
}

function TeamTable({ title, players, version, queueId }: { title: string; players: GamePlayer[]; version?: string; queueId?: number }) {
  return (
    <section>
      <h2>{title}</h2>
      <table>
        <thead>
          <tr>
            <th>Oyuncu</th>
            <th>Rank</th>
            <th>Son maçlar</th>
            <th>Sv</th>
            <th>KDA</th>
            <th>CS</th>
            <th>Eşya</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => {
            const rank = queueId === 440 ? p.stats?.rankFlex : p.stats?.rankSolo;
            const icon = championIcon(version, p.championKey);
            return (
              <tr key={p.riotId + p.championId} className={`${p.isMe ? 'me' : ''} ${p.live?.isDead ? 'dead' : ''}`}>
                <td>
                  <div className="cell-player">
                    {icon ? <img src={icon} alt="" /> : <span className="champ-dot" />}
                    <div>
                      <div>{p.riotId.split('#')[0]}</div>
                      <div className="sub">
                        {p.championName}
                        {p.live?.isDead && ` · ${Math.ceil(p.live.respawnTimer)} sn`}
                      </div>
                    </div>
                  </div>
                </td>
                <td className={tierClass(rank?.tier)}>{p.stats ? (p.stats.loading ? '...' : formatRank(rank)) : '-'}</td>
                <td>{p.stats && !p.stats.recentLoading ? `${winRate(p.stats.recentWins, p.stats.recentGames)} (${p.stats.recentGames})` : p.stats ? '...' : '-'}</td>
                <td>{p.live?.level ?? '-'}</td>
                <td>{p.live ? `${p.live.kills}/${p.live.deaths}/${p.live.assists}` : '-'}</td>
                <td>{p.live?.cs ?? '-'}</td>
                <td>{p.live ? goldK(p.live.itemGold) : '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
