import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';

import { Icon } from './icons';
import { Chip } from './ui';

export interface Match {
  start: number;
  end: number;
}

/**
 * Find and replace scoped to one variable's value list, opened from that
 * row's own Find button. Replaces the old whole-tool section: cross-variable
 * match ordering was complexity nobody needed, and the control now sits next
 * to the list it actually edits.
 *
 * Find next focuses the row's textarea and selects the match, which is the
 * reason this app moved to the DOM in the first place.
 */
export function FindReplace({
  text,
  onReplaceAll,
  onReplaceOne,
  focusMatch,
  onClose,
  triggerRef,
}: {
  text: string;
  onReplaceAll: (find: string, replace: string) => void;
  onReplaceOne: (m: Match, replace: string) => void;
  focusMatch: (m: Match) => void;
  onClose: () => void;
  /**
   * The button that opened this popover. Without it, re-clicking that same
   * button closed the popover and immediately reopened it in the same tick:
   * this effect's own `mousedown` listener fires first and closes it (the
   * trigger sits outside `box`, so it reads as "outside"), then the
   * trigger's own `click` handler runs its `setFindOpen(o => !o)` toggle
   * against that now-closed state and flips it straight back open. Treating
   * the trigger as in-bounds here leaves toggling it solely to its own
   * onClick, which is the only handler that should own that decision.
   */
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const [index, setIndex] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstField.current?.focus();
  }, []);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (box.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose, triggerRef]);

  const matches = useMemo<Match[]>(() => {
    if (!find) return [];
    const out: Match[] = [];
    let from = 0;
    for (;;) {
      const at = text.indexOf(find, from);
      if (at === -1) break;
      out.push({ start: at, end: at + find.length });
      from = at + find.length;
    }
    return out;
  }, [find, text]);

  const current = matches.length ? matches[index % matches.length] : null;

  const field: React.CSSProperties = {
    fontSize: 12.5,
    padding: '8px 10px',
  };

  return (
    <div
      ref={box}
      role="dialog"
      aria-label="Find and replace in this variable"
      // Anchored under the trigger on wide screens (lg+). Below that, the
      // trigger can sit anywhere in a wrapped toolbar row, and a 320px popover
      // anchored to its right edge can run clean off the left edge of a phone
      // screen — so under lg it becomes a fixed bar pinned to the viewport
      // instead, which is always fully on-screen regardless of where its
      // trigger ended up.
      className="hard-lg fixed inset-x-4 bottom-6 z-20 lg:absolute lg:inset-x-auto lg:bottom-auto lg:right-0 lg:top-full lg:z-10 lg:mt-2 lg:w-[330px]"
      style={{
        background: 'var(--color-paper)',
        border: '2px solid var(--color-ink)',
        borderRadius: 'var(--radius-block)',
      }}
    >
      <div className="p-3">
        <div className="flex items-center gap-2">
          <input
            ref={firstField}
            value={find}
            onChange={(e) => {
              setFind(e.target.value);
              setIndex(0);
            }}
            placeholder="find"
            aria-label="Find within this variable's values"
            className="field"
            style={field}
          />
          <span aria-hidden style={{ color: 'var(--color-grey)', display: 'flex' }}>
            <Icon.arrowRight size={14} />
          </span>
          <input
            value={replace}
            onChange={(e) => setReplace(e.target.value)}
            placeholder="replace"
            aria-label="Replace with"
            className="field"
            style={field}
          />
        </div>

        <div className="flex items-center gap-1.5 pt-3">
          <Chip
            onClick={() => {
              if (!matches.length) return;
              const n = (index + 1) % matches.length;
              setIndex(n);
              focusMatch(matches[n]);
            }}
            disabled={!matches.length}
          >
            Find next
          </Chip>
          <Chip
            onClick={() => {
              if (!current) return;
              onReplaceOne(current, replace);
            }}
            disabled={!current}
          >
            Replace
          </Chip>
          <Chip
            onClick={() => {
              onReplaceAll(find, replace);
              setIndex(0);
            }}
            disabled={!matches.length}
          >
            All
          </Chip>
          <span className="label ml-auto" style={{ color: 'var(--color-grey)' }}>
            {matches.length === 0
              ? find
                ? 'no matches'
                : ''
              : `${(index % matches.length) + 1}/${matches.length}`}
          </span>
        </div>
      </div>
    </div>
  );
}
