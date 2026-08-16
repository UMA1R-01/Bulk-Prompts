import type { ReactNode } from 'react';

/**
 * Every icon in the app, in one object.
 *
 * They all inherit `currentColor` and share one stroke geometry, so an icon
 * dropped into a chip picks up that chip's colour automatically and never
 * needs a per-use fill. Kept out of ui.tsx because that file exports
 * components only — mixing a const export in there costs Fast Refresh.
 */

type IconProps = { size?: number };

function stroke(size: number, path: ReactNode, width = 2) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ flexShrink: 0 }}
    >
      {path}
    </svg>
  );
}

export const Icon = {
  chevron: ({ size = 14 }: IconProps) => stroke(size, <path d="m6 9 6 6 6-6" />),
  chevronRight: ({ size = 14 }: IconProps) => stroke(size, <path d="m9 6 6 6-6 6" />),
  undo: ({ size = 14 }: IconProps) =>
    stroke(
      size,
      <>
        <path d="M9 14 4 9l5-5" />
        <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
      </>,
    ),
  redo: ({ size = 14 }: IconProps) =>
    stroke(
      size,
      <>
        <path d="m15 14 5-5-5-5" />
        <path d="M20 9H9.5A5.5 5.5 0 0 0 9.5 20H13" />
      </>,
    ),
  copy: ({ size = 13 }: IconProps) =>
    stroke(
      size,
      <>
        <rect x="9" y="9" width="12" height="12" rx="2" />
        <path d="M5 15V5a2 2 0 0 1 2-2h10" />
      </>,
    ),
  check: ({ size = 12 }: IconProps) => stroke(size, <path d="m5 13 4 4L19 7" />, 3),
  close: ({ size = 14 }: IconProps) => stroke(size, <path d="M18 6 6 18M6 6l12 12" />),
  minimize: ({ size = 14 }: IconProps) => stroke(size, <path d="M5 12h14" />),
  maximize: ({ size = 14 }: IconProps) =>
    stroke(size, <rect x="5" y="5" width="14" height="14" rx="3" />),
  restore: ({ size = 14 }: IconProps) =>
    stroke(
      size,
      <>
        <path d="M8 8V4h10v10h-4" />
        <rect x="4" y="8" width="10" height="10" rx="2.5" />
      </>,
    ),
  plus: ({ size = 13 }: IconProps) => stroke(size, <path d="M12 5v14M5 12h14" />),
  shuffle: ({ size = 13 }: IconProps) =>
    stroke(
      size,
      <>
        <path d="M16 3h5v5" />
        <path d="M4 20 21 3" />
        <path d="M21 16v5h-5" />
        <path d="m15 15 6 6M4 4l5 5" />
      </>,
    ),
  paste: ({ size = 13 }: IconProps) =>
    stroke(
      size,
      <>
        <rect x="8" y="2" width="8" height="4" rx="1" />
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      </>,
    ),
  search: ({ size = 13 }: IconProps) =>
    stroke(
      size,
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </>,
    ),
  arrowUp: ({ size = 18 }: IconProps) => stroke(size, <path d="M12 19V5M5 12l7-7 7 7" />),
  arrowRight: ({ size = 15 }: IconProps) => stroke(size, <path d="M5 12h14M13 6l6 6-6 6" />),
};
