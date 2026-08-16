import { useEffect, useRef, useState } from 'react';

import { copyMaybeRich, copyText, pasteText } from '../lib/clipboard';
import type { ExtractionResult } from '../lib/extractor';
import { escapeHtml } from '../lib/generator';
import { countBulkLines, type Extractor } from '../state/useExtractor';
import { TemplateEditor } from './TemplateEditor';
import { Icon } from './icons';
import {
  Card,
  CardHead,
  Chip,
  CopiedMark,
  Empty,
  Label,
  Notice,
  Pill,
  Toggle,
  ValueChip,
} from './ui';

export function ExtractorView({
  x,
  onNotice,
  highlightVariables,
}: {
  x: Extractor;
  onNotice: (m: string) => void;
  /** Shell-level preference (see App.tsx) — whether copies carry the highlighted HTML flavour or plain text only. */
  highlightVariables: boolean;
}) {
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulk, setBulk] = useState('');
  const [total, setTotalDraft] = useState(String(x.snap.prompts.length));
  const [resultsCollapsed, setResultsCollapsed] = useState<Set<number>>(new Set());
  const [justCopiedByPrompt, setJustCopiedByPrompt] = useState(false);
  const [justCopiedByVariable, setJustCopiedByVariable] = useState(false);
  // Entries with content collapse to a one-line preview; this holds the ones
  // explicitly opened again. An empty entry is always open — there is nothing
  // to preview and you need somewhere to type.
  const [openEntries, setOpenEntries] = useState<Set<number>>(new Set());

  // Keeps the entries box showing the true count: after setTotal() actually
  // lands (add one, remove, bulk add, or this box itself), not the value it
  // held a render ago. Reading x.snap.prompts.length synchronously right
  // after calling setTotal was the bug — React hadn't applied the update yet,
  // so the box snapped back to the number it was trying to replace.
  useEffect(() => {
    setTotalDraft(String(x.snap.prompts.length));
  }, [x.snap.prompts.length]);

  // Keyed by resultOrigins[i] (the result's source index in snap.prompts),
  // not by i itself — see removeEntry for why the two aren't interchangeable.
  const allResultsCollapsed =
    x.resultOrigins.length > 0 && x.resultOrigins.every((origin) => resultsCollapsed.has(origin));
  const filledEntries = x.snap.prompts.filter((p) => p.trim()).length;
  const allEntriesCollapsed =
    filledEntries > 0 &&
    x.snap.prompts.every((p, i) => !p.trim() || !openEntries.has(i));

  function isOpen(i: number, text: string) {
    return openEntries.has(i) || !text.trim();
  }

  function toggleEntry(i: number) {
    setOpenEntries((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  }

  // isOpen() treats an empty entry as always-open so there's somewhere to
  // type. The moment that entry gets real text — via Paste, not just typing
  // — that same rule flips against it: nothing had recorded the entry as
  // explicitly opened, so it collapsed itself right as content landed, one
  // render after the user pasted. Paste has to mark the entry open for the
  // same reason focusing the textarea already does.
  function markOpen(i: number) {
    setOpenEntries((s) => (s.has(i) ? s : new Set(s).add(i)));
  }

  /** Shifts every index above `removed` down by one, drops `removed` itself. */
  function reindexAfterRemoval(s: Set<number>, removed: number): Set<number> {
    const n = new Set<number>();
    for (const v of s) {
      if (v < removed) n.add(v);
      else if (v > removed) n.add(v - 1);
    }
    return n;
  }

  // Indices shift when an entry is removed, so both open and collapsed state
  // have to shift with them — otherwise removing entry 2 silently leaves
  // entry 3 wearing entry 2's state. resultsCollapsed is keyed the same way
  // openEntries is (by index into snap.prompts, via resultOrigins) for
  // exactly this reason: one reindexing rule covers both.
  function removeEntry(i: number) {
    x.removePrompt(i);
    setOpenEntries((s) => reindexAfterRemoval(s, i));
    setResultsCollapsed((s) => reindexAfterRemoval(s, i));
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,540px)] gap-5 items-start">
      <div className="flex flex-col gap-5 min-w-0">
        {/* ══ template ══ */}
        <Card>
          <CardHead title="Your template">
            <Toggle
              checked={x.snap.autoExtract}
              onChange={x.setAutoExtract}
              label="Auto-extract"
            />
            {/* Always rendered, just disabled — conditionally hiding it when
                auto-extract is on made it (and everything after it in this
                row) jump position on every toggle. */}
            <Chip
              onClick={x.extractNow}
              disabled={x.snap.autoExtract}
              title={x.snap.autoExtract ? 'Auto-extract is already on' : 'Extract now'}
            >
              Extract now
            </Chip>
            <Chip
              onClick={async () => {
                const r = await pasteText();
                if (!r.ok) return onNotice(r.message);
                x.setTemplate(r.text);
              }}
              title="Paste a template"
            >
              <Icon.paste />
              Paste
            </Chip>
            <Chip
              onClick={() => x.setTemplate('')}
              disabled={!x.snap.template}
              title="Clear the template"
            >
              <Icon.close size={13} />
              Clear
            </Chip>
          </CardHead>

          <div className="p-4 sm:p-5 flex flex-col gap-4">
            <TemplateEditor
              value={x.snap.template}
              onChange={x.setTemplate}
              placeholder="A portrait of [SUBJECT] wearing [CLOTHING]."
            />
            {/* Calm, not alarming: writing the template after an example is normal. */}
            {x.noVariables && (
              <Notice>
                No variables yet — results show a word-by-word difference instead.
              </Notice>
            )}
            {x.adjacentWarning && (
              <Notice tone="warn">
                Two variables touch with nothing between them. The whole run goes to the
                first one — add a separator to split them reliably.
              </Notice>
            )}
          </div>
        </Card>

        {/* ══ filled prompts ══ */}
        <Card>
          <CardHead
            title="Filled prompts"
            meta={`${x.filled} of ${x.snap.prompts.length} filled`}
          >
            {filledEntries > 0 && (
              <Chip
                onClick={() =>
                  setOpenEntries(
                    allEntriesCollapsed
                      ? new Set(x.snap.prompts.map((_, i) => i))
                      : new Set(),
                  )
                }
              >
                {allEntriesCollapsed ? 'Expand all' : 'Collapse all'}
              </Chip>
            )}
            <Chip onClick={x.addPrompt} title="Add one more entry">
              <Icon.plus />
              Add one
            </Chip>
            <Chip tone="primary" onClick={() => setBulkOpen(true)}>
              Bulk add
            </Chip>
          </CardHead>

          <div className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pb-4">
              <Label>Entries</Label>
              <input
                value={total}
                onChange={(e) => setTotalDraft(e.target.value)}
                // Applied on Enter or blur only. Never per keystroke — clearing
                // the box to retype produces a transient empty value, and
                // acting on that would silently truncate the list.
                //
                // Enter commits directly rather than just calling .blur() and
                // leaning on the resulting onBlur to do it: calling .blur()
                // synchronously from inside a React key handler makes the
                // native blur it triggers get processed with state from before
                // this handler ran, so onBlur's own closure saw a stale
                // `total` and silently no-opped. Committing here first sidesteps
                // that; the blur() call after is then purely cosmetic.
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    x.setTotal(total);
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                onBlur={() => x.setTotal(total)}
                inputMode="numeric"
                aria-label="Number of prompt entries"
                className="field"
                style={{
                  width: 74,
                  fontSize: 13,
                  padding: '7px 10px',
                  textAlign: 'center',
                }}
              />
              <span style={{ fontSize: 12, color: 'var(--color-grey)' }}>
                applied on Enter or when you click away
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {x.snap.prompts.map((p, i) => {
                const open = isOpen(i, p);
                return (
                  <div
                    key={i}
                    style={{
                      border: `2px solid ${open ? 'var(--color-violet)' : 'var(--color-ink)'}`,
                      borderRadius: 'var(--radius-block)',
                      background: 'var(--color-paper)',
                    }}
                  >
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => toggleEntry(i)}
                        disabled={!p.trim()}
                        aria-expanded={open}
                        aria-label={open ? `Collapse entry ${i + 1}` : `Expand entry ${i + 1}`}
                        className="flex items-center gap-2 shrink-0"
                        style={{ borderRadius: 6, opacity: p.trim() ? 1 : 0.55 }}
                      >
                        <span style={{ color: 'var(--color-grey)', display: 'flex' }}>
                          {open ? <Icon.chevron size={13} /> : <Icon.chevronRight size={13} />}
                        </span>
                        <span
                          className="label"
                          style={{ color: 'var(--color-grey)', fontWeight: 700 }}
                        >
                          {String(i + 1).padStart(2, '0')}
                        </span>
                      </button>

                      {!open && (
                        // See VariableRow: on a phone this gets its own line
                        // rather than being truncated down to nothing.
                        <span
                          className="flex-1 truncate min-w-0 max-sm:basis-full max-sm:order-last"
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 12,
                            color: 'var(--color-ink-2)',
                          }}
                          title={p}
                        >
                          {p}
                        </span>
                      )}
                      {open && <div className="flex-1" />}

                      {/* Collapsed keeps only Remove — the other two act on
                          text you can't see from here, and three chips on
                          every row ate the preview that makes a collapsed
                          entry worth reading. */}
                      <div className="flex items-center gap-1.5">
                        {open && (
                          <>
                            <Chip
                              onClick={async () => {
                                const r = await pasteText();
                                if (!r.ok) return onNotice(r.message);
                                x.setPrompt(i, r.text);
                                markOpen(i);
                              }}
                              title={`Paste into entry ${i + 1}`}
                            >
                              <Icon.paste />
                              <span className="hidden lg:inline">Paste</span>
                            </Chip>
                            <Chip
                              onClick={() => x.clearPrompt(i)}
                              disabled={!p}
                              title={`Clear entry ${i + 1}`}
                            >
                              <Icon.close size={13} />
                              <span className="hidden lg:inline">Clear</span>
                            </Chip>
                          </>
                        )}
                        {x.snap.prompts.length > 1 && (
                          <Chip onClick={() => removeEntry(i)} title={`Remove entry ${i + 1}`}>
                            Remove
                          </Chip>
                        )}
                      </div>
                    </div>

                    {open && (
                      <div className="px-3 pb-3">
                        {/* Auto-grows to its content instead of a fixed
                            rows={3} with its own internal scrollbar.
                            Collapse already exists as the way to shrink an
                            entry's footprint — stacking a second, separate
                            "small until you scroll it" behavior on the
                            expanded state just fought that, forcing a
                            scroll to read a prompt you'd already chosen to
                            open. No resize handle either: a fixed height
                            you drag and an auto-grow that overrides it on
                            the next keystroke would just fight each other. */}
                        <textarea
                          ref={(el) => {
                            if (!el) return;
                            el.style.height = 'auto';
                            el.style.height = `${el.scrollHeight}px`;
                          }}
                          value={p}
                          onChange={(e) => {
                            x.setPrompt(i, e.target.value);
                            e.target.style.height = 'auto';
                            e.target.style.height = `${e.target.scrollHeight}px`;
                          }}
                          onFocus={() => markOpen(i)}
                          placeholder="paste a finished prompt"
                          rows={3}
                          spellCheck={false}
                          aria-label={`Filled prompt ${i + 1}`}
                          className="field block"
                          style={{
                            fontSize: 12.5,
                            lineHeight: '22px',
                            padding: '11px 13px',
                            resize: 'none',
                            overflow: 'hidden',
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      </div>

      {/* ══ results ══ — sticky only at xl, same as the Generator's run panel.
          See GeneratorView's matching aside for why top is 0 and max-h is
          158px: main (not the document) is the scroll container now, so
          sticky offsets are relative to main's own scrollport. */}
      <aside className="w-full min-w-0 xl:sticky xl:top-0">
        <Card className="xl:max-h-[calc(100vh-158px)]">
          <CardHead
            title="Results"
            meta={
              x.results.length > 0
                ? `${x.matched} of ${x.results.length} matched`
                : undefined
            }
          >
            {x.results.length > 0 && (
              <Chip
                onClick={() =>
                  setResultsCollapsed(allResultsCollapsed ? new Set() : new Set(x.resultOrigins))
                }
              >
                {allResultsCollapsed ? 'Expand all' : 'Collapse all'}
              </Chip>
            )}
            {x.matched > 0 && (
              <>
                <Chip
                  tone={justCopiedByPrompt ? 'on' : 'default'}
                  title="Copy the values, one prompt per block"
                  onClick={async () => {
                    // Flash the button itself rather than a toast — see the
                    // "by variable" button below for why.
                    const text = x.results
                      .filter((r) => r.matched)
                      .map((r) => (r.matched ? r.values.map((v) => v.value).join('\n') : ''))
                      .join('\n\n');
                    const r = await copyText(text);
                    if (r.ok) {
                      setJustCopiedByPrompt(true);
                      window.setTimeout(() => setJustCopiedByPrompt(false), 1800);
                    } else {
                      onNotice(r.message);
                    }
                  }}
                >
                  {justCopiedByPrompt ? <Icon.check /> : <Icon.copy />}
                  By prompt
                </Chip>
                <Chip
                  tone={justCopiedByVariable ? 'on' : 'primary'}
                  title="Copy the values grouped under each variable"
                  onClick={async () => {
                    // Flash the button itself rather than a toast — the
                    // button you just pressed is right there, no need for a
                    // separate popup. A failure has no other indicator, so
                    // that still surfaces via onNotice.
                    // Plain `[NAME]`, not a `###` heading — `###` reads as
                    // Markdown to a lot of paste targets, and one rendering
                    // it turned every value list into a single Markdown
                    // paragraph, where a lone `\n` between lines is just a
                    // soft wrap — so instead of one value per line, the
                    // whole list ran together on one visual line with
                    // spaces. Nothing else in this app emits Markdown; this
                    // shouldn't have either.
                    const plain = Object.entries(x.grouped)
                      .map(([k, vs]) => `[${k}]\n${vs.join('\n')}`)
                      .join('\n\n');
                    // The rich flavour bolds just the [NAME] label so it
                    // reads as a heading over its values at a glance. Values
                    // are joined with real `<br>` tags, not a literal `\n`
                    // in the markup — HTML has no rendering meaning for
                    // that whitespace, so relying on it was the exact bug
                    // the plain-text version just got fixed for. Groups
                    // themselves get a blank paragraph between them for the
                    // same reason promptsToHtml does — see generator.ts.
                    const html = Object.entries(x.grouped)
                      .map(
                        ([k, vs]) =>
                          `<p><b>[${escapeHtml(k)}]</b><br>${vs.map(escapeHtml).join('<br>')}</p>`,
                      )
                      .join('\n<p><br></p>\n');
                    const r = await copyMaybeRich(plain, html, highlightVariables);
                    if (r.ok) {
                      setJustCopiedByVariable(true);
                      window.setTimeout(() => setJustCopiedByVariable(false), 1800);
                    } else {
                      onNotice(r.message);
                    }
                  }}
                >
                  {justCopiedByVariable ? <Icon.check /> : <Icon.copy />}
                  By variable
                </Chip>
              </>
            )}
          </CardHead>

          <div className="scroll-soft flex-1 min-h-0 overflow-y-auto p-4 sm:p-5">
            {x.results.length === 0 ? (
              <Empty
                title="Nothing to extract yet"
                hint="Add a template and a finished prompt."
              />
            ) : (
              <div className="flex flex-col gap-2">
                {x.results.map((r, i) => {
                  // resultOrigins[i], not i: i is only this result's position
                  // among currently-shown results, which is fine for the "01,
                  // 02…" display numbering but not stable across a removal —
                  // origin is the same index openEntries/removeEntry use, so
                  // collapse state (and Result's own key, so its internal
                  // per-row copied-count state doesn't leak either) survives
                  // a removal elsewhere in the list intact.
                  const origin = x.resultOrigins[i];
                  return (
                    <Result
                      key={origin}
                      r={r}
                      index={i}
                      onNotice={onNotice}
                      collapsed={resultsCollapsed.has(origin)}
                      onToggle={() =>
                        setResultsCollapsed((s) => {
                          const n = new Set(s);
                          if (n.has(origin)) n.delete(origin);
                          else n.add(origin);
                          return n;
                        })
                      }
                    />
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      </aside>

      {bulkOpen && (
        <BulkDialog
          value={bulk}
          onChange={setBulk}
          onClose={() => {
            setBulk(''); // draft is discarded when closed without submitting
            setBulkOpen(false);
          }}
          onSubmit={(thenExtract) => {
            x.bulkAdd(bulk, thenExtract);
            setBulk('');
            setBulkOpen(false);
          }}
          onNotice={onNotice}
        />
      )}
    </div>
  );
}

function Result({
  r,
  index,
  collapsed,
  onToggle,
  onNotice,
}: {
  r: ExtractionResult;
  index: number;
  collapsed: boolean;
  onToggle: () => void;
  onNotice: (m: string) => void;
}) {
  const [copied, setCopied] = useState<Record<number, number>>({});

  // No toast on success — the inline CopiedMark right next to the button is
  // the confirmation. A failure has no other indicator, so that still surfaces.
  async function copyValue(i: number, text: string) {
    const r2 = await copyText(text);
    if (r2.ok) {
      setCopied((c) => ({ ...c, [i]: (c[i] ?? 0) + 1 }));
    } else {
      onNotice(r2.message);
    }
  }

  return (
    <article
      style={{
        border: '2px solid var(--color-ink)',
        borderRadius: 'var(--radius-block)',
        background: 'var(--color-paper)',
      }}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3 pt-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Expand result ${index + 1}` : `Collapse result ${index + 1}`}
          className="flex items-center gap-2 shrink-0"
          style={{ borderRadius: 6 }}
        >
          <span style={{ color: 'var(--color-grey)', display: 'flex' }}>
            {collapsed ? <Icon.chevronRight size={13} /> : <Icon.chevron size={13} />}
          </span>
          <span className="label" style={{ color: 'var(--color-grey)', fontWeight: 700 }}>
            {String(index + 1).padStart(2, '0')}
          </span>
        </button>
        <Pill tone={r.matched ? 'good' : 'muted'}>{r.matched ? 'matched' : 'difference'}</Pill>
        {r.ambiguous && (
          <Pill tone="warn" title="Two variables touch, so the split can't be trusted">
            ambiguous
          </Pill>
        )}
      </div>

      <div className="px-3 pb-3 pt-2">
        {collapsed ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Collapsed used to be read-only — scan the row, expand it to
                actually get a value out. Same click-to-copy the expanded
                row's own values and the difference view's fragments
                already have, so grabbing one value doesn't require opening
                a row just to close it again right after. */}
            {r.matched
              ? r.values.map((v, i) => (
                  <span key={v.name} className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => copyValue(i, v.value)}
                      title={`Copy ${v.name}: ${v.value}`}
                      style={{ borderRadius: 6 }}
                    >
                      <ValueChip>{v.value || '—'}</ValueChip>
                    </button>
                    {copied[i] > 0 && <CopiedMark count={copied[i]} />}
                  </span>
                ))
              : r.fragments.map((f, i) => (
                  <span key={i} className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => copyValue(i, f)}
                      title="Copy this fragment"
                      style={{ borderRadius: 6 }}
                    >
                      <ValueChip>{f}</ValueChip>
                    </button>
                    {copied[i] > 0 && <CopiedMark count={copied[i]} />}
                  </span>
                ))}
          </div>
        ) : r.matched ? (
          <div className="flex flex-col gap-1.5">
            {r.values.map((v, i) => (
              <div key={v.name} className="flex flex-wrap items-center gap-2">
                {/* Bounded by the row, not by a fixed px column: a name
                    like OMNITRIX_LOCATION doesn't fit the 92px this used to
                    be pinned to, and unlike a value (free text, fine to
                    ellipsise with the full text in a title tooltip) a
                    variable name is a short identifier — silently hiding
                    the end of one is actively misleading, since two names
                    can differ only in a truncated suffix. A first pass at
                    this capped the label to a narrow fixed column
                    (maxWidth: 150 + overflowWrap: anywhere), which broke
                    even moderately long names into a ragged stack — it
                    should use the row's own full width before wrapping at
                    all, and prefer breaking at a natural boundary over an
                    arbitrary character. maxWidth: 100% (of the row, since
                    this is a flex item) plus minWidth: 0 gets that: the
                    name grows as wide as it needs up to the whole row,
                    same as any other flex-wrapped text, and only breaks
                    mid-word for a run with nothing else to break on. */}
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    color: 'var(--color-grey)',
                    minWidth: 0,
                    maxWidth: '100%',
                    overflowWrap: 'break-word',
                  }}
                >
                  {v.name}
                </span>
                {/* min-w-0 let this shrink all the way to nothing, which is
                    exactly what happened once the name above stopped being
                    capped: with nothing guaranteeing the value any width,
                    a long name just ate the row and left this to whatever
                    sliver was left over — "abdomen" down to "ab…", the
                    copy button dragged along wherever that sliver ended.
                    A real floor (110px) means that once the name plus a
                    legible value can't both fit on the name's own line,
                    flex-wrap moves the value — and the copied mark and
                    copy button right after it — down to a line of its own
                    instead, where it gets the row's full width rather than
                    whatever the name didn't want. */}
                <span className="flex-1" style={{ minWidth: 110 }}>
                  <ValueChip title={v.value}>{v.value || '—'}</ValueChip>
                </span>
                {copied[i] > 0 && <CopiedMark count={copied[i]} />}
                <Chip title={`Copy ${v.name}`} onClick={() => copyValue(i, v.value)}>
                  <Icon.copy />
                </Chip>
              </div>
            ))}
          </div>
        ) : (
          <>
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                lineHeight: '24px',
                margin: 0,
                overflowWrap: 'break-word',
              }}
            >
              {r.diff.map((d, i) => (
                <span
                  key={i}
                  style={
                    d.kind === 'same'
                      ? { color: 'var(--color-grey)' }
                      : d.kind === 'removed'
                        ? { color: 'var(--color-grey)', textDecoration: 'line-through' }
                        : {
                            color: 'var(--color-violet-ink)',
                            background: 'var(--color-violet-wash)',
                            fontWeight: 600,
                            borderRadius: 4,
                            padding: '1px 3px',
                          }
                  }
                >
                  {d.text}
                </span>
              ))}
            </p>
            {r.fragments.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-3">
                {r.fragments.map((f, i) => (
                  <span key={i} className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => copyValue(i, f)}
                      title="Copy this fragment"
                      style={{ borderRadius: 6 }}
                    >
                      <ValueChip title={f}>{f}</ValueChip>
                    </button>
                    {copied[i] > 0 && <CopiedMark count={copied[i]} />}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </article>
  );
}

function BulkDialog({
  value,
  onChange,
  onClose,
  onSubmit,
  onNotice,
}: {
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
  onSubmit: (thenExtract: boolean) => void;
  onNotice: (m: string) => void;
}) {
  const n = countBulkLines(value);
  const dialog = useRef<HTMLDivElement>(null);

  // Escape closes it, and Tab can never land on the page behind the scrim —
  // the same pair of guarantees FindReplace's popover already gives, applied
  // here to a full modal.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = dialog.current;
      if (!root) return;
      // :not(:disabled) matters here specifically: Add and Add and extract
      // are disabled until the textarea has content, and a disabled button
      // can never become document.activeElement — so treating it as "last"
      // would make the trap compare against a target Tab can never reach,
      // and the wrap-around would silently never fire.
      const focusable = root.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // flex, not grid: a single-track CSS grid auto-sizes to its child's content
  // width, so the dialog's own width:100% had nothing but its own intrinsic
  // content to resolve against and never actually saw the viewport. Flex
  // correctly constrains the child to the container's real available width.
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-5 sm:p-8"
      style={{ background: 'rgba(18,18,18,0.55)' }}
      onClick={onClose}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Bulk add prompts"
        onClick={(e) => e.stopPropagation()}
        className="hard-lg w-full max-w-[680px]"
        style={{
          background: 'var(--color-paper)',
          border: '2px solid var(--color-ink)',
          borderRadius: 'var(--radius-card)',
        }}
      >
        <CardHead title="Bulk add" meta={`${n} will be added`}>
          <Chip onClick={onClose} title="Close">
            <Icon.close />
          </Chip>
        </CardHead>
        <div className="p-4 sm:p-5">
          <p className="pb-3" style={{ fontSize: 12.5, color: 'var(--color-grey)' }}>
            One prompt per line. Blank lines are ignored.
          </p>
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={11}
            autoFocus
            spellCheck={false}
            aria-label="Prompts to import, one per line"
            className="field block"
            style={{
              fontSize: 12.5,
              lineHeight: '22px',
              padding: '13px 15px',
              resize: 'vertical',
            }}
          />
          <div className="flex flex-wrap items-center gap-2 pt-4">
            <Chip
              onClick={async () => {
                const r = await pasteText();
                if (!r.ok) return onNotice(r.message);
                onChange(r.text);
              }}
            >
              <Icon.paste />
              Paste
            </Chip>
            <div className="flex-1" />
            <Chip onClick={onClose}>Cancel</Chip>
            <Chip onClick={() => onSubmit(false)} disabled={n === 0}>
              Add
            </Chip>
            <Chip tone="primary" onClick={() => onSubmit(true)} disabled={n === 0}>
              Add and extract
            </Chip>
          </div>
        </div>
      </div>
    </div>
  );
}
