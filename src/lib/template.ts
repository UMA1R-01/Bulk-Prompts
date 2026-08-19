/**
 * Template parsing. No React, no DOM — plain functions, unit-testable alone.
 *
 * Everything works off the *live* template string; nothing is cached against a
 * previously-detected variable list. The spec calls that stale-list bug the
 * single most damaging defect in the reference implementation, so detection,
 * generation and extraction all re-parse from source every time.
 */

/** Matches a bracketed token containing no nested brackets. */
export const VARIABLE_PATTERN = /\[([^[\]]*)\]/g;

export type TemplateToken =
  | { kind: 'literal'; text: string }
  | { kind: 'variable'; name: string };

/**
 * Splits a template into an alternating run of literals and variable slots.
 * Empty or whitespace-only brackets (`[ ]`) are not variables; they stay in the
 * literal text exactly as written.
 */
export function tokenizeTemplate(template: string): TemplateToken[] {
  const tokens: TemplateToken[] = [];
  let cursor = 0;

  for (const m of template.matchAll(VARIABLE_PATTERN)) {
    const name = m[1].trim();
    if (!name) continue; // `[ ]` is literal text, not a slot
    const start = m.index!;
    if (start > cursor) {
      tokens.push({ kind: 'literal', text: template.slice(cursor, start) });
    }
    tokens.push({ kind: 'variable', name });
    cursor = start + m[0].length;
  }

  if (cursor < template.length) {
    tokens.push({ kind: 'literal', text: template.slice(cursor) });
  }
  return tokens;
}

/**
 * Ordered, de-duplicated variable names.
 *
 * Case-sensitive: `[Subject]` and `[SUBJECT]` are different variables.
 * Whitespace inside brackets is trimmed, so `[ SUBJECT ]` is `SUBJECT`.
 */
export function detectVariables(template: string): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const m of template.matchAll(VARIABLE_PATTERN)) {
    const name = m[1].trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    ordered.push(name);
  }
  return ordered;
}

/**
 * True when two variable slots touch with no literal text between them
 * (`[FIRST][LAST]`). There is no way to know where one value ends and the next
 * begins, so we never silently guess — extraction attributes the run to the
 * first variable and flags the result as ambiguous.
 */
export function hasAdjacentVariables(template: string): boolean {
  const tokens = tokenizeTemplate(template);
  return tokens.some(
    (t, i) => t.kind === 'variable' && tokens[i + 1]?.kind === 'variable',
  );
}

/** Splits a multi-line value field into candidate values, dropping blank lines. */
export function parseValueLines(raw: string): string[] {
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/**
 * Splits a value list into consecutive groups of `size`, each joined into one
 * `{comma, separated}` string — braced the way Midjourney's own permutation
 * syntax is, so a group reads as a group wherever it lands, including inside
 * a copied/generated prompt. A group counts as a single value at generation
 * time — this is the whole mechanism behind a variable's "Permutation"
 * toggle: it turns a long value list into a handful of combined rows without
 * a second bracket syntax in the template itself. `size` <= 1 is a no-op,
 * since a group of one value is indistinguishable from not grouping at all.
 *
 * A trailing group left with only one value (list length not a multiple of
 * `size`) skips the braces too — there is nothing left in that group to
 * permute against, so it is just a value again, not a set.
 */
export function groupValues(lines: string[], size: number): string[] {
  if (size <= 1) return lines;
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += size) {
    const chunk = lines.slice(i, i + size);
    out.push(chunk.length > 1 ? `{${chunk.join(', ')}}` : chunk[0]);
  }
  return out;
}

/**
 * The group size to use for one variable, or undefined if it isn't grouped
 * at all.
 *
 * Permutation has a single section-wide default (on/off plus a shared
 * size) rather than a toggle on every variable — that's the whole point of
 * it: turning grouping on doesn't mean visiting every row. A variable
 * follows that default unless it's named in `overrides`, which records
 * exceptions carved out one variable at a time (see the Permutation pill on
 * each row): 0 means "opted out even though the default is on", any size
 * >= 2 means "grouped at this size regardless of what the default says".
 * No entry at all just inherits the default, live — change the default and
 * every non-overridden variable picks it up immediately.
 */
export function effectivePermutationSize(
  name: string,
  global: { on: boolean; size: number },
  overrides: Record<string, number>,
): number | undefined {
  if (name in overrides) {
    const v = overrides[name];
    return v >= 2 ? v : undefined;
  }
  return global.on ? global.size : undefined;
}
