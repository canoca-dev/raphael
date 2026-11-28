import { useEffect, useState, type ReactNode } from 'react';
import { acceleratorFromEvent, DEFAULT_OVERLAY_HOTKEY, formatHotkey, hotkeyProblem, MOVE_HOTKEY } from '../../shared/hotkey';
import { PERSONAL_KEY_DESCRIPTION, RIOT_LEGAL } from '../../shared/riot';
import type { ActionResult, AppInfo, AppState, KeyStatus, RaphaelBridge } from '../../shared/types';

const KEY_STATUS: Record<KeyStatus, { text: string; cls: string }> = {
  none: { text: 'Anahtar yok', cls: 'bad' },
  checking: { text: 'Kontrol ediliyor…', cls: 'info' },
  ok: { text: 'Çalışıyor', cls: 'good' },
  invalid: { text: 'Süresi dolmuş ya da geçersiz', cls: 'bad' },
  offline: { text: "Riot'a ulaşılamıyor", cls: 'warn' },
  unknown: { text: 'Riot hata veriyor, birazdan yeniden denenecek', cls: 'warn' },
};

export function Settings({ state, bridge, onClose }: { state: AppState; bridge: RaphaelBridge; onClose: () => void }) {
  const info = state.app;
  if (!info) return null;
  return (
    <div className="settings">
      <div className="settings-head">
        <button onClick={onClose}>← Geri</button>
        <h1>Ayarlar</h1>
      </div>
      <KeySection info={info} bridge={bridge} />
      <HotkeySection info={info} state={state} bridge={bridge} />
      <StartupSection info={info} bridge={bridge} />
      <AboutSection info={info} bridge={bridge} />
    </div>
  );
}

function Result({ r }: { r?: ActionResult | null }) {
  if (!r?.message) return null;
  return <div className={`result ${r.ok ? 'good' : 'bad'}`}>{r.message}</div>;
}

function KeySection({ info, bridge }: { info: AppInfo; bridge: RaphaelBridge }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const status = KEY_STATUS[info.key.status];

  const run = async (action: () => Promise<ActionResult>) => {
    setBusy(true);
    setResult(null);
    try {
      const r = await action();
      setResult(r);
      if (r.ok) setValue('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel" id="anahtar">
      <h2>
        <span lang="en">Riot</span> API anahtarı
      </h2>
      <div className="row">
        <span className={`pill ${status.cls}`}>{status.text}</span>
        {info.key.masked && (
          <span className="muted small">
            {info.key.masked}
            {info.key.source === 'env' ? ' · .env dosyasından' : ''}
            {info.key.savedAt ? ` · ${new Date(info.key.savedAt).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })} tarihinde kaydedildi` : ''}
          </span>
        )}
      </div>
      {info.key.notice && <div className="result good">{info.key.notice}</div>}

      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) void run(() => bridge.saveKey(value));
        }}
      >
        <input
          type="password"
          placeholder="RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          aria-label="Riot API anahtarı"
        />
        <button type="submit" disabled={busy || !value.trim()}>
          Kaydet
        </button>
        <button type="button" disabled={busy} onClick={() => void run(() => bridge.pasteKey())}>
          Panodan yapıştır
        </button>
      </form>
      <Result r={result} />

      <div className="row">
        <button onClick={() => void bridge.openRiotPortal()}>Riot sitesini aç</button>
        <button disabled={busy || info.key.status === 'none'} onClick={() => void bridge.recheckKey()}>
          Yeniden dene
        </button>
        {info.key.source === 'settings' && (
          <button className="link" onClick={() => void bridge.clearKey()}>
            Anahtarı sil
          </button>
        )}
      </div>

      <div className="help">
        <p>
          <b>Günlük anahtar</b> (Development) 24 saatte bir geçersiz olur ve yalnızca Riot sitesinde yenilenir; Raphael bunu senin yerine
          yapamaz. Süresi dolunca Raphael bildirim gösterir. Yenilemek için <b>Riot sitesini aç</b>, giriş yap, <b>Regenerate API Key</b>'e
          bas ve anahtarın yanındaki kopyala düğmesine tıkla. Raphael'e dönünce panodaki yeni anahtarı kendisi alır.
        </p>
        <details>
          <summary>
            <b>Kalıcı anahtar (Personal API Key):</b> süresi dolmaz, her gün yenilemekten kurtarır. Nasıl başvurulur?
          </summary>
          <ol>
            <li>
              <b>Riot sitesini aç</b> ve Riot hesabınla giriş yap.
            </li>
            <li>
              Ana sayfadaki <b>Register Product</b> düğmesine bas, <b>Personal API Key</b>'i seç.
            </li>
            <li>
              Ürün adına <b>Raphael</b> yaz. Riot ayrıntılı açıklama istiyor; aşağıdaki metni kopyalayıp açıklama alanına yapıştır. Adres
              sorarsa: https://github.com/canoca-dev/raphael
            </li>
            <li>Kuralları kabul edip gönder. Riot başvuruyu inceler, sonuç sitedeki mesajlarına gelir (süre belirtilmiyor).</li>
            <li>Onaylanınca anahtar sitede ürününün sayfasında görünür. Kopyala; Raphael panodan alır ya da buraya yapıştırırsın.</li>
          </ol>
          <CopyBox text={PERSONAL_KEY_DESCRIPTION} />
        </details>
        <p className="muted small">Anahtar yalnızca bu bilgisayarda, Windows'un şifrelemesiyle saklanır. Kimseyle paylaşma, sohbete yazma.</p>
      </div>
    </section>
  );
}

