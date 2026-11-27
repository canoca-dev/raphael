// Kısayol yardımcıları. Kısayollar Electron biçiminde tutulur: "Control+Z", "Alt+F2" gibi.
// Hem ana süreç (doğrulama) hem arayüz (tuş yakalama, gösterme) kullanır.

export const DEFAULT_OVERLAY_HOTKEY = 'Control+Z';
export const MOVE_HOTKEY = 'Control+Shift+F11';

const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta', 'OS', 'AltGraph', 'CapsLock', 'Fn']);
const FUNCTION_KEY = /^F([1-9]|1[0-9]|2[0-4])$/;

export interface KeyLike {
  key: string;
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

const NAMED_CODES: Record<string, string> = {
  Space: 'Space',
  Tab: 'Tab',
  Insert: 'Insert',
  Delete: 'Delete',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
};

/** Klavye olayından kısayol üretir. Yalnız Ctrl/Alt/Shift'e basıldıysa ya da tuş desteklenmiyorsa null. */
export function acceleratorFromEvent(e: KeyLike): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;
  const key = keyName(e);
  if (!key) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Control');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Super');
  parts.push(key);
  return parts.join('+');
}

function keyName(e: KeyLike): string | null {
  // Harflerde tuşun üstünde yazan harf esas alınır (Windows kısayolları da böyle çalışır).
  if (/^[a-z]$/i.test(e.key)) return e.key.toUpperCase();
  let m: RegExpExecArray | null;
  if ((m = /^Key([A-Z])$/.exec(e.code))) return m[1];
  if ((m = /^Digit([0-9])$/.exec(e.code))) return m[1];
  if ((m = /^Numpad([0-9])$/.exec(e.code))) return `num${m[1]}`;
  if (FUNCTION_KEY.test(e.code)) return e.code;
  return NAMED_CODES[e.code] ?? null;
}

const RESERVED: Record<string, string> = {
  'Alt+F4': 'Alt + F4 pencereleri kapatır',
  'Alt+Tab': 'Alt + Tab pencereler arasında geçiş yapar',
  'Control+Alt+Delete': 'Ctrl + Alt + Delete Windows tarafından kullanılır',
  'Control+Shift+Escape': 'Ctrl + Shift + Esc Görev Yöneticisi’ni açar',
  [MOVE_HOTKEY]: 'Ctrl + Shift + F11 oyun içi pencereyi taşımak için kullanılıyor',
};

/** Kısayolda sorun varsa açıklamasını, yoksa null döner. */
export function hotkeyProblem(acc: string): string | null {
  const parts = acc.split('+').filter(Boolean);
  const key = parts[parts.length - 1];
  const mods = parts.slice(0, -1);
  if (!key || ['Control', 'Alt', 'Shift', 'Super'].includes(key)) return 'Ctrl, Alt ya da Shift ile birlikte bir tuşa bas.';
  if (RESERVED[acc]) return `${RESERVED[acc]}, başka bir kısayol seç.`;
  const strongModifier = mods.some((m) => m === 'Control' || m === 'Alt' || m === 'Super');
  if (!strongModifier && !FUNCTION_KEY.test(key)) {
    return 'Sohbete yazarken karışmaması için Ctrl ya da Alt ile birlikte seç (F tuşları tek başına da olur).';
  }
  return null;
}

const MODIFIER_ALIASES: Record<string, string> = {
  control: 'Control',
  ctrl: 'Control',
  cmdorctrl: 'Control',
  commandorcontrol: 'Control',
  alt: 'Alt',
  shift: 'Shift',
  super: 'Super',
  win: 'Super',
  meta: 'Super',
};

/** Elle yazılmış kısayolu (.env'deki "ctrl + z" gibi) Electron biçimine çevirir: "Control+Z". */
export function normalizeHotkey(acc: string): string {
  const parts = acc
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);
  return parts
    .map((p, i) => {
      const lower = p.toLowerCase();
      if (i < parts.length - 1) return MODIFIER_ALIASES[lower] ?? p;
      return /^([a-z]|f([1-9]|1[0-9]|2[0-4]))$/.test(lower) ? lower.toUpperCase() : p;
    })
    .join('+');
}

/** "Control+Z" -> "Ctrl + Z" */
export function formatHotkey(acc?: string): string {
  if (!acc) return '';
  return acc
    .split('+')
    .map((p) => (p === 'Control' ? 'Ctrl' : p === 'Super' ? 'Win' : p.startsWith('num') ? `Num ${p.slice(3)}` : p))
    .join(' + ');
}
