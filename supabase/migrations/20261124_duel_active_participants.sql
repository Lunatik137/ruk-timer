create table public.duel_active_participants (
  participant_key text primary key,
  room_id uuid not null references public.duel_rooms(id) on delete cascade,
  expires_at timestamptz not null
);

alter table public.duel_active_participants enable row level security;
revoke all on public.duel_active_participants from public, anon, authenticated;
grant select, insert, update, delete on public.duel_active_participants to service_role;

create index duel_active_participants_room_idx on public.duel_active_participants (room_id);

create function public.sync_duel_active_participants()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  previous_keys text[] := '{}';
  current_keys text[] := '{}';
  participant text;
  conflicting_room uuid;
  previous_expiry timestamptz;
  checked_at timestamptz := clock_timestamp();
begin
  if tg_op = 'UPDATE' then
    previous_expiry := old.expires_at;
    if old.completed_at is null and old.expires_at > checked_at then
      previous_keys := array_remove(array[old.seats->>0, old.seats->>1, old.referee_key], null);
    end if;
  end if;
  if new.completed_at is null and new.expires_at > checked_at then
    current_keys := array_remove(array[new.seats->>0, new.seats->>1, new.referee_key], null);
  end if;

  delete from public.duel_active_participants
  where room_id = new.id and participant_key <> all(current_keys);

  for participant in
    select distinct key from unnest(current_keys) as keys(key) order by key
  loop
    if participant = any(previous_keys) and new.expires_at = previous_expiry then
      continue;
    end if;

    -- Keep rooms created before the migration valid and prevent new overlapping seats.
    select room.id into conflicting_room from public.duel_rooms as room
    where room.id <> new.id and room.completed_at is null and room.expires_at > checked_at
      and (room.referee_key = participant or room.seats @> jsonb_build_array(participant))
    order by room.expires_at desc limit 1;

    if conflicting_room is null then
      insert into public.duel_active_participants as lease (participant_key, room_id, expires_at)
      values (participant, new.id, new.expires_at)
      on conflict (participant_key) do update
        set room_id = excluded.room_id, expires_at = excluded.expires_at
        where lease.room_id = excluded.room_id or lease.expires_at <= clock_timestamp();
      if found then
        continue;
      end if;

      select room_id into conflicting_room from public.duel_active_participants
      where participant_key = participant;
    end if;

    raise exception using errcode = 'RUK01', message = 'duel_participant_busy',
      detail = coalesce(conflicting_room::text, '');
  end loop;
  return new;
end;
$$;

revoke all on function public.sync_duel_active_participants() from public, anon, authenticated;
grant execute on function public.sync_duel_active_participants() to service_role;

create trigger sync_duel_active_participants
after insert or update of seats, referee_key, completed_at, expires_at on public.duel_rooms
for each row execute function public.sync_duel_active_participants();
