import {
  readText as tauriReadText,
  writeHtml as tauriWriteHtml,
  writeText as tauriWriteText,
} from '@tauri-apps/plugin-clipboard-manager';

/**
 * Every copy and paste in the app goes through here, so a permission failure
 * behaves identically everywhere — one message, never a mix of loud failures
 * and silent ones.
 *
 * Inside the desktop build this goes through Tauri's native clipboard plugin
 * rather than the web Clipboard API — the web API makes WebView2 show its own
 * permission prompt on every single read, which the native plugin doesn't:
 * that access is granted once, up front, via the app's own capability file.
 */
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export interface ClipboardOutcome {
  ok: boolean;
  message: string;
}

const COPY_FAIL =
  'Could not reach the clipboard. Select the text and press Ctrl+C.';
const PASTE_FAIL =
  'Could not read the clipboard. Click the field and press Ctrl+V.';

export async function copyText(
  text: string,
  successMessage = 'Copied',
): Promise<ClipboardOutcome> {
  try {
    if (isTauri) {
      await tauriWriteText(text);
    } else {
      await navigator.clipboard.writeText(text);
    }
    return { ok: true, message: successMessage };
  } catch {
    return { ok: false, message: COPY_FAIL };
  }
}

/**
 * Writes both a plain and an HTML flavour, so pasting into a rich destination
 * keeps the variable portions visually distinct while plain destinations still
 * get clean text. Falls back to plain-only where neither the native plugin
 * nor ClipboardItem is available.
 */
export async function copyRich(
  plain: string,
  html: string,
  successMessage = 'Copied',
): Promise<ClipboardOutcome> {
  try {
    if (isTauri) {
      await tauriWriteHtml(html, plain);
      return { ok: true, message: successMessage };
    }
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([plain], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' }),
        }),
      ]);
      return { ok: true, message: successMessage };
    }
    return await copyText(plain, successMessage);
  } catch {
    // Some browsers reject write() but allow writeText().
    return await copyText(plain, successMessage);
  }
}

/** Routes to copyRich or copyText based on the user's rich-copy preference — one call site per copy action regardless of which mode is active. */
export async function copyMaybeRich(
  plain: string,
  html: string,
  rich: boolean,
  successMessage?: string,
): Promise<ClipboardOutcome> {
  return rich ? copyRich(plain, html, successMessage) : copyText(plain, successMessage);
}

export async function pasteText(): Promise<
  { ok: true; text: string } | { ok: false; message: string }
> {
  try {
    const text = isTauri ? await tauriReadText() : await navigator.clipboard.readText();
    return { ok: true, text };
  } catch {
    return { ok: false, message: PASTE_FAIL };
  }
}
