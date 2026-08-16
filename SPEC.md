# Prompt Generator & Extractor — Functional Specification

This is an implementation-agnostic functional spec for a two-tool prompt-engineering utility. It describes **what the product does** — screens, controls, behaviors, and edge cases — not how any particular prior implementation built it. It does not prescribe a language, framework, or platform; use it as the behavioral baseline for a fresh build.

---

## 1. Product overview

A single-screen app with two independent tools, switchable via a tab bar:

- **Generator** — turn one template containing `[VARIABLE]` placeholders into many finished prompts, by supplying a list of candidate values per variable.
- **Extractor** — the inverse: given the same kind of template plus a set of already-written, filled-in prompt strings, recover the variable values that would reproduce each filled prompt.

Both tools are self-contained text-manipulation utilities: no accounts, no server-side processing, no external data sources. All logic can be implemented as deterministic string/pattern matching — **no AI or model inference is required for any feature described in this spec.** (If the new build wants to add AI-assisted features later, that's an addition on top of this spec, not a requirement of it.)

Every field a user fills in should persist locally across sessions with no explicit "Save" step, scoped independently per field/tool, so relaunching the app restores exactly where the user left off.

---

## 2. Global shell

- **Title/header** area, static.
- **Tab switcher**: "Generator" / "Extractor". The last-active tab should be remembered across sessions. Switching tabs does not need to preserve the other tool's transient UI state (open modals, in-progress edit fields, undo history) — but its underlying data must remain intact and reappear correctly when the user switches back.
- **Scroll-to-top affordance**: appears once the page is scrolled a meaningful distance, returns to top smoothly.
- **Per-tool toolbar**: Undo, Redo, Reset All — present identically at the top of both tools, each operating only on its own tool's state.

### Undo / Redo requirements
- Each tool maintains its own undo history (a bounded stack — e.g. cap at some reasonable depth such as 50 entries — of full-tool-state snapshots).
- A new snapshot should be captured automatically after the user pauses editing for roughly a second (debounced), *and* explicitly right before any action that overwrites or deletes data in bulk (clearing a field, removing an item, randomizing, find/replace, bulk import, resetting, etc.) so that action is always a clean, one-step-undoable point.
- **Design pitfall to avoid**: every bulk/destructive mutation must go through the same "snapshot first" path — it's easy to add a new destructive control (e.g., a "set total count" field) and forget to wire it into the undo system, which silently defeats the safety net for exactly the situations where users need it most.
- Provide standard keyboard shortcuts (undo / redo) **scoped so they don't fight the platform's native per-field undo.** A global shortcut listener that fires regardless of what's focused will intercept a user's attempt to undo their last few keystrokes inside a text field and instead jump the whole tool back to a coarser snapshot — surprising and worth deliberately avoiding.
- Decide deliberately whether undo history should survive a tab switch or an app relaunch, and make that behavior consistent and (ideally) discoverable — don't let it silently reset without the user having any way to know why Undo stopped working.
- "Reset All" clears a tool back to its empty default state; this action should itself be a normal undo point.

---

## 3. Generator tool

### 3.1 Template input
- Multi-line text input for the template, sized to comfortably show its content (grows as needed).
- Example placeholder text: `A portrait of [SUBJECT] wearing [CLOTHING].`
- Controls: **paste-from-clipboard**, **clear**.
- An **Auto-Detect** toggle controls whether variables are (re-)detected automatically as the template changes, vs. requiring an explicit "Detect Variables" action.
- **Design pitfall to avoid**: whatever the detection trigger is, it must not depend on *how* the text got into the field (typed character-by-character vs. pasted in one action vs. programmatically set). A prior implementation of this idea only ran auto-detection on a paste event, which meant a user who typed their template directly — and had auto-detect on — got no variables detected and, because the manual "Detect Variables" button was only shown when auto-detect was *off*, had no visible way to proceed at all. Make sure detection (automatic or manual-button) is always reachable regardless of input method.

### 3.2 Variable detection
- A "variable" is any `[NAME]`-style bracketed token in the template. Detection should be case-sensitive, trim whitespace inside the brackets, de-duplicate repeated names, and ignore empty/whitespace-only brackets (`[ ]`).
- Re-running detection should preserve previously-entered values for variable names that still exist, drop UI state (like "collapsed" flags) for names that no longer exist, and clear any previously generated output (since the variable set changed).
- Detecting on an empty template, or a template with no bracketed tokens, should show a clear inline message and not proceed.

### 3.3 Providing values
For each detected variable, show a block with:
- Collapse/expand control, the variable's name, and a count of how many non-blank values are currently entered.
- **Randomize**: shuffle the order of that one variable's value list (does not affect other variables' ordering) — should no-op gracefully if there's ≤1 value.
- **Paste-to-field** and **clear-field** controls, same clipboard behavior as the template's.
- A multi-line input where each line is one candidate value for that variable.
- A way to collapse/expand all variable blocks at once, and an optional "auto-collapse this block after pasting into it" preference.

