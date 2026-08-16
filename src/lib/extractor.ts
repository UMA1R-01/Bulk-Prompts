import { tokenizeTemplate, type TemplateToken } from './template';
import { addedFragments, wordDiff, type DiffPart } from './wordDiff';

export interface RecoveredValue {
  name: string;
  value: string;
  /** Offsets into the filled prompt, narrowed to the trimmed value. */
  start: number;
  end: number;
  /** True when this came out of an `[A][B]` run, where the split is unknowable. */
  ambiguous: boolean;
}

export type ExtractionResult =
  | { matched: true; source: string; values: RecoveredValue[]; ambiguous: boolean }
  | {
      matched: false;
      source: string;
      diff: DiffPart[];
      fragments: string[];
      ambiguous: false;
    };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Escapes literal text, collapsing every whitespace run into a tolerant
 * matcher. Leading/trailing whitespace becomes optional so a prompt with
 * slightly different spacing still matches.
 */
function literalPattern(literal: string): string {
  if (!literal) return '';
  const parts = literal.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '\\s*';
  let out = '';
  if (/^\s/.test(literal)) out += '\\s*';
  out += parts.map(escapeRe).join('\\s+');
  if (/\s$/.test(literal)) out += '\\s*';
  return out;
}

/**
 * Every character of a match is covered by a capture group, in order, so
 * offsets can be accumulated by summing group lengths. That is why the literals
 * are captured too.
 */
function buildRegex(tokens: TemplateToken[]): RegExp | null {
  let src = '^(\\s*)';
  tokens.forEach((t, i) => {
    if (t.kind === 'literal') {
      src += `(${literalPattern(t.text)})`;
    } else {
      // Greedy when the next token is another variable, so an adjacent run
      // lands on the first variable and the rest come back empty.
      const nextIsVar = tokens[i + 1]?.kind === 'variable';
      src += nextIsVar ? '([\\s\\S]*)' : '([\\s\\S]*?)';
    }
  });
  src += '(\\s*)$';
  try {
    return new RegExp(src);
  } catch {
    return null;
  }
}

/** Variable indices (counting only variables) that sit in an adjacent run. */
function adjacentIndices(tokens: TemplateToken[]): Set<number> {
  const out = new Set<number>();
  let v = -1;
  tokens.forEach((t, i) => {
    if (t.kind !== 'variable') return;
    v++;
    if (tokens[i - 1]?.kind === 'variable') {
      out.add(v);
      out.add(v - 1);
    }
    if (tokens[i + 1]?.kind === 'variable') out.add(v);
  });
  return out;
}

/**
 * A variable name can appear more than once in a template — the regex still
 * captures each occurrence independently, but callers only want one row per
 * name. Keeps the first occurrence's value/offsets; a later occurrence that
 * came out of an adjacent run still marks the merged row ambiguous.
 */
function dedupeByName(values: RecoveredValue[]): RecoveredValue[] {
  const out: RecoveredValue[] = [];
  for (const v of values) {
    const existing = out.find((o) => o.name === v.name);
    if (existing) {
      existing.ambiguous = existing.ambiguous || v.ambiguous;
    } else {
      out.push({ ...v });
    }
  }
  return out;
}

function fallback(template: string, filled: string): ExtractionResult {
  const diff = wordDiff(template, filled);
  return {
    matched: false,
    source: filled,
    diff,
    fragments: addedFragments(diff),
    ambiguous: false,
  };
}

/**
 * Recovers values for one filled prompt.
 *
 * Static text between slots is a fixed anchor, with incidental whitespace
 * differences tolerated. If it does not match, or the template has no
 * variables, we fall back to a word diff.
 *
 * **Adjacent variables.** `[FIRST][LAST]` has no separator, so the boundary is
 * genuinely unknowable. Documented behaviour: the run goes to the *first*
 * variable, later ones come back empty, and every value in the run is marked
 * ambiguous so the UI can flag it rather than quietly producing a wrong answer.
 */
export function extractOne(template: string, filled: string): ExtractionResult {
  const tokens = tokenizeTemplate(template);
  const hasVariable = tokens.some((t) => t.kind === 'variable');
  if (!hasVariable || !filled.trim()) return fallback(template, filled);

  const regex = buildRegex(tokens);
  if (!regex) return fallback(template, filled);

  const m = regex.exec(filled);
  if (!m) return fallback(template, filled);

  const adjacent = adjacentIndices(tokens);
  const values: RecoveredValue[] = [];
  let cursor = (m.index ?? 0) + (m[1] ?? '').length;
  let variableIndex = -1;

  tokens.forEach((t, i) => {
    const raw = m[i + 2] ?? '';
    if (t.kind === 'variable') {
      variableIndex++;
      const lead = raw.length - raw.trimStart().length;
      const trimmed = raw.trim();
      values.push({
        name: t.name,
        value: trimmed,
        start: cursor + lead,
        end: cursor + lead + trimmed.length,
        ambiguous: adjacent.has(variableIndex),
      });
    }
    cursor += raw.length;
  });

  const deduped = dedupeByName(values);

  return {
    matched: true,
    source: filled,
    values: deduped,
    ambiguous: deduped.some((v) => v.ambiguous),
  };
}

/**
 * Groups recovered values by variable name across every result.
 *
 * Every name seen in any result gets a heading; a prompt that produced no value
 * for a name simply contributes nothing rather than shifting the rows. The
 * grouping is never based on whichever prompt happened to be processed first.
 */
export function groupByVariable(
  results: ExtractionResult[],
): Record<string, string[]> {
  const names: string[] = [];
  for (const r of results) {
    if (!r.matched) continue;
    for (const v of r.values) if (!names.includes(v.name)) names.push(v.name);
  }
  const out: Record<string, string[]> = {};
  for (const n of names) {
    out[n] = results.flatMap((r) =>
      r.matched ? r.values.filter((v) => v.name === n).map((v) => v.value) : [],
    );
  }
  return out;
}
