alter table public.duel_rooms
  add column is_public boolean not null default false;

create index duel_rooms_public_lobby_idx on public.duel_rooms (expires_at desc)
where is_public and completed_at is null
  and state->>'started' = 'false'
  and (seats->>0 is null or seats->>1 is null);
