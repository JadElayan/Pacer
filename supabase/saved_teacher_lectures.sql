create table if not exists public.saved_teacher_lectures (
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  data jsonb not null,
  primary key (user_id, code)
);
alter table public.saved_teacher_lectures enable row level security;
revoke all on public.saved_teacher_lectures from anon;
grant select, insert, update on public.saved_teacher_lectures to authenticated;
drop policy if exists "Teachers access their saved lectures" on public.saved_teacher_lectures;
create policy "Teachers access their saved lectures" on public.saved_teacher_lectures
for all to authenticated using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
