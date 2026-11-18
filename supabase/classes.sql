-- Pacer 12 - Classes
-- Teacher-made classes: a teacher creates a class and shares its join code or link. Signed-in students join once,
-- and their lessons from that class are grouped together. A class can point at the meeting that is live right now.
-- Safe to run more than once.

create table if not exists public.pacer_classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  subject text check (subject is null or char_length(subject) <= 80),
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  join_code text not null unique check (join_code ~ '^[A-Z0-9]{6}$'),
  teacher_name text check (teacher_name is null or char_length(teacher_name) <= 80),
  live_code text check (live_code is null or live_code ~ '^\d{6}$'),
  live_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists pacer_classes_teacher on public.pacer_classes (teacher_id);

create table if not exists public.pacer_class_members (
  class_id uuid not null references public.pacer_classes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (class_id, user_id)
);
create index if not exists pacer_class_members_user on public.pacer_class_members (user_id);

alter table public.pacer_classes enable row level security;
alter table public.pacer_class_members enable row level security;
revoke all on public.pacer_classes from anon;
revoke all on public.pacer_class_members from anon;
grant select, insert, update, delete on public.pacer_classes to authenticated;
grant select, delete on public.pacer_class_members to authenticated;

-- Membership checks go through these helpers. Checking one table's rows from the other's policy directly
-- would make the two policies call each other ("infinite recursion detected in policy").
create or replace function public.pacer_is_class_member(cid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.pacer_class_members where class_id = cid and user_id = (select auth.uid()));
$$;
create or replace function public.pacer_owns_class(cid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.pacer_classes where id = cid and teacher_id = (select auth.uid()));
$$;
revoke all on function public.pacer_is_class_member(uuid) from public, anon;
revoke all on function public.pacer_owns_class(uuid) from public, anon;
grant execute on function public.pacer_is_class_member(uuid) to authenticated;
grant execute on function public.pacer_owns_class(uuid) to authenticated;

-- Teachers manage their own classes.
drop policy if exists "Teachers manage their classes" on public.pacer_classes;
create policy "Teachers manage their classes" on public.pacer_classes
  for all to authenticated
  using (teacher_id = (select auth.uid()))
  with check (teacher_id = (select auth.uid()));

-- Students read the classes they belong to (name, teacher, which meeting is live).
drop policy if exists "Members read their classes" on public.pacer_classes;
create policy "Members read their classes" on public.pacer_classes
  for select to authenticated
  using (public.pacer_is_class_member(id));

-- Students see and leave their own memberships; teachers see who is in their classes.
drop policy if exists "Members see their memberships" on public.pacer_class_members;
create policy "Members see their memberships" on public.pacer_class_members
  for select to authenticated
  using (user_id = (select auth.uid()) or public.pacer_owns_class(class_id));
drop policy if exists "Members leave their classes" on public.pacer_class_members;
create policy "Members leave their classes" on public.pacer_class_members
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Joining goes through this function, so a student only needs the code, never the class id.
create or replace function public.pacer_join_class(code text)
returns table (id uuid, name text, subject text, color text, teacher_name text, live_code text, live_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  found public.pacer_classes;
begin
  if (select auth.uid()) is null then raise exception 'Sign in to join a class'; end if;
  select * into found from public.pacer_classes c where c.join_code = upper(trim(code));
  if found.id is null then raise exception 'No class has that code'; end if;
  insert into public.pacer_class_members (class_id, user_id) values (found.id, (select auth.uid()))
    on conflict do nothing;
  return query select found.id, found.name, found.subject, found.color, found.teacher_name, found.live_code, found.live_at;
end $$;
revoke all on function public.pacer_join_class(text) from public, anon;
grant execute on function public.pacer_join_class(text) to authenticated;
