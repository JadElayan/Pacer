<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Working on Pacer

Pacer is a live classroom whiteboard (Next.js, React 19, Supabase Realtime, Claude for AI). These notes are for any contributor, human or AI. The section above is maintained by `next dev`; edit only below it.

## Read first

- [README.md](README.md): setup, environment variables, features, repository map.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how a live room works, room state fields, the classroom screen's landmarks, every place AI is called, the motion system, and known gotchas.
- [supabase/README.md](supabase/README.md): database scripts, in order, with what is installed.

## Rules that keep things working

- The teacher changes room state only through `mutate()` from `lib/useRoom.ts`. New `RoomState` and `Topic` fields must be optional so older rooms and saved lessons still load. Teacher-only data must be removed in `sharedState()`.
- In `Classroom.tsx`, board actions take a `surface` (a slide id, or `undefined` for the whiteboard). Never read the global slide inside `renderBoard`; Split view renders two boards at once.
- Keep AI calls on request where possible. `docs/ARCHITECTURE.md` lists the few automatic ones; don't add more without a reason, because each costs API tokens. Every call goes through `askAI` (`lib/ai.ts`) and `/api/ai`; give a new AI kind its settings in `lib/aiBudget.ts` (effort, thinking, output cap) rather than sending defaults, and keep automatic calls behind a cooldown.
- Colors are picked with `LiquidSwatches` (`components/LiquidSwatches.tsx`) everywhere; objects blend to a new color with a CSS transition.
- New animations go through `components/Motion.tsx` or the motion section at the end of `app/globals.css`, and must turn off under reduced motion (the OS setting and Pacer's own Reduce motion preference).
- UI text is short, plain English. Messages say what happened and what to do next.
- SQL in `supabase/` is applied by hand. Make scripts safe to run twice and add them to `supabase/README.md`.

## Before you finish

- `npm run lint` (TypeScript) and `npm test` (unit tests). For UI work also run `npm run build` (stop `next dev` first: building while it runs breaks the dev server until it restarts), then `npm run test:e2e` and `npm run test:a11y` (they start their own production server on port 3199 and need Playwright's Chromium). CI runs all of them on pull requests.
- Check UI changes in a browser as both teacher (`/room/<code>?role=teacher`) and student (`/room/<code>`). Guests can't test sign-in features (Share, student sticky notes, private annotations); say so if you couldn't.
- When behavior or structure changes, update `docs/ARCHITECTURE.md` and the README feature list in the same change.
