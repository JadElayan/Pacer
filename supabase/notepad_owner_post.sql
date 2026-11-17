-- Shared notepads: let the board owner (the teacher) post new notepads, not only edit or remove students'.
-- Before this, a teacher's "Post to board" always failed with "Notepad no longer exists".
-- Students are unchanged: they can post only while contributions are on, and only edit their own notepads.
-- Run after board_collaboration.sql. Safe to run more than once.
create or replace function public.pacer_write_notepad(board uuid, note uuid, content text, px double precision, py double precision, remove_note boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare config public.pacer_boards%rowtype;
declare existing uuid;
declare owner boolean;
begin
  select * into config from public.pacer_boards where id = board for update;
  if auth.uid() is null or config.id is null then raise exception 'Board unavailable'; end if;
  select author_id into existing from public.pacer_notepads where board_id = board and id = note;
  owner := config.owner_id = auth.uid();
  if owner then
    if remove_note and existing is null then raise exception 'Notepad no longer exists'; end if;
  elsif not config.contributions or not public.pacer_board_member(board) or (existing is not null and existing <> auth.uid()) then
    raise exception 'Student posting is closed or this notepad belongs to someone else';
  end if;
  if remove_note then
    delete from public.pacer_notepads where board_id = board and id = note;
  else
    if content is null or char_length(btrim(content)) not between 1 and 1500 or px is null or py is null
      or px not between -3 and 6 or py not between -3 and 6 then raise exception 'Invalid notepad'; end if;
    insert into public.pacer_notepads values (board, note, auth.uid(),
      left(coalesce(nullif(auth.jwt()->'user_metadata'->>'full_name', ''), nullif(auth.jwt()->'user_metadata'->>'name', ''),
        case when owner then 'Teacher' else 'Student' end), 80),
      btrim(content), px, py)
    on conflict (board_id, id) do update set body = excluded.body, x = excluded.x, y = excluded.y;
  end if;
end $$;
revoke execute on function public.pacer_write_notepad(uuid,uuid,text,double precision,double precision,boolean) from public, anon;
grant execute on function public.pacer_write_notepad(uuid,uuid,text,double precision,double precision,boolean) to authenticated;
