import { useEffect, useState } from 'react';
import type { AppState, RaphaelBridge } from '../shared/types';
import { ChampSelectView } from './components/ChampSelectView';
import { GameView } from './components/GameView';
import { Overlay } from './components/Overlay';
import { StatusBar } from './components/StatusBar';

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

  useEffect(() => {
    void resolveBridge().then(setBridge);
  }, []);

  useEffect(() => {
    if (!bridge) return;
    void bridge.getState().then(setState);
    return bridge.onState(setState);
  }, [bridge]);

  if (bridge === null) {
    return <div className="fatal">Uygulama bileşenleri yüklenemedi. Uygulamayı kapatıp yeniden aç; sorun sürerse raphael.log dosyasına bak.</div>;
  }
  if (!state || !bridge) return null;
  if (isOverlay) return <Overlay state={state} />;

  return (
    <div className="app">
      <StatusBar state={state} onReload={() => void bridge.reloadEnv().then(setState)} onOpenLog={() => void bridge.openLog()} />
      <main>
        {state.game ? (
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
      <p className="muted small">
        Oyun içi pencere: {state.hotkey ? <b>{state.hotkey.replace(/\+/g, ' + ')}</b> : 'kısayol kaydedilemedi'} ile aç/kapat,
        Ctrl + Shift + F11 ile taşı.
      </p>
    </div>
  );
}
