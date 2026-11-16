create table if not exists public.teacher_rooms (
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  state jsonb not null,
  revision bigint not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, code)
);

alter table public.teacher_rooms enable row level security;
revoke all on public.teacher_rooms from anon;
grant select, insert, update on public.teacher_rooms to authenticated;

drop policy if exists "Teachers manage their own rooms" on public.teacher_rooms;
create policy "Teachers manage their own rooms" on public.teacher_rooms
  for all to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function public.save_teacher_room(room_code text, room_state jsonb, room_revision bigint)
returns void language sql security invoker set search_path = '' as $$
  insert into public.teacher_rooms as existing (user_id, code, state, revision)
  values ((select auth.uid()), room_code, room_state, room_revision)
  on conflict (user_id, code) do update
  set state = excluded.state, revision = excluded.revision, updated_at = now()
  where existing.revision <= excluded.revision;
$$;
revoke execute on function public.save_teacher_room(text, jsonb, bigint) from public;
grant execute on function public.save_teacher_room(text, jsonb, bigint) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pacer-teacher-slides', 'pacer-teacher-slides', false, 1000000, array['image/jpeg'])
on conflict (id) do nothing;

drop policy if exists "Teachers read their slide files" on storage.objects;
create policy "Teachers read their slide files" on storage.objects for select to authenticated
  using (bucket_id = 'pacer-teacher-slides' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Teachers store their slide files" on storage.objects;
create policy "Teachers store their slide files" on storage.objects for insert to authenticated
  with check (bucket_id = 'pacer-teacher-slides' and (storage.foldername(name))[1] = (select auth.uid())::text);
