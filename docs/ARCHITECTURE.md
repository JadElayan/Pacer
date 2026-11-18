# How Pacer works

A guide for contributors and AI coding agents. It explains the moving parts of a live lesson, where each one lives in the code, and the rules that keep them working. Read [README.md](../README.md) first for setup, and [AGENTS.md](../AGENTS.md) for the working rules.

## The big picture

A **room** is one live lecture, identified by a 6-digit code. The teacher's browser owns the room state and broadcasts it; students receive it and render the same board.

```
Teacher browser ──signed "state" messages──▶ Supabase Realtime channel pacer:<code> ──▶ Student browsers
       ▲                                                                                     │
       └──────────── "event" / "answer" messages (questions, confusion, check-ins) ◀─────────┘
```

- Without Supabase configured, the channel is a `BroadcastChannel`, so rooms only sync between tabs of one browser ([lib/transport.ts](../lib/transport.ts)).
- [lib/useRoom.ts](../lib/useRoom.ts) holds the room state. `mutate(fn)` is the only way the teacher changes it: it applies `fn`, saves to `localStorage`, and broadcasts. `sharedState()` strips teacher-only fields (`privateSlidePages`) and unpresented slides before anything leaves the teacher's browser.
- Room keys ([lib/roomKey.ts](../lib/roomKey.ts), [supabase/room_keys.sql](../supabase/room_keys.sql)) sign each state update so students only accept the real teacher.
- Signed-in teachers also back the room up to their account (`save_teacher_room`) when teacher storage is on.

## Room state

Defined in [lib/types.ts](../lib/types.ts) as `RoomState`. The fields that matter most:

| Field | Meaning |
| --- | --- |
| `blocks` | Everything placed on a board: text, equations, sticky notes, shapes, connectors. A block with `surface` set belongs to that slide (`surface` = slide page id); without it, it belongs to the whiteboard. |
| `strokes` | Pen and highlighter ink on the **whiteboard**. Ink on slides lives in `slides.ink[pageNumber]`. Coordinates are normalized 0–1. |
| `topics`, `currentTopicId` | The lecture's topics in order and the live one. `Topic.slides` records which slides were shown while it was live; `Topic.strokeIds` the handwriting AI assigned to it. |
| `slides` | The uploaded deck: `pages` (only presented pages are shared with students unless access is "all"), `current`, `presented`, `ink`, and `hidden` (pages kept from students even with access "all", until the teacher presents them). |
| `aiPaused`, `aiAutoPause` | Student AI switch. `aiPaused` turns it off; `aiAutoPause` (on unless `false`) also turns it off while a check-in is open. See AI pause. |
| `showSlides`, `splitView` | Board layout: **Board** (`showSlides` false), **Slides** (`showSlides` true), or **Split** (`showSlides` and `splitView` true). |
| `archive` | Snapshots of the whiteboard taken every time it is cleared. Shown in **Board archive**. |
| `collaborationId`, `studentStickyPermission` | Links the room to the account-backed board used for student sticky notes. |

All new fields must be optional so older saved rooms and lessons still load.

## The classroom screen

[components/Classroom.tsx](../components/Classroom.tsx) is the whole live lesson for both roles. It is large; search for these landmarks:

