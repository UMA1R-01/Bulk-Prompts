import { useEffect, useRef, useState } from 'react';

import { pasteText } from '../lib/clipboard';
import { parseValueLines } from '../lib/template';
import { FindReplace, type Match } from './FindReplace';
import { Icon } from './icons';
import { Chip, FillBar, Pill } from './ui';

export interface VariableRowProps {
  name: string;
  raw: string;
  count: number;
  /** Rows this variable will fill before it starts repeating its last value. */
  runLength: number;
  collapsed: boolean;
  onChange: (raw: string) => void;
  onToggle: () => void;
  onShuffle: () => void;
  onClear: () => void;
  onReplaceAll: (find: string, replace: string) => void;
  onReplaceRange: (start: number, end: number, replace: string) => void;
  onNotice: (message: string) => void;
}

/**
 * One variable: a single line you can scan, and a plain textarea underneath
 * when it's open.
 *
 * The values stay raw text, one per line, on purpose — it is the only shape
 * that lets someone paste a column straight out of a spreadsheet or a list
 * from anywhere else and have it just work. Anything token-ish (chips you add
 * one at a time) would break that paste in exchange for looking tidier.
 */
export function VariableRow({
  name,
  raw,
  count,
  runLength,
  collapsed,
  onChange,
  onToggle,
  onShuffle,
  onClear,
  onReplaceAll,
  onReplaceRange,
  onNotice,
}: VariableRowProps) {
  const ta = useRef<HTMLTextAreaElement | null>(null);
  const findTrigger = useRef<HTMLButtonElement | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const held = count > 0 && count < runLength ? runLength - count : 0;
  const lines = parseValueLines(raw);

  // The action row (Find included) unmounts when the row collapses, without
  // going through FindReplace's own onClose — so without this, re-expanding
  // the same row later would silently reopen Find and steal focus into it.
  useEffect(() => {
    if (collapsed) setFindOpen(false);
  }, [collapsed]);

  async function paste() {
    const r = await pasteText();
    if (!r.ok) {
      onNotice(r.message);
      return;
    }
    onChange(raw ? `${raw.replace(/\n$/, '')}\n${r.text}` : r.text);
  }

  function focusMatch(m: Match) {
    const el = ta.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(m.start, m.end);
  }

  return (
    <div
      style={{
        border: `2px solid ${collapsed ? 'var(--color-ink)' : 'var(--color-violet)'}`,
        borderRadius: 'var(--radius-block)',
        background: 'var(--color-paper)',
        overflow: findOpen ? 'visible' : 'hidden',
      }}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Expand ${name}` : `Collapse ${name}`}
          className="flex items-center gap-2.5 text-left shrink-0"
          style={{ borderRadius: 6 }}
        >
          <span style={{ color: 'var(--color-grey)', display: 'flex' }}>
            {collapsed ? <Icon.chevronRight size={13} /> : <Icon.chevron size={13} />}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              fontSize: 12.5,
              letterSpacing: '0.02em',
            }}
          >
            {name}
          </span>
          <span style={{ fontSize: 12, color: 'var(--color-grey)' }}>
            {count} {count === 1 ? 'value' : 'values'}
          </span>
        </button>

        {/* The held-value fact lives here, next to the variable it describes. */}
        {held > 0 && (
          <Pill
            tone="accent"
            title={`This list runs out after ${count} ${count === 1 ? 'row' : 'rows'}`}
          >
            repeats last ×{held}
          </Pill>
        )}
        {count === 0 && <Pill tone="warn">empty — renders blank</Pill>}

        {collapsed && lines.length > 0 && (
          // basis-full below sm: squeezed between the name and a status pill
          // on a phone, this preview truncated to about five characters. On
          // its own line it's readable, which is the only reason it exists.
          <span
            className="flex-1 truncate min-w-0 max-sm:basis-full"
            style={{ fontSize: 12.5, color: 'var(--color-grey)' }}
            title={lines.join(', ')}
          >
            {lines.slice(0, 3).join(' · ')}
            {lines.length > 3 ? ' …' : ''}
          </span>
        )}
        <div className={collapsed && lines.length ? '' : 'flex-1'} />

        <FillBar count={count} of={runLength} />

        {/* Per-variable, not per-section: these act on this list alone — and
            only while the row is open. Four chips on every collapsed row is
            forty controls on a ten-variable template, and they crowded out the
            value preview that makes a collapsed row worth reading at all. */}
        {!collapsed && (
          <div className="flex items-center gap-1.5">
            <Chip onClick={paste} title={`Paste into ${name}`}>
              <Icon.paste />
              <span className="hidden lg:inline">Paste</span>
            </Chip>
            <Chip onClick={onShuffle} disabled={count < 2} title={`Shuffle ${name}`}>
              <Icon.shuffle />
              <span className="hidden lg:inline">Shuffle</span>
            </Chip>
            <Chip onClick={onClear} disabled={count === 0} title={`Clear ${name}`}>
              <Icon.close size={13} />
              <span className="hidden lg:inline">Clear</span>
            </Chip>
            <div className="relative">
              <Chip
                ref={findTrigger}
                onClick={() => setFindOpen((o) => !o)}
                title={`Find and replace in ${name}`}
                ariaExpanded={findOpen}
              >
                <Icon.search />
                <span className="hidden lg:inline">Find</span>
              </Chip>
              {findOpen && (
                <FindReplace
                  text={raw}
                  triggerRef={findTrigger}
                  onClose={() => setFindOpen(false)}
                  focusMatch={focusMatch}
                  onReplaceAll={onReplaceAll}
                  onReplaceOne={(m, replace) => onReplaceRange(m.start, m.end, replace)}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="px-3 pb-3">
          <textarea
            ref={ta}
            value={raw}
            onChange={(e) => onChange(e.target.value)}
            placeholder={'one value per line — paste a whole list here'}
            spellCheck={false}
            aria-label={`Values for ${name}, one per line`}
            rows={6}
            className="field block"
            style={{
              fontSize: 13,
              lineHeight: '23px',
              padding: '12px 14px',
              resize: 'vertical',
            }}
          />
        </div>
      )}
    </div>
  );
}
