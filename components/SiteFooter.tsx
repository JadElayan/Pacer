import Link from "next/link";

export function SiteFooter() {
  return (
    // A shade darker than text-smoke so the links stay readable (4.5:1+) even over the home page's blue glow.
    <footer className="relative mx-auto max-w-[1280px] px-6 pb-10 pt-6 text-sm text-[#57524b]">
      <nav aria-label="Legal and company" className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-stone pt-6">
        <Link className="underline-offset-2 hover:underline" href="/welcome">For teachers</Link>
        <Link className="underline-offset-2 hover:underline" href="/privacy">Privacy</Link>
        <Link className="underline-offset-2 hover:underline" href="/terms">Terms</Link>
        <Link className="underline-offset-2 hover:underline" href="/data-deletion">Delete my data</Link>
      </nav>
    </footer>
  );
}
