alter table public.duel_rooms
  add column referee_name text,
  add column access_requests jsonb not null default '[]'::jsonb
    check (jsonb_typeof(access_requests) = 'array' and jsonb_array_length(access_requests) <= 32);

update public.duel_rooms as room
set referee_name = (
      select viewer->>'name' from jsonb_array_elements(room.spectators) as viewer
      where viewer->>'key' = room.referee_key limit 1
    ),
    spectators = coalesce((
      select jsonb_agg(viewer order by position)
      from jsonb_array_elements(room.spectators) with ordinality as entries(viewer, position)
      where viewer->>'key' <> room.referee_key
    ), '[]'::jsonb)
where room.referee_key is not null;

update public.duel_rooms set referee_key = null where referee_name is null;
alter table public.duel_rooms add constraint duel_referee_identity
  check ((referee_key is null) = (referee_name is null));
