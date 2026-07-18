import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { RunProvider } from "./run-context";

/**
 * Inter through next/font rather than a <link> to fonts.googleapis.com —
 * next/font self-hosts the file at build time, so there is no third-party
 * request, no layout shift on first paint, and the demo still renders
 * correctly on a conference network that cannot reach Google.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "PostDx — Autonomous Care Coordination",
  description: "FHIR R4 in, clinician and family care-coordination packages out.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      {/* RunProvider lives above the router so a run survives navigation
          between /, /clinician, and /parent without re-fetching. */}
      <body className="min-h-full bg-canvas text-ink">
        <RunProvider>{children}</RunProvider>
      </body>
    </html>
  );
}
