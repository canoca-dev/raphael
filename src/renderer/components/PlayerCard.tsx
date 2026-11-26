import type { PlayerStats } from '../../shared/types';
import { championIcon, formatRank, positionName, queueName, tierClass, winRate } from '../format';

interface Props {
  version?: string;
  label: string;
  championKey?: string;
  championName?: string;
  position?: string;
  isMe?: boolean;
  hidden?: boolean; // Riot kuralı gereği gizli oyuncu
  stats?: PlayerStats;
  hasApiKey: boolean;
  queueId?: number;
}

export function PlayerCard(p: Props) {
  const icon = championIcon(p.version, p.championKey);
  const s = p.stats;
  const flexQueue = p.queueId === 440;
  const mainRank = flexQueue ? s?.rankFlex : s?.rankSolo;
  const otherRank = flexQueue ? s?.rankSolo : s?.rankFlex;
  return (
    <div className={`card ${p.isMe ? 'me' : ''} ${p.hidden ? 'hidden-player' : ''}`}>
      <div className="card-head">
        {icon ? <img className="champ" src={icon} alt="" /> : <div className="champ empty" />}
        <div className="who">
          <div className="name">
            {p.label}
            {p.isMe && <span className="badge">Sen</span>}
          </div>
          <div className="sub">{[positionName(p.position), p.championName ?? 'Seçiyor...'].filter(Boolean).join(' · ')}</div>
        </div>
        {s && !s.loading && (
          <div className={`rank ${tierClass(mainRank?.tier)}`}>
            <div>{formatRank(mainRank)}</div>
            {mainRank && (
              <div className="sub">
                {winRate(mainRank.wins, mainRank.wins + mainRank.losses)} · {mainRank.wins + mainRank.losses} maç
              </div>
            )}
            {otherRank && (
              <div className="sub">
                {flexQueue ? 'Tek/Çift' : 'Esnek'}: {formatRank(otherRank, false)}
              </div>
            )}
          </div>
        )}
      </div>

      {p.hidden && <div className="muted small">Riot kuralı gereği bu oyuncunun bilgileri yükleme ekranında görünür.</div>}
      {!p.hidden && !s && !p.hasApiKey && <div className="muted small">Ayrıntılar için Riot API anahtarı gerekli.</div>}
      {s?.loading && <div className="muted small">Yükleniyor...</div>}
      {s?.error && !s.loading && <div className="warn small">{s.error}</div>}

      {s && !s.loading && (
        <>
          <div className="stats">
            <Stat
              label={s.recentQueueId ? `Son ${queueName(s.recentQueueId)}` : 'Son maçlar'}
              value={s.recentLoading ? '...' : s.recentGames ? `${s.recentWins}G ${s.recentGames - s.recentWins}M` : 'maç yok'}
            />
            <Stat label="KDA" value={s.recentLoading ? '...' : s.recentGames ? s.recentKda.toFixed(1) : '-'} />
            <Stat
              label="Bu şampiyonla"
              value={s.recentLoading ? '...' : s.championGames ? `${s.championWins}/${s.championGames} kazandı` : 'son maçlarda yok'}
            />
            <Stat
              label="Ustalık"
              value={
                s.mastery
                  ? `Sv ${s.mastery.level} · ${Math.round(s.mastery.points / 1000)}k`
                  : s.mastery === null
                    ? 'Hiç oynamamış'
                    : '...'
              }
            />
          </div>
          {s.recent.length > 0 && (
            <div className="history">
              {s.recent.map((m) => (
                <span
                  key={m.matchId}
                  className={`pip ${m.remake ? 'remake' : m.win ? 'win' : 'loss'}`}
                  title={`${m.kills}/${m.deaths}/${m.assists}${m.remake ? ' (remake)' : ''}`}
                >
                  {championIcon(p.version, m.championKey) ? <img src={championIcon(p.version, m.championKey)} alt="" /> : '?'}
                </span>
              ))}
            </div>
          )}
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
