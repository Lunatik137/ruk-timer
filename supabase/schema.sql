-- ============================================================================
-- RukTimer - Supabase Cloud PostgreSQL Schema (WCA Timer & CFOP AI Platform)
-- Best-practice RLS (initPlan-optimized (select auth.uid()) + explicit grants)
-- Idempotent script: safe to run on both new and existing databases.
-- Note: `daily_submissions` has been retired for new installs. Existing rows on
-- production are left untouched (export manually before dropping if desired).
-- ============================================================================

create extension if not exists "pgcrypto";

-- 1. Sessions
create table if not exists public.cube_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Session 1',
  puzzle text not null default '3x3',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Solves
create table if not exists public.solves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.cube_sessions(id) on delete cascade,
  puzzle text not null default '3x3',
  time_ms integer not null check (time_ms >= 0),
  penalty text not null default 'OK' check (penalty in ('OK', '+2', 'DNF')),
  scramble text not null,
  comment text not null default '',
  splits_ms integer[] null,
  reconstruction text null,
  solved_at timestamptz not null default now()
);

alter table public.solves
  add column if not exists splits_ms integer[] null,
  add column if not exists reconstruction text null;

-- 3. User settings synced across Web/PWA/Expo
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 4. CFOP progress & SM-2 Spaced Repetition
create table if not exists public.cfop_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  alg_id text not null,
  status text not null default 'learning'
    check (status in ('unlearned', 'learning', 'learned', 'mastered')),
  preferred_formula text null,
  ease_factor real not null default 2.5 check (ease_factor >= 1.3),
  interval_days integer not null default 0 check (interval_days >= 0),
  repetitions integer not null default 0 check (repetitions >= 0),
  next_review_at timestamptz not null default now(),
  last_drilled_at timestamptz null,
  updated_at timestamptz not null default now(),
  primary key (user_id, alg_id)
);

-- 5. Custom CFOP Practice Sets (multi-group random drill)
create table if not exists public.cfop_practice_sets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  case_ids text[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- 6. Private User Files Metadata (Cloudflare R2 private bucket)
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

-- 7. AI Coach reports cache & daily quota tracking
create table if not exists public.ai_coach_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  report_type text not null check (report_type in ('coach', 'weekly')),
  metrics_snapshot jsonb not null default '{}'::jsonb,
  ai_advice jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default current_date,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

-- 8. Indexes
create index if not exists idx_cube_sessions_user_id on public.cube_sessions(user_id, created_at);
create index if not exists idx_solves_user_session on public.solves(user_id, session_id, solved_at desc);
create index if not exists idx_solves_session_id on public.solves(session_id);
create index if not exists idx_cfop_progress_user_review on public.cfop_progress(user_id, next_review_at);
create index if not exists idx_user_files_user_status_created on public.user_files(user_id, status, created_at desc);
create index if not exists idx_ai_reports_user_created on public.ai_coach_reports(user_id, created_at desc);

-- 9. Grants
grant select, insert, update, delete on table public.cube_sessions to authenticated;
grant select, insert, update, delete on table public.solves to authenticated;
grant select, insert, update on table public.user_settings to authenticated;
grant select, insert, update, delete on table public.cfop_progress to authenticated;
grant select, insert, update, delete on table public.cfop_practice_sets to authenticated;
grant select, insert, update, delete on table public.user_files to authenticated;
grant select, insert, delete on table public.ai_coach_reports to authenticated;
grant select, insert, update on table public.ai_usage to authenticated;

-- 10. Row Level Security
alter table public.cube_sessions enable row level security;
alter table public.solves enable row level security;
alter table public.user_settings enable row level security;
alter table public.cfop_progress enable row level security;
alter table public.cfop_practice_sets enable row level security;
alter table public.user_files enable row level security;
alter table public.ai_coach_reports enable row level security;
alter table public.ai_usage enable row level security;

drop policy if exists "Users can view own sessions" on public.cube_sessions;
create policy "Users can view own sessions" on public.cube_sessions for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users can insert own sessions" on public.cube_sessions;
create policy "Users can insert own sessions" on public.cube_sessions for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update own sessions" on public.cube_sessions;
create policy "Users can update own sessions" on public.cube_sessions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete own sessions" on public.cube_sessions;
create policy "Users can delete own sessions" on public.cube_sessions for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users can view own solves" on public.solves;
create policy "Users can view own solves" on public.solves for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users can insert own solves" on public.solves;
create policy "Users can insert own solves" on public.solves for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update own solves" on public.solves;
create policy "Users can update own solves" on public.solves for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete own solves" on public.solves;
create policy "Users can delete own solves" on public.solves for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users can manage own settings" on public.user_settings;
create policy "Users can manage own settings" on public.user_settings for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Users can manage own cfop progress" on public.cfop_progress;
create policy "Users can manage own cfop progress" on public.cfop_progress for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Users can manage own cfop practice sets" on public.cfop_practice_sets;
create policy "Users can manage own cfop practice sets" on public.cfop_practice_sets for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Users can manage own files" on public.user_files;
create policy "Users can manage own files" on public.user_files for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Users can manage own ai reports" on public.ai_coach_reports;
create policy "Users can manage own ai reports" on public.ai_coach_reports for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Users can view own ai usage" on public.ai_usage;
create policy "Users can view own ai usage" on public.ai_usage for select to authenticated using ((select auth.uid()) = user_id);

-- 11. Atomic AI Daily Quota RPC
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