function CopyBox({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copybox">
      <textarea readOnly value={text} rows={7} onFocus={(e) => e.currentTarget.select()} />
      <button
        onClick={() =>
          void navigator.clipboard.writeText(text).then(
            () => setCopied(true),
            () => setCopied(false),
          )
        }
      >
        {copied ? 'Kopyalandı' : 'Metni kopyala'}
      </button>
    </div>
  );
}

function HotkeySection({ info, state, bridge }: { info: AppInfo; state: AppState; bridge: RaphaelBridge }) {
  const [capturing, setCapturing] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);

  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setCapturing(false);
        setPreview(null);
        return;
      }
      const acc = acceleratorFromEvent(e);
      if (!acc) return; // yalnız Ctrl/Alt/Shift: asıl tuşu bekle
      setPreview(acc);
      const problem = hotkeyProblem(acc);
      if (problem) {
        setResult({ ok: false, message: problem });
        return;
      }
      setCapturing(false);
      void bridge.setHotkey(acc).then((r) => setResult(r.ok ? { ok: true, message: `Kısayol ${formatHotkey(acc)} oldu.` } : r));
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing, bridge]);

  return (
    <section className="panel" id="kisayol">
      <h2>Oyun içi pencere</h2>
      <div className="row">
        <span>Aç/kapat kısayolu:</span>
        <kbd>{formatHotkey(capturing ? (preview ?? undefined) : info.hotkey) || '…'}</kbd>
        {capturing ? (
          <span className="muted small">Yeni kısayola bas (vazgeçmek için Esc)</span>
        ) : (
          <>
            <button
              onClick={() => {
                setResult(null);
                setPreview(null);
                setCapturing(true);
              }}
            >
              Değiştir
            </button>
            {info.hotkey !== DEFAULT_OVERLAY_HOTKEY && (
              <button className="link" onClick={() => void bridge.setHotkey(DEFAULT_OVERLAY_HOTKEY).then(setResult)}>
                Varsayılana dön ({formatHotkey(DEFAULT_OVERLAY_HOTKEY)})
              </button>
            )}
          </>
        )}
      </div>
      <Result r={result} />
      {info.hotkeyError && <div className="result bad">{info.hotkeyError}</div>}
      <p className="muted small">
        Kısayol yalnızca oyun sırasında çalışır{info.hotkeyActive ? ' (şu an etkin)' : ''}. Oyun dışında {formatHotkey(info.hotkey)} diğer
        programlarda her zamanki gibi çalışır. Oyun içi pencerenin oyunun üstünde görünmesi için oyun ayarlarında pencere modunu{' '}
        <b>Kenarlıksız</b> seç.
      </p>
      <div className="row">
        <button onClick={() => void bridge.toggleOverlayMove()}>{state.overlayMoving ? 'Taşımayı bitir' : 'Pencerenin yerini değiştir'}</button>
        <span className="muted small">Ya da {formatHotkey(MOVE_HOTKEY)}. Sürükle, bitince tekrar bas; yeri saklanır.</span>
      </div>
    </section>
  );
}

function Toggle({ checked, disabled, onChange, children }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className={`toggle ${disabled ? 'disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

function StartupSection({ info, bridge }: { info: AppInfo; bridge: RaphaelBridge }) {
  return (
    <section className="panel" id="baslangic">
      <h2>Başlangıç</h2>
      <Toggle checked={info.openAtLogin} disabled={!info.packaged} onChange={(v) => void bridge.setOptions({ openAtLogin: v })}>
        Windows açılınca Raphael'i arka planda başlat
        {!info.packaged && <span className="muted small"> (kurulum dosyasıyla kurulunca çalışır)</span>}
      </Toggle>
      <Toggle checked={info.showOnChampSelect} onChange={(v) => void bridge.setOptions({ showOnChampSelect: v })}>
        Şampiyon seçimi başlayınca Raphael penceresini öne getir
      </Toggle>
      <p className="muted small">
        Pencereyi kapatınca Raphael saatin yanındaki simgede çalışmaya devam eder. Tamamen kapatmak için simgeye sağ tıklayıp <b>Çıkış</b>'a bas.
      </p>
    </section>
  );
}

function AboutSection({ info, bridge }: { info: AppInfo; bridge: RaphaelBridge }) {
  return (
    <section className="panel" id="hakkinda">
      <h2>Hakkında</h2>
      <div className="row">
        <span>Raphael {info.version}</span>
        {info.update?.state === 'downloading' && <span className="muted small">Yeni sürüm ({info.update.version}) indiriliyor…</span>}
        {info.update?.state === 'ready' && <button onClick={() => void bridge.installUpdate()}>Güncellemeyi kur ({info.update.version})</button>}
        {!info.packaged && <span className="muted small">Geliştirme modunda; otomatik güncelleme kurulu sürümde çalışır.</span>}
        <span className="spacer" />
        <button onClick={() => void bridge.openLog()}>Günlüğü aç</button>
      </div>
      <p className="muted small legal">{RIOT_LEGAL}</p>
    </section>
  );
}
