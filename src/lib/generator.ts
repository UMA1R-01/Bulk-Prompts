import { detectVariables, groupValues, parseValueLines, tokenizeTemplate } from './template';

/**
 * A run of text inside a generated prompt. `variable` is undefined for literal
 * text and set for a substituted value — that is what lets the UI highlight,
 * colour-code and inline-edit just that portion.
 */
export interface PromptSegment {
  text: string;
  variable?: string;
}

export interface GeneratedPrompt {
  id: string;
  segments: PromptSegment[];
  copyCount: number;
  edited: boolean;
}

export type GenerateBlock = 'empty-template' | 'no-variables' | 'no-values';

export type GenerationOutcome =
  | { ok: true; prompts: GeneratedPrompt[] }
  | { ok: false; block: GenerateBlock };

export function promptText(p: GeneratedPrompt): string {
  return p.segments.map((s) => s.text).join('');
}

/** Values that actually landed in this row, keyed by variable name. */
export function promptValues(p: GeneratedPrompt): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of p.segments) {
    if (s.variable) out[s.variable] = s.text;
  }
  return out;
}

/**
 * Builds every prompt row from the **live** template text.
 *
 * Row count is the length of the longest value list. A variable whose list is
 * shorter repeats *its own last value* for the remaining rows — not blank, not
 * cycled from the top. A variable with no values contributes an empty string
 * and does not block generation.
 *
 * `permutations` names variables whose list should first be chunked into
 * consecutive groups of the given size (see `groupValues`) — each group then
 * behaves as one value, same as any other line, for row-count and repeat
 * purposes.
 */
export function generatePrompts(
  template: string,
  rawValues: Record<string, string>,
  permutations: Record<string, number> = {},
): GenerationOutcome {
  if (!template.trim()) return { ok: false, block: 'empty-template' };

  const tokens = tokenizeTemplate(template);
  const names = detectVariables(template);
  if (names.length === 0) return { ok: false, block: 'no-variables' };

  const lists = new Map<string, string[]>(
    names.map((n) => {
      const lines = parseValueLines(rawValues[n] ?? '');
      const size = permutations[n];
      return [n, size ? groupValues(lines, size) : lines];
    }),
  );

  const rowCount = Math.max(0, ...[...lists.values()].map((l) => l.length));
  if (rowCount === 0) return { ok: false, block: 'no-values' };

  const prompts: GeneratedPrompt[] = [];
  for (let row = 0; row < rowCount; row++) {
    const segments: PromptSegment[] = tokens.map((t) => {
      if (t.kind === 'literal') return { text: t.text };
      const list = lists.get(t.name) ?? [];
      let value = '';
      if (list.length > 0) {
        value = row < list.length ? list[row] : list[list.length - 1];
      }
      return { text: value, variable: t.name };
    });
    prompts.push({ id: `p${row}`, segments, copyCount: 0, edited: false });
  }
  return { ok: true, prompts };
}

/** How many rows a Generate press would produce, for the live count. */
export function projectedRowCount(
  template: string,
  rawValues: Record<string, string>,
  permutations: Record<string, number> = {},
): number {
  const lengths = detectVariables(template).map((n) => {
    const lines = parseValueLines(rawValues[n] ?? '');
    const size = permutations[n];
    return size ? groupValues(lines, size).length : lines.length;
  });
  return Math.max(0, ...lengths);
}

/** Shared by every HTML clipboard flavour the app writes — see clipboard.ts. */
export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Which text styles mark a variable portion in a rich-text paste. */
export interface CopyStyle {
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

/**
 * Bold, italic, and underline together, so a variable still reads as "the
 * part that changes" even wherever one of the three gets stripped.
 */
export const DEFAULT_COPY_STYLE: CopyStyle = { bold: true, italic: true, underline: true };

/**
 * Renders prompts as HTML so a rich-text paste keeps the variable portions
 * visually distinct, styled per the given CopyStyle. Written to the
 * clipboard as a `text/html` flavour alongside plain text — something the
 * DOM gives us for free.
 *
 * Prompts are separated by a genuinely empty paragraph, not just a `\n`
 * between two `<p>` tags: that whitespace has no rendering meaning in HTML
 * (browsers collapse it), so without it the gap between prompts depends
 * entirely on whatever margin the paste destination happens to keep on a
 * bare `<p>` — several strip it, and prompts land back to back with no
 * visible break between them. An empty paragraph forces the gap to exist
 * as actual content instead of styling that isn't ours to control.
 */
export function promptsToHtml(
  prompts: GeneratedPrompt[],
  style: CopyStyle = DEFAULT_COPY_STYLE,
): string {
  const mark = (text: string) => {
    let out = escapeHtml(text);
    if (style.underline) out = `<u>${out}</u>`;
    if (style.italic) out = `<i>${out}</i>`;
    if (style.bold) out = `<b>${out}</b>`;
    return out;
  };
  return prompts
    .map(
      (p) =>
        `<p>${p.segments.map((s) => (s.variable ? mark(s.text) : escapeHtml(s.text))).join('')}</p>`,
    )
    .join('\n<p><br></p>\n');
}
