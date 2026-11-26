import type { PlayerStats } from '../../shared/types';
import { championIcon, formatRank, positionName, tierClass, winRate } from '../format';

interface Props {
  version?: string;
  championKey?: string;
  championName?: string;
  riotId?: string;
  position?: string;
  isMe?: boolean;
  hidden?: boolean;
  stats?: PlayerStats;
  hasApiKey: boolean;
}

export function PlayerCard(p: Props) {
  const icon = championIcon(p.version, p.championKey);
  const s = p.stats;
  const solo = s?.rankSolo;
  return (
    <div className={`card ${p.isMe ? 'me' : ''}`}>
      <div className="card-head">
        {icon ? <img className="champ" src={icon} alt="" /> : <div className="champ empty" />}
        <div className="who">
          <div className="name">
            {p.hidden && !p.riotId ? 'Gizli oyuncu' : p.riotId ?? '...'}
            {p.isMe && <span className="badge">Sen</span>}
          </div>
          <div className="sub">
            {[positionName(p.position), p.championName ?? 'Seçiyor...'].filter(Boolean).join(' · ')}
          </div>
        </div>
        {s && (
          <div className={`rank ${tierClass(solo?.tier)}`}>
            <div>{formatRank(solo)}</div>
            {solo && <div className="sub">{winRate(solo.wins, solo.wins + solo.losses)} · {solo.wins + solo.losses} maç</div>}
          </div>
        )}
      </div>

      {s?.loading && !s.recent.length && <div className="muted small">Yükleniyor...</div>}
      {s?.error && <div className="warn small">{s.error}</div>}
      {!s && p.hidden && <div className="muted small">Riot seçim ekranında bu oyuncuyu gizliyor. Oyun başlayınca gösteririm.</div>}
      {!s && !p.hidden && !p.hasApiKey && <div className="muted small">Detay için Riot API anahtarı gerekli.</div>}

      {s && !s.loading && (
        <>
          <div className="stats">
            <Stat label="Son maçlar" value={`${s.recentWins}G ${s.recentGames - s.recentWins}M`} />
            <Stat label="KDA" value={s.recentKda.toFixed(1)} />
            <Stat
              label="Bu şampiyon"
              value={s.championGames ? `${s.championWins}/${s.championGames} kazandı` : 'son maçlarda yok'}
            />
            <Stat
              label="Ustalık"
              value={s.mastery ? `Sv ${s.mastery.level} · ${Math.round(s.mastery.points / 1000)}k` : s.mastery === null ? 'Yok' : '-'}
            />
          </div>
          <div className="history">
            {s.recent.map((m) => (
              <span key={m.matchId} className={`pip ${m.win ? 'win' : 'loss'}`} title={`${m.championName} ${m.kills}/${m.deaths}/${m.assists}`}>
                {p.version ? <img src={championIcon(p.version, m.championName)} alt={m.championName} /> : m.championName[0]}
              </span>
            ))}
          </div>
          {s.tags.length > 0 && (
            <div className="tags">
              {s.tags.map((t) => (
                <span key={t.text} className={`tag ${t.kind}`}>
                  {t.text}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}
