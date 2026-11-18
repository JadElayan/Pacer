"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/useAuth";
import { Reveal } from "./Motion";

/** Small line icons for the feature lists (24×24, stroke = currentColor). */
const ICONS: Record<string, ReactNode> = {
  ask: <><path d="M5 5h14v10H9l-4 4z" /><path d="M10 9.5a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6 1" /><path d="M12 14.5h.01" /></>,
  snip: <><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><path d="M9 12h6" /></>,
  catchup: <><path d="M12 7v5l3 2" /><path d="M4.5 9A8 8 0 1 1 4 13" /><path d="M4 5v4h4" /></>,
  notes: <><path d="M6 3h9l3 3v15H6z" /><path d="M9 10h6M9 14h6M9 18h3" /></>,
  check: <><circle cx="12" cy="12" r="8.5" /><path d="m8.5 12.5 2.3 2.2 4.7-5" /></>,
  board: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /><path d="m7 12 3-3 2 2 4-4" /></>,
  split: <><rect x="3" y="5" width="8" height="14" rx="1.5" /><rect x="13" y="5" width="8" height="14" rx="1.5" /></>,
  topics: <><rect x="3" y="5" width="7" height="6" rx="1.5" /><rect x="14" y="5" width="7" height="6" rx="1.5" /><path d="M3 15h18M3 19h12" /></>,
  alert: <><path d="M12 4 3 19h18z" /><path d="M12 10v4M12 16.5h.01" /></>,
  recap: <><path d="M5 4h14v16H5z" /><path d="M9 8h6M9 12h6M9 16h4" /><path d="m15.5 15.5 1.5 1.5 3-3" /></>,
  share: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5" /><path d="M16 5.5a3 3 0 0 1 0 5M18 14.5c1.4.7 2.2 2 2.5 4" /></>,
  lock: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.5" /></>,
  spark: <><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.6L12 15l-1.8-4.4L5.5 9l4.7-1.4z" /><path d="M18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></>,
};
const Icon = ({ name }: { name: keyof typeof ICONS }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{ICONS[name]}</svg>
);

const STEPS = [
  ["Teacher starts a meeting", "Name the lecture and get a 6-digit code and QR code. Upload slides or start on a blank whiteboard."],
  ["Students join in seconds", "Scan the QR or type the code. No install, no account needed to follow along."],
  ["Everyone stays in sync", "The board, slides and topics update live on every screen while each student gets help their own way."],
] as const;

const STUDENTS: [keyof typeof ICONS, string, string][] = [
  ["ask", "Ask about any step", "Tap a note on the board for “Why this step?”, a simpler version or an example, explained with the lesson around it."],
  ["snip", "Snip to explain", "Draw a box around handwriting or part of a slide and get a deeper explanation right next to it."],
  ["catchup", "Catch me up", "Zoned out for a minute? Get a short summary of what changed, then jump back to the live board."],
  ["notes", "A private notebook", "Notes for each topic, saved clips from the board, and annotations only you can see."],
  ["check", "Quick check-ins", "Answer the teacher’s questions privately. It helps Pacer learn your level, never a grade."],
];

const TEACHERS: [keyof typeof ICONS, string, string][] = [
  ["board", "A live whiteboard", "Write, draw, add equations, sticky notes and shapes. Students see each stroke as it happens."],
  ["split", "Slides, board or both", "Present slides, switch to the board, or show them side by side in Split view."],
  ["topics", "Topics that write themselves", "Pacer groups the lesson into topics with a title and summary, and remembers the slides for each."],
  ["alert", "See where the class is lost", "Students flag confusion privately. You see which step, never who, and can send everyone back to it."],
  ["recap", "Post-class package", "One click writes a recap, practice questions and a catch-up note, ready for email or your LMS."],
  ["share", "Share the board", "Let students add sticky notes, or keep the board view only, like a shared whiteboard."],
];

const TRUST: [keyof typeof ICONS, string, string][] = [
  ["eye", "Anonymous by design", "Confusion signals and check-in results show teachers patterns, never names. Small classes stay hidden until enough students respond."],
  ["lock", "Private notes stay private", "Student notes and annotations are stored for that student only and never sent to the class."],
  ["spark", "AI that says it’s AI", "Every AI answer is labeled as extra help, not the teacher’s words, and points back to what was on the board."],
];

/** The animated board in the hero: a lesson writes itself in, a student asks, the teacher is nudged. Loops. */
function BoardDemo() {
  return (
    <div className="ob-demo" aria-hidden="true">
      <div className="ob-demo-bar">
        <span className="ob-demo-dot" /><span className="ob-demo-dot" /><span className="ob-demo-dot" />
        <span className="ob-demo-topic"><b>1</b> Solving linear equations <i>Live</i></span>
        <span className="ob-demo-seg"><span>Slides</span><span className="on">Board</span><span>Split</span></span>
      </div>
      <div className="ob-demo-board">
        <p className="ob-line ob-line-1">2x + 6 = 14</p>
        <p className="ob-line ob-line-2">2x = 8</p>
        <p className="ob-line ob-line-3">x = 4</p>
        <svg className="ob-ink" viewBox="0 0 120 40"><path d="M6 30 C 30 8, 60 8, 112 26" /></svg>
        <div className="ob-sticky">Check: 2·4 + 6 = 14 ✓</div>
        <div className="ob-ask"><span className="ob-ask-q">Why this step?</span><span className="ob-ask-a">Subtract 6 from both sides to keep the equation balanced.</span></div>
        <div className="ob-alert"><span className="ob-alert-dot" />2 students are stuck on <b>2x = 8</b></div>
      </div>
    </div>
  );
}

