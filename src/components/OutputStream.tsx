import { useEffect, useMemo, useRef, useState } from 'react';

import { copyMaybeRich } from '../lib/clipboard';
import { promptText, promptsToHtml, type CopyStyle, type GeneratedPrompt } from '../lib/generator';
import { Icon } from './icons';
import { CardHead, Chip, CopiedMark, Empty, Label, Pill, ValueChip } from './ui';

/**
 * The run: header, search, and every generated row — self-contained so it owns
 * its own expand/collapse state end to end, including the collapse-all control
 * in its header.
 */
export function OutputStream({
  prompts,
  runId,
  onCopied,
  onRemove,
  onClearCopied,
  onEditSegment,
  onNotice,
  highlightVariables,
  copyStyle,
  onCopyStyleChange,
}: {
  prompts: GeneratedPrompt[];
  /** Bumped only by an explicit Generate press — see useGenerator. */
  runId: number;
  onCopied: (id: string) => void;
  onRemove: (id: string) => void;
  onClearCopied: () => void;
  onEditSegment: (id: string, index: number, text: string) => void;
  onNotice: (m: string) => void;
  /** Derived from copyStyle in App.tsx — true whenever any of bold/italic/underline is on. */
  highlightVariables: boolean;
  copyStyle: CopyStyle;
  onCopyStyleChange: (v: CopyStyle) => void;
}) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [justCopiedAll, setJustCopiedAll] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return prompts;
    return prompts.filter((p) => promptText(p).toLowerCase().includes(q));
  }, [prompts, query]);

  // Every prompt opens by default — collapsing is the optional move, not
  // reading. Keyed on runId, not on `prompts` itself: every copy, edit, or
  // remove creates a new `prompts` array too, and resetting on that reference
  // change meant any row you'd collapsed snapped back open the moment you
  // touched anything. runId only advances on an actual new Generate press.
  useEffect(() => {
    if (prompts.length) setExpanded(new Set(prompts.map((p) => p.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const allExpanded = prompts.length > 0 && prompts.every((p) => expanded.has(p.id));
  const copied = prompts.filter((p) => p.copyCount > 0).length;

  return (
    <>
      <CardHead
        title="Your prompts"
        meta={prompts.length > 0 ? `${prompts.length} ready · ${copied} copied` : undefined}
      >
        {/* Doubles as both the style picker and the on/off switch — none
            active means a plain-text copy, so there's no separate toggle. */}
        <span className="inline-flex items-center gap-0.5 shrink-0" role="group" aria-label="Copy style">
          {(
            [
              ['bold', <b key="b">B</b>],
              ['italic', <i key="i">I</i>],
              ['underline', <u key="u">U</u>],
            ] as const
          ).map(([key, glyph]) => (
            <button
              key={key}
              type="button"
              aria-pressed={copyStyle[key]}
              title={key.charAt(0).toUpperCase() + key.slice(1)}
              onClick={() => onCopyStyleChange({ ...copyStyle, [key]: !copyStyle[key] })}
              style={{
                background: copyStyle[key] ? 'var(--color-mint)' : 'transparent',
                color: copyStyle[key] ? 'var(--color-mint-ink)' : 'var(--color-ink)',
                fontFamily: 'var(--font-sans)',
                fontWeight: 700,
                fontSize: 13,
                lineHeight: 1,
                padding: '6px 7px',
                borderRadius: 'var(--radius-key)',
                cursor: 'pointer',
              }}
            >
              {glyph}
            </button>
          ))}
        </span>
        {prompts.length > 0 && (
          <>
            <Chip
              onClick={() =>
                setExpanded(allExpanded ? new Set() : new Set(prompts.map((p) => p.id)))
              }
            >
              {allExpanded ? 'Collapse all' : 'Expand all'}
            </Chip>
            <Chip
              onClick={onClearCopied}
              disabled={copied === 0}
              title="Remove every prompt you've already copied"
            >
              Clear copied
            </Chip>
            <Chip
              tone={justCopiedAll ? 'on' : 'primary'}
              onClick={async () => {
                // Flash the button itself rather than a toast — the button
                // you just pressed is right there, no need to point at it
                // from a separate popup. A failure has no other indicator,
                // so that still surfaces via onNotice.
                const r = await copyAll(prompts, highlightVariables, copyStyle);
                if (r.ok) {
                  setJustCopiedAll(true);
                  window.setTimeout(() => setJustCopiedAll(false), 1800);
                } else {
                  onNotice(r.message);
                }
              }}
            >
              {justCopiedAll ? <Icon.check /> : <Icon.copy />}
              Copy all
            </Chip>
          </>
        )}
      </CardHead>

      <div className="scroll-soft flex-1 min-h-0 overflow-y-auto p-4 sm:p-5">
        {!prompts.length ? (
          <Empty
            title="Nothing generated yet"
            hint="Add a value to any variable, then press Generate."
          />
        ) : (
          <>
            {prompts.length > 3 && (
              <div className="pb-3">
                <div className="relative">
                  <span
                    aria-hidden
                    className="absolute left-3 top-1/2 -translate-y-1/2"
                    style={{ color: 'var(--color-grey)', display: 'flex' }}
                  >
                    <Icon.search size={14} />
                  </span>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={`Search ${prompts.length} prompts`}
                    aria-label="Search generated prompts"
                    className="field"
                    style={{ fontSize: 12.5, padding: '9px 12px 9px 32px' }}
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              {visible.map((p) => {
                const open = expanded.has(p.id);
                const toggle = () =>
                  setExpanded((s) => {
                    const n = new Set(s);
                    if (n.has(p.id)) n.delete(p.id);
                    else n.add(p.id);
                    return n;
                  });
                const index = prompts.indexOf(p) + 1;
                return (
                  <article
                    key={p.id}
                    style={{
                      border: '2px solid var(--color-ink)',
                      borderRadius: 'var(--radius-block)',
                      background:
                        p.copyCount > 0 ? 'var(--color-mint-wash)' : 'var(--color-paper)',
                    }}
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3 pt-2.5">
                      <button
                        type="button"
                        onClick={toggle}
                        aria-expanded={open}
                        aria-label={open ? `Collapse prompt ${index}` : `Expand prompt ${index}`}
                        className="flex items-center gap-2 shrink-0"
                        style={{ borderRadius: 6 }}
                      >
                        <span style={{ color: 'var(--color-grey)', display: 'flex' }}>
                          {open ? <Icon.chevron size={13} /> : <Icon.chevronRight size={13} />}
                        </span>
                        <span
                          className="label"
                          style={{ color: 'var(--color-grey)', fontWeight: 700 }}
                        >
                          {String(index).padStart(2, '0')}
                        </span>
                      </button>
                      {p.edited && <Pill tone="accent">edited</Pill>}
                      {p.copyCount > 0 && <CopiedMark count={p.copyCount} />}
                      <div className="flex-1" />
                      <Chip
                        title={`Copy prompt ${index}`}
                        onClick={async () => {
                          // No toast on success — the CopiedMark that appears
                          // next to this button is the confirmation. A
                          // failure has no other indicator, so that still surfaces.
                          const r = await copyMaybeRich(
                            promptText(p),
                            promptsToHtml([p], copyStyle),
                            highlightVariables,
                          );
                          if (r.ok) {
                            onCopied(p.id);
                          } else {
                            onNotice(r.message);
                          }
                        }}
                      >
                        <Icon.copy />
                        Copy
                      </Chip>
                      <Chip title={`Remove prompt ${index}`} onClick={() => onRemove(p.id)}>
                        <Icon.close size={13} />
                      </Chip>
                    </div>

                    <div className="px-3 pb-3 pt-2">
                      {open ? (
                        <ExpandedPrompt prompt={p} onEditSegment={onEditSegment} />
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {p.segments.filter((s) => s.variable).length === 0 ? (
                            <span style={{ fontSize: 12.5, color: 'var(--color-grey)' }}>
                              no variables
                            </span>
                          ) : (
                            p.segments
                              .filter((s) => s.variable)
                              .map((s, n) => (
                                <ValueChip key={n} title={`${s.variable}: ${s.text}`}>
                                  {s.text || '—'}
                                </ValueChip>
                              ))
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>

            <p className="pt-3">
              <Label>
                Showing {visible.length} of {prompts.length}
              </Label>
            </p>
          </>
        )}
      </div>
    </>
  );
}

/**
 * The assembled prompt with each variable portion editable in place.
 *
 * Clicking a value turns that one span into an input sized to its content.
 * Enter or blur commits, Escape reverts, and only this prompt changes — the
 * source value list is never touched.
 */
function ExpandedPrompt({
  prompt,
  onEditSegment,
}: {
  prompt: GeneratedPrompt;
  onEditSegment: (id: string, index: number, text: string) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing !== null) input.current?.select();
  }, [editing]);

  return (
    <p
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 12.5,
        lineHeight: '26px',
        color: 'var(--color-ink-2)',
        margin: 0,
        overflowWrap: 'break-word',
      }}
    >
      {prompt.segments.map((s, i) => {
        if (!s.variable) return <span key={i}>{s.text}</span>;

        if (editing === i) {
          return (
            <input
              key={i}
              ref={input}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                onEditSegment(prompt.id, i, draft);
                setEditing(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onEditSegment(prompt.id, i, draft);
                  setEditing(null);
                }
                if (e.key === 'Escape') setEditing(null);
              }}
              aria-label={`Edit ${s.variable} in this prompt`}
              style={{
                background: 'var(--color-paper)',
                color: 'var(--color-ink)',
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                fontSize: 12.5,
                padding: '1px 6px',
                border: '2px solid var(--color-violet)',
                borderRadius: 5,
                outline: 'none',
                width: `${Math.max(draft.length, 4) * 7.6 + 20}px`,
              }}
            />
          );
        }

        return (
          <button
            key={i}
            type="button"
            title={`${s.variable} — click to edit just this one`}
            onClick={() => {
              setDraft(s.text);
              setEditing(i);
            }}
            style={{
              background: 'var(--color-violet-wash)',
              color: 'var(--color-violet-ink)',
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              fontSize: 12.5,
              padding: '1px 6px',
              borderRadius: 5,
              cursor: 'text',
            }}
          >
            {s.text || '—'}
          </button>
        );
      })}
    </p>
  );
}

function copyAll(prompts: GeneratedPrompt[], highlightVariables: boolean, copyStyle: CopyStyle) {
  return copyMaybeRich(
    prompts.map(promptText).join('\n\n'),
    promptsToHtml(prompts, copyStyle),
    highlightVariables,
  );
}
