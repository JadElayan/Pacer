# Google sign-in setup (about 10 minutes)

Pacer works without accounts (guests). Sign-in adds a saved private learning profile and a teacher's lecture history.
Supabase project: **Pacer** (ref `wgumjmgebrcdwrccgrjz`). Tables `profiles`, `learning_profiles`, `lectures` already exist with row-level security: each person can only read and write their own rows. Teachers never see students' profiles.

## 1. Google Cloud Console (console.cloud.google.com)
1. Create or pick a project → **APIs & Services → OAuth consent screen**: User type **External**, app name **Pacer**, your email as support/developer contact. Under **Test users**, add the Google emails of everyone who will sign in during the demo (while the app is in "Testing", only listed users can sign in).
2. **Credentials → Create credentials → OAuth client ID** → type **Web application**.
3. **Authorized redirect URIs**: `https://wgumjmgebrcdwrccgrjz.supabase.co/auth/v1/callback`
4. Copy the **Client ID** and **Client secret**.

## 2. Supabase dashboard (supabase.com/dashboard → project Pacer)
1. **Authentication → Sign In / Providers → Google**: enable, paste Client ID and Client secret, save.
2. **Authentication → URL Configuration**: Site URL `https://pacer-demo.vercel.app`; Redirect URLs add `https://pacer-demo.vercel.app/**` and `http://localhost:3000/**`.

## 3. Turn it on
Run [student_lessons.sql](supabase/student_lessons.sql) in the Supabase SQL Editor to enable private lesson sync. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_AUTH_ENABLED=1` in `.env.local` and restart the dev server. A "Sign in with Google" button then appears on the home page.

## Privacy notes
- Students' questions and answers sent to teachers stay anonymous; the signed-in account is never attached to classroom events.
- Profile stats, question history, and AI study suggestions sync to the signed-in student's own learning profile row. Saved lessons have their own per-student rows. Guest data stays in the browser.
