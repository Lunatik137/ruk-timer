-- ============================================================================
-- RukTimer - Supabase Cloud PostgreSQL Schema (WCA Timer & CFOP AI Platform)
-- Best-practice RLS (initPlan-optimized (select auth.uid()) + explicit grants)
-- Idempotent migration script: safe to run on both new and existing databases
-- ============================================================================

create extension if not exists "pgcrypto";

-- 1. Bảng lưu các phiên giải (Sessions)
create table if not exists public.cube_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Session 1',
  puzzle text not null default '3x3',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Bảng lưu lịch sử từng lần giải (Solves)
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

-- Bổ sung cột tương thích ngược nếu bảng solves đã tồn tại từ phiên bản trước
alter table public.solves
  add column if not exists splits_ms integer[] null,
  add column if not exists reconstruction text null;

-- 3. Bảng đồng bộ cài đặt người dùng đa thiết bị (Web / PWA / Mobile)
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 4. Bảng lưu tiến độ học thuật toán CFOP & Lịch ôn tập ngắt quãng (SM-2 SRS)
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

-- 5. Bảng lưu kết quả Thử thách Scramble Hàng ngày (Daily Ao5 Leaderboard)
create table if not exists public.daily_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_date text not null,
  puzzle text not null default '3x3',
  display_name text not null default 'Cuber',
  division text not null default 'open',
  ao5_ms integer null,
  best_single_ms integer null,
  times_ms integer[] not null default '{}',
  penalties text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (user_id, challenge_date, puzzle)
);

-- 6. Bảng lưu lịch sử báo cáo phân tích AI Coach & Weekly Report
create table if not exists public.ai_coach_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  report_type text not null check (report_type in ('coach', 'weekly')),
  metrics_snapshot jsonb not null default '{}'::jsonb,
  ai_advice jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 7. Indexes tối ưu tốc độ truy vấn lịch sử, khoá ngoại & RLS
create index if not exists idx_cube_sessions_user_id on public.cube_sessions(user_id, created_at);
create index if not exists idx_solves_user_session on public.solves(user_id, session_id, solved_at desc);
create index if not exists idx_solves_session_id on public.solves(session_id);
create index if not exists idx_cfop_progress_user_review on public.cfop_progress(user_id, next_review_at);
create index if not exists idx_daily_submissions_date_ao5 on public.daily_submissions(challenge_date, puzzle, ao5_ms asc nulls last);
create index if not exists idx_ai_reports_user_created on public.ai_coach_reports(user_id, created_at desc);

-- 8. Phân quyền truy cập bảng cho role authenticated qua Data API
grant select, insert, update, delete on table public.cube_sessions to authenticated;
grant select, insert, update, delete on table public.solves to authenticated;
grant select, insert, update, delete on table public.user_settings to authenticated;
grant select, insert, update, delete on table public.cfop_progress to authenticated;
grant select, insert, update, delete on table public.daily_submissions to authenticated;
grant select on table public.daily_submissions to anon;
grant select, insert, delete on table public.ai_coach_reports to authenticated;

-- 9. Bật Row Level Security (RLS) bảo mật dữ liệu theo từng tài khoản
alter table public.cube_sessions enable row level security;
alter table public.solves enable row level security;
alter table public.user_settings enable row level security;
alter table public.cfop_progress enable row level security;
alter table public.daily_submissions enable row level security;
alter table public.ai_coach_reports enable row level security;

-- Policies cho bảng cube_sessions (dùng (select auth.uid()) để tối ưu initPlan)
drop policy if exists "Users can view own sessions" on public.cube_sessions;
create policy "Users can view own sessions"
  on public.cube_sessions for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own sessions" on public.cube_sessions;
create policy "Users can insert own sessions"
  on public.cube_sessions for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own sessions" on public.cube_sessions;
create policy "Users can update own sessions"
  on public.cube_sessions for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own sessions" on public.cube_sessions;
create policy "Users can delete own sessions"
  on public.cube_sessions for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Policies cho bảng solves
drop policy if exists "Users can view own solves" on public.solves;
create policy "Users can view own solves"
  on public.solves for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own solves" on public.solves;
create policy "Users can insert own solves"
  on public.solves for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own solves" on public.solves;
create policy "Users can update own solves"
  on public.solves for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own solves" on public.solves;
create policy "Users can delete own solves"
  on public.solves for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Policies cho bảng user_settings
drop policy if exists "Users can manage own settings" on public.user_settings;
create policy "Users can manage own settings"
  on public.user_settings for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Policies cho bảng cfop_progress
drop policy if exists "Users can manage own cfop progress" on public.cfop_progress;
create policy "Users can manage own cfop progress"
  on public.cfop_progress for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Policies cho bảng daily_submissions (mọi người đọc được BXH, chỉ chủ tài khoản được ghi)
drop policy if exists "Anyone can view daily leaderboard" on public.daily_submissions;
create policy "Anyone can view daily leaderboard"
  on public.daily_submissions for select
  to anon, authenticated
  using (true);

drop policy if exists "Users can insert own daily submission" on public.daily_submissions;
create policy "Users can insert own daily submission"
  on public.daily_submissions for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own daily submission" on public.daily_submissions;
create policy "Users can update own daily submission"
  on public.daily_submissions for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Policies cho bảng ai_coach_reports
drop policy if exists "Users can manage own ai reports" on public.ai_coach_reports;
create policy "Users can manage own ai reports"
  on public.ai_coach_reports for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
