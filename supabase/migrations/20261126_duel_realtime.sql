alter table public.duel_rooms
  add column realtime_topic text not null default ('duel:' || gen_random_uuid()::text),
  add constraint duel_rooms_realtime_topic_key unique (realtime_topic);

create function public.is_active_duel_topic(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.duel_rooms
    where completed_at is null and expires_at > now() and (
      realtime_topic = p_topic
      or (
        id = case when p_topic ~ '^duel-wait:[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}:[0-9a-f-]{36}$'
             then split_part(p_topic, ':', 2)::uuid end
        and access_requests @> jsonb_build_array(jsonb_build_object(
          'id', split_part(p_topic, ':', 3), 'status', 'pending'
        ))
      )
    )
  );
$$;

revoke all on function public.is_active_duel_topic(text) from public, anon, authenticated;
grant execute on function public.is_active_duel_topic(text) to anon;

-- The anon JWT identifies the application. The private, unguessable topic
-- returned by the room API is the room-specific receive capability.
create policy "duel guests receive current room notifications"
on realtime.messages for select to anon
using (
  extension = 'broadcast'
  and topic = (select realtime.topic())
  and (select public.is_active_duel_topic(realtime.topic()))
);

create function public.rotate_duel_topic()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.realtime_topic := 'duel:' || gen_random_uuid()::text;
  return new;
end;
$$;

create trigger rotate_duel_topic
before update of seats, referee_key, spectators on public.duel_rooms
for each row when (
  old.seats is distinct from new.seats
  or old.referee_key is distinct from new.referee_key
  or old.spectators is distinct from new.spectators
)
execute function public.rotate_duel_topic();

create function public.notify_duel_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Existing subscribers fetch a new snapshot, including a rotated topic.
  perform realtime.send('{}'::jsonb, 'room_changed', old.realtime_topic, true);
  -- A waiting guest only receives a hint for their own decision or cancellation.
  if old.access_requests is distinct from new.access_requests then
    perform realtime.send('{}'::jsonb, 'room_changed', 'duel-wait:' || old.id::text || ':' || (request->>'id'), true)
    from jsonb_array_elements(old.access_requests) as request
    where request->>'status' = 'pending' and not (
      new.access_requests @> jsonb_build_array(jsonb_build_object('id', request->>'id', 'status', 'pending'))
    );
  end if;
  return new;
exception when others then
  -- Realtime delivery is best effort. A signaling failure must never undo a match write.
  raise warning 'Duel Realtime notification failed (SQLSTATE %)', sqlstate;
  return new;
end;
$$;

revoke all on function public.notify_duel_change() from public, anon, authenticated;
create trigger notify_duel_change
after update of revision on public.duel_rooms
for each row when (old.revision is distinct from new.revision)
execute function public.notify_duel_change();
