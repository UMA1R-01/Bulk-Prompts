import { forwardRef, type ReactNode } from 'react';

import { Icon } from './icons';

/* ══════════════════════════════════════════════════════════════════════
   Chalk Blocks primitives.

   One rule underneath all of them: anything you can press has a 2px ink
   edge and a hard offset shadow that flattens under the click (`.press`).
   Anything that only reports state — a pill, a label, a value chip — has a
   soft edge and no shadow, so it never reads as a control.
   ══════════════════════════════════════════════════════════════════════ */

/* ── cards ─────────────────────────────────────────────────────────── */

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`hard-lg flex flex-col min-w-0 ${className}`}
      style={{
        background: 'var(--color-paper)',
        border: '2px solid var(--color-ink)',
        borderRadius: 'var(--radius-card)',
      }}
    >
      {children}
    </section>
  );
}

/** Card title bar: name on the left, controls on the right, 2px rule under. */
export function CardHead({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 sm:px-5 py-3"
      style={{ borderBottom: '2px solid var(--color-ink)' }}
    >
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          fontSize: 15.5,
          letterSpacing: '-0.01em',
        }}
      >
        {title}
      </h2>
      {meta && (
        <span className="label" style={{ color: 'var(--color-grey)' }}>
          {meta}
        </span>
      )}
      {children && (
        <div className="ml-auto flex flex-wrap items-center gap-1.5">{children}</div>
      )}
    </div>
  );
}

/* ── controls ──────────────────────────────────────────────────────── */

type ChipTone = 'default' | 'on' | 'primary' | 'danger';

const CHIP_TONES: Record<ChipTone, { bg: string; fg: string; hover: string }> = {
  default: { bg: 'var(--color-paper)', fg: 'var(--color-ink)', hover: '#F1EEE4' },
  on: { bg: 'var(--color-mint)', fg: 'var(--color-mint-ink)', hover: '#A2E9C4' },
  primary: { bg: 'var(--color-violet)', fg: '#FFFFFF', hover: 'var(--color-violet-deep)' },
  danger: { bg: 'var(--color-alert-wash)', fg: 'var(--color-alert-ink)', hover: '#FFDCCF' },
};

/**
 * The one small control in the app. Everything that isn't Generate is a chip:
 * paste, clear, shuffle, copy, collapse. Kept to a single size so a toolbar
 * row never turns into a hierarchy of competing buttons.
 *
 * Forwards its ref because a disclosure trigger (Find, in VariableRow) needs
 * to hand its own DOM node to the popover it opens, so the popover's
 * outside-click handler can recognise "the trigger itself" as in-bounds
 * rather than treating a re-click as a click elsewhere.
 */
export const Chip = forwardRef<
  HTMLButtonElement,
  {
    children: ReactNode;
    onClick?: () => void;
    tone?: ChipTone;
    disabled?: boolean;
    title?: string;
    /** For a chip that discloses a panel — never a stateful toggle like bold/italic. */
    ariaExpanded?: boolean;
    className?: string;
  }
>(function Chip(
  { children, onClick, tone = 'default', disabled, title, ariaExpanded, className = '' },
  ref,
) {
  const t = CHIP_TONES[tone];
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-expanded={ariaExpanded}
      className={`press ${tone === 'primary' ? 'focus-ink' : ''} inline-flex items-center gap-1.5 shrink-0 ${className}`}
      style={{
        background: t.bg,
        color: t.fg,
        border: '1.5px solid var(--color-ink)',
        borderRadius: 'var(--radius-key)',
        fontFamily: 'var(--font-sans)',
        fontWeight: 600,
        fontSize: 12,
        lineHeight: 1,
        padding: '7px 10px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.38 : 1,
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = t.hover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = t.bg;
      }}
    >
      {children}
    </button>
  );
});

/** The one loud control: full-width, violet, seated on a 4px ink shadow. */
export function BigButton({
  children,
  onClick,
  disabled,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="hard-down press focus-ink w-full flex items-center justify-center gap-2"
      style={{
        background: disabled ? '#CFCBC1' : 'var(--color-violet)',
        color: '#FFFFFF',
        border: '2px solid var(--color-ink)',
        borderRadius: 'var(--radius-ctl)',
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 16,
        letterSpacing: '-0.01em',
        padding: '14px 20px',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = 'var(--color-violet-deep)';
      }}
      onMouseLeave={(e) => {
        if (!disabled) e.currentTarget.style.background = 'var(--color-violet)';
      }}
    >
      {children}
    </button>
  );
}

