-- Private annotations: let the board owner save them too, not only joined students.
-- Without this, a teacher who opens the student view with their own account (for example to test it)
-- can see the board but every annotation save is rejected, because owners never join their own board.
-- Run after board_collaboration.sql. Safe to run more than once.
begin;
create or replace function public.pacer_board_access(board uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.pacer_board_member(board)
    or exists (select 1 from public.pacer_boards b where b.id = board and b.owner_id = auth.uid());
$$;
revoke execute on function public.pacer_board_access(uuid) from public, anon;
grant execute on function public.pacer_board_access(uuid) to authenticated;

drop policy if exists private_annotations on public.pacer_annotations;
create policy private_annotations on public.pacer_annotations to authenticated
  using (user_id = auth.uid() and public.pacer_board_access(board_id))
  with check (user_id = auth.uid() and public.pacer_board_access(board_id));
commit;
