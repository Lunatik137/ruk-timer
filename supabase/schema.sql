-- ============================================================================
-- RukTimer - Supabase Cloud PostgreSQL Schema (WCA Timer)
-- Best-practice RLS (initPlan-optimized auth.uid() + explicit role grants)
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
  solved_at timestamptz not null default now()
);

-- 3. Indexes tối ưu tốc độ truy vấn lịch sử, khoá ngoại & RLS
create index if not exists idx_cube_sessions_user_id on public.cube_sessions(user_id, created_at);
create index if not exists idx_solves_user_session on public.solves(user_id, session_id, solved_at desc);
create index if not exists idx_solves_session_id on public.solves(session_id);

-- 4. Phân quyền truy cập bảng cho role authenticated qua Data API
grant select, insert, update, delete on table public.cube_sessions to authenticated;
grant select, insert, update, delete on table public.solves to authenticated;

-- 5. Bật Row Level Security (RLS) bảo mật dữ liệu theo từng tài khoản
alter table public.cube_sessions enable row level security;
alter table public.solves enable row level security;

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
