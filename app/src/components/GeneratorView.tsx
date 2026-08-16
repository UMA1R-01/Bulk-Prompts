import { pasteText } from '../lib/clipboard';
import type { CopyStyle } from '../lib/generator';
import type { Generator } from '../state/useGenerator';
import { OutputStream } from './OutputStream';
import { TemplateEditor } from './TemplateEditor';
import { VariableRow } from './VariableRow';
import { Icon } from './icons';
import { BigButton, Card, CardHead, Chip, Empty, Label, Notice, Toggle } from './ui';

export function GeneratorView({
  g,
  onNotice,
  highlightVariables,
  copyStyle,
  onCopyStyleChange,
}: {
  g: Generator;
  onNotice: (m: string) => void;
  highlightVariables: boolean;
  copyStyle: CopyStyle;
  onCopyStyleChange: (v: CopyStyle) => void;
}) {
  const allCollapsed =
    g.variables.length > 0 && g.variables.every((v) => g.snap.collapsed[v]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,540px)] gap-5 items-start">
      {/* ══ work ══ */}
      <Card>
        <CardHead title="Your template">
          <Toggle
            checked={g.snap.autoDetect}
            onChange={g.setAutoDetect}
            label="Auto-detect"
          />
          <Chip
            onClick={async () => {
              const r = await pasteText();
              if (!r.ok) return onNotice(r.message);
              g.setTemplate(r.text);
            }}
            title="Paste a template"
          >
            <Icon.paste />
            Paste
          </Chip>
          <Chip onClick={g.clearTemplate} disabled={!g.snap.template} title="Clear the template">
            <Icon.close size={13} />
            Clear
          </Chip>
          {/* Stays visible even when auto-detect is on — hiding it outright was
              the exact bug that could leave someone with no way to move forward
              if auto-detect ever failed to fire. Disabled instead of hidden:
              redundant while auto-detect is live, one click away the moment
              it isn't. */}
          <Chip
            onClick={g.detectNow}
            disabled={g.snap.autoDetect}
            title={g.snap.autoDetect ? 'Auto-detect is already on' : 'Detect variables now'}
          >
            Detect variables
          </Chip>
        </CardHead>

        <div className="p-4 sm:p-5 flex flex-col gap-4">
          <TemplateEditor
            value={g.snap.template}
            onChange={g.setTemplate}
            placeholder="A portrait of [SUBJECT] wearing [CLOTHING]."
          />

          {g.notice && (
            <Notice tone="warn" onDismiss={g.dismissNotice}>
              {g.notice}
            </Notice>
          )}
          {g.adjacentWarning && (
            <Notice tone="warn">
              Two variables touch with nothing between them — their values will run
              together with no space in what you generate. If you meant one longer
              name rather than two variables, check nothing closed early.
            </Notice>
          )}

          <section>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pb-3">
              <Label>
                Variables — {g.variables.length} found
              </Label>
              {g.rows > 0 && g.driver && (
                <span style={{ fontSize: 12.5, color: 'var(--color-grey)' }}>
                  {g.rows} {g.rows === 1 ? 'row' : 'rows'}, set by{' '}
                  <b style={{ color: 'var(--color-ink)' }}>{g.driver}</b> — the longest list
                </span>
              )}
              <div className="ml-auto flex items-center gap-2">
                <span style={{ fontSize: 12.5, color: 'var(--color-grey)' }}>
                  {g.readyCount} of {g.variables.length} filled
                </span>
                {g.variables.length > 0 && (
                  <Chip onClick={() => g.setAllCollapsed(!allCollapsed)}>
                    {allCollapsed ? 'Expand all' : 'Collapse all'}
                  </Chip>
                )}
              </div>
            </div>

            {g.variables.length === 0 ? (
              <Empty
                title="No variables yet"
                hint="Wrap a word in square brackets to make it a variable, like [SUBJECT]."
              />
            ) : (
              <div className="flex flex-col gap-2">
                {g.variables.map((name) => (
                  <VariableRow
                    key={name}
                    name={name}
                    raw={g.snap.values[name] ?? ''}
                    count={g.counts[name] ?? 0}
                    runLength={g.rows}
                    collapsed={!!g.snap.collapsed[name]}
                    onChange={(raw) => g.setValues(name, raw)}
                    onToggle={() => g.toggleCollapsed(name)}
                    onShuffle={() => g.shuffle(name)}
                    onClear={() => g.clearValues(name)}
                    onReplaceAll={(find, replace) => g.replaceAllIn(name, find, replace)}
                    onReplaceRange={(start, end, replace) =>
                      g.replaceRangeIn(name, start, end, replace)
                    }
                    onNotice={onNotice}
                  />
                ))}
              </div>
            )}
          </section>

          <div>
            <BigButton
              onClick={g.generate}
              disabled={g.rows === 0}
              title={g.rows === 0 ? 'Add a value to any variable first' : undefined}
            >
              {g.rows === 0
                ? 'Generate prompts'
                : `Generate ${g.rows} ${g.rows === 1 ? 'prompt' : 'prompts'}`}
              <Icon.arrowRight size={17} />
            </BigButton>
            <p
              className="pt-2.5 text-center"
              style={{ fontSize: 12.5, color: 'var(--color-grey)' }}
            >
              {g.rows === 0
                ? 'Add a value to any variable first.'
                : 'Replaces the current run. Shorter lists repeat their last value.'}
            </p>
          </div>
        </div>
      </Card>

      {/* ══ run ══
          Sticky only at xl, where the run genuinely is a second column. Below
          that it's a card in the flow like any other, so a short viewport never
          ends up with two competing scroll areas. top-0 is relative to main's
          own scrollport (main is the scroll container, not the document), so
          it naturally respects main's padding with no offset needed — a
          nonzero offset here would hold the card below its resting position
          from the very first frame. The 158px in max-h accounts for the
          title bar + toolbar above main (measured ~110px) plus main's own
          top+bottom padding (48px); re-measure if that chrome's height changes. */}
      <aside className="w-full min-w-0 xl:sticky xl:top-0">
        <Card className="xl:max-h-[calc(100vh-158px)]">
          <OutputStream
            prompts={g.output}
            runId={g.runId}
            onCopied={g.markCopied}
            onRemove={g.removeOutput}
            onClearCopied={g.clearCopied}
            onEditSegment={g.editSegment}
            onNotice={onNotice}
            highlightVariables={highlightVariables}
            copyStyle={copyStyle}
            onCopyStyleChange={onCopyStyleChange}
          />
        </Card>
      </aside>
    </div>
  );
}
