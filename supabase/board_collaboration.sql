begin;
create table if not exists public.pacer_boards (
  id uuid primary key, owner_id uuid not null references auth.users on delete cascade,
  code text not null check (code ~ '^[0-9]{6}$'), contributions boolean not null default false
);
create table if not exists public.pacer_board_members (
  board_id uuid references public.pacer_boards on delete cascade,
  user_id uuid references auth.users on delete cascade,
  primary key (board_id, user_id)
);
alter table public.pacer_boards add column if not exists snapshot jsonb;
alter table public.pacer_boards add column if not exists revision bigint not null default -1;
alter table public.pacer_boards add column if not exists updated_at timestamptz not null default now();
create table if not exists public.pacer_notepads (
  board_id uuid references public.pacer_boards on delete cascade,
  id uuid, author_id uuid not null references auth.users on delete cascade,
  author text not null, body text not null, x double precision not null, y double precision not null,
  primary key (board_id, id)
);
create table if not exists public.pacer_annotations (
  board_id uuid references public.pacer_boards on delete cascade,
  user_id uuid references auth.users on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 2000000),
  primary key (board_id, user_id)
);
alter table public.pacer_boards enable row level security;
alter table public.pacer_board_members enable row level security;
alter table public.pacer_notepads enable row level security;
alter table public.pacer_annotations enable row level security;
revoke all on public.pacer_boards, public.pacer_board_members, public.pacer_notepads, public.pacer_annotations from public, anon, authenticated;
grant select, insert, update on public.pacer_annotations to authenticated;

create or replace function public.pacer_board_member(board uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.pacer_board_members m where m.board_id = board and m.user_id = auth.uid());
$$;
drop policy if exists private_annotations on public.pacer_annotations;
create policy private_annotations on public.pacer_annotations to authenticated
  using (user_id = auth.uid() and public.pacer_board_member(board_id))
  with check (user_id = auth.uid() and public.pacer_board_member(board_id));

create or replace function public.pacer_open_board(board uuid, room_code text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  insert into public.pacer_boards (id, owner_id, code) values (board, auth.uid(), room_code) on conflict (id) do nothing;
  if not exists (select 1 from public.pacer_boards where id = board and owner_id = auth.uid() and code = room_code)
    then raise exception 'Only the board owner can host'; end if;
end $$;

create or replace function public.pacer_join_board(board uuid, room_code text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (select 1 from public.pacer_boards where id = board and code = room_code and owner_id <> auth.uid())
    then raise exception 'Board invitation unavailable'; end if;
  insert into public.pacer_board_members values (board, auth.uid()) on conflict do nothing;
end $$;

create or replace function public.pacer_set_contributions(board uuid, allowed boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.pacer_boards set contributions = allowed where id = board and owner_id = auth.uid();
  if not found then raise exception 'Only the board owner can change access'; end if;
end $$;

create or replace function public.pacer_save_board_snapshot(board uuid, state jsonb, rev bigint)
returns void language sql security definer set search_path = '' as $$
  update public.pacer_boards
    set snapshot = state - 'privateSlidePages', revision = rev, updated_at = now(),
        contributions = case when state->>'ended' = 'true' then false else contributions end
    where id = board and owner_id = auth.uid() and revision < rev
      and state->>'code' = code and state->>'collaborationId' = id::text
      and octet_length(state::text) <= 4000000;
$$;

create or replace function public.pacer_load_member_board(room_code text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select b.snapshot from public.pacer_boards b
  join public.pacer_board_members m on m.board_id = b.id
  where m.user_id = auth.uid() and b.code = room_code and b.snapshot is not null
  order by b.updated_at desc limit 1;
$$;

create or replace function public.pacer_board_notepads(board uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare config public.pacer_boards%rowtype;
begin
  select * into config from public.pacer_boards where id = board;
  if auth.uid() is null or config.id is null or (config.owner_id <> auth.uid() and not public.pacer_board_member(board))
    then raise exception 'Board membership required'; end if;
  return jsonb_build_object('allowed', config.contributions, 'notes',
    coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'author', n.author, 'mine', n.author_id = auth.uid(), 'body', n.body, 'x', n.x, 'y', n.y))
      from public.pacer_notepads n where n.board_id = board), '[]'::jsonb));
end $$;

create or replace function public.pacer_view_guest_notepads(board uuid, room_code text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('allowed', false, 'notes',
    coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'author', n.author, 'mine', false, 'body', n.body, 'x', n.x, 'y', n.y))
      from public.pacer_notepads n where n.board_id = b.id), '[]'::jsonb))
  from public.pacer_boards b where b.id = board and b.code = room_code;
$$;

create or replace function public.pacer_write_notepad(board uuid, note uuid, content text, px double precision, py double precision, remove_note boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare config public.pacer_boards%rowtype;
declare existing uuid;
begin
  select * into config from public.pacer_boards where id = board for update;
  if auth.uid() is null or config.id is null then raise exception 'Board unavailable'; end if;
  select author_id into existing from public.pacer_notepads where board_id = board and id = note;
  if config.owner_id = auth.uid() then
    if existing is null then raise exception 'Notepad no longer exists'; end if;
  elsif not config.contributions or not public.pacer_board_member(board) or (existing is not null and existing <> auth.uid()) then
    raise exception 'Student posting is closed or this notepad belongs to someone else';
  end if;
  if remove_note then
    delete from public.pacer_notepads where board_id = board and id = note;
  else
    if content is null or char_length(btrim(content)) not between 1 and 1500 or px is null or py is null
      or px not between -3 and 6 or py not between -3 and 6 then raise exception 'Invalid notepad'; end if;
    insert into public.pacer_notepads values (board, note, auth.uid(),
      left(coalesce(nullif(auth.jwt()->'user_metadata'->>'full_name', ''), nullif(auth.jwt()->'user_metadata'->>'name', ''), 'Student'), 80),
      btrim(content), px, py)
    on conflict (board_id, id) do update set body = excluded.body, x = excluded.x, y = excluded.y;
  end if;
end $$;

revoke execute on function public.pacer_board_member(uuid), public.pacer_open_board(uuid,text),
  public.pacer_join_board(uuid,text), public.pacer_set_contributions(uuid,boolean),
  public.pacer_board_notepads(uuid), public.pacer_write_notepad(uuid,uuid,text,double precision,double precision,boolean) from public, anon;
revoke execute on function public.pacer_save_board_snapshot(uuid,jsonb,bigint), public.pacer_load_member_board(text) from public, anon;
grant execute on function public.pacer_board_member(uuid), public.pacer_open_board(uuid,text),
  public.pacer_join_board(uuid,text), public.pacer_set_contributions(uuid,boolean),
  public.pacer_board_notepads(uuid), public.pacer_write_notepad(uuid,uuid,text,double precision,double precision,boolean) to authenticated;
grant execute on function public.pacer_save_board_snapshot(uuid,jsonb,bigint), public.pacer_load_member_board(text) to authenticated;
revoke execute on function public.pacer_view_guest_notepads(uuid,text) from public;
grant execute on function public.pacer_view_guest_notepads(uuid,text) to anon, authenticated;
commit;
