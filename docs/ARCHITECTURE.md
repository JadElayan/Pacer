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
| `slides` | The uploaded deck: `pages` (only presented pages are shared with students unless access is "all"), `current`, `presented`, `ink`. |
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
| `renderBoard(sp, surface, ref, showAsk)` | Renders one `Whiteboard`. Split calls it twice (slide side, whiteboard side). Anything a board does must use the `surface` argument, never the global slide, or Split puts items on the wrong side. |
| `board-topbar` | Topic cards (`TopicStrip`), the Slides / Board / Split switch, Start new topic / Clear pen / Clear board, and the Share button. |
| `clearBoard`, `clearsSlide` | Clearing acts on the current slide in Slides view and on the active side in Split; whiteboard clears are archived first. |
| `startTopic`, `scheduleSummary`, the slide-summary effect | Topic creation and AI titling (see AI usage). |
| Teacher rail / student rail | Tool buttons, grouped with `ToolGroup`. |

Other pieces:

- [components/Whiteboard.tsx](../components/Whiteboard.tsx): one board surface. Placement, ink, selection, drag, resize, text editing, and item animations.
- [components/TopicStrip.tsx](../components/TopicStrip.tsx): topic cards with title and description. `describeTopic` in Classroom supplies a fallback description ("Slides 3–5 · 2 notes") until AI writes one.
- [components/TopicPage.tsx](../components/TopicPage.tsx): a topic's page, with its slides (and their ink) and whiteboard notes.
- [components/TeacherSlidePreviews.tsx](../components/TeacherSlidePreviews.tsx): the Pages list, with a sliding highlight.
- [components/BoardShare.tsx](../components/BoardShare.tsx): the Share button. The teacher sets students to **View only** or **Can add notes**; students add sticky notes. It talks to Supabase RPCs (`pacer_set_contributions`, `pacer_write_notepad`) through [lib/useBoardCollaboration.ts](../lib/useBoardCollaboration.ts), which also polls the notes every 1.5 s and stores students' private annotations.
- [components/Sheet.tsx](../components/Sheet.tsx): the rounded side panel used by [Board archive](../components/ArchiveSheet.tsx) and the [post-class package](../components/PostClassSheet.tsx).

## AI usage

All AI goes through `askAI` ([lib/ai.ts](../lib/ai.ts)) to [app/api/ai/route.ts](../app/api/ai/route.ts), which rate-limits and builds prompts from [lib/prompt.ts](../lib/prompt.ts). Without `ANTHROPIC_API_KEY`, [lib/demo.ts](../lib/demo.ts) returns labeled demo answers.

Know which calls cost tokens without anyone asking:

| When | Kind | Trigger |
| --- | --- | --- |
| Automatic | `summarize` | 1.5 s after the teacher adds a text/equation note (titles and describes the topic, may start a new one). |
| Automatic | `summarize` (image) | 4.5 s after the teacher stops writing with the pen, AI key only (reads handwriting). |
| Automatic | `summarize` | 1.5 s after a slide is shown in a topic that has no notes yet (titles it from slide text). |
| On request | `explain`, `why`, `simplify`, `example`, `snip`, `graph`, `visual`, `quiz`, … | A student asks about a note, a snip, or a slide. |
| On request | `catchup`, `followup` | A student asks to catch up or marks something confusing. |
| On request | `clarify`, `deeper` | Teacher Insights suggestion; Explain deeper on a topic page. |
| On request | `recap` | The teacher presses **Generate** in the post-class package. The result is cached in `localStorage` (`pacer:recap:<code>`), so reopening is free. |

Keep new AI features on request unless there is a strong reason not to.

## Motion

Motion lives in [components/Motion.tsx](../components/Motion.tsx) and the end of [app/globals.css](../app/globals.css). Everything must respect both the OS reduced-motion setting and Pacer's own **Reduce motion** preference (`[data-reduce-motion="true"]` on the classroom root turns off all CSS animation and transition).

| Piece | Used for |
| --- | --- |
| `AnimatedPanel` ([components/AnimatedPanel.tsx](../components/AnimatedPanel.tsx)) | Panels that appear and disappear (rise, drawer, dialog, side). Keeps children mounted while closing. |
| `Collapse` | Height-animated open/close (pen color tray, Pages list), so content below slides instead of jumping. Falls back to a timer if `transitionend` never fires. |
| `SegmentedControl` | The iOS-style Slides / Board / Split switch: click, arrow keys, or press and drag the thumb. |
| `ToolGroup` | Tool rail groups: a highlight slides to the active tool; press and drag along the group to choose. The active tool keeps its own blue background, faded in after the slider arrives, so it can never be left white on white. |
| `useFlip()` | Returns a callback ref. When children jump (a row wraps), they glide to the new spot. Small continuous moves are ignored. |
| View transitions | Layout switches (`shownView` in Classroom). Named layers: `pacer-slide`, `pacer-board`, `pacer-pages`. `data-view-transition` on `<html>` tells `useFlip` to stay out of the way. Browsers without the API get a fade. |
| Whiteboard item motion | `data-motion="enter" | "edit"` on `.block-card` by kind: text and equations write in, stickies drop, shapes spring; deleted items render as `.block-leave` ghosts for 0.3 s. Items present when a board mounts never animate. |

## Saved work and the database

- Students: [lib/lessons.ts](../lib/lessons.ts) saves lessons and notes per account; [lib/useTopicNotes.ts](../lib/useTopicNotes.ts) holds notebook notes.
- Teachers: [lib/savedLectures.ts](../lib/savedLectures.ts) saves lectures (including `showSlides`, `splitView`, zoom) to reopen later; [lib/teacherStorage.ts](../lib/teacherStorage.ts) backs up rooms and slide images.
- SQL lives in [supabase/](../supabase/) and is applied by hand. [supabase/README.md](../supabase/README.md) lists each script and whether it is installed.

## Gotchas

- `NEXT_PUBLIC_*` variables are baked in at build time. If a deployed site says "Slide uploads need teacher storage and sign-in configured", set `NEXT_PUBLIC_AUTH_ENABLED=1`, `NEXT_PUBLIC_TEACHER_STORAGE_ENABLED=1` and the Supabase variables in the host, then redeploy. Development (`next dev`) allows local uploads without them.
- Uploading a plain-text file makes one slide per 20 lines, which is a quick way to get a multi-slide deck when testing.
- Sign-in is Google only. The Share button, student sticky notes and private annotations need a signed-in account and can't be tested as a guest.
- `setPointerCapture` throws for pointers that are no longer active; wrap it in `try` (see `Motion.tsx`).
- An automated browser whose window is hidden pauses CSS transitions and `requestAnimationFrame`, so animation timing measured there is wrong. Measure with the window visible.