| Landmark | What it does |
| --- | --- |
| `shownView` / `wantView` | The layout on screen lags one step behind room state so each change can run a view transition (see Motion). |
| `split`, `activeSide`, `onSlideSide`, `annotationSurface` | In Split, tools act on the side used last. `annotationSurface` is the slide id or `undefined` for the whiteboard. |
| `renderBoard(sp, surface, ref, showAsk, slideMaxHeight?)` | Renders one `Whiteboard`. Split calls it twice (slide side, whiteboard side). Anything a board does must use the `surface` argument, never the global slide, or Split puts items on the wrong side. |
| `SplitBoards` ([components/SplitBoards.tsx](../components/SplitBoards.tsx)) | Split layout: side by side when there is room, stacked (slide on top) when the column is under 980px or a student's notebook is open. A person can pin either; the handle between panes resizes them (drag, arrow keys, double-click resets). Side by side, the whiteboard matches the slide's height. Saved in `localStorage` (`pacer:split-*`). Arrangement changes, whether chosen or automatic, run in a view transition so both panes glide to their new place; the toggle (`pacer-arrange`) stays live so its thumb is seen sliding. |
| `toggleInsights` | Opens and closes Insights in a view transition (`pacer-insights`), so the board glides to its new width. |
| `notesOpen`, `focusMode` | Students can hide the notebook (`pacer:notes-open`). Focus mode (F, Esc to leave) hides the header and rails for the most board space. |
| `clipMode`, `saveClip` | Students drag a box on a slide or board to copy it into their notes as an image (no AI). It includes their private ink and is trimmed by `cleanClip`. |
| `openCatchup` / `explainCatchup` | Catch me up opens a sheet of topics without AI; AI runs only when the student presses Explain. |
| `checkinPlan`, `offered` | Suggested check-ins from the uploaded deck (teacher only). See Check-in suggestions. |
| `board-topbar` | Topic cards (`TopicStrip`), the Slides / Board / Split switch, Start new topic / Clear pen / Clear board, and the Share button. |
| `clearBoard`, `clearsSlide` | Clearing acts on the current slide in Slides view and on the active side in Split; whiteboard clears are archived first. |
| `startTopic`, `scheduleSummary`, the slide-summary effect | Topic creation and AI titling (see AI usage). |
| Teacher rail / student rail | Tool buttons, grouped with `ToolGroup`. |

Other pieces:

- [components/Whiteboard.tsx](../components/Whiteboard.tsx): one board surface. Placement, ink, selection, drag, resize, text editing, and item animations. A selected sticky note or shape gets a floating toolbar above it (`StickyTools`, `ShapeTools` in [BoardObjects.tsx](../components/BoardObjects.tsx)); shapes store their color in `Block.shapeColor`. Shapes and sticky notes resize freely: corner handles change width and height (Shift keeps proportions) and edge handles change one; the result is saved as `Block.shapeSize` with `scale` reset to 1. Text resizes its width; equations scale their font size. The equation box shows a live preview and saves TeX converted by [lib/mathInput.ts](../lib/mathInput.ts) (`x^2`, `a/b`, `sqrt(x)`).
- [components/TopicStrip.tsx](../components/TopicStrip.tsx): topic cards with title and description. `describeTopic` in Classroom supplies a fallback description ("Slides 3–5 · 2 notes") until AI writes one.
- [components/TopicPage.tsx](../components/TopicPage.tsx): a topic's page, with its slides (and their ink) and whiteboard notes.
- [components/TeacherSlidePreviews.tsx](../components/TeacherSlidePreviews.tsx): the Pages list, with a sliding highlight. Arrow keys (and Home / End) present the next slide while a thumbnail has focus; keys pressed while a slide is still opening are queued. The highlight must not overshoot: it once ran past the last slide, added a scrollbar and made the list jump.
- [components/BoardShare.tsx](../components/BoardShare.tsx): the Share button. The teacher sets students to **View only** or **Can add notes**; students add sticky notes. It talks to Supabase RPCs (`pacer_set_contributions`, `pacer_write_notepad`) through [lib/useBoardCollaboration.ts](../lib/useBoardCollaboration.ts), which also polls the notes every 1.5 s and stores students' private annotations.
- [components/Notebook.tsx](../components/Notebook.tsx): the student notebook. A **Type / Write** switch (`pacer:notes-input`): Type is the rich text editor; Write turns each topic into a lined page and lets students write over clips. Handwriting is drawn by [components/InkCanvas.tsx](../components/InkCanvas.tsx) and stored as vector strokes ([lib/ink.ts](../lib/ink.ts), 1000 units wide) in `useTopicNotes` under `<notes key>:ink`, keyed by topic id or `clip:<id>`. Pen pressure sets line width; once a pen touches any ink canvas (`html[data-pen]`), fingers scroll instead of drawing. Copy and Print turn handwriting into images. The whiteboard has the same palm rejection.
- [lib/clipImage.ts](../lib/clipImage.ts): `cleanClip` trims the empty margin around a clip and whitens near-white paper, without AI, so a loose box becomes just the diagram.
- [components/Sheet.tsx](../components/Sheet.tsx): the rounded side panel used by [Board archive](../components/ArchiveSheet.tsx) and the [post-class package](../components/PostClassSheet.tsx).

