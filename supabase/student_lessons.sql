create table if not exists public.student_lessons (
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, code)
);

alter table public.student_lessons enable row level security;
revoke all on public.student_lessons from anon;
grant select, insert, update on public.student_lessons to authenticated;

drop policy if exists "Students read their own lessons" on public.student_lessons;
create policy "Students read their own lessons"
  on public.student_lessons for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Students insert their own lessons" on public.student_lessons;
create policy "Students insert their own lessons"
  on public.student_lessons for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Students update their own lessons" on public.student_lessons;
create policy "Students update their own lessons"
  on public.student_lessons for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
