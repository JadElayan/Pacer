-- Pacer 10 - Teacher AI pause
-- Lets a teacher pause student AI help for a room. The teacher's browser signs each change with the room key
-- (see room_keys.sql) and appends it here. Anyone may insert, nobody may update or delete, and the AI route only
-- trusts rows whose signature verifies against the room's public key, newest signed time first.
-- Safe to run more than once.

create table if not exists public.pacer_room_ai_signals (
  id bigint generated always as identity primary key,
  code text not null check (code ~ '^[0-9]{6}$'),
  body text not null check (length(body) <= 200),
  sig text not null check (length(sig) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists pacer_room_ai_signals_code on public.pacer_room_ai_signals (code, id desc);

alter table public.pacer_room_ai_signals enable row level security;
grant select, insert on public.pacer_room_ai_signals to anon, authenticated;
drop policy if exists "Anyone can read AI signals" on public.pacer_room_ai_signals;
create policy "Anyone can read AI signals" on public.pacer_room_ai_signals for select to anon, authenticated using (true);
drop policy if exists "Anyone can add AI signals" on public.pacer_room_ai_signals;
create policy "Anyone can add AI signals" on public.pacer_room_ai_signals for insert to anon, authenticated with check (true);
