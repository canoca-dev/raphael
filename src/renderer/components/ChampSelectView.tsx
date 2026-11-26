import type { AppState, ChampSelectState } from '../../shared/types';
import { PlayerCard } from './PlayerCard';

export function ChampSelectView({ state, cs }: { state: AppState; cs: ChampSelectState }) {
  return (
    <div className="champselect">
      <section>
        <h2>Takımın</h2>
        <div className="cards">
          {cs.myTeam.map((p) => (
            <PlayerCard
              key={p.cellId}
              version={state.ddragonVersion}
              championKey={p.championKey}
              championName={p.championName}
              riotId={p.riotId}
              position={p.position}
              isMe={p.isMe}
              hidden={p.hidden}
              stats={p.stats}
              hasApiKey={state.hasApiKey}
            />
          ))}
        </div>
      </section>
      <section>
        <h2>Rakip seçimleri</h2>
        <div className="enemy-picks">
          {cs.theirTeam.map((p) => (
            <div key={p.cellId} className="enemy-pick">
              {p.championKey && state.ddragonVersion ? (
                <img src={`https://ddragon.leagueoflegends.com/cdn/${state.ddragonVersion}/img/champion/${p.championKey}.png`} alt="" />
              ) : (
                <div className="champ empty" />
              )}
              <span>{p.championName ?? 'Seçiyor...'}</span>
            </div>
          ))}
        </div>
        <p className="muted small">Rakiplerin isimleri seçim ekranında gizli. Rank ve geçmişleri oyun başlayınca görünür.</p>
      </section>
    </div>
  );
}
