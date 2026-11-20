alter table public.duel_rooms
  add column referee_key text,
  add column completed_at timestamptz;

-- Earlier rooms did not record a finish timestamp; their expiry gives the creation time.
update public.duel_rooms
set completed_at = expires_at - interval '24 hours'
where state->'winner' in ('0'::jsonb, '1'::jsonb);

create index duel_rooms_completed_idx on public.duel_rooms (completed_at desc) where completed_at is not null;
create index duel_rooms_completed_host_idx on public.duel_rooms (host_key) where completed_at is not null;
create index duel_rooms_completed_seats_idx on public.duel_rooms using gin (seats) where completed_at is not null;
