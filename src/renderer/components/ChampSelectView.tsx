import type { AppState, ChampSelectState } from '../../shared/types';
import { championIcon, queueName } from '../format';
import { PlayerCard } from './PlayerCard';

export function ChampSelectView({ state, cs }: { state: AppState; cs: ChampSelectState }) {
  return (
    <div className="champselect">
      {cs.anonymous && (
        <div className="notice">
          {queueName(cs.queueId) || 'Dereceli'} seçim ekranında Riot oyuncuları gizliyor. Kurallar gereği burada yalnızca sen ve
          grubundaki arkadaşların görünür. Herkesin bilgisi yükleme ekranı başlayınca gelecek.
        </div>
      )}
      <section>
        <h2>Takımın {cs.queueId && !cs.anonymous ? <span className="muted">· {queueName(cs.queueId)}</span> : null}</h2>
        <div className="cards">
          {cs.myTeam.map((p) => (
            <PlayerCard
              key={p.cellId}
              version={state.ddragonVersion}
              label={p.label}
              championKey={p.championKey}
              championName={p.championName}
              position={p.position}
              isMe={p.isMe}
              hidden={!p.revealed}
              stats={p.stats}
              hasApiKey={state.hasApiKey}
              queueId={cs.queueId}
            />
          ))}
        </div>
      </section>
      <section>
        <h2>Rakip seçimleri</h2>
        <div className="picks">
          {cs.theirPicks.map((p) => (
            <Pick key={p.cellId} version={state.ddragonVersion} championKey={p.championKey} name={p.championId ? p.championName ?? '?' : 'Seçiyor...'} />
          ))}
        </div>
      </section>
      {cs.bans.length > 0 && (
        <section>
          <h2>Yasaklar</h2>
          <div className="picks small-picks">
            {cs.bans.map((b) => (
              <Pick key={b.championId} version={state.ddragonVersion} championKey={b.championKey} name={b.championName ?? '?'} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Pick({ version, championKey, name }: { version?: string; championKey?: string; name: string }) {
  const icon = championIcon(version, championKey);
  return (
    <div className="pick">
      {icon ? <img src={icon} alt="" /> : <div className="champ empty" />}
      <span>{name}</span>
    </div>
  );
}
