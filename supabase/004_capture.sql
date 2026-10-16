-- Scan reservations contain only IDs, a per-user salted image hash and time.
-- No photos, recognised words or task data. All limits are server-owned.
begin;
create table if not exists public.simpledo_scan_reservations (
 request_id uuid primary key,
 user_id uuid references auth.users(id) on delete set null,
 image_hash text not null check(image_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now()
);
create index if not exists simpledo_scan_time on public.simpledo_scan_reservations(created_at);
alter table public.simpledo_scan_reservations enable row level security;
revoke all on public.simpledo_scan_reservations from public,anon,authenticated;
-- The service role cannot delete reservations through REST or reset quotas.
grant select,insert on public.simpledo_scan_reservations to service_role;
create or replace function public.reserve_simpledo_scan(p_user uuid,p_request uuid,p_hash text)
returns text language plpgsql security definer set search_path='' as $$
begin
 if p_user is null or p_request is null or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid reservation'; end if;
 -- Serialize all reservations, across users and edge instances, before checking.
 perform pg_catalog.pg_advisory_xact_lock(782516904);
 -- Retain global reservations after account deletion. Expire metadata after 40 days.
 delete from public.simpledo_scan_reservations where created_at<now()-interval '40 days';
 if exists(select 1 from public.simpledo_scan_reservations where request_id=p_request) then return 'duplicate'; end if;
 if exists(select 1 from public.simpledo_scan_reservations where user_id=p_user and image_hash=p_hash and created_at>now()-interval '24 hours') then return 'duplicate'; end if;
 if (select count(*) from public.simpledo_scan_reservations where created_at>now()-interval '32 days')>=800 then return 'global'; end if;
 if (select count(*) from public.simpledo_scan_reservations where created_at>now()-interval '24 hours')>=50 then return 'global'; end if;
 if (select count(*) from public.simpledo_scan_reservations where created_at>now()-interval '1 minute')>=10 then return 'global'; end if;
 if (select count(*) from public.simpledo_scan_reservations where user_id=p_user and created_at>now()-interval '24 hours')>=10 then return 'user'; end if;
 if (select count(*) from public.simpledo_scan_reservations where user_id=p_user and created_at>now()-interval '1 minute')>=2 then return 'user'; end if;
 insert into public.simpledo_scan_reservations(request_id,user_id,image_hash) values(p_request,p_user,p_hash);
 return 'reserved';
end $$;
revoke all on function public.reserve_simpledo_scan(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_simpledo_scan(uuid,uuid,text) to service_role;
commit;
