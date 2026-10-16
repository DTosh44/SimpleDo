-- Run after 001_tasks.sql. Custom tag metadata syncs separately from tasks.
-- Built-in Work and Home identities are fixed in the client. Deleting a tag
-- creates a metadata tombstone; it never deletes a task.
begin;
create table if not exists public.simpledo_tags (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 200),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and payload->>'id' = id),
  revision bigint not null default 1 check (revision > 0),
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.simpledo_tags enable row level security;
drop policy if exists "Read own tags" on public.simpledo_tags;
create policy "Read own tags" on public.simpledo_tags for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.simpledo_tags from anon, authenticated;
grant select on public.simpledo_tags to authenticated;

-- Only this authenticated, owner-scoped function can write. Serialized per user,
-- with a compare-and-swap revision so stale offline edits cannot erase new work.
create or replace function public.sync_tag(tag_id text, tag_payload jsonb,
  expected_revision bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  current_row public.simpledo_tags%rowtype;
  conflicting boolean := false;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if tag_id is null or length(tag_id) not between 1 and 200
     or tag_id !~ '^tag-[a-zA-Z0-9-]{1,100}$'
     or tag_payload is null or jsonb_typeof(tag_payload) <> 'object'
     or (tag_payload->>'id') is distinct from tag_id
     or jsonb_typeof(tag_payload->'name') is distinct from 'string'
     or length(trim(tag_payload->>'name')) not between 1 and 32
     or jsonb_typeof(tag_payload->'deleted') is distinct from 'boolean'
     or coalesce(tag_payload->>'color','') not in ('blue','orange','pink','purple','mustard','grey')
     or coalesce(tag_payload->>'context','') not in ('work','outside')
     or coalesce(tag_payload->>'createdAt','') = '' or coalesce(tag_payload->>'updatedAt','') = ''
     or octet_length(tag_payload::text) > 100000
     or expected_revision is null or expected_revision < 0 then
    raise exception 'Invalid tag';
  end if;
  perform (tag_payload->>'createdAt')::timestamptz;
  perform (tag_payload->>'updatedAt')::timestamptz;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  select * into current_row from public.simpledo_tags
    where user_id = owner_id and id = tag_id for update;
  if not found then
    if expected_revision <> 0 then raise exception 'Cloud history missing; restore from backup'; end if;
    insert into public.simpledo_tags (user_id,id,payload,deleted)
      values(owner_id,tag_id,tag_payload,(tag_payload->>'deleted')::boolean) returning * into current_row;
  elsif current_row.payload = tag_payload and current_row.deleted = (tag_payload->>'deleted')::boolean then
    null; -- Idempotent retry after a lost response.
  elsif current_row.revision <> expected_revision and not ((tag_payload->>'deleted')::boolean and not current_row.deleted) then
    conflicting := true;
  else
    -- A stale deletion removes the label but preserves its newest classification.
    if current_row.revision <> expected_revision and (tag_payload->>'deleted')::boolean then
      tag_payload := current_row.payload || jsonb_build_object('deleted',true,'updatedAt',tag_payload->>'updatedAt');
    end if;
    update public.simpledo_tags set payload=tag_payload, deleted=(tag_payload->>'deleted')::boolean,
      revision=revision+1, updated_at=now()
      where user_id=owner_id and id=tag_id returning * into current_row;
  end if;
  return jsonb_build_object('id',current_row.id,'payload',current_row.payload,
    'revision',current_row.revision,'deleted',current_row.deleted,'conflict',conflicting);
end;
$$;
revoke all on function public.sync_tag(text,jsonb,bigint) from public, anon;
grant execute on function public.sync_tag(text,jsonb,bigint) to authenticated;
commit;
