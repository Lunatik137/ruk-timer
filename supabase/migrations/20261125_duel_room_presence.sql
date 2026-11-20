create or replace function public.sync_duel_active_participants()
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
    if participant = any(previous_keys) then
      if new.expires_at is distinct from previous_expiry then
        update public.duel_active_participants set expires_at = new.expires_at
        where room_id = new.id and participant_key = participant;
      end if;
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


alter table public.duel_rooms
  alter column expires_at set default (now() + interval '5 minutes');

-- Give connected browsers a grace period to renew pre-existing rooms.
update public.duel_rooms set expires_at = now() + interval '5 minutes'
where completed_at is null and expires_at > now() + interval '5 minutes';

create function public.refresh_duel_presence(p_room uuid, p_participant text)
returns void
language sql
set search_path = ''
as $$
  update public.duel_rooms as room
  set expires_at = now() + interval '5 minutes'
  where room.id = p_room
    and room.completed_at is null
    and room.expires_at > clock_timestamp()
    and room.expires_at <= now() + interval '4 minutes'
    and (
      room.seats @> jsonb_build_array(p_participant)
      or (room.state->>'started' = 'false' and p_participant in (room.host_key, room.referee_key))
    );
$$;

revoke all on function public.refresh_duel_presence(uuid, text) from public, anon, authenticated;
grant execute on function public.refresh_duel_presence(uuid, text) to service_role;
