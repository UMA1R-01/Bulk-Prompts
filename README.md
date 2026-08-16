# Bulk Prompts

Two text tools in one desktop app, for anyone who writes the same prompt shape over and over with different values.

- **Generate**: one template with `[VARIABLE]` placeholders plus a list of values per variable, turned into many finished prompts.
- **Extract**: the inverse. Give it the template and a batch of already-written prompts, and it recovers the values that produced them.

No accounts, no server, no model calls. Every field persists to local storage automatically, with no Save step. See [SPEC.md](SPEC.md) for the full functional spec this app implements.

[![Leave a tip](https://img.shields.io/badge/%E2%98%95-Leave_a_tip-ff69b4?style=for-the-badge)](#-leave-a-tip)

## Download

**[Download the latest Windows installer →](https://github.com/UMA1R-01/Bulk-Prompts/releases/latest)**

Grab `Bulk.Prompts_x.y.z_x64-setup.exe` from the release assets and run it (GitHub replaces the spaces in the filename with dots). It installs to `%LOCALAPPDATA%\Programs\Bulk Prompts` with a Start Menu shortcut, and registers an uninstaller under Windows' Add/Remove Programs. It relies on the WebView2 runtime, which already ships with Windows 10 and 11; on a machine without it, the installer offers to fetch it.

The installer is unsigned, so Windows SmartScreen will warn on first run. Choose **More info, then Run anyway**.

Prefer to build it yourself, or run it as a plain web app instead? See [Building from source](#building-from-source) below.

## What it does

**Generate** takes one template written with `[VARIABLE]` placeholders and a plain list of values per variable, one value per line, so a column pasted straight out of a spreadsheet works as-is, then produces one finished prompt per row. Row count follows the longest list; shorter lists repeat their own last value to fill the rest.

**Extract** runs the process in reverse: paste the same kind of template plus a batch of prompts someone already wrote by hand, and it recovers the values that would reproduce each one. Variables with no separator between them, like `[FIRST][LAST]`, are genuinely unmatchable by any algorithm; rather than guess, Extract attributes the whole run to the first variable and flags the result `AMBIGUOUS`.

Both tools keep independent undo history and persist every field automatically. Neither one calls out to a model or a server; it is all deterministic string parsing, running either as a desktop app or, if you build it yourself, a static web page.

## Tech stack

- **[React 19](https://react.dev)** + **[TypeScript](https://www.typescriptlang.org)**
- **[Vite](https://vite.dev)** for the dev server and bundling
- **[Tailwind CSS v4](https://tailwindcss.com)**, configured CSS-first, no separate config file
- **[Tauri v2](https://tauri.app)** (Rust) for the desktop shell
- **[Vitest](https://vitest.dev)** for the logic test suite, **[Oxlint](https://oxc.rs)** for linting
- No UI framework beyond Tailwind: every control (buttons, toggles, the template editor's inline tokens) is hand-built to the app's own design system

## Building from source

### Prerequisites

For the web build you only need [Node.js](https://nodejs.org) 20.19+ or 22.12+.

The desktop build additionally needs the [Tauri v2 prerequisites](https://tauri.app/start/prerequisites/) for your platform. On Windows that means:

- [Rust](https://rustup.rs) (stable, MSVC toolchain)
- Microsoft C++ Build Tools, including the Windows SDK
- WebView2 Runtime, preinstalled on Windows 10 and 11

### Install

```bash
git clone https://github.com/UMA1R-01/Bulk-Prompts.git
cd Bulk-Prompts/app
npm install
```

### Run

```bash
npm run dev
```

```bash
npm run tauri dev
```

`npm run dev` serves the web app at `http://localhost:5173`. `npm run tauri dev` launches the desktop window and starts Vite automatically; the first desktop run compiles the whole Rust dependency tree and can take a while, later runs are quick.

### Build

```bash
npm run build
```

```bash
npm run tauri build
```

`npm run build` type-checks and bundles the web app to `app/dist/`. `npm run tauri build` produces a native installer under `app/src-tauri/target/release/bundle/`.

### Test and lint

```bash
npm run test      # vitest, runs the core logic suite once
npm run lint       # oxlint
```

All logic tests live in one file, `src/lib/core.test.ts`, covering every module in `src/lib/` directly, with no component mounted.

## Project layout

```
app/
  public/
    fonts/             self-hosted Bricolage Grotesque, Inter Tight, JetBrains Mono
    favicon.svg
  src/
    lib/                pure TypeScript, no React import, unit-testable alone
      template.ts        tokenizing and variable detection
      generator.ts       row generation + HTML for rich copy
      extractor.ts       reverse matching, ambiguity flagging, grouping
      wordDiff.ts        LCS word diff used as the extractor fallback
      undoStack.ts       bounded snapshot history
      clipboard.ts       every copy/paste goes through here
      storage.ts         localStorage read/write, namespaced per tool
      core.test.ts       covers all of the above
    state/              useGenerator / useExtractor, the two tools' state machines
    components/         TemplateEditor, VariableRow, FindReplace, OutputStream,
                         GeneratorView, ExtractorView, TitleBar (the custom
                         frameless window bar used by the desktop build),
                         ui.tsx (shared primitives), icons.tsx (icon set)
    App.tsx             shell: tool switcher, undo/redo/reset, scroll-to-top
  src-tauri/            Rust side of the desktop shell: window config, bundler
                         config, and app icons
```

`lib/` has no React dependency on purpose: the logic that has to be correct is testable without a component tree, and portable if the UI is ever rebuilt again.

## Design, "Chalk Blocks"

Bone (`#FFFCF3`) page, white cards, one accent (`#5B3DF5` violet). Butter and mint are background-only signal colours, each paired with its own text token for contrast. Anything pressable gets a 2px ink edge and a hard offset shadow that flattens on click; anything that only reports state gets a soft edge and no shadow. Bricolage Grotesque for headings and UI text, Inter Tight for body copy, JetBrains Mono for every piece of prompt content and all labels. Full rationale lives in `app/src/index.css`'s header comment.

## Decisions worth knowing

**Adjacent variables.** `[FIRST][LAST]` has no separator, so the split point is genuinely unknowable. The whole run is attributed to the *first* variable, later ones come back empty, and the result is flagged `AMBIGUOUS` in the UI with a hint to add a separator. Documented rather than silently guessed.

**Undo history is in-memory.** Each tool has its own 50-deep stack. It survives switching tools but is cleared on reload: field values come back, history does not. The buttons disable when a stack is empty so this is visible, not mysterious. Every bulk or destructive action snapshots first, including the entry-count control in Extract.

**The entry-count control** in Extract applies on Enter or blur only, never per keystroke, and ignores an empty field instead of reading it as zero. Clearing the box to type a new number would otherwise truncate the list on the first keystroke.

**Detection never depends on how text arrived.** Typed, pasted, or set programmatically all take the same path, and a manual "Detect variables" action is always available regardless of the auto-detect setting.

**Rich-text copy** writes both `text/plain` and `text/html` via the Clipboard API, so pasting a generated prompt into a rich destination keeps the variable portions visually distinct. Falls back to plain text if `ClipboardItem` isn't available.

## Known gaps

- **Mobile is out of scope for now**, by explicit choice. The layout is responsive down to phone widths, but there's no dedicated mobile app shell.
- **No dark/light theme toggle.** The bone-and-white look is fixed by design, not tied to the OS colour-scheme preference; this hasn't come up as a requirement yet.

## ☕ Leave a tip

💛 If you like this app, a tip is always welcome!

<div>

<img src="https://img.shields.io/badge/Bitcoin-native%20BTC%20only-555?style=flat-square&logo=bitcoin&logoColor=white&labelColor=F7931A" alt="Bitcoin: native BTC only">

```
bc1qs25pegh3232q9j58kt5dgczymcj4pg8a5un2zp
```

</div>

<div>

<img src="https://img.shields.io/badge/Base-ETH%20%2F%20USDC%20on%20Base%20only-555?style=flat-square&logo=coinbase&logoColor=white&labelColor=0052FF" alt="Base: ETH / USDC on Base only">

```
0x81F29C9Dca41cb57395BE5b56c7606653A8c2E34
```

</div>

<div>

<img src="https://img.shields.io/badge/Solana-SOL%20%2F%20SPL%20tokens%20only-555?style=flat-square&logo=solana&logoColor=white&labelColor=9945FF" alt="Solana: SOL / SPL tokens only">

```
G57VrGCbAFWSe2vPfx2ZrUUxzJeiARncKUkYMxw3wKVa
```

</div>

## License

[MIT](LICENSE), (c) Umair Aamir
