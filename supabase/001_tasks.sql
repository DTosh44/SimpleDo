-- Run once in the Supabase SQL editor. No service-role key is used by the app.
begin;
create table if not exists public.simpledo_tasks (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 200),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and payload->>'id' = id),
  revision bigint not null default 1 check (revision > 0),
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.simpledo_tasks enable row level security;
drop policy if exists "Read own tasks" on public.simpledo_tasks;
create policy "Read own tasks" on public.simpledo_tasks for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.simpledo_tasks from anon, authenticated;
grant select on public.simpledo_tasks to authenticated;

-- Only this authenticated, owner-scoped function can write. Serialized per user,
-- with a compare-and-swap revision so stale offline edits cannot erase new work.
create or replace function public.sync_task(task_id text, task_payload jsonb,
  is_deleted boolean, expected_revision bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  current_row public.simpledo_tasks%rowtype;
  conflicting boolean := false;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if task_id is null or length(task_id) not between 1 and 200
     or task_id in ('__proto__', 'constructor', 'prototype')
     or task_payload is null or jsonb_typeof(task_payload) <> 'object'
     or (task_payload->>'id') is distinct from task_id
     or jsonb_typeof(task_payload->'title') is distinct from 'string'
     or length(trim(task_payload->>'title')) not between 1 and 180
     or octet_length(task_payload::text) > 100000
     or expected_revision is null or expected_revision < 0 or is_deleted is null then
    raise exception 'Invalid task';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  select * into current_row from public.simpledo_tasks
    where user_id = owner_id and id = task_id for update;
  if not found then
    if expected_revision <> 0 then raise exception 'Cloud history missing; restore from backup'; end if;
    insert into public.simpledo_tasks (user_id,id,payload,deleted)
      values(owner_id,task_id,task_payload,is_deleted) returning * into current_row;
  elsif current_row.payload = task_payload and current_row.deleted = is_deleted then
    null; -- Idempotent retry after a lost response.
  elsif current_row.revision <> expected_revision then
    conflicting := true;
  else
    update public.simpledo_tasks set payload=task_payload, deleted=is_deleted,
      revision=revision+1, updated_at=now()
      where user_id=owner_id and id=task_id returning * into current_row;
  end if;
  return jsonb_build_object('id',current_row.id,'payload',current_row.payload,
    'revision',current_row.revision,'deleted',current_row.deleted,'conflict',conflicting);
end;
$$;
revoke all on function public.sync_task(text,jsonb,boolean,bigint) from public, anon;
grant execute on function public.sync_task(text,jsonb,boolean,bigint) to authenticated;
commit;
