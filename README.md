# Pacer

Pacer is a live classroom whiteboard with student-controlled explanations and anonymous class insights. The Teaching dashboard hosts and resumes lectures. The Learning dashboard joins meetings and reviews saved lessons.

## Start here

Use Node.js 22 and npm. Run `npm ci` and `npm run dev`, then open http://localhost:3000. On Windows PowerShell, use `npm.cmd` if script execution is blocked. Copy `.env.example` to `.env.local` for optional integrations. `npm run lint` checks TypeScript and `npm run build` checks the production build.

| Configuration | Behavior |
| --- | --- |
| No Supabase configuration | Guest rooms sync between tabs in the same browser. |
| `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Enables Supabase Realtime for live rooms across devices. Use the public anon key. |
| `NEXT_PUBLIC_AUTH_ENABLED=1` | Enables Google sign-in after OAuth is configured. See [account setup](AUTH_SETUP.md). |
| `ANTHROPIC_API_KEY` and optional `ANTHROPIC_MODEL` | Enables server-side AI. Without a key, replies use labeled demo content. |
| `NEXT_PUBLIC_TEACHER_STORAGE_ENABLED=1` | Enables optional teacher room and slide backups. Requires the storage migration. |

## Current features

- Teachers can rename live lectures, edit and format text in place, add equations, ink, shapes, sticky notes and templates, and pan or zoom the board. Connectors snap to objects and can be reattached. Archived boards and saved lectures preserve teaching materials. Continuing a saved lecture starts a new meeting.
- A row above the board holds the lecture's topics (title and short description, editable), a **Slides / Board / Split** switch, and Start new topic / Clear pen / Clear board. A first topic exists as soon as the room opens. Split shows the slide and the whiteboard side by side; on phones it becomes two tabs. Clearing acts on whatever is on screen (the slide, or the side used last in Split).
- Topics remember the slides shown while they were live. A topic's page shows those slides with the teacher's ink, plus its whiteboard notes. Topics made only of slides are titled from the slide text.
- The post-class package (recap, practice questions, catch-up note) is generated only when the teacher presses Generate, and is kept for the room so reopening it doesn't use the AI again.
- Students can follow the teacher or browse independently, ask questions about notes or a snip, catch up, and answer check-ins. Signed-in students can save lessons and learning progress.
- The **Share** button works like Zoom Whiteboard sharing: the teacher sets students to View only or Can add notes, and signed-in students can then add sticky notes to the board and edit their own. Private annotation data uses separate per-account storage and is excluded from shared room updates.
- Teachers can upload PDFs, images, and plain text notes. Export slides and documents to PDF to preserve their layout. Production uploads require teacher sign-in, teacher storage, and the slide image migrations; development can use local disk and supports Office imports when LibreOffice is installed.
- Students can write private notes in each classroom and save them in the current browser, including when the board is view only.
- Layout switches, board items, tool rails, slide thumbnails and panels are animated; everything respects reduced-motion settings.

## Repository map

| Area | Entry points |
| --- | --- |
| Home, roles, and classroom | [Home](app/page.tsx), [room route](app/room), [Classroom](components/Classroom.tsx) |
| Board editing | [Whiteboard](components/Whiteboard.tsx), [textbox editor](components/BoardTextEditor.tsx), [connectors](components/BoardConnectors.tsx) |
| Topics and slides | [Topic cards](components/TopicStrip.tsx), [topic page](components/TopicPage.tsx), [Pages list](components/TeacherSlidePreviews.tsx), [slides](lib/slides.ts) |
| Panels and motion | [Motion helpers](components/Motion.tsx), [panel animation](components/AnimatedPanel.tsx), [side sheet](components/Sheet.tsx) |
| Live sync and collaboration | [Room state](lib/useRoom.ts), [transport](lib/transport.ts), [account collaboration](lib/useBoardCollaboration.ts), [Share button](components/BoardShare.tsx) |
| Saved work | [Student lessons](lib/lessons.ts), [teacher lectures](lib/savedLectures.ts), [SQL migrations](supabase/) |
| AI | [Server route](app/api/ai/route.ts), [prompt](lib/prompt.ts) |

**[How Pacer works](docs/ARCHITECTURE.md)** explains room state, the classroom screen, where AI is called, the motion system and known gotchas. Read it before changing the classroom. Before editing Next.js code, follow [AGENTS.md](AGENTS.md) and read the relevant installed guides in `node_modules/next/dist/docs/`.

## Deployment and database

Deploy this Next.js repository to Vercel and configure the environment variables above for the target environment. The public Supabase settings are read at build time. Add the deployment URL to Google sign-in redirects as described in [account setup](AUTH_SETUP.md). Keep the Anthropic key in server-side environment settings.

Supabase SQL is applied separately from Git and Vercel. For a new environment, configure the existing account tables described in the account setup, then apply [student lessons](supabase/student_lessons.sql), [saved teacher lectures](supabase/saved_teacher_lectures.sql), [teacher storage](supabase/pacer_cloud_storage.sql), [transparent slide support](supabase/transparent_slide_images.sql), and [board collaboration](supabase/board_collaboration.sql) with its [annotation owner access](supabase/annotation_owner_access.sql) follow-up, and [room keys](supabase/room_keys.sql). Confirm which scripts are already applied before setting up an existing project: [supabase/README.md](supabase/README.md) lists every script in order with its status, and [check_installed.sql](supabase/check_installed.sql) reports what a project has.

## Verification and open work

The textbox workflow was verified locally for range formatting, resize, undo/redo, reload, and reopening a saved lecture. Connector snapping, reconnection at 125% zoom, deletion, undo/redo, and reload were also verified locally.

After applying the collaboration migration, verify with a signed-in teacher and two distinct student accounts. Check that disabling contributions blocks further writes while preserving drafts, and that private annotations reopen for their owner and are inaccessible to other accounts. Hosted multi-account verification is pending. Live classroom traffic uses a public Realtime channel. After [room keys](supabase/room_keys.sql) is applied, each meeting registers a public signing key when it starts, and students accept board updates and check-in grades only when the browser that created the meeting signed them. Without that migration, rooms stay unlocked and the teacher sees a notice. Student questions and answers on the channel are still unauthenticated, and a teacher can only sign from the browser that created the meeting.

## Launch readiness

Rate limits on the AI route, anonymous usage metrics, a waitlist, privacy/terms/data-request pages and the post-class package are in this repository. See [launch checklist](docs/LAUNCH_CHECKLIST.md) (do this first), [outreach kit](docs/OUTREACH_KIT.md), [pricing](docs/PRICING.md) and [acquisition readiness](docs/ACQUISITION_READINESS.md). Run `supabase/launch_readiness.sql` once in the Supabase SQL editor. `npm test`, `npm run test:e2e` and `npm run test:a11y` run the unit, smoke and accessibility checks; CI runs all of them on every pull request. Optional variables: `NEXT_PUBLIC_CONTACT_EMAIL`, `AI_LIMIT_PER_MINUTE`, `AI_LIMIT_PER_DAY`, `AI_GLOBAL_DAILY_CAP`.
