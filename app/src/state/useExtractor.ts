import { useCallback, useMemo, useRef, useState } from 'react';

import { extractOne, groupByVariable, type ExtractionResult } from '../lib/extractor';
import { detectVariables, hasAdjacentVariables } from '../lib/template';
import { K, load, save } from '../lib/storage';
import { UndoStack } from '../lib/undoStack';

export interface ExtractorSnapshot {
  template: string;
  prompts: string[];
  autoExtract: boolean;
}

const EMPTY: ExtractorSnapshot = { template: '', prompts: [''], autoExtract: true };

function initial(): ExtractorSnapshot {
  const prompts = load<string[]>(K.extPrompts, ['']);
  return {
    template: load(K.extTemplate, ''),
    prompts: prompts.length ? prompts : [''],
    autoExtract: load(K.extAutoExtract, true),
  };
}

export function useExtractor() {
  const stack = useRef<UndoStack<ExtractorSnapshot> | null>(null);
  stack.current ??= new UndoStack<ExtractorSnapshot>(initial());

  const [snap, setSnap] = useState<ExtractorSnapshot>(stack.current.present);
  const [manualRun, setManualRun] = useState(0);
  const [, force] = useState(0);

  const burst = useRef(false);
  const timer = useRef<number | null>(null);

  const persist = useCallback((s: ExtractorSnapshot) => {
    save(K.extTemplate, s.template);
    save(K.extPrompts, s.prompts);
    save(K.extAutoExtract, s.autoExtract);
  }, []);

  const apply = useCallback(
    (next: ExtractorSnapshot) => {
      // Mirror the undo stack's internal pointer even for changes that don't
      // themselves create an undo point (the auto-extract switch) — otherwise
      // the next real commit pushes a stale "present" as history and quietly
      // discards whatever this apply() just did.
      stack.current!.replacePresent(next);
      setSnap(next);
      persist(next);
      force((n) => n + 1);
    },
    [persist],
  );

  const edit = useCallback(
    (next: ExtractorSnapshot) => {
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

  const mutate = useCallback(
    (next: ExtractorSnapshot) => {
      if (timer.current) window.clearTimeout(timer.current);
      burst.current = false;
      stack.current!.commit(next);
      apply(next);
    },
    [apply],
  );

  /**
   * Always recomputed fresh from the live template — there is no separately
   * detected variable list that could go stale. `manualRun` only exists so an
   * explicit Extract press re-runs when auto-extract is off.
   *
   * Computed alongside `resultOrigins`, the index each result's *source*
   * prompt holds in `snap.prompts` — not results.map's own index, since
   * empty prompts are filtered out first and the two index spaces only
   * coincide when nothing is empty. Any UI state keyed per-result (e.g. an
   * expanded/collapsed set) has to key off `resultOrigins`, not a plain
   * `.map((_, i) => i)`, or it silently attaches to the wrong row the moment
   * an entry above it is removed.
   */
  const { results, resultOrigins } = useMemo(() => {
    void manualRun;
    if (!snap.autoExtract && manualRun === 0) return { results: [], resultOrigins: [] };
    const origins: number[] = [];
    const out: ExtractionResult[] = [];
    snap.prompts.forEach((p, i) => {
      if (!p.trim()) return;
      origins.push(i);
      out.push(extractOne(snap.template, p));
    });
    return { results: out, resultOrigins: origins };
  }, [snap.template, snap.prompts, snap.autoExtract, manualRun]);

  const filled = snap.prompts.filter((p) => p.trim()).length;
  const matched = results.filter((r) => r.matched).length;

  return {
    snap,
    results,
    resultOrigins,
    filled,
    matched,
    grouped: groupByVariable(results),
    /**
     * Calm state, never an error: writing a template after an example is
     * normal. Gated on the template actually having content — an untouched,
     * empty field isn't "no variables found", it's just not started yet, and
     * showing the notice there was confusing rather than informative.
     */
    noVariables: snap.template.trim().length > 0 && detectVariables(snap.template).length === 0,
    adjacentWarning: hasAdjacentVariables(snap.template),
    canUndo: stack.current.canUndo,
    canRedo: stack.current.canRedo,

    setTemplate: (template: string) => edit({ ...snap, template }),
    setPrompt: (i: number, value: string) =>
      edit({ ...snap, prompts: snap.prompts.map((p, n) => (n === i ? value : p)) }),

    addPrompt: () => mutate({ ...snap, prompts: [...snap.prompts, ''] }),
    clearPrompt: (i: number) =>
      mutate({ ...snap, prompts: snap.prompts.map((p, n) => (n === i ? '' : p)) }),
    removePrompt: (i: number) => {
      if (snap.prompts.length <= 1) return; // never remove the last entry
      mutate({ ...snap, prompts: snap.prompts.filter((_, n) => n !== i) });
    },

    /**
     * Sets how many entries exist at once.
     *
     * The highest-risk control in the app for data loss. Guards, all
     * deliberate: a non-numeric or empty value is ignored rather than read as
     * zero; the floor is 1; and it routes through the same snapshot-first path
     * as every other destructive action. The UI only calls this on Enter or
     * blur, never per keystroke — clearing the box to retype would otherwise
     * truncate the list on the first character.
     */
    setTotal: (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;
      const n = Number.parseInt(trimmed, 10);
      if (!Number.isFinite(n)) return;
      const target = Math.max(1, n);
      if (target === snap.prompts.length) return;
      const next =
        target > snap.prompts.length
          ? [...snap.prompts, ...Array<string>(target - snap.prompts.length).fill('')]
          : snap.prompts.slice(0, target);
      mutate({ ...snap, prompts: next });
    },

    setAutoExtract: (autoExtract: boolean) => {
      apply({ ...snap, autoExtract });
      if (autoExtract) setManualRun(0);
    },
    extractNow: () => setManualRun((n) => n + 1),

    /**
     * One prompt per line, blank lines ignored. Appends, or replaces the list
     * outright when the only existing entry is still untouched.
     */
    bulkAdd: (raw: string, thenExtract: boolean) => {
      const lines = raw
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      if (!lines.length) return;
      const onlyEmpty = snap.prompts.length === 1 && !snap.prompts[0].trim();
      mutate({ ...snap, prompts: onlyEmpty ? lines : [...snap.prompts, ...lines] });
      if (thenExtract && !snap.autoExtract) setManualRun((n) => n + 1);
    },

    undo: () => {
      if (timer.current) window.clearTimeout(timer.current);
      burst.current = false;
      const prev = stack.current!.undo();
      if (prev) apply(prev);
    },
    redo: () => {
      const next = stack.current!.redo();
      if (next) apply(next);
    },
    reset: () => mutate({ ...EMPTY }),
  };
}

export type Extractor = ReturnType<typeof useExtractor>;

export function countBulkLines(raw: string): number {
  return raw.split('\n').filter((l) => l.trim()).length;
}
