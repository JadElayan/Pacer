-- Room lock: one public signing key per live meeting code. Students verify the teacher's broadcasts against it.
-- Anyone may read keys (they are public). Registration goes through the function below, which never replaces
-- a key that is less than seven days old, so a live room can't be taken over. Old codes can be reused after that.
begin;
create table if not exists public.pacer_room_keys (
  code text primary key check (code ~ '^[0-9]{6}$'),
  public_key jsonb not null check (jsonb_typeof(public_key) = 'object' and octet_length(public_key::text) <= 600),
  created_at timestamptz not null default now()
);
alter table public.pacer_room_keys enable row level security;
revoke all on public.pacer_room_keys from public, anon, authenticated;
grant select on public.pacer_room_keys to anon, authenticated;
drop policy if exists "Anyone can read room keys" on public.pacer_room_keys;
create policy "Anyone can read room keys" on public.pacer_room_keys for select to anon, authenticated using (true);

create or replace function public.pacer_register_room_key(room_code text, room_key jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if room_code !~ '^[0-9]{6}$' or jsonb_typeof(room_key) <> 'object' or octet_length(room_key::text) > 600
    or room_key->>'kty' is distinct from 'EC' or room_key->>'crv' is distinct from 'P-256'
    or room_key->>'d' is not null then
    raise exception 'Invalid room key';
  end if;
  insert into public.pacer_room_keys as existing (code, public_key) values (room_code, room_key)
  on conflict (code) do update set public_key = excluded.public_key, created_at = now()
  where existing.created_at < now() - interval '7 days';
  return found;
end $$;
revoke execute on function public.pacer_register_room_key(text, jsonb) from public;
grant execute on function public.pacer_register_room_key(text, jsonb) to anon, authenticated;
commit;
