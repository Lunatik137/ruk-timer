create table public.duel_camera_signals (
  room_id uuid not null references public.duel_rooms(id) on delete cascade,
  peer_id text not null,
  session_id uuid not null,
  publishing boolean not null,
  signals jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (room_id, peer_id)
);
alter table public.duel_camera_signals enable row level security;
revoke all on public.duel_camera_signals from public, anon, authenticated;
grant select, insert, update, delete on public.duel_camera_signals to service_role;

create function public.clear_finished_duel_camera()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.duel_camera_signals where room_id = new.id;
  return new;
end;
$$;
revoke all on function public.clear_finished_duel_camera() from public, anon, authenticated;
grant execute on function public.clear_finished_duel_camera() to service_role;

create trigger clear_finished_duel_camera
after update of completed_at on public.duel_rooms
for each row when (old.completed_at is null and new.completed_at is not null)
execute function public.clear_finished_duel_camera();
