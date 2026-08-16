import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { VARIABLE_PATTERN } from '../lib/template';

const LINE = 40;
const PAD_Y = 16;
const PAD_X = 18;

/**
 * A real textarea with the `[VARIABLE]` slots drawn behind it.
 *
 * The textarea's own text is transparent (the caret and selection are not), and
 * a mirror div underneath renders the same string with tokens painted in. Both
 * layers share identical metrics — including padding, which has to live on the
 * layers rather than the wrapper, since the absolutely-positioned textarea
 * fills the wrapper's padding box and would otherwise sit PAD_X out of step
 * with the mirror. This is what buys inline tokens *and* ordinary text editing
 * — no contenteditable, no lost undo, no broken IME.
 *
 * Carries the bold display type and butter ground that used to live on a
 * separate live-preview panel above this field. That panel just re-showed the
 * same bracket tokens back at you until a value existed to fill them, which
 * made it pure repetition in the state where people actually look at it —
 * right after opening the template. One field, set boldly, replaces it.
 */
export function TemplateEditor({
  value,
  onChange,
  placeholder,
  minRows = 2,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  minRows?: number;
}) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  // Mirrors the textarea's live selection so renderTokens can tell which
  // token(s), if any, the current selection overlaps.
  const [sel, setSel] = useState({ start: 0, end: 0 });
  const [focused, setFocused] = useState(false);

  // Grow to fit content; the mirror defines the height and the textarea
  // stretches to match it, so the two can never disagree.
  useLayoutEffect(() => {
    const el = ta.current;
    const m = mirror.current;
    if (!el || !m) return;
    el.style.height = `${Math.max(m.scrollHeight, minRows * LINE + PAD_Y * 2)}px`;
  }, [value, minRows]);

  // document-level `selectionchange` instead of onSelect/onMouseUp/onKeyUp:
  // those three fire at different, inconsistent points (onMouseUp only at
  // drag-end, not during the drag; onSelect has known cross-browser gaps),
  // which is what made the token's flip feel laggy and unreliable.
  // `selectionchange` is the one event that fires live, continuously, and
  // identically regardless of how the selection changed — mouse drag,
  // shift+arrow, double-click, select-all.
  useEffect(() => {
    function onSelectionChange() {
      const el = ta.current;
      if (!el || document.activeElement !== el) return;
      setSel({ start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 });
    }
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, []);

  const shared: React.CSSProperties = {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: 18,
    lineHeight: `${LINE}px`,
    padding: `${PAD_Y}px ${PAD_X}px`,
    margin: 0,
    border: 0,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    letterSpacing: '-0.015em',
  };

  return (
    // minHeight matches the floor the effect above enforces on the textarea.
    // The textarea is absolutely positioned, so it never contributes to this
    // wrapper's height on its own — without this, a short or empty template
    // left the wrapper only as tall as the (near-empty) mirror, and the
    // taller textarea beneath it visually spilled into whatever came next.
    <div
      className="relative"
      style={{
        minHeight: minRows * LINE + PAD_Y * 2,
        background: 'var(--color-butter)',
        border: `2px solid ${focused ? 'var(--color-violet)' : 'var(--color-ink)'}`,
        borderRadius: 'var(--radius-block)',
      }}
    >
      <div ref={mirror} aria-hidden style={{ ...shared, color: 'transparent' }}>
        {renderTokens(value, sel)}
        {/* a trailing newline needs a character or the mirror loses its last line */}
        {value.endsWith('\n') && ' '}
      </div>
      <textarea
        ref={ta}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        // The native selection highlight dims to an inactive colour on blur
        // that ::selection can't target, so a token left showing its
        // "selected" look after focus moved elsewhere would be visibly out of
        // sync with what the textarea itself is doing.
        onBlur={() => {
          setFocused(false);
          setSel({ start: 0, end: 0 });
        }}
        placeholder={placeholder}
        spellCheck={false}
        aria-label="Prompt template"
        style={{
          ...shared,
          position: 'absolute',
          inset: 0,
          width: '100%',
          resize: 'none',
          background: 'transparent',
          color: 'transparent',
          // Not violet: the caret sits on top of two different grounds —
          // plain butter most of the time, but a solid violet token fill
          // whenever it's positioned inside or right at the edge of a
          // [VARIABLE]. A violet caret disappears completely on that violet
          // fill, which is exactly the position someone's cursor is in
          // while trying to extend a variable's name — unable to see where
          // the caret actually landed, a click meant to land just inside
          // the closing bracket can land just outside it instead, and
          // typing there opens a second, adjacent token rather than
          // extending the first. Ink holds contrast on both grounds.
          caretColor: 'var(--color-ink)',
          outline: 'none',
          overflow: 'hidden',
        }}
        className="template-input placeholder:text-[#6C5A16]/60"
      />
    </div>
  );
}

