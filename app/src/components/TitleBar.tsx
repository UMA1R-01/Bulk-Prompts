import { useEffect, useState, type ReactNode } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

import { Icon } from './icons';

// Only the real desktop build gets window controls — in a plain browser tab
// (`npm run dev` opened directly) these would call into an IPC bridge that
// doesn't exist.
const isTauri = '__TAURI_INTERNALS__' in window;
const appWindow = isTauri ? getCurrentWindow() : null;

/** The four-square mark, matching favicon.svg — the app's only brand mark now that the toolbar below no longer repeats it. */
function Mark() {
  return (
    <span aria-hidden className="relative shrink-0" style={{ width: 22, height: 22 }}>
      <span
        className="absolute"
        style={{
          inset: 0,
          background: 'var(--color-violet)',
          border: '2px solid var(--color-ink)',
          borderRadius: 6,
        }}
      />
      <span
        className="absolute"
        style={{
          right: -4,
          bottom: -4,
          width: 12,
          height: 12,
          background: 'var(--color-butter)',
          border: '2px solid var(--color-ink)',
          borderRadius: 4,
        }}
      />
    </span>
  );
}

/** Ghost-style window control — ink glyph, hover fill, no border. Deliberately not a Chip: these read as OS chrome, not app controls. */
function WindowButton({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid place-items-center focus-ink"
      style={{ width: 46, color: 'var(--color-ink)' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger ? 'var(--color-alert)' : '#EFEBDD';
        if (danger) e.currentTarget.style.color = '#FFFFFF';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = 'var(--color-ink)';
      }}
    >
      {children}
    </button>
  );
}

/**
 * Replaces the native OS title bar (`decorations: false` in tauri.conf.json)
 * so the window's top edge reads as Chalk Blocks instead of a generic
 * explorer window. The brand mark lives here and only here — it used to
 * repeat in the toolbar header below, which read as duplication once this
 * strip existed. `data-tauri-drag-region` makes the empty strip area (and
 * the non-interactive brand block) draggable; the window buttons are plain
 * elements so clicks on them never get mistaken for a drag.
 */
export function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!appWindow) return;
    let unlisten: (() => void) | undefined;
    appWindow
      .isMaximized()
      .then(setMaximized)
      .catch(() => {});
    appWindow
      .onResized(() => {
        appWindow?.isMaximized().then(setMaximized).catch(() => {});
      })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});
    return () => unlisten?.();
  }, []);

  return (
    <div
      data-tauri-drag-region
      className="flex items-stretch select-none shrink-0"
      style={{ background: 'var(--color-bone)', borderBottom: '2px solid var(--color-ink)', height: 46 }}
    >
      <div
        data-tauri-drag-region
        className="flex items-center gap-3.5 flex-1 min-w-0"
        style={{ padding: '0 16px 0 22px' }}
      >
        <Mark />
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: 16,
            letterSpacing: '-0.03em',
            color: 'var(--color-ink)',
          }}
        >
          Bulk Prompts
        </span>
      </div>

      {isTauri && (
        <div className="flex shrink-0">
          <WindowButton label="Minimize" onClick={() => appWindow?.minimize()}>
            <Icon.minimize />
          </WindowButton>
          <WindowButton label={maximized ? 'Restore' : 'Maximize'} onClick={() => appWindow?.toggleMaximize()}>
            {maximized ? <Icon.restore /> : <Icon.maximize />}
          </WindowButton>
          <WindowButton label="Close" danger onClick={() => appWindow?.close()}>
            <Icon.close />
          </WindowButton>
        </div>
      )}
    </div>
  );
}