function FeatureList({ items, start = 0 }: { items: [keyof typeof ICONS, string, string][]; start?: number }) {
  return <ul className="ob-features">
    {items.map(([icon, title, text], i) => (
      <Reveal as="li" key={title} delay={(start + i) * 60} className="ob-feature">
        <span className="ob-feature-icon"><Icon name={icon} /></span>
        <div><h4>{title}</h4><p>{text}</p></div>
      </Reveal>
    ))}
  </ul>;
}

/** First screen for signed-out visitors: what Pacer is, what it gives students and teachers, and sign in. */
export function Onboarding({ onGuest }: { onGuest: () => void }) {
  const { signIn } = useAuth();
  const actions = <div className="ob-actions">
    <button type="button" className="btn btn-dark text-base" onClick={() => void signIn()}>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4"><path fill="#fff" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" /><path fill="#fff" opacity=".85" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" /><path fill="#fff" opacity=".7" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2z" /><path fill="#fff" opacity=".55" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10C7.2 7.7 9.4 5.9 12 5.9z" /></svg>
      Sign in with Google
    </button>
    <button type="button" className="btn btn-outline text-base" onClick={onGuest}>Continue as guest</button>
  </div>;

  return (
    <div className="ob relative">
      <section className="ob-hero mx-auto grid max-w-[1180px] items-center gap-10 px-6 pb-16 pt-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:pt-14">
        <div className="ob-hero-copy">
          <p className="ob-eyebrow"><span className="ob-eyebrow-dot" />A live classroom companion</p>
          <h1 className="display text-[44px] md:text-[60px]">The classroom,<br /><span className="ob-accent">in sync.</span></h1>
          <p className="mt-5 max-w-[34rem] text-lg leading-relaxed text-graphite">
            One shared lesson, and every student moving through it their own way. Teachers write and present live; students get help on any step without raising a hand.
          </p>
          {actions}
          <p className="mt-4 text-sm text-smoke">Guests can join or teach right away. Sign in to keep your notes, lessons and lectures on any device.</p>
        </div>
        <div className="ob-hero-demo"><BoardDemo /></div>
      </section>

      <section aria-labelledby="ob-how" className="mx-auto max-w-[1180px] px-6 py-12">
        <Reveal><p className="ob-kicker">How a lesson works</p><h2 id="ob-how" className="display text-[32px] md:text-[40px]">From code to classroom in a minute.</h2></Reveal>
        <ol className="ob-steps">
          {STEPS.map(([title, text], i) => (
            <Reveal as="li" key={title} delay={i * 90} className="ob-step">
              <span className="ob-step-num">{i + 1}</span>
              <h3>{title}</h3><p>{text}</p>
            </Reveal>
          ))}
        </ol>
      </section>

      <section aria-labelledby="ob-what" className="mx-auto max-w-[1180px] px-6 py-12">
        <Reveal><p className="ob-kicker">What Pacer gives you</p><h2 id="ob-what" className="display text-[32px] md:text-[40px]">Built for both sides of the room.</h2></Reveal>
        <div className="ob-roles">
          <Reveal as="article" className="ob-role ob-role-students">
            <header><span className="ob-role-tag">For students</span><h3>Help on your terms, without stopping the class.</h3></header>
            <FeatureList items={STUDENTS} />
          </Reveal>
          <Reveal as="article" delay={120} className="ob-role ob-role-teachers">
            <header><span className="ob-role-tag">For teachers</span><h3>Teach live, and see the room you can’t see.</h3></header>
            <FeatureList items={TEACHERS} start={1} />
          </Reveal>
        </div>
      </section>

      <section aria-labelledby="ob-trust" className="mx-auto max-w-[1180px] px-6 py-12">
        <Reveal><p className="ob-kicker">Privacy and trust</p><h2 id="ob-trust" className="display text-[32px] md:text-[40px]">Students speak up because nobody is watching.</h2></Reveal>
        <div className="ob-trust">
          {TRUST.map(([icon, title, text], i) => (
            <Reveal key={title} delay={i * 90} className="ob-trust-card">
              <span className="ob-feature-icon"><Icon name={icon} /></span>
              <h3>{title}</h3><p>{text}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section aria-labelledby="ob-start" className="mx-auto max-w-[1180px] px-6 pb-16 pt-6">
        <Reveal className="ob-cta">
          <h2 id="ob-start" className="display text-[30px] md:text-[38px]">Ready for your next lesson?</h2>
          <p className="mt-3 text-graphite">Join a class with a code, or start teaching in under a minute.</p>
          {actions}
          <p className="mt-4 text-sm text-smoke">Teaching a course? <Link href="/welcome" className="underline underline-offset-2">See Pacer for teachers and schools</Link>.</p>
        </Reveal>
      </section>
    </div>
  );
}
