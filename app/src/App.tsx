import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import { ExtractorView } from './components/ExtractorView';
import { GeneratorView } from './components/GeneratorView';
import { Icon } from './components/icons';
import { TitleBar } from './components/TitleBar';
import { Chip } from './components/ui';
import { DEFAULT_COPY_STYLE, type CopyStyle } from './lib/generator';
import { K, load, save } from './lib/storage';
import { useExtractor } from './state/useExtractor';
import { useGenerator } from './state/useGenerator';

type Tool = 'generate' | 'extract';

/**
 * Appears once the main pane has scrolled a meaningful distance, returns to
 * the top smoothly (or instantly under prefers-reduced-motion). Tracks the
 * main pane's own scroll, not the document's — the title bar and toolbar sit
 * outside it and never scroll. Kept local to App rather than split into its
 * own file — it's a dozen lines with exactly one call site.
 */
function ScrollToTopButton({ containerRef }: { containerRef: RefObject<HTMLElement | null> }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onScroll() {
      setVisible(el!.scrollTop > 600);
    }
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [containerRef]);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => {
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        containerRef.current?.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
      }}
      aria-label="Scroll to top"
      title="Scroll to top"
      className="hard-md press focus-ink fixed bottom-7 right-7 grid place-items-center"
      style={{
        width: 46,
        height: 46,
        background: 'var(--color-violet)',
        color: '#FFFFFF',
        border: '2px solid var(--color-ink)',
        borderRadius: 'var(--radius-ctl)',
        // Below FindReplace's popover at every width (mobile z-20, desktop
        // z-10) on purpose: that popover is something someone is actively
        // typing into, parked at this same bottom-right corner on narrow
        // screens. A passive nav button has no business sitting on top of it.
        zIndex: 5,
      }}
    >
      <Icon.arrowUp />
    </button>
  );
}

export default function App() {
  const [tool, setTool] = useState<Tool>(() => load<Tool>(K.activeTool, 'generate'));
  const [toast, setToast] = useState<string | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  // Shell-level preference, not per-tool work state — applies to copy actions
  // in both Generate and Extract alike, so it lives here rather than in
  // either tool's own state hook. No separate on/off switch: B/I/U alone
  // double as both the style picker and the toggle — none active means a
  // plain-text copy, same as the switch being off used to.
  const [copyStyle, setCopyStyleState] = useState<CopyStyle>(() =>
    load<CopyStyle>(K.copyStyle, DEFAULT_COPY_STYLE),
  );
  const setCopyStyle = (v: CopyStyle) => {
    setCopyStyleState(v);
    save(K.copyStyle, v);
  };
  const highlightVariables = copyStyle.bold || copyStyle.italic || copyStyle.underline;

  const g = useGenerator();
  const x = useExtractor();

  const notice = useCallback((m: string) => setToast(m), []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  const switchTool = (t: Tool) => {
    setTool(t);
    save(K.activeTool, t); // the last-used tool comes back on reload
  };

  const active = tool === 'generate' ? g : x;

  // Undo/redo are bound at the window, but a text field's own history must win
  // first — so we let the browser handle the shortcut whenever the focus is
  // inside an editable element.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const el = document.activeElement;
      const editing =
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLInputElement ||
        (el instanceof HTMLElement && el.isContentEditable);
      if (editing) return;

      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        active.undo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        active.redo();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ══════════ title bar + toolbar ══════════
          Fixed as one unit — outside the scrolling pane below, so the drag
          strip and the tool switch/undo stay put and never collide with
          main's own scrollbar. The brand mark now lives only in TitleBar —
          repeating it here too, right underneath, read as duplication once
          that strip existed. Quiet on purpose otherwise: white ground, one
          ink rule underneath — the colour in this app belongs to the work,
          not the chrome. */}
      <TitleBar />
      <header
        className="shrink-0"
        style={{
          background: 'var(--color-paper)',
          borderBottom: '2px solid var(--color-ink)',
        }}
      >
        <div className="px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center gap-x-5 gap-y-3">
          <nav
            className="hard-sm flex shrink-0"
            style={{
              border: '2px solid var(--color-ink)',
              borderRadius: 'var(--radius-ctl)',
              overflow: 'hidden',
            }}
          >
            {(['generate', 'extract'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => switchTool(t)}
                aria-current={tool === t ? 'page' : undefined}
                className={tool === t ? 'focus-ink' : ''}
                style={{
                  background: tool === t ? 'var(--color-violet)' : 'transparent',
                  color: tool === t ? '#FFFFFF' : 'var(--color-ink)',
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 700,
                  fontSize: 13,
                  padding: '7px 18px',
                  cursor: 'pointer',
                }}
              >
                {t === 'generate' ? 'Generate' : 'Extract'}
              </button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <Chip onClick={active.undo} disabled={!active.canUndo} title="Undo (Ctrl+Z)">
              <Icon.undo />
              <span className="hidden sm:inline">Undo</span>
            </Chip>
            <Chip onClick={active.redo} disabled={!active.canRedo} title="Redo (Ctrl+Shift+Z)">
              <Icon.redo />
              <span className="hidden sm:inline">Redo</span>
            </Chip>
            <Chip tone="danger" onClick={active.reset} title="Reset this tool">
              Reset
            </Chip>
          </div>
        </div>
      </header>

      {/* ══════════ working area ══════════
          The only element that scrolls — min-h-0 is load-bearing here: without
          it a flex-1 child won't shrink below its content's natural height,
          and this pane would grow instead of scrolling internally. */}
      <main ref={mainRef} className="scroll-soft flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6">
        {tool === 'generate' ? (
          <GeneratorView
            g={g}
            onNotice={notice}
            highlightVariables={highlightVariables}
            copyStyle={copyStyle}
            onCopyStyleChange={setCopyStyle}
          />
        ) : (
          <ExtractorView x={x} onNotice={notice} highlightVariables={highlightVariables} />
        )}
      </main>

      <ScrollToTopButton containerRef={mainRef} />

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="hard-md fixed bottom-7 left-4 sm:left-6 lg:left-8 px-4 py-3 z-40"
          style={{
            background: 'var(--color-paper)',
            border: '2px solid var(--color-ink)',
            borderRadius: 'var(--radius-ctl)',
            fontSize: 13,
            fontWeight: 600,
            maxWidth: 'calc(100vw - 110px)',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
