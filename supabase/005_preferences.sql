-- Run after 004_capture.sql, before releasing account-synchronised Inbox visibility.
-- A single owner-scoped preference; clients may read only their own value.
-- All writes go through a revision-checked authenticated RPC, not direct table grants.
begin;
create table if not exists public.simpledo_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (name = 'inbox_completed_visibility'),
  value text not null check (value in ('end-of-day','48-hours','3-days','5-days','indefinitely')),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id,name)
);
alter table public.simpledo_preferences enable row level security;
drop policy if exists "Read own preferences" on public.simpledo_preferences;
create policy "Read own preferences" on public.simpledo_preferences
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.simpledo_preferences from public, anon, authenticated;
grant select on public.simpledo_preferences to authenticated;

create or replace function public.sync_simpledo_preference(
  preference_name text, preference_value text, expected_revision bigint
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  current_row public.simpledo_preferences%rowtype;
  conflicting boolean := false;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if preference_name is distinct from 'inbox_completed_visibility'
     or preference_value is null
     or preference_value not in ('end-of-day','48-hours','3-days','5-days','indefinitely')
     or expected_revision is null or expected_revision < 0 then
    raise exception 'Invalid preference';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  select * into current_row from public.simpledo_preferences
    where user_id = owner_id and name = preference_name for update;
  if not found then
    if expected_revision <> 0 then raise exception 'Cloud preference history missing'; end if;
    insert into public.simpledo_preferences(user_id,name,value)
      values(owner_id,preference_name,preference_value) returning * into current_row;
  elsif current_row.value = preference_value then
    null; -- idempotent retry following a lost response
  elsif current_row.revision <> expected_revision then
    conflicting := true;
  else
    update public.simpledo_preferences
       set value = preference_value, revision = revision + 1, updated_at = now()
     where user_id = owner_id and name = preference_name
     returning * into current_row;
  end if;
  return jsonb_build_object('name',current_row.name,'value',current_row.value,
    'revision',current_row.revision,'conflict',conflicting);
end;
$$;
revoke all on function public.sync_simpledo_preference(text,text,bigint) from public, anon;
grant execute on function public.sync_simpledo_preference(text,text,bigint) to authenticated;
commit;
