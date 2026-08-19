import { useEffect, useRef, useState } from 'react';

import { pasteText } from '../lib/clipboard';
import { groupValues, parseValueLines } from '../lib/template';
import { FindReplace, type Match } from './FindReplace';
import { Icon } from './icons';
import { Chip, FillBar, Pill, Stepper, Toggle, ValueChip } from './ui';

export interface VariableRowProps {
  name: string;
  raw: string;
  count: number;
  /** Rows this variable will fill before it starts repeating its last value. */
  runLength: number;
  collapsed: boolean;
  /** Effective group size — from the section-wide default or this row's own override. Undefined means not grouped. */
  permutationSize?: number;
  /** Whether this row has broken from the section-wide default with its own override. */
  permutationOverridden: boolean;
  onChange: (raw: string) => void;
  onToggle: () => void;
  onShuffle: () => void;
  onClear: () => void;
  onReplaceAll: (find: string, replace: string) => void;
  onReplaceRange: (start: number, end: number, replace: string) => void;
  /** Detaches this row from the section-wide default; 0 means explicitly off. */
  onPermutationOverride: (size: number) => void;
  onPermutationOverrideClear: () => void;
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
  permutationSize,
  permutationOverridden,
  onChange,
  onToggle,
  onShuffle,
  onClear,
  onReplaceAll,
  onReplaceRange,
  onPermutationOverride,
  onPermutationOverrideClear,
  onNotice,
}: VariableRowProps) {
  const ta = useRef<HTMLTextAreaElement | null>(null);
  const findTrigger = useRef<HTMLButtonElement | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const held = count > 0 && count < runLength ? runLength - count : 0;
  const lines = parseValueLines(raw);
  const grouped = !!permutationSize;

  // Remembers the last size this row was actually grouped at, so switching
  // its own Permutation toggle off and back on restores that number instead
  // of resetting to the generic default — the section-wide default control
  // already gets this for free (its size persists independently of its own
  // on/off), an override didn't without tracking it separately here, since
  // "off" and "size" collapse into the same stored number (0 vs >=2).
  const lastSize = useRef(2);
  if (permutationSize) lastSize.current = permutationSize;

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
      {/*
        Independent flex-wrap lines, not one shared row. They used to be a
        single flex-wrap container, which meant a pill that only exists
        conditionally (the "→ N groups" pill, "repeats last", the collapsed
        preview) changed that row's total content width and could shove
        other controls onto a wrapped second line — visibly, whenever
        Permutation flipped on or a list ran short. Giving identity/status
        and the action chips their own lines means content appearing or
        disappearing on one line can never push another line's contents
        around.
      */}
      <div className="flex flex-col gap-2 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
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
              {lines.length} {lines.length === 1 ? 'value' : 'values'}
            </span>
          </button>

          {/* A group counts as one value from here down — see counts in
              useGenerator — so this reads "N groups", not "N values", the
              moment this variable is grouped. Not overridden: the pill
              itself is the entry point into per-variable control — click it
              to break from the section-wide default at exactly this size.
              Overridden: it's just a read-only readout, since the row below
              already carries the actual control. */}
          {grouped &&
            lines.length > 0 &&
            (permutationOverridden ? (
              <Pill tone="accent" title={`${lines.length} values grouped ${permutationSize} at a time — set for this variable only`}>
                → {count} {count === 1 ? 'group' : 'groups'} of {permutationSize}
              </Pill>
            ) : (
              <button
                type="button"
                onClick={() => onPermutationOverride(permutationSize)}
                title={`Click to set a group size just for ${name}, independent of the section-wide default`}
                aria-label={`Customize the group size for ${name}`}
                // A solid ink edge, not the softer dashed violet this had at
                // first — anything pressable in this app gets a 2px ink
                // border (see Chip), reserving a soft/dashed edge for
                // anything that's read-only. The pill below, once
                // overridden, drops back to Pill's own plain soft edge —
                // losing the button styling here is itself the signal that
                // the action moved to the row's own controls.
                className="label press"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  background: 'var(--color-violet-wash)',
                  color: 'var(--color-violet-ink)',
                  border: '1.5px solid var(--color-ink)',
                  borderRadius: 999,
                  padding: '4px 9px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                → {count} {count === 1 ? 'group' : 'groups'} of {permutationSize}
              </button>
            ))}

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
        </div>

        {/* This row's own Permutation control — only exists once it has
            broken from the section-wide default (see the pill above), and
            only while the row is open, same reasoning the action chips
            always had: nothing here that collapsed's read-only pills don't
            already summarize. */}
        {!collapsed && permutationOverridden && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="flex items-center gap-1.5 shrink-0">
              <Toggle
                checked={grouped}
                onChange={(checked) => onPermutationOverride(checked ? lastSize.current : 0)}
                label="Permutation"
              />
              <span
                className="flex items-center gap-1.5"
                style={{
                  fontSize: 12,
                  color: 'var(--color-grey)',
                  opacity: grouped ? 1 : 0.4,
                }}
              >
                <Stepper
                  value={permutationSize ?? lastSize.current}
                  onChange={onPermutationOverride}
                  disabled={!grouped}
                  ariaLabel={`Group size for ${name}`}
                />
                per group
              </span>
            </div>
            <Chip onClick={onPermutationOverrideClear} title={`Stop customizing ${name} — follow the section-wide default again`}>
              Match default
            </Chip>
          </div>
        )}

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
            {/* lines.length, not count: shuffling the raw list is still
                meaningful even when Permutation has grouped it down to a
                single group, since it changes which values land in that
                group and in what order they join. */}
            <Chip onClick={onShuffle} disabled={lines.length < 2} title={`Shuffle ${name}`}>
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

          {/* What Permutation actually does to this list, spelled out — the
              pill above describes the effect in the abstract, this shows
              the literal strings it produces. */}
          {permutationSize && lines.length > 0 && (
            <div className="pt-3">
              <span className="label">resolves to, one group per row</span>
              <div className="flex flex-col gap-1.5 pt-2">
                {groupValues(lines, permutationSize).map((group, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        color: 'var(--color-grey)',
                        minWidth: 14,
                      }}
                    >
                      {i + 1}
                    </span>
                    <ValueChip>{group}</ValueChip>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