## AI usage

All AI goes through `askAI` ([lib/ai.ts](../lib/ai.ts)) to [app/api/ai/route.ts](../app/api/ai/route.ts), which rate-limits and builds prompts from [lib/prompt.ts](../lib/prompt.ts). Without `ANTHROPIC_API_KEY`, [lib/demo.ts](../lib/demo.ts) returns labeled demo answers.

Know which calls cost tokens without anyone asking:

| When | Kind | Trigger |
| --- | --- | --- |
| Automatic | `summarize` | 3 s after the teacher adds a text/equation note (titles and describes the topic, may start a new one). At most once per 20 s per topic (`AUTO_COOLDOWN`), and skipped when the notes haven't changed. |
| Automatic | `summarize` (image) | 6 s after the teacher stops writing with the pen, AI key only (reads handwriting). Only once there are at least 3 new strokes (a tick or an arrow isn't read), at most once per 20 s per topic. |
| Automatic | `summarize` | 2.5 s after a slide is shown in a topic that has no notes yet (titles it from slide text). Not repeated for the same slides. |
| On request | `explain`, `why`, `simplify`, `example`, `snip`, `graph`, `visual`, `quiz`, … | A student asks about a note, a snip, or a slide. |
| On request | `catchup`, `followup` | A student asks to catch up or marks something confusing. |
| On request | `clarify`, `deeper` | Teacher Insights suggestion; Explain deeper on a topic page. |
| On request | `explain` / `followup`, `quiz` | Study plan on the Learning dashboard: **Explain it to me** and **Give me one** (a practice question), built from that topic's saved notes and check-ins (`planMaterial`). Never automatic. |
| Automatic, once per upload | `checkins` | After the teacher uploads a deck, if suggestions are on. Saved per deck in `localStorage` (`pacer:checkins:<deckId>`), so reopening costs nothing. Teachers can turn suggestions off from the card. |
| On request | `recap` | The teacher presses **Generate** in the post-class package. The result is cached in `localStorage` (`pacer:recap:<code>`), so reopening is free. |

Keep new AI features on request unless there is a strong reason not to.

### AI cost and abuse controls

[lib/aiBudget.ts](../lib/aiBudget.ts) holds the rules; [app/api/ai/route.ts](../app/api/ai/route.ts) applies them in this order: room paused, shared cache, per-minute and daily request limits ([lib/rateLimit.ts](../lib/rateLimit.ts)), token budgets, then the call.

- **Per-task settings (`requestSettings`).** Titles, practice questions, graphs and teacher tips run without thinking at low effort, with small output caps. Tutoring answers use low effort. Only the post-class package and check-in planning (once per class or deck) use medium effort. Settings are sent only to models that accept them. `ANTHROPIC_LIGHT_MODEL` optionally moves titles, practice questions and tips to a cheaper model.
- **Reuse.** The server keeps answers for 6 hours, keyed by model, task and the exact prompt (and picture), so thirty students asking about the same note cost one call. Identical requests already in flight share one call. The browser keeps answers for 30 minutes in `sessionStorage` (`lib/ai.ts`). "Explain it another way" always asks again.
- **Pictures.** `askAI` scales images to at most 1024 px on the long side; image cost grows with pixel area.
- **Budgets.** Every call's token use (`usage`) is converted to units (input + 5 × output, cache reads at 0.1) and counted per device, per room and site-wide per day (`AI_UNITS_*`). Teacher-only jobs also have daily caps per device (post-class package 15, check-in plans 25). A device that trips the per-minute limit 3 times in 30 minutes is paused for 30 minutes. Counter names are salted with a server secret so nobody can inflate them through the public counter functions.
- **Spotting abuse.** Each call logs one JSON line, `{"ai":"usage", kind, client, room, model, units, input, output, from}` (client and room are hashed). Refusals log `{"ai":"budget"}` or `{"ai":"abuse"}`. Search the host's logs (Vercel → Logs) for `"ai":` to see who is spending and on what.
- Counters live in Supabase when [ai_token_budget.sql](../supabase/ai_token_budget.sql) (step 11) is installed, otherwise in each server instance's memory.

### AI pause

The teacher's header button **Student AI** (fixed width: "on" and "paused" share one grid cell, so the header never wraps) turns student AI off (`aiPaused`), and by default it is also off while a check-in is open (`aiAutoPause`). Students see a banner, and Ask, Snip, Explain and follow-ups are disabled; Clip and notes still work. Hiding buttons is not enough, so the server checks too: student calls send `room` (the 6-digit code), and [app/api/ai/route.ts](../app/api/ai/route.ts) answers 423 when [lib/aiPause.ts](../lib/aiPause.ts) finds the room paused. The teacher's browser signs `{ paused, ts }` with the room key and inserts it into `pacer_room_ai_signals` ([supabase/room_ai_pause.sql](../supabase/room_ai_pause.sql)); the server verifies signatures against the room's public key and uses the newest. If the table or key is missing, it fails open (AI works). Blocked tries send a `blocked` event, shown to the teacher as an anonymous count and left out of Insights.

### Check-in suggestions

[lib/checkins.ts](../lib/checkins.ts) sends the deck's slide text (up to 40 slides) once. The prompt allows at most one question per slide and eight in all, and an answer key only when a slide states it (`answerSlide`); answers without a source are dropped. While a suggestion's own slide is on screen (Slides or Split), a card offers **Ask class**, **Edit first** / **Add an answer**, or **Skip**. Once asked, the open-question bar keeps showing the teacher the answer key (read from `pacer:key:<code>` in the teacher's browser; never sent to students). If a later slide may show the answer and students can see all pages, the card offers to hide it; presenting a hidden slide shows it again.

## Motion

Motion lives in [components/Motion.tsx](../components/Motion.tsx) and the end of [app/globals.css](../app/globals.css). Everything must respect both the OS reduced-motion setting and Pacer's own **Reduce motion** preference (`[data-reduce-motion="true"]` on the classroom root turns off all CSS animation and transition).

| Piece | Used for |
| --- | --- |
| `AnimatedPanel` ([components/AnimatedPanel.tsx](../components/AnimatedPanel.tsx)) | Panels that appear and disappear (rise, drawer, dialog, side). Keeps children mounted while closing. |
| `Collapse` | Height-animated open/close (pen color tray, Pages list), so content below slides instead of jumping. Falls back to a timer if `transitionend` never fires. |
| `SegmentedControl` | The iOS-style Slides / Board / Split switch: click, arrow keys, or press and drag the thumb. |
| `ToolGroup` | Tool rail groups: a highlight slides to the active tool; press and drag along the group to choose. The active tool keeps its own blue background, faded in after the slider arrives, so it can never be left white on white. |
| `useFlip()` | Returns a callback ref. When children jump (a row wraps), they glide to the new spot. Small continuous moves are ignored. |
| `runViewTransition(update, { reduced, settle })` | Runs a state change inside a view transition so named elements glide to their new place. Used for Slides / Board / Split (`shownView` in Classroom; layers `pacer-slide`, `pacer-board`, `pacer-pages`) and for leaving the onboarding page. Its snapshot pauses the page for a frame or two, so it is not used where something must keep moving (the home Learning / Teaching switch uses CSS animations instead). Sets `data-view-transition` on `<html>` so `useFlip` stays out of the way. Browsers without the API change instantly or fade. |
| `SegmentedControl` (student) | Follow / Browse and Board / Notes use the same control. |
| `LiquidSwatches` ([components/LiquidSwatches.tsx](../components/LiquidSwatches.tsx)) | Every color picker: pen and highlighter (board tray, notebook Write bar), arrows, shapes and sticky notes. The objects themselves blend to the new color (CSS transitions on `.sticky-note`, `.board-shape*`, connector strokes). The selection is a drop that flows to the new color, blending colors on the way, merged with the swatches by an SVG goo filter; a ripple marks where it lands. Press and slide to sweep through colors. When settled, a crisp `.liquid-cap` outside the filter shows the choice (the filter blurs edges unevenly). |
| `Reveal` | Fades and lifts content in the first time it scrolls into view (onboarding sections); `delay` staggers siblings. |
| Whiteboard item motion | `data-motion="enter" | "edit"` on `.block-card` by kind: text and equations write in, stickies drop, shapes spring; deleted items render as `.block-leave` ghosts for 0.3 s. Items present when a board mounts never animate. |

## Home and onboarding

[app/page.tsx](../app/page.tsx) is the home page. Signed-out visitors (when sign-in is configured) see [components/Onboarding.tsx](../components/Onboarding.tsx): an animated board preview, how a lesson works, what students and teachers get, privacy, and sign-in or Continue as guest. Its feature lists are plain arrays at the top of the file; keep them in step with the README feature list. Signed-in users and guests see the Learning / Teaching switch (`SegmentedControl`). Switching remounts the view (`.home-view`, keyed by `data-view`) so its pieces animate in with CSS, the footer glides with `useFlip`, and the background glows move with transform and opacity only (`.home-glow[data-view]` in `globals.css`) so the blur is never repainted mid-animation. [components/HomeArt.tsx](../components/HomeArt.tsx) draws the subject doodles in the side margins (whiteboard marker for Teaching, notebook ink for Learning): each path uses `pathLength={1}` so one keyframe draws any stroke, the two sets cross-fade with the view, the hidden set is paused, and they are hidden below 64rem. Keep the Learning doodles within the outer ~100px, because the three-column layout covers the rest. The same file has `RotatingSubject` (the subject word at the end of the signed-in Learning headline) and `DeskScene` (the desk that draws itself under the Join card); both turn off under reduced motion. Teaching also has center doodles (`TEACHING_CENTER`, a 1000px band around the title and Start Meeting card, shown from 80rem). The `?view=teaching` query keeps the choice in the URL.

## Saved work and the database

- Students: [lib/lessons.ts](../lib/lessons.ts) saves lessons and notes per account; [lib/useTopicNotes.ts](../lib/useTopicNotes.ts) holds notebook notes. Removing a lesson (`removeLesson`) stores a small `removed: true` marker with a newer timestamp instead of deleting the row, because `student_lessons` has no delete grant and the marker stops an older account copy from bringing it back. Rejoining that class saves it again.
- Student progress: [lib/progress.ts](../lib/progress.ts) keeps a private log of each check-in answer (question, the student's answer, the answer key once the teacher closes the question, right or wrong, later retries) and each I'm lost / Got it signal with its topic. `Classroom.tsx` records them (`updateLog`, `rec(field, topicId)`); the log is saved on the device (`pacer:progress:<user|guest>`) and inside the student's existing `learning_profiles` row as `data.log`, so no new SQL is needed. [components/ProgressBox.tsx](../components/ProgressBox.tsx) turns it into a study plan, topics by subject, How it felt and To revisit. [lib/studyPlan.ts](../lib/studyPlan.ts) picks the plan's focus (a chosen topic, else the most-missed topic, else the newest open review mark) and its steps: re-read the notes (or have them explained when there is no saved lesson), retry missed check-ins (graded locally with `isCorrect` from `lib/grade.ts`, no AI), and one practice question. The plan is frozen when it opens, steps done today are kept in `pacer:plan:<user|guest>`, and **Next topic** clears the review marks it covered. Practice answers are added to the log, so a wrong one can be retried later. `resolveReview` matches older review marks (saved without a lesson code, often named "Untitled lecture" or "New topic") to the saved lesson with the same title, closest in time, and shows that lesson's name. Study entries gained `code` (for links) and `resolved` (Got it now). Students who only have the older per-subject counts still see the old bars until they answer a check-in.
- Both dashboards' lesson lists use [lib/lessonList.ts](../lib/lessonList.ts): `lessonName` replaces "Untitled lecture" with the first real topic, or subject and date; `isEmptyLesson` hides classes with nothing saved (behind "N empty classes hidden"); lists show `LESSONS_SHOWN` rows before Show all, group into Today / This week / Earlier, and get a search box after `SEARCH_AFTER` lessons. Continuing a saved lecture names the new meeting with `lessonName`.
- Teachers: [lib/savedLectures.ts](../lib/savedLectures.ts) saves lectures (including `showSlides`, `splitView`, zoom) to reopen later, and `removeLecture` deletes one (device and account). Guest lectures live only in the browser, and choosing Continue as guest clears an earlier guest's (`clearGuestLectures`); [lib/teacherStorage.ts](../lib/teacherStorage.ts) backs up rooms and slide images.
- SQL lives in [supabase/](../supabase/) and is applied by hand. [supabase/README.md](../supabase/README.md) lists each script and whether it is installed.

## Gotchas

- `NEXT_PUBLIC_*` variables are baked in at build time. If a deployed site says "Slide uploads need teacher storage and sign-in configured", set `NEXT_PUBLIC_AUTH_ENABLED=1`, `NEXT_PUBLIC_TEACHER_STORAGE_ENABLED=1` and the Supabase variables in the host, then redeploy. Development (`next dev`) allows local uploads without them.
- Uploading a plain-text file makes one slide per 20 lines, which is a quick way to get a multi-slide deck when testing.
- Sign-in is Google only. The Share button, student sticky notes and private annotations need a signed-in account and can't be tested as a guest.
- Testing costs credits too: every note, pen pause and slide in a teacher room can call the AI. Test without `ANTHROPIC_API_KEY` (demo answers) unless you are checking AI output, or set a low `AI_UNITS_GLOBAL_DAY`.
- Server-side AI pause needs [room_ai_pause.sql](../supabase/room_ai_pause.sql) (step 10). Without it the switch still hides student AI buttons, but a student calling the API directly isn't refused.
- Pacer is installable (`app/manifest.ts`, `app/icon.tsx`, `app/apple-icon.tsx`, drawn by [lib/appIcon.tsx](../lib/appIcon.tsx)). Apple Pencil pressure and palm rejection need checking on a real iPad.
- Running `npm run build` while `next dev` is running can leave the dev server pointing at chunks it no longer has ("Failed to load chunk server/chunks/ssr/…", shown as 1 Issue). Restart `next dev` to fix it.
- `setPointerCapture` throws for pointers that are no longer active; wrap it in `try` (see `Motion.tsx`).
- An automated browser whose window is hidden pauses CSS transitions and `requestAnimationFrame`, so animation timing measured there is wrong. Measure with the window visible.
- CI runs without Supabase, so sign-in is off there and the accessibility test never sees the onboarding page. Scan it by hand when you change it.
- On Windows, `npm run test:e2e` and `npm run test:a11y` fail to start their server (they spawn `npx`, which is `npx.cmd` there). They run in CI on Linux; set `CHROMIUM_PATH` to use an installed Chrome or Edge locally on other systems.
