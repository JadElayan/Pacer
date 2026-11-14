import type { Metadata, Viewport } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = { title: "Pacer", description: "Every student. Every pace. A live classroom companion that adapts to how each student learns." };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body className="min-h-screen bg-eggshell text-ink">{children}</body></html>);
}
