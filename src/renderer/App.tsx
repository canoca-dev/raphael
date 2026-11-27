import { useEffect, useRef, useState } from 'react';
import { formatHotkey, MOVE_HOTKEY } from '../shared/hotkey';
import { RIOT_LEGAL } from '../shared/riot';
import type { AppState, RaphaelBridge } from '../shared/types';
import { ChampSelectView } from './components/ChampSelectView';
import { GameView } from './components/GameView';
import { Overlay } from './components/Overlay';
import { Settings } from './components/Settings';
import { Banners, StatusBar } from './components/StatusBar';

declare global {
  interface Window {
    raphael?: RaphaelBridge;
  }
}

const params = new URLSearchParams(location.search);
const isOverlay = params.get('overlay') === '1';

async function resolveBridge(): Promise<RaphaelBridge | null> {
  if (window.raphael) return window.raphael;
  // Örnek veri yalnızca geliştirme önizlemesinde (npm run preview:mock); gerçek uygulamada asla.
  if (import.meta.env.DEV) {
    const { mockBridge } = await import('./mock');
    return mockBridge(params.get('mock') ?? 'champ');
  }
  return null;
}

export function App() {
  const [bridge, setBridge] = useState<RaphaelBridge | null | undefined>(undefined);
  const [state, setState] = useState<AppState | null>(null);
  const [view, setView] = useState<'main' | 'settings'>(params.get('view') === 'settings' ? 'settings' : 'main');
  const askedForKey = useRef(false);

  useEffect(() => {
    void resolveBridge().then(setBridge);
  }, []);

  useEffect(() => {
    if (!bridge) return;
    void bridge.getState().then(setState);
    const offState = bridge.onState(setState);
    const offSettings = bridge.onOpenSettings(() => setView('settings'));
    return () => {
      offState();
      offSettings();
    };
  }, [bridge]);

  // İlk açılışta anahtar yoksa doğrudan ayarlara götür.
  useEffect(() => {
    if (isOverlay || askedForKey.current || !state?.app) return;
    askedForKey.current = true;
    if (state.app.key.status === 'none') setView('settings');
  }, [state]);

  if (bridge === null) {
    return <div className="fatal">Uygulama bileşenleri yüklenemedi. Uygulamayı kapatıp yeniden aç; sorun sürerse raphael.log dosyasına bak.</div>;
  }
  if (!state || !bridge) return null;
  if (isOverlay) return <Overlay state={state} />;

  const inSettings = view === 'settings';
  const openSettings = () => setView('settings');
  return (
    <div className="app">
      <StatusBar state={state} onOpenSettings={openSettings} inSettings={inSettings} />
      <Banners state={state} bridge={bridge} onOpenSettings={openSettings} inSettings={inSettings} />
      <main>
        {inSettings ? (
          <Settings state={state} bridge={bridge} onClose={() => setView('main')} />
        ) : state.game ? (
          <GameView state={state} game={state.game} />
        ) : state.champSelect ? (
          <ChampSelectView state={state} cs={state.champSelect} />
        ) : (
          <Idle state={state} />
        )}
      </main>
    </div>
  );
}

function Idle({ state }: { state: AppState }) {
  const loading = ['GameStart', 'InProgress', 'Reconnect'].includes(state.phase);
  return (
    <div className="idle">
      <h1>Raphael</h1>
      {loading ? (
        <p>
          Oyun yükleniyor. Oyuncu listesi Riot API'den gelince burada görünecek.
          {!state.hasApiKey && ' Bunun için Riot API anahtarı gerekli.'}
        </p>
      ) : state.client === 'disconnected' ? (
        <p>LoL client'ı bekleniyor. Client'ı açınca otomatik bağlanacağım.</p>
      ) : (
        <p>Client'a bağlandım. Şampiyon seçimine girince bilgiler burada görünecek.</p>
      )}
      {state.app && (
        <p className="muted small">
          Oyun içi pencere oyun sırasında <b>{formatHotkey(state.app.hotkey)}</b> ile açılıp kapanır, {formatHotkey(MOVE_HOTKEY)} ile taşınır.
        </p>
      )}
      <p className="muted legal">{RIOT_LEGAL}</p>
    </div>
  );
}