### 3.4 Find & Replace
- Operates across the variable **value** fields (not the template text itself).
- Find / Replace-with inputs.
- **Find Next**: cycles through matches across all variable fields in order, wraps around, focuses and highlights the match in place.
- **Replace**: replaces only the currently-located match, then advances to the next one.
- **Replace All**: replaces every occurrence across every variable's values in one pass.

### 3.5 Generating output
- A "Generate" action, enabled once at least one variable has at least one non-blank value (should not require *every* variable to be filled — variables with no values contribute an empty string).
- **Row count = the length of the longest variable value list.** For each output row, each variable contributes its corresponding line; a variable whose list is shorter than the max should repeat **its own last provided value** for the remaining rows (not blank, not wrapped/cycled from the top).
- Re-generating replaces the previous output set entirely.
- **Design pitfall to avoid**: generation logic must stay in sync with whatever the template currently says. If detection is a separate, explicit step, and the template can be edited afterward without forcing re-detection, then generating must handle a mismatch gracefully — either automatically re-resolve variables from the live template text, or validate first and show a friendly message — rather than fail with an unhandled error and silently do nothing. (This was the single most damaging defect in the reference implementation: editing the template after detecting variables, then generating again, crashed the generation step with no visible feedback to the user at all.)

### 3.6 Output panel
- Live count of generated items, plus (once there's output): a **copy-all** action, and a **clear all copied items** action.
- Each output item, individually:
  - Collapsible: collapsed view shows just the variable values as compact chips (or an explicit "no variables" state); expanded view shows the full assembled text.
  - Variable portions of the text should be visually distinguished and **editable in place** (click a variable's value within a generated item to edit just that one occurrence, without touching the source value list it came from).
  - A copy action with a success confirmation state and a running per-item copy counter.
  - A remove action for deleting just that one output item.
  - Copying (single item or "copy all") should preserve which portions were variables when pasted into a rich-text destination (e.g., bold/italic/underline styling on the variable segments), with a plain-text fallback if rich copying isn't available.
- An empty state (illustration/text) when nothing has been generated yet.

---

## 4. Extractor tool

### 4.1 Template input
Same shape as the Generator's template field (paste/clear controls), plus its own **Auto-Extract** toggle governing whether extraction re-runs automatically as the user types/edits, versus requiring an explicit "Extract" action.
- **Design pitfall to avoid**: unlike the Generator's detection step, extraction here should always be recomputed fresh from the live template text (not cached against a separately-detected variable list) — that avoids the "stale variable list" failure mode called out in §3.5 entirely, and it's the right default for this tool regardless of how auto-extract is toggled.

### 4.2 Filled-prompts list
- Starts with one empty entry. Each entry:
  - Should collapse to a compact single-line preview once it has content (click to re-expand and edit).
  - Has its own paste / clear / remove controls (remove hidden when it's the only entry left).
- **Add one** control, plus a **bulk add** entry point (see §4.5).
- A **direct "total count" control** for setting how many entries exist at once (growing by appending empty entries, or shrinking by dropping from the end).
  - **Design pitfall to avoid**: this is the highest-risk control in the whole app for accidental data loss. If it's a plain numeric input, remember that clearing the field to type a new number produces a transient empty/zero value on the very first keystroke — naively reacting to that intermediate state by immediately truncating the list will silently discard everything beyond the first entry before the user finishes typing. Guard against acting on empty/invalid intermediate input (e.g., only apply on blur/confirm, or ignore empty string rather than coercing it to zero), and make sure this control's changes go through the same "snapshot before destructive change" undo path as every other destructive action.
- An expand-all/collapse-all toggle, and a progress indicator (how many entries currently have content vs. total).

### 4.3 Extraction behavior
- Match each non-blank filled-in prompt against the template by treating the static text between `[VARIABLE]` tokens as fixed anchors and the bracketed tokens as the parts to recover — tolerate incidental whitespace differences in the static portions.
- **On a full match**: show the recovered value for each variable, clearly labeled, with the matched text highlighted inline against the full prompt.
- **On a failed match** (or a template with no `[VARIABLE]` tokens at all): fall back to a word-level diff between the template and the filled-in text, presented so the user can see what was removed vs. added, with the additions also broken out as individually copyable pieces. If the template genuinely has no variables, make this fallback state clear but not alarming — see the next pitfall.
- **Design pitfall to avoid**: if extraction re-runs on every keystroke (auto-extract), don't surface the "no variables found, falling back to diff" state as a red/error-styled banner — during normal use, a person will often start typing an example filled-in prompt before they've finished writing the template, and that's an expected transient state, not an error. Reserve alarming styling for things that are actually wrong.
- **Known inherent limitation, not a bug to "fix" so much as a conscious design decision**: two variables placed directly adjacent with no static text between them (`[FIRST][LAST]`) are fundamentally ambiguous to reverse-match — there's no way to know where one ends and the other begins. Decide explicitly how the new implementation should handle this (e.g., always attribute everything to the last variable and document that; require/encourage at least one static character between adjacent variables; or attempt a smarter heuristic) rather than leaving the behavior to fall out unexamined from whatever matching strategy is used.

### 4.4 Results panel
- Live count in the header.
- Two bulk-copy modes, available once there's at least one successful match with recovered variables:
  - **Grouped by prompt**: each prompt's recovered values together, prompts separated clearly.
  - **Grouped by variable**: all recovered values for a given variable name gathered together under that variable's heading, across every matched prompt.
    - **Design pitfall to avoid**: if different filled-in prompts can end up matching different variable sets (e.g., because some used a different template shape or partially matched), decide deliberately what "grouped by variable" means in that case — don't silently base the grouping only on whichever prompt happened to be processed first and drop the rest.
- Each result, individually copyable (each recovered variable value, and — for fallback/diff results — each individual added fragment).

### 4.5 Bulk import
- A modal/panel with a large text area for pasting many prompts at once, one prompt per line (blank lines ignored), with a live count of how many will be added.
- Its own paste control; discards its draft when closed without submitting.
- Two submit actions: **add** (append to the existing list, or replace it if the only existing entry is still empty/untouched) and **add & extract** (same, plus force an immediate extraction pass regardless of the auto-extract setting). Note that if auto-extract is already on, these two actions will behave identically — that's fine, just don't be surprised the distinction only matters when auto-extract is off.

---

## 5. Cross-cutting requirements

- **Fully deterministic, no AI required.** Variable detection, generation, extraction, and diffing are all achievable with plain pattern matching / string manipulation. Nothing in this spec depends on non-deterministic or model-based behavior.
- **Text/clipboard only** — no file or image inputs are part of this spec.
- **Responsive**: usable single-column on narrow/mobile viewports, and a richer multi-column layout on wide viewports; be mindful that panels which are pinned/sticky to the viewport (like a results panel) can end up cramped on short screens if they're also sized relative to full viewport height.
- **Clipboard-permission handling should be consistent** across every copy/paste control in the app — pick one fallback behavior (e.g., a visible inline message, or a native prompt telling the user to use the keyboard shortcut) and apply it uniformly, rather than having some controls fail loudly and others fail silently.
