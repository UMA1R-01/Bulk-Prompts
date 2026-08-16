/** Word-level diff used as the Extractor's fallback when a prompt does not match. */

export type DiffKind = 'same' | 'removed' | 'added';

export interface DiffPart {
  kind: DiffKind;
  text: string;
}

/**
 * A word plus the whitespace that followed it. `text` is rendered; `key` is
 * compared.
 *
 * These must stay separate: if trailing whitespace were part of the comparison,
 * the final word of a string would never equal the same word mid-string
 * ("text" vs "text "), so every diff would falsely report its last word as
 * changed. That bug shipped in the first version and the tests caught it.
 */
interface Word {
  text: string;
  key: string;
}

/** Trailing sentence punctuation with nothing else after it in the same run. */
const TRAILING_PUNCTUATION = /[,.;:!?]+$/;

/**
 * Splits a `word` chunk into its content and any sentence punctuation glued
 * directly to the end of it (`"throat,"` → `"throat"` + `","`), so the two
 * can be diffed independently. Without this, a value sitting hard against
 * punctuation — the common case, since templates read naturally as
 * `[VAR], rest of sentence` — turns into one token that either matches a
 * template token completely or not at all. `[LOCATION],` in the template
 * and `throat,` in the filled prompt then never align on their identical
 * trailing comma, so the whole `throat,` gets reported as "added" — comma
 * included — when only the word actually changed.
 */
function splitTrailingPunctuation(trimmed: string, trailingSpace: string): Word[] {
  const m = trimmed.match(TRAILING_PUNCTUATION);
  if (!m || m[0].length === trimmed.length) return [{ text: trimmed + trailingSpace, key: trimmed }];
  const core = trimmed.slice(0, -m[0].length);
  return [
    { text: core, key: core },
    { text: m[0] + trailingSpace, key: m[0] },
  ];
}

function words(s: string): Word[] {
  return [...s.matchAll(/\S+\s*/g)].flatMap((m) => {
    const whole = m[0];
    const trimmed = whole.trimEnd();
    const trailingSpace = whole.slice(trimmed.length);
    return splitTrailingPunctuation(trimmed, trailingSpace);
  });
}

/**
 * Longest-common-subsequence diff over whitespace-separated words.
 *
 * `removed` is present in the template but not the prompt; `added` is what the
 * prompt introduced — those additions are what the user most likely wants, so
 * the UI offers each added run as an individually copyable piece.
 */
export function wordDiff(before: string, after: string): DiffPart[] {
  const a = words(before);
  const b = words(after);
  const n = a.length;
  const m = b.length;

  // Templates and prompts are short; O(n*m) is fine.
  const table: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] =
        a[i].key === b[j].key
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const raw: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i].key === b[j].key) {
      // Keep the later text so trailing spacing follows the new string.
      raw.push({ kind: 'same', text: b[j].text });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      raw.push({ kind: 'removed', text: a[i++].text });
    } else {
      raw.push({ kind: 'added', text: b[j++].text });
    }
  }
  while (i < n) raw.push({ kind: 'removed', text: a[i++].text });
  while (j < m) raw.push({ kind: 'added', text: b[j++].text });

  // Merge neighbours of the same kind so the UI renders a few spans, not one
  // per word.
  const out: DiffPart[] = [];
  for (const p of raw) {
    const last = out[out.length - 1];
    if (last && last.kind === p.kind) last.text += p.text;
    else out.push({ ...p });
  }
  return out;
}

/** The added runs on their own, each individually copyable. */
export function addedFragments(parts: DiffPart[]): string[] {
  return parts
    .filter((p) => p.kind === 'added')
    .map((p) => p.text.trim())
    .filter((t) => t.length > 0);
}
