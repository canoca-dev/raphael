import type { AppState, LiveGameState, LivePlayer, TeamSide } from '../../shared/types';
import { championIcon, clock, formatRank, goldK, tierClass, winRate } from '../format';

export function LiveView({ state, live }: { state: AppState; live: LiveGameState }) {
  const enemy: TeamSide = live.myTeam === 'ORDER' ? 'CHAOS' : 'ORDER';
  const goldDiff = live.itemGold[live.myTeam] - live.itemGold[enemy];
  return (
    <div className="live">
      <div className="live-head">
        <span className="clock">{clock(live.gameTime)}</span>
        <span>
          Skor {live.kills[live.myTeam]} - {live.kills[enemy]}
        </span>
        <span className={goldDiff >= 0 ? 'good' : 'bad'}>
          Eşya altını farkı {goldDiff >= 0 ? '+' : ''}
          {goldK(goldDiff)}
        </span>
        <span className="spacer" />
        {live.objectives.map((o) => (
          <span key={o.name} className="objective">
            {o.name}: {o.nextSpawnAt === null ? 'haritada / bilinmiyor' : clock(o.nextSpawnAt - live.gameTime)}
          </span>
        ))}
      </div>
      <div className="teams">
        <TeamTable title="Takımın" players={live.players.filter((p) => p.team === live.myTeam)} version={state.ddragonVersion} />
        <TeamTable title="Rakipler" players={live.players.filter((p) => p.team === enemy)} version={state.ddragonVersion} />
      </div>
    </div>
  );
}

function TeamTable({ title, players, version }: { title: string; players: LivePlayer[]; version?: string }) {
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
          {players.map((p) => (
            <tr key={p.riotId} className={`${p.isMe ? 'me' : ''} ${p.isDead ? 'dead' : ''}`}>
              <td>
                <div className="cell-player">
                  {championIcon(version, p.championKey) && <img src={championIcon(version, p.championKey)} alt="" />}
                  <div>
                    <div>{p.riotId.split('#')[0]}</div>
                    <div className="sub">
                      {p.championName}
                      {p.isDead && ` · ${Math.ceil(p.respawnTimer)} sn`}
                    </div>
                  </div>
                </div>
              </td>
              <td className={tierClass(p.stats?.rankSolo?.tier)}>{p.stats ? formatRank(p.stats.rankSolo) : '...'}</td>
              <td>{p.stats ? `${winRate(p.stats.recentWins, p.stats.recentGames)} (${p.stats.recentGames})` : '...'}</td>
              <td>{p.level}</td>
              <td>
                {p.kills}/{p.deaths}/{p.assists}
              </td>
              <td>{p.cs}</td>
              <td>{goldK(p.itemGold)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
