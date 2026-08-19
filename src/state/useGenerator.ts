import { useCallback, useMemo, useRef, useState } from 'react';

import {
  generatePrompts,
  type GeneratedPrompt,
  type GenerateBlock,
} from '../lib/generator';
import {
  detectVariables,
  effectivePermutationSize,
  hasAdjacentVariables,
  parseValueLines,
} from '../lib/template';
import { K, load, save } from '../lib/storage';
import { UndoStack } from '../lib/undoStack';

export interface GeneratorSnapshot {
  template: string;
  values: Record<string, string>;
  collapsed: Record<string, boolean>;
  autoDetect: boolean;
  /** The section-wide Permutation default: on/off plus the shared group size. */
  permutationGlobal: { on: boolean; size: number };
  /** Per-variable exceptions to the default — 0 means explicitly off, >=2 a custom size. */
  permutationOverrides: Record<string, number>;
}

const EMPTY: GeneratorSnapshot = {
  template: '',
  values: {},
  collapsed: {},
  autoDetect: true,
  permutationGlobal: { on: false, size: 2 },
  permutationOverrides: {},
};

function initial(): GeneratorSnapshot {
  return {
    template: load(K.genTemplate, ''),
    values: load<Record<string, string>>(K.genValues, {}),
    collapsed: load<Record<string, boolean>>(K.genCollapsed, {}),
    autoDetect: load(K.genAutoDetect, true),
    permutationGlobal: load(K.genPermutationGlobal, { on: false, size: 2 }),
    permutationOverrides: load<Record<string, number>>(K.genPermutationOverrides, {}),
  };
}

const BLOCK_MESSAGE: Record<GenerateBlock, string> = {
  'empty-template': 'Write a template first — there is nothing to generate from.',
  'no-variables':
    'No variables in the template. Wrap a word in square brackets, like [SUBJECT].',
  'no-values': 'Add at least one value to any variable before generating.',
};

