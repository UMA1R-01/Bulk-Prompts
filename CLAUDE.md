# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

The root of this repo is **not** the project — it only holds `SPEC.md` (the implementation-agnostic functional spec) and `README.md`. The actual app, including `package.json`, lives in `app/`. There is no root `package.json`; every command below must run from `app/`.

## Commands

```bash
cd app
npm install
npm run dev              # vite dev server
npm run test              # vitest run — the whole core.test.ts suite, once
npm run lint               # oxlint
npm run build               # tsc -b && vite build
```

Run a single test by name or file (vitest, not the `npm run test` wrapper):

```bash
npx vitest run -t "adjacent variables"     # match by test/describe name
npx vitest run src/lib/core.test.ts        # match by file
```

All logic tests live in one file, `src/lib/core.test.ts`, covering every module in `src/lib/`. `vite.config.ts` scopes vitest to `src/**/*.test.ts` with `environment: 'node'` (no DOM needed — nothing under test touches React).

## Architecture

**Two independent tools, one shell.** `App.tsx` owns which tool is active (`generate` | `extract`, persisted, tab-switchable) and renders either `GeneratorView` or `ExtractorView`. Each view is backed by its own state hook (`useGenerator` / `useExtractor`) with its own snapshot shape, its own `UndoStack`, and its own localStorage keys — the two tools never share state, only the shell chrome (header, undo/redo/reset, scroll-to-top, toast).

**`lib/` has zero React imports on purpose.** Template tokenizing, generation, extraction/matching, word-diff, and the undo stack are plain TypeScript, unit-tested directly in `core.test.ts` without mounting any component. `state/` hooks are the only layer that touches this logic from React; `components/` never import from `lib/` directly except through the hooks.

**State hooks follow a three-tier mutation pattern** (see `useGenerator.ts`, mirrored in `useExtractor.ts`) — this is the thing to understand before touching either hook:
- `edit()` — the typing path. Debounced burst-collapse: the first keystroke opens an undo point via `stack.commit()`, subsequent keystrokes within ~1s call `stack.replacePresent()` instead, so a whole paragraph of typing becomes one undo step, not hundreds.
- `mutate()` — the destructive-action path. Always calls `stack.commit()` immediately, no debounce. Every bulk/destructive control (clear, shuffle, replace-all, reset, the entry-count field) must go through this, not `edit()` — that's the app's whole undo-safety guarantee, and it's easy to add a new destructive control and forget to wire it in.
- `apply()` — internal. Syncs the `UndoStack`'s pointer, updates React state, and persists to localStorage, for changes that shouldn't themselves create an undo point (collapse toggles, the auto-detect switch). `edit()` and `mutate()` both call through `apply()` after touching the stack.

`UndoStack<T>` (`lib/undoStack.ts`) is a plain class holding `past`/`future` arrays, capped at `maxDepth` (50), instantiated once per hook via a `useRef`. It is in-memory only — survives switching tools, cleared on reload.

**Generator detection vs. Extractor extraction are deliberately asymmetric.** The Generator caches a `detected` variable list separately from the live template; with auto-detect on, edits re-run detection automatically, with it off the list stays pinned until an explicit `detectNow()`. The manual "detect/extract now" action stays visible and reachable regardless of the auto toggle — hiding it when auto-mode is on was a real bug in an earlier build (see the comment on `detectNow`) that left users with no way to proceed. The Extractor does *not* cache a detected list at all — it re-parses the template fresh on every extraction, by design, so there's no "stale variable list" failure mode to guard against on that side (see `SPEC.md` §4.1).

**Generation is always re-resolved from the live template** at generate-time, independent of whatever the detected/displayed variable list currently shows — so editing the template after detecting variables can't desync generation from what's on screen.

**Storage** (`lib/storage.ts`) is namespaced per field via key constants (`K.genTemplate`, `K.extractPrompts`, etc.), read once at hook-init time and written on every `apply()`. No batching, no explicit save step.

## Design system — "Chalk Blocks"

Light two-tone ground (bone `#FFFCF3` page, white `#FFFFFF` cards), violet accent (`#5B3DF5`), with butter (`#FFD84B`) and mint (`#B4F0D3`) as background-only signal colours. **The one structural rule: anything you can press has a 2px ink (`#121212`) edge and a hard offset shadow that flattens under the click; anything that only reports state has a soft edge and no shadow.** That's what `.hard-sm/.hard-md/.hard-lg/.hard-down` and `.press` in `index.css` exist for — the shadow lives in those classes rather than in inline styles, because an inline `box-shadow` outranks `.press:active` and the press silently stops working. Radii are real (`--radius-card` 14px down to `--radius-key` 8px); the previous build's zero-radius rule is gone.

Butter, mint, violet-wash and alert-wash are **backgrounds only** — each has a paired text token (`--color-mint-ink`, `--color-violet-ink`, `--color-alert-ink`) and using the raw accent as small text on its own wash fails contrast. `index.css`'s header comment carries the full ratio table.

Two self-hosted typefaces plus one for data: Bricolage Grotesque 800 (display — wordmark, card titles, the template editor itself), Inter Tight (body and controls), JetBrains Mono (variable names, values, counts, micro-labels). Fonts live in `app/public/fonts/` and are declared in `app/src/index.css`.

Components come from `components/ui.tsx` (Card/CardHead, Chip, BigButton, Toggle, Pill, ValueChip, Notice, Empty, FillBar, CopiedMark) with every icon in `components/icons.tsx` — that split exists so `ui.tsx` stays components-only and keeps Fast Refresh. `Chip` is the *only* small control in the app; `BigButton` is used exactly once, for Generate. If a new control needs a third size, that's a signal the layout is wrong, not that the system needs another button.

`tsconfig.app.json` sets `erasableSyntaxOnly: true`, which is why classes in this codebase use explicit field declarations + constructor assignment instead of TS constructor-parameter-property shorthand.

## Behavioral contracts worth knowing before changing related code

- **Variable values are a plain textarea, one value per line** — never a chip/token editor. That shape is the entire paste story: a column out of a spreadsheet or a list from anywhere else drops straight in.
- **`TemplateEditor` carries the bold, butter-ground treatment** — there is no separate "live preview" panel above it. An earlier build had one (`RowPreview`, since deleted): it assembled row 1 from the template plus whatever values existed, but in the state people actually look at it — template just opened, nothing filled in yet — it only re-showed the same `[BRACKET]` tokens the editor below it already had, so it was pure repetition. Folding its type treatment into the editable field itself removed the duplicate box without losing the boldness.
- **Adjacent variables** (`[FIRST][LAST]`, no separator between them) are genuinely unmatchable on extraction. The whole run is attributed to the first variable, later ones come back empty, and the result is flagged `AMBIGUOUS` rather than silently guessed.
- **The entry-count control** in the Extractor applies only on Enter/blur, and ignores an empty field rather than coercing it to zero — reacting to the transient empty state while someone is retyping the number would truncate their list.
- Both tools' copy actions write `text/plain` and `text/html` together via the Clipboard API so variable portions stay visually distinct when pasted somewhere rich, falling back to plain text if `ClipboardItem` isn't available.
