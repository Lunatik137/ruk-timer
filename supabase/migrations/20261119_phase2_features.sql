-- ============================================================================
-- RukTimer Migration: Phase 2 Features (Additive & Idempotent - Safe on Prod)
-- Adds:
--   1. cfop_practice_sets (Custom multi-group CFOP random practice sets)
--   2. user_files (Cloudflare R2 private object metadata & ownership)
--   3. ai_usage + consume_ai_quota() RPC (Per-user daily Gemini quota)
-- Note: Does NOT drop historical `daily_submissions` table if it already exists.
-- ============================================================================

create extension if not exists "pgcrypto";

-- 1. Custom CFOP Practice Sets (synced per user between Web & Expo)
create table if not exists public.cfop_practice_sets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  case_ids text[] not null default '{}',
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on table public.cfop_practice_sets to authenticated;
alter table public.cfop_practice_sets enable row level security;

drop policy if exists "Users can manage own cfop practice sets" on public.cfop_practice_sets;
create policy "Users can manage own cfop practice sets"
  on public.cfop_practice_sets for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 2. Private User Files Metadata (backed by private Cloudflare R2 bucket)
create table if not exists public.user_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  object_key text not null unique,
  file_name text not null,
  file_kind text not null check (file_kind in ('video', 'backup', 'other')),
  content_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  status text not null default 'pending' check (status in ('pending', 'ready')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_files_user_status_created
  on public.user_files(user_id, status, created_at desc);

grant select, insert, update, delete on table public.user_files to authenticated;
alter table public.user_files enable row level security;

drop policy if exists "Users can manage own files" on public.user_files;
create policy "Users can manage own files"
  on public.user_files for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 3. Per-user Daily AI Quota Tracking for `/api/ai/coach`
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default current_date,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

grant select, insert, update on table public.ai_usage to authenticated;
alter table public.ai_usage enable row level security;

drop policy if exists "Users can view own ai usage" on public.ai_usage;
create policy "Users can view own ai usage"
  on public.ai_usage for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Atomic RPC: increments today's usage only if under `p_daily_limit`
create or replace function public.consume_ai_quota(p_daily_limit integer default 30)
returns table (allowed boolean, used_count integer, remaining integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    return query select false, 0, 0;
    return;
  end if;

  insert into public.ai_usage (user_id, usage_date, request_count, updated_at)
  values (v_uid, current_date, 0, now())
  on conflict (user_id, usage_date) do nothing;

  select request_count into v_count
  from public.ai_usage
  where user_id = v_uid and usage_date = current_date
  for update;

  if v_count >= p_daily_limit then
    return query select false, v_count, 0;
    return;
  end if;

  update public.ai_usage
  set request_count = request_count + 1,
      updated_at = now()
  where user_id = v_uid and usage_date = current_date
  returning request_count into v_count;

  return query select true, v_count, greatest(0, p_daily_limit - v_count);
end;
$$;

grant execute on function public.consume_ai_quota(integer) to authenticated;
