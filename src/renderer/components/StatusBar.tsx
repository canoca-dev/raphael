import type { ReactElement } from 'react';
import type { AppState, RaphaelBridge } from '../../shared/types';

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

export function StatusBar({ state, onOpenSettings, inSettings }: { state: AppState; onOpenSettings: () => void; inSettings: boolean }) {
  return (
    <header className="statusbar">
      <span className="brand">Raphael</span>
      <span className={`dot ${state.client === 'connected' ? 'on' : 'off'}`} />
      <span>{state.client === 'connected' ? `Client bağlı · ${PHASES[state.phase] ?? state.phase}` : 'Client kapalı'}</span>
      <span className="spacer" />
      {!inSettings && (
        <button onClick={onOpenSettings} title="Riot API anahtarı, kısayol, başlangıç">
          Ayarlar
        </button>
      )}
    </header>
  );
}

/** Kullanıcının bir şey yapması gereken durumlar: anahtar, güncelleme, kısayol, Riot hataları. */
export function Banners({ state, bridge, onOpenSettings, inSettings }: { state: AppState; bridge: RaphaelBridge; onOpenSettings: () => void; inSettings: boolean }) {
  const info = state.app;
  const key = info?.key.status;
  const items: ReactElement[] = [];

  if (info?.update?.state === 'ready') {
    items.push(
      <div key="update" className="banner info">
        <span>Raphael'in yeni sürümü ({info.update.version}) hazır.</span>
        <button onClick={() => void bridge.installUpdate()}>Yeniden başlat ve kur</button>
      </div>,
    );
  }
  if (info?.key.notice && !inSettings) {
    items.push(
      <div key="notice" className="banner good">
        <span>{info.key.notice}</span>
      </div>,
    );
  }
  if (key === 'none' && !inSettings) {
    items.push(
      <div key="nokey" className="banner warn">
        <span>Riot API anahtarı yok: rank, son maçlar ve ustalık için anahtar gerekli.</span>
        <button onClick={onOpenSettings}>Anahtar gir</button>
      </div>,
    );
  } else if (key === 'invalid') {
    items.push(
      <div key="invalid" className="banner bad">
        <span>
          Riot API anahtarının süresi dolmuş ya da geçersiz. Riot sitesinde <b>Regenerate API Key</b>'e basıp yeni anahtarı kopyala; Raphael'e
          dönünce panodan kendisi alır.
        </span>
        <button onClick={() => void bridge.openRiotPortal()}>Riot sitesini aç</button>
        {!inSettings && <button onClick={onOpenSettings}>Ayarlar</button>}
      </div>,
    );
  } else if (state.apiError) {
    items.push(
      <div key="apierror" className="banner warn">
        <span>{state.apiError}</span>
      </div>,
    );
  }
  if (info?.hotkeyError && !inSettings) {
    items.push(
      <div key="hotkey" className="banner warn">
        <span>{info.hotkeyError}</span>
        <button onClick={onOpenSettings}>Ayarlar</button>
      </div>,
    );
  }
  return items.length ? <div className="banners">{items}</div> : null;
}
