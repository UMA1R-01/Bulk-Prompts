/**
 * Local, per-field persistence with no explicit Save step.
 *
 * Keys are namespaced per tool so the two tools can never overwrite each
 * other, and each field is written independently — reloading restores exactly
 * where you left off.
 */

const PREFIX = 'run.';

export const K = {
  activeTool: 'app.tool',
  copyStyle: 'app.copyStyle',

  genTemplate: 'gen.template',
  genValues: 'gen.values',
  genAutoDetect: 'gen.autoDetect',
  genCollapsed: 'gen.collapsed',

  extTemplate: 'ext.template',
  extPrompts: 'ext.prompts',
  extAutoExtract: 'ext.autoExtract',
} as const;

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    // A corrupt entry loses one field rather than preventing the app booting.
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Quota or private-mode failure. Persistence is a convenience, never a
    // precondition — the session keeps working in memory.
  }
}
