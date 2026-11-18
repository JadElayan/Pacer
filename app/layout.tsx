import type { Metadata, Viewport } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = { title: "Pacer", description: "The classroom, in sync. One lesson, with every student moving through it their own way.", appleWebApp: { capable: true, title: "Pacer", statusBarStyle: "default" } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#fdfcfc" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body className="min-h-screen bg-eggshell text-ink">{children}</body></html>);
}
