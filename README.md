# Pacer

Live lectures move at a shared pace, while students differ in how they process explanations and recover when they lose their place. Pacer is a context-aware classroom companion that offers **student-controlled support** using the teacher's whiteboard content, and gives the teacher **anonymous, aggregated** signals about where the class is stuck.

Built for in-person classrooms. (Online/camera mode is a possible later addition and is intentionally not included.)

## Run it

```bash
npm install
cp .env.example .env.local   # optional, see below
npm run dev                  # http://localhost:3000
```

| Variable | Without it |
|---|---|
| `ANTHROPIC_API_KEY` (+ optional `ANTHROPIC_MODEL`) | AI runs in **Demo mode**: prewritten answers, labeled "Demo response" in the UI |
| `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sync uses `BroadcastChannel`: **only tabs in the same browser** sync. A banner says so. |

With Supabase keys set, sync uses Supabase Realtime **Broadcast**. No tables are needed for the current prototype.

## 2-minute demo

1. Home → type a title → **Start Meeting** → **Enter classroom** (teacher).
2. Open the join link / enter the 6-digit code in a second tab → **Join Meeting** (student).
3. Teacher: click **Add demo step** (or type notes/equations). Student sees it live, and concept cards pop into the left column.
4. Student: click `2x = 8` → **Why this step?**, or press **Snip** and drag a box around it.
5. Student: change **Mode** to Guided, tap **Still confused**.
6. Teacher: **Insights** shows the aggregated signal (enable "Demo: show small groups" with only one student; real threshold is 3).

See **DEMO_SCRIPT.md** for the full on-stage script with teacher/student roles.

## What's implemented

Zoom-style home, room codes + QR, live-synced whiteboard (typed notes, KaTeX equations, pen), AI topic cards + topic pages, click-to-ask and snip tool, AI pop-ups (one at a time, cooldown, dismissible), Focus/Guided/Example/Standard modes, Catch Me Up, local preference scoring, teacher insights with small-group suppression, a live "students need help" alert with a **Revisit this** button that highlights the block on every student's screen.

## New in this version
- **Check-in questions:** the teacher asks a question with a hidden answer key; students answer in a card above the board; grading happens on the teacher's side (the key is never sent to students); results appear anonymously in Insights. Not for a grade.
- **Snip tools:** a **Tools** menu beside the snip panel: Explain in depth, Graph it (SVG plot), Visualize it (balance-scale steps), Quiz me (private practice). With no AI key these show clearly labeled demo content.
- **Learning profile:** a private, on-device profile per subject (questions asked, confusion, check-in and quiz accuracy) with plain-language suggestions. Teachers never see it.

## Known prototype limits

- No real teacher auth: room ownership is a token in the teacher's browser. Anyone who can reach the channel could spoof messages. Needs Supabase RLS + signed tokens for production.
- Lecture state/feedback are not yet persisted to Postgres (teacher's browser stores it locally).
- Pen strokes are normalized to the board and sync on stroke end.