/**
 * Splits the raw string into text and painted token spans, with the
 * selection painted per character rather than left to the browser — the
 * real textarea's own ::selection is made fully transparent (see
 * index.css's `.template-input::selection`) specifically so this function
 * can take over. A plain textarea can't vary its native selection colour
 * per character, so leaving it to the browser meant a selected token lost
 * its violet fill entirely and read as plain text — indistinguishable from
 * the sentence around it. Rendering the selection here instead lets a
 * selected token keep a marker (see segmentStyle) that no uniform browser
 * selection could show.
 */
function renderTokens(text: string, sel: { start: number; end: number }) {
  const hasSelection = sel.end > sel.start;
  const segments: { start: number; end: number; isToken: boolean }[] = [];
  let cursor = 0;

  for (const m of text.matchAll(VARIABLE_PATTERN)) {
    const name = m[1].trim();
    if (!name) continue; // `[ ]` is literal text, not a slot
    const start = m.index!;
    const end = start + m[0].length;
    if (start > cursor) segments.push({ start: cursor, end: start, isToken: false });
    segments.push({ start, end, isToken: true });
    cursor = end;
  }
  if (cursor < text.length) segments.push({ start: cursor, end: text.length, isToken: false });

  const out: React.ReactNode[] = [];
  let key = 0;
  for (const seg of segments) {
    // A segment only partly covered by the selection splits into up to
    // three pieces at the selection's own edges, so each piece gets the
    // right combination of "is this a token" and "is this selected."
    const cuts = hasSelection
      ? [sel.start, sel.end].filter((n) => n > seg.start && n < seg.end)
      : [];
    const points = [seg.start, ...cuts, seg.end];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const isSelected = hasSelection && a < sel.end && b > sel.start;
      out.push(
        <span key={key++} style={segmentStyle(seg.isToken, isSelected)}>
          {text.slice(a, b)}
        </span>,
      );
    }
  }
  return out;
}

/**
 * No horizontal padding on a token's own fill: it stops exactly at the
 * brackets, so the surrounding spaces never read as part of the token.
 * Vertical padding only — that's safe because it doesn't change the text's
 * horizontal extent, so the mirror still occupies exactly the same width as
 * the invisible textarea's real text beneath it.
 *
 * A selected token is deliberately *not* set apart from the plain-text
 * selection around it — no shade shift, no underline, no tinted brackets.
 * All were tried; none read as an improvement, so a selected token is
 * exactly as selected text everywhere else looks: this is a choice, not a
 * gap.
 *
 * A selected run — token or plain text — gets 9px of padding, measured
 * against this editor's own 40px line height (LINE, above) so that two
 * consecutive selected lines butt up with zero gap between their bands
 * rather than leaving a sliver of the butter ground showing through. A
 * token keeps that same 9px while it's part of a selection, so it stays
 * flush with the plain-text run either side of it instead of sitting
 * measurably taller — but drops back to a much smaller 2px at rest, when
 * it isn't part of any band and doesn't need to match one.
 */
function segmentStyle(isToken: boolean, isSelected: boolean): React.CSSProperties {
  if (!isToken) {
    return isSelected
      ? { background: 'var(--color-violet)', color: '#FFFFFF', padding: '9px 0' }
      : { color: 'var(--color-ink)' };
  }
  return {
    background: 'var(--color-violet)',
    color: '#FFFFFF',
    // 9px matches the selection band's own padding so a token sitting in a
    // selection stays flush with the plain-text run around it — the same
    // reason plain selected text gets that padding in the first place. At
    // rest a token isn't part of any band, so it goes back to its normal,
    // much smaller pill padding instead of staying artificially tall.
    padding: isSelected ? '9px 0' : '2px 0',
  };
}