/**
 * A switch shaped like a chip, because that is what it is: a control that
 * stays pressed. Mint when on, paper when off, with the state also carried by
 * the dot so it doesn't rely on colour alone.
 */
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  const t = checked ? CHIP_TONES.on : CHIP_TONES.default;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="press inline-flex items-center gap-2 shrink-0"
      style={{
        background: t.bg,
        color: t.fg,
        border: '1.5px solid var(--color-ink)',
        borderRadius: 'var(--radius-key)',
        fontFamily: 'var(--font-sans)',
        fontWeight: 600,
        fontSize: 12,
        lineHeight: 1,
        padding: '7px 10px',
        cursor: 'pointer',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 10,
          height: 10,
          borderRadius: 3,
          border: '1.5px solid var(--color-ink)',
          background: checked ? 'var(--color-ink)' : 'transparent',
        }}
      />
      {label}
    </button>
  );
}

/* ── state, not controls ───────────────────────────────────────────── */

type PillTone = 'muted' | 'good' | 'warn' | 'accent';

const PILL_TONES: Record<PillTone, { bg: string; fg: string }> = {
  muted: { bg: '#F1EEE4', fg: 'var(--color-grey)' },
  good: { bg: 'var(--color-mint)', fg: 'var(--color-mint-ink)' },
  warn: { bg: 'var(--color-alert-wash)', fg: 'var(--color-alert-ink)' },
  accent: { bg: 'var(--color-violet-wash)', fg: 'var(--color-violet-ink)' },
};

export function Pill({
  children,
  tone = 'muted',
  title,
}: {
  children: ReactNode;
  tone?: PillTone;
  title?: string;
}) {
  const t = PILL_TONES[tone];
  return (
    <span
      title={title}
      className="label inline-flex items-center gap-1 shrink-0"
      style={{
        background: t.bg,
        color: t.fg,
        borderRadius: 999,
        padding: '4px 9px',
        fontWeight: 700,
      }}
    >
      {children}
    </span>
  );
}

/** A recovered or substituted value, shown for reading — never a button. */
export function ValueChip({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      style={{
        // inline-block, not inline: max-width, overflow and text-overflow are
        // all ignored on a non-replaced inline element, so a long value ran
        // straight out of its column instead of ellipsing.
        display: 'inline-block',
        verticalAlign: 'middle',
        background: 'var(--color-violet-wash)',
        color: 'var(--color-violet-ink)',
        border: '1px solid #D8D0FB',
        borderRadius: 6,
        fontFamily: 'var(--font-mono)',
        fontSize: 11.5,
        fontWeight: 500,
        padding: '3px 8px',
        whiteSpace: 'nowrap',
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {children}
    </span>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <span className="label" style={{ color: 'var(--color-grey)' }}>
      {children}
    </span>
  );
}

export function Notice({
  children,
  tone = 'info',
  onDismiss,
}: {
  children: ReactNode;
  tone?: 'info' | 'warn';
  onDismiss?: () => void;
}) {
  const warn = tone === 'warn';
  return (
    <div
      role={warn ? 'alert' : 'status'}
      className="flex items-start gap-3 px-4 py-3"
      style={{
        fontSize: 13,
        lineHeight: 1.5,
        background: warn ? 'var(--color-alert-wash)' : 'var(--color-violet-wash)',
        color: warn ? 'var(--color-alert-ink)' : 'var(--color-violet-ink)',
        border: `1.5px solid ${warn ? 'var(--color-alert)' : '#CFC4FA'}`,
        borderRadius: 'var(--radius-ctl)',
      }}
    >
      <span className="flex-1">{children}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          title="Dismiss"
          style={{ color: 'inherit', lineHeight: 1 }}
        >
          <Icon.close />
        </button>
      )}
    </div>
  );
}

/** Copy confirmation attached to one item, with its running count. */
export function CopiedMark({ count }: { count: number }) {
  return (
    <Pill tone="good">
      <Icon.check />
      copied{count > 1 ? ` ${count}×` : ''}
    </Pill>
  );
}

/** An empty panel is an invitation, so it always names the next action. */
export function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div
      className="text-center px-6 py-12"
      style={{
        border: '2px dashed var(--color-hair)',
        borderRadius: 'var(--radius-block)',
      }}
    >
      <p
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          fontSize: 17,
          letterSpacing: '-0.02em',
        }}
      >
        {title}
      </p>
      <p style={{ fontSize: 13, color: 'var(--color-grey)', marginTop: 6 }}>{hint}</p>
    </div>
  );
}

/** Proportion of the run this variable can fill before it repeats itself. */
export function FillBar({ count, of }: { count: number; of: number }) {
  const pct = of > 0 ? Math.min(100, Math.round((count / of) * 100)) : 0;
  return (
    <span
      aria-hidden
      className="hidden sm:block shrink-0"
      style={{
        width: 96,
        height: 9,
        background: '#F1EEE4',
        border: '1.5px solid var(--color-ink)',
        borderRadius: 999,
        overflow: 'hidden',
      }}
    >
      <span
        style={{
          display: 'block',
          height: '100%',
          width: `${pct}%`,
          background: count === 0 ? 'var(--color-alert)' : 'var(--color-violet)',
        }}
      />
    </span>
  );
}