export function useGenerator() {
  const stack = useRef<UndoStack<GeneratorSnapshot> | null>(null);
  stack.current ??= new UndoStack<GeneratorSnapshot>(initial());

  const [snap, setSnap] = useState<GeneratorSnapshot>(stack.current.present);
  const [output, setOutput] = useState<GeneratedPrompt[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [runId, setRunId] = useState(0); // bumped only by generate() — see OutputStream

  /**
   * The variable blocks actually shown, as opposed to whatever the live
   * template currently contains.
   *
   * With auto-detect on these stay in lockstep with the template. With it
   * off, this is the whole point of the toggle: the list is pinned to
   * whatever was last detected, and only an explicit `detectNow()` moves it —
   * otherwise the setting has no observable effect, which was the bug.
   */
  const [detected, setDetected] = useState<string[]>(() =>
    detectVariables(stack.current!.present.template),
  );

  const [, force] = useState(0);

  const burst = useRef(false);
  const timer = useRef<number | null>(null);

  const persist = useCallback((s: GeneratorSnapshot) => {
    save(K.genTemplate, s.template);
    save(K.genValues, s.values);
    save(K.genCollapsed, s.collapsed);
    save(K.genAutoDetect, s.autoDetect);
    save(K.genPermutationGlobal, s.permutationGlobal);
    save(K.genPermutationOverrides, s.permutationOverrides);
  }, []);

  const apply = useCallback(
    (next: GeneratorSnapshot) => {
      // Keep the undo stack's internal pointer mirrored even for changes that
      // don't themselves create an undo point (collapse toggles, the
      // auto-detect switch). Skipping this left the stack holding a stale
      // "present", so the *next* real commit pushed that stale value as
      // history and silently discarded whatever apply() had just done.
      stack.current!.replacePresent(next);
      setSnap(next);
      persist(next);
      force((n) => n + 1);
    },
    [persist],
  );

  /**
   * Typing path. One snapshot opens a burst, further keystrokes replace the
   * present, so a paragraph collapses into a single undo step instead of 200.
   */
  const edit = useCallback(
    (next: GeneratorSnapshot) => {
      const s = stack.current!;
      if (!burst.current) {
        s.commit(next);
        burst.current = true;
      } else {
        s.replacePresent(next);
      }
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        burst.current = false;
      }, 1000);
      apply(next);
    },
    [apply],
  );

  /**
   * Snapshot-first path for every bulk or destructive change. Any new
   * destructive control must call this — forgetting to is the classic way an
   * undo system silently stops protecting the cases that matter.
   */
  const mutate = useCallback(
    (next: GeneratorSnapshot) => {
      if (timer.current) window.clearTimeout(timer.current);
      burst.current = false;
      stack.current!.commit(next);
      apply(next);
    },
    [apply],
  );

  const variables = detected;

  // A permutation-enabled variable contributes its *group* count here, not
  // its raw line count — from generation's point of view a group of values
  // is one value, so everything downstream (rows, driver, FillBar, "repeats
  // last") should see it that way too.
  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const v of variables) {
      const n = parseValueLines(snap.values[v] ?? '').length;
      const size = effectivePermutationSize(v, snap.permutationGlobal, snap.permutationOverrides);
      out[v] = size && size > 1 && n > 0 ? Math.ceil(n / size) : n;
    }
    return out;
  }, [variables, snap.values, snap.permutationGlobal, snap.permutationOverrides]);

  // Longest list among the *displayed* variables. Deliberately not derived
  // from the live template — when auto-detect is off this is meant to stay
  // still until detectNow() runs, same as the blocks below it.
  const rows = useMemo(
    () => Math.max(0, ...variables.map((v) => counts[v] ?? 0)),
    [variables, counts],
  );

  /** The variable whose list sets the run length. */
  const driver = useMemo(() => {
    let best: string | null = null;
    for (const v of variables) {
      if (counts[v] === rows && rows > 0) best ??= v;
    }
    return best;
  }, [variables, counts, rows]);

  const readyCount = variables.filter((v) => counts[v] > 0).length;

  /** Drops collapsed/permutation-override entries for variables detectNow() no longer finds. */
  function pruneStale(keep: Set<string>) {
    const collapsedEntries = Object.entries(snap.collapsed).filter(([k]) => keep.has(k));
    const overrideEntries = Object.entries(snap.permutationOverrides).filter(([k]) => keep.has(k));
    if (
      collapsedEntries.length !== Object.keys(snap.collapsed).length ||
      overrideEntries.length !== Object.keys(snap.permutationOverrides).length
    ) {
      apply({
        ...snap,
        collapsed: Object.fromEntries(collapsedEntries),
        permutationOverrides: Object.fromEntries(overrideEntries),
      });
    }
  }

  return {
    snap,
    variables,
    counts,
    rows,
    driver,
    readyCount,
    output,
    notice,
    runId,
    /**
     * Same check the Extractor already runs, surfaced here too — adjacent
     * variables are just as easy to create while typing a template in this
     * tool as in that one, and a person editing one long name into two
     * separate `[FIRST][LAST]` tokens by accident has no way to notice
     * from the Generator side alone otherwise.
     */
    adjacentWarning: hasAdjacentVariables(snap.template),
    canUndo: stack.current.canUndo,
    canRedo: stack.current.canRedo,

    dismissNotice: () => setNotice(null),

    setTemplate: (template: string) => {
      edit({ ...snap, template });
      if (snap.autoDetect) setDetected(detectVariables(template));
    },
    setValues: (name: string, raw: string) =>
      edit({ ...snap, values: { ...snap.values, [name]: raw } }),

    clearTemplate: () => mutate({ ...snap, template: '' }),
    clearValues: (name: string) =>
      mutate({ ...snap, values: { ...snap.values, [name]: '' } }),

    /** Shuffles one variable's list only; no-ops on 0 or 1 values. */
    shuffle: (name: string) => {
      const lines = parseValueLines(snap.values[name] ?? '');
      if (lines.length <= 1) return;
      const next = [...lines];
      for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
      mutate({ ...snap, values: { ...snap.values, [name]: next.join('\n') } });
    },

    toggleCollapsed: (name: string) =>
      apply({
        ...snap,
        collapsed: { ...snap.collapsed, [name]: !snap.collapsed[name] },
      }),
    setAllCollapsed: (collapsed: boolean) =>
      apply({ ...snap, collapsed: Object.fromEntries(variables.map((v) => [v, collapsed])) }),

    setAutoDetect: (autoDetect: boolean) => {
      apply({ ...snap, autoDetect });
      // Re-sync immediately on turning it back on, so the toggle never leaves
      // a stale list sitting there until the user happens to edit something.
      if (autoDetect) setDetected(detectVariables(snap.template));
    },

    /**
     * Explicit detection. Always reachable regardless of the auto-detect
     * setting — a prior build only showed this button when auto-detect was
     * off, which meant a user who typed a template directly (with auto-detect
     * already on, but before this fix, silently not re-detecting) had no
     * visible way to proceed at all.
     */
    detectNow: () => {
      if (!snap.template.trim()) {
        setNotice('Write a template first — there is nothing to detect yet.');
        return;
      }
      const next = detectVariables(snap.template);
      setDetected(next);
      setOutput([]); // the variable set changed, so old output is stale
      setNotice(
        next.length === 0
          ? 'No [VARIABLES] found. Wrap a word in square brackets, like [SUBJECT].'
          : null,
      );
      pruneStale(new Set(next));
    },

    /**
     * Turns the section-wide Permutation default on or off. A behavior
     * toggle, not a content edit — goes through apply(), the same
     * non-undoable path as auto-detect and collapse.
     */
    setGlobalPermutationOn: (on: boolean) =>
      apply({ ...snap, permutationGlobal: { ...snap.permutationGlobal, on } }),

    /** Sets the shared group size every non-overridden variable follows live. */
    setGlobalPermutationSize: (size: number) => {
      if (!Number.isFinite(size)) return;
      const clamped = Math.max(2, Math.floor(size));
      if (snap.permutationGlobal.size === clamped) return;
      apply({ ...snap, permutationGlobal: { ...snap.permutationGlobal, size: clamped } });
    },

    /**
     * Detaches one variable from the section-wide default — `size` >= 2
     * gives it its own group size, 0 opts it out of grouping entirely even
     * while the default is on. Either way it stops following
     * permutationGlobal until clearPermutationOverride() reattaches it.
     */
    setPermutationOverride: (name: string, size: number) => {
      if (!Number.isFinite(size)) return;
      const clamped = size <= 0 ? 0 : Math.max(2, Math.floor(size));
      if (snap.permutationOverrides[name] === clamped) return;
      apply({
        ...snap,
        permutationOverrides: { ...snap.permutationOverrides, [name]: clamped },
      });
    },

    /** Reattaches a variable to the section-wide default. */
    clearPermutationOverride: (name: string) => {
      if (!(name in snap.permutationOverrides)) return;
      const next = { ...snap.permutationOverrides };
      delete next[name];
      apply({ ...snap, permutationOverrides: next });
    },

    /**
     * Replace every occurrence within one variable's list.
     *
     * Bulk and destructive, so it snapshots first rather than joining the
     * debounced typing path — one Undo puts the whole list back.
     */
    replaceAllIn: (name: string, find: string, replace: string) => {
      if (!find) return;
      const text = snap.values[name] ?? '';
      if (!text.includes(find)) return;
      mutate({
        ...snap,
        values: { ...snap.values, [name]: text.split(find).join(replace) },
      });
    },

    /** Replace the single occurrence at [start, end) within one variable. */
    replaceRangeIn: (name: string, start: number, end: number, replace: string) => {
      const text = snap.values[name] ?? '';
      mutate({
        ...snap,
        values: {
          ...snap.values,
          [name]: text.slice(0, start) + replace + text.slice(end),
        },
      });
    },

    generate: () => {
      // Always re-resolved from the live template, so editing it after
      // detection can never break generation — independent of the detected/
      // displayed list above, by design.
      const effective: Record<string, number> = {};
      for (const v of detectVariables(snap.template)) {
        const size = effectivePermutationSize(v, snap.permutationGlobal, snap.permutationOverrides);
        if (size) effective[v] = size;
      }
      const outcome = generatePrompts(snap.template, snap.values, effective);
      if (!outcome.ok) {
        setNotice(BLOCK_MESSAGE[outcome.block]);
        setOutput([]);
        return;
      }
      setNotice(null);
      setOutput(outcome.prompts); // regenerating replaces the set entirely
      setRunId((n) => n + 1);
    },

    removeOutput: (id: string) =>
      setOutput((o) => o.filter((p) => p.id !== id)),

    /**
     * Clears out everything already copied, so what's left in the panel is
     * exactly what you still have to get through. Output-only, like
     * removeOutput — no value list is touched, and nothing here is undoable.
     */
    clearCopied: () => setOutput((o) => o.filter((p) => p.copyCount === 0)),

    markCopied: (id: string) =>
      setOutput((o) =>
        o.map((p) => (p.id === id ? { ...p, copyCount: p.copyCount + 1 } : p)),
      ),

    /** Edits one occurrence inside one prompt. The value list is untouched. */
    editSegment: (id: string, index: number, text: string) =>
      setOutput((o) =>
        o.map((p) =>
          p.id === id
            ? {
                ...p,
                edited: true,
                segments: p.segments.map((s, i) =>
                  i === index ? { ...s, text } : s,
                ),
              }
            : p,
        ),
      ),

    undo: () => {
      if (timer.current) window.clearTimeout(timer.current);
      burst.current = false;
      const prev = stack.current!.undo();
      if (prev) {
        setSnap(prev);
        persist(prev);
        if (prev.autoDetect) setDetected(detectVariables(prev.template));
      }
    },
    redo: () => {
      const next = stack.current!.redo();
      if (next) {
        setSnap(next);
        persist(next);
        if (next.autoDetect) setDetected(detectVariables(next.template));
      }
    },
    /** Reset is itself a normal undo point. */
    reset: () => {
      mutate({ ...EMPTY });
      setDetected([]);
      setOutput([]);
      setNotice(null);
    },
  };
}

export type Generator = ReturnType<typeof useGenerator>;
