-- Pacer 11 - AI token budgets
-- Shared counters for lib/aiBudget.ts: tokens used per device, per class and for the whole site each day, plus the
-- abuse penalty box. Without this script the server keeps the same counters in memory, per server instance.
-- Counter names are salted by the server, so callers can't guess (and inflate) real ones. Rows hold only hashed
-- names and numbers: no student content, no IP addresses.
-- Safe to run more than once.

create table if not exists public.pacer_ai_budget (
  key text not null check (length(key) <= 80),
  bucket timestamptz not null,
  total bigint not null default 0,
  primary key (key, bucket)
);
alter table public.pacer_ai_budget enable row level security;
revoke all on public.pacer_ai_budget from anon, authenticated;

-- Adds p_amount to a counter for the current window and returns the new total (p_amount 0 just reads it).
create or replace function public.ai_budget_add(p_key text, p_window_seconds integer, p_amount integer)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bucket timestamptz;
  v_total bigint;
begin
  if p_key is null or length(p_key) > 80 or p_window_seconds not between 1 and 86400 or p_amount not between 0 and 2000000 then
    return null;
  end if;
  v_bucket := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.pacer_ai_budget as b (key, bucket, total) values (p_key, v_bucket, p_amount)
    on conflict (key, bucket) do update set total = b.total + excluded.total
    returning b.total into v_total;
  if random() < 0.01 then
    delete from public.pacer_ai_budget where bucket < now() - interval '2 days';
  end if;
  return v_total;
end;
$$;

revoke all on function public.ai_budget_add(text, integer, integer) from public;
grant execute on function public.ai_budget_add(text, integer, integer) to anon, authenticated;
