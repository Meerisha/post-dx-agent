"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertIcon,
  ChartIcon,
  CrossIcon,
  DocumentIcon,
  HeartIcon,
  StethoscopeIcon,
  UsersIcon,
} from "./icons";

/**
 * Sidebar is route-driven rather than state-driven — each entry is a real
 * href, so the browser back button and a direct visit to /parent both behave.
 */
const NAV: { href: string; label: string; Icon: typeof DocumentIcon }[] = [
  { href: "/", label: "New Patient", Icon: DocumentIcon },
  { href: "/clinician", label: "Clinician Package", Icon: StethoscopeIcon },
  { href: "/parent", label: "Family Plan", Icon: HeartIcon },
  { href: "/encounters", label: "Encounter Browser", Icon: ChartIcon },
];

function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="no-print fixed inset-y-0 left-0 flex w-60 flex-col bg-sidebar">
      <Link href="/" className="flex items-center gap-2.5 px-5 py-5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-white">
          <CrossIcon size={18} />
        </span>
        <span className="min-w-0">
          <span className="block text-[18px] font-bold leading-tight text-white">PostDx</span>
          <span className="block text-[11px] leading-tight text-slate-400">
            Autonomous Care Coordination
          </span>
        </span>
      </Link>

      <nav className="mt-2 flex flex-col">
        {NAV.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 border-l-[3px] px-5 py-2.5 text-sm transition-colors ${
                active
                  ? "border-primary bg-sidebar-active text-white"
                  : "border-transparent text-slate-300 hover:bg-sidebar-hover hover:text-white"
              }`}
            >
              <Icon size={18} className="shrink-0 opacity-80" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-5 py-4">
        <p className="text-[11px] text-slate-500">Powered by Claude</p>
      </div>
    </aside>
  );
}

export function Disclaimer() {
  return (
    <p className="mt-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] leading-relaxed text-warning">
      <AlertIcon size={16} className="mt-px shrink-0" />
      <span>
        <strong className="font-semibold">Drafts, not decisions.</strong> Every document here is
        AI-generated from synthetic data and requires review and signature by a licensed clinician
        before any clinical or payer use. Payer and agency requirements vary by plan and by state —
        verify before submitting.
      </span>
    </p>
  );
}

/** Shell for the three agent routes. /encounters keeps its own bare layout. */
export function AppShell({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="pl-60">
        <header className="no-print sticky top-0 z-20 flex h-12 items-center justify-between border-b border-line bg-white px-6">
          <span className="text-[13px] text-muted">{title}</span>
          <div className="flex items-center gap-2">{actions}</div>
        </header>

        <main className="px-6 py-5">
          {children}
          <Disclaimer />
          <footer className="mt-4 flex items-center justify-end gap-1.5 pb-2 text-[11px] text-faint">
            <UsersIcon size={13} />
            Built at Abridge × Anthropic × Lightspeed Hackathon · July 18 2026 · Solo
          </footer>
        </main>
      </div>
    </div>
  );
}
