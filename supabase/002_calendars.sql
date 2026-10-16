-- Server-only encrypted OAuth material. No browser role can read or modify it.
begin;
create table if not exists public.simpledo_calendar_connections (
 user_id uuid not null references auth.users(id) on delete cascade,
 provider text not null check(provider in ('outlook','google')),
 token_cipher text not null,
 selected jsonb not null default '[]'::jsonb check(jsonb_typeof(selected)='array'),
 updated_at timestamptz not null default now(),
 primary key(user_id,provider)
);
create table if not exists public.simpledo_calendar_oauth (
 state_hash text primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 provider text not null check(provider in ('outlook','google')),
 verifier_cipher text not null,
 expires_at timestamptz not null
);
alter table public.simpledo_calendar_connections enable row level security;
alter table public.simpledo_calendar_oauth enable row level security;
revoke all on public.simpledo_calendar_connections, public.simpledo_calendar_oauth from public,anon,authenticated;
grant all on public.simpledo_calendar_connections, public.simpledo_calendar_oauth to service_role;
commit;
