import { useEffect, useState } from 'react';
import type { AppState, RaphaelBridge } from '../shared/types';
import { ChampSelectView } from './components/ChampSelectView';
import { LiveView } from './components/LiveView';
import { Overlay } from './components/Overlay';
import { StatusBar } from './components/StatusBar';
import { mockBridge } from './mock';

declare global {
  interface Window {
    raphael?: RaphaelBridge;
  }
}

// Electron dışında (tarayıcı önizlemesi) örnek verilerle çalışır.
const bridge: RaphaelBridge = window.raphael ?? mockBridge(new URLSearchParams(location.search).get('mock') ?? 'champ');
const isOverlay = new URLSearchParams(location.search).get('overlay') === '1';

export function App() {
  const [state, setState] = useState<AppState | null>(null);

  useEffect(() => {
    bridge.getState().then(setState);
    return bridge.onState(setState);
  }, []);

  if (!state) return null;
  if (isOverlay) return <Overlay state={state} />;

  return (
    <div className="app">
      <StatusBar state={state} onReload={() => bridge.reloadEnv().then(setState)} />
      <main>
        {state.liveGame ? (
          <LiveView state={state} live={state.liveGame} />
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
  return (
    <div className="idle">
      <h1>Raphael</h1>
      {state.client === 'disconnected' ? (
        <p>LoL client'ı bekleniyor. Client'ı açınca otomatik bağlanacağım.</p>
      ) : (
        <p>Client'a bağlandım. Şampiyon seçimine girdiğinde takımın burada görünecek.</p>
      )}
      <p className="muted">Oyun içi pencereyi aç/kapat: Ctrl + Shift + R</p>
    </div>
  );
}
