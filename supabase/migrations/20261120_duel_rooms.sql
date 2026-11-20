create table public.duel_rooms (
  id uuid primary key,
  host_key text not null,
  host_name text not null,
  seats jsonb not null,
  spectators jsonb not null default '[]'::jsonb,
  revision integer not null default 0,
  state jsonb not null,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  check (jsonb_typeof(seats) = 'array' and jsonb_array_length(seats) = 2),
  check (jsonb_typeof(spectators) = 'array' and jsonb_array_length(spectators) <= 2)
);

alter table public.duel_rooms enable row level security;
revoke all on public.duel_rooms from public, anon, authenticated;
grant select, insert, update, delete on public.duel_rooms to service_role;

create index duel_rooms_expiry_idx on public.duel_rooms (expires_at);
