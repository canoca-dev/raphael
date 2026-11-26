import type { AppState } from '../../shared/types';

const PHASES: Record<string, string> = {
  None: 'Ana ekran',
  Lobby: 'Lobi',
  Matchmaking: 'Maç aranıyor',
  ReadyCheck: 'Maç bulundu',
  ChampSelect: 'Şampiyon seçimi',
  GameStart: 'Oyun başlıyor',
  InProgress: 'Oyunda',
  Reconnect: 'Yeniden bağlanılıyor',
  WaitingForStats: 'Maç sonu',
  PreEndOfGame: 'Maç sonu',
  EndOfGame: 'Maç sonu',
};

export function StatusBar({ state, onReload, onOpenLog }: { state: AppState; onReload: () => void; onOpenLog: () => void }) {
  return (
    <header className="statusbar">
      <span className="brand">Raphael</span>
      <span className={`dot ${state.client === 'connected' ? 'on' : 'off'}`} />
      <span>{state.client === 'connected' ? `Client bağlı · ${PHASES[state.phase] ?? state.phase}` : 'Client kapalı'}</span>
      <span className="spacer" />
      {!state.hasApiKey && <span className="warn">Riot API anahtarı yok: yalnızca temel bilgiler görünür</span>}
      {state.apiError && <span className="warn">{state.apiError}</span>}
      <button onClick={onReload} title=".env dosyasını yeniden oku">
        Anahtarı yenile
      </button>
      <button onClick={onOpenLog} title="Sorun olursa bu dosyaya bakılır">
        Günlük
      </button>
    </header>
  );
}
