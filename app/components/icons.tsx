/**
 * Stroke-based icon set. No emoji anywhere in the UI.
 *
 * Every glyph is 24-viewBox, rendered at 20px, stroke-width 1.5, fill none,
 * and inherits colour from `currentColor` so a parent's text colour drives it.
 */

type IconProps = {
  className?: string;
  size?: number;
};

function Svg({ className, size = 20, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export function DocumentIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </Svg>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </Svg>
  );
}

export function MagnifierIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </Svg>
  );
}

export function EnvelopeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </Svg>
  );
}

export function HeartIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </Svg>
  );
}

export function ColumnsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
    </Svg>
  );
}

/** Branching path — Agent 2 splits the case down Part C or Part B. */
export function ForkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 3v6a3 3 0 003 3h6a3 3 0 013 3v6M6 21v-6" />
      <path d="M18 9l3-3-3-3M6 3l0 0" />
      <circle cx="6" cy="3" r="0.5" />
    </Svg>
  );
}

export function StethoscopeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 3v5a4 4 0 008 0V3M4 3h3M13 3h3" />
      <path d="M10 12v2a5 5 0 0010 0v-1" />
      <circle cx="20" cy="11" r="2" />
    </Svg>
  );
}

/** Medical cross, used as the product mark. */
export function CrossIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 6v12M6 12h12" />
    </Svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 13l4 4L19 7" />
    </Svg>
  );
}

export function XIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
    </Svg>
  );
}

export function PrintIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 8V4a1 1 0 011-1h8a1 1 0 011 1v4M7 18H5a2 2 0 01-2-2v-4a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2h-2" />
      <path d="M7 15h10v5a1 1 0 01-1 1H8a1 1 0 01-1-1v-5z" />
    </Svg>
  );
}

export function LocationIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 21s7-5.686 7-11a7 7 0 10-14 0c0 5.314 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </Svg>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M16 19v-1a4 4 0 00-4-4H6a4 4 0 00-4 4v1" />
      <circle cx="9" cy="7" r="3" />
      <path d="M22 19v-1a4 4 0 00-3-3.87M16 4.13A4 4 0 0119 8" />
    </Svg>
  );
}

export function ChartIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20V10M10 20V4M16 20v-6M22 20H2" />
    </Svg>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </Svg>
  );
}
