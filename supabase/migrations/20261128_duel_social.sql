create table public.duel_room_chat (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.duel_rooms(id) on delete cascade,
  sender_key text not null,
  sender_name text not null check (char_length(sender_name) between 1 and 32),
  body text not null check (char_length(btrim(body)) between 1 and 400),
  sent_at timestamptz not null default now(),
  bucket bigint not null default floor(extract(epoch from now())),
  unique (room_id, sender_key, bucket)
);
create index duel_room_chat_recent_idx on public.duel_room_chat (room_id, sent_at desc, id desc);

create table public.duel_social_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  friend_code uuid not null unique default gen_random_uuid(),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 32)
);

create table public.duel_friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references public.duel_social_profiles(user_id) on delete cascade,
  recipient uuid not null references public.duel_social_profiles(user_id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz not null default now(),
  request_bucket bigint not null default floor(extract(epoch from now()) / 5),
  check (requester <> recipient),
  unique (requester, request_bucket)
);
create unique index duel_friendships_pair_idx on public.duel_friendships (least(requester, recipient), greatest(requester, recipient));
create index duel_friendships_inbox_idx on public.duel_friendships (recipient, created_at desc);
create index duel_friendships_sent_idx on public.duel_friendships (requester, created_at desc);

create table public.duel_friend_chat (
  id uuid primary key default gen_random_uuid(),
  friendship_id uuid not null references public.duel_friendships(id) on delete cascade,
  sender_id uuid not null references public.duel_social_profiles(user_id) on delete cascade,
  body text check (char_length(btrim(body)) between 1 and 400),
  room_id uuid references public.duel_rooms(id) on delete cascade,
  sent_at timestamptz not null default now(),
  bucket bigint not null default floor(extract(epoch from now())),
  check ((body is null) <> (room_id is null)),
  unique (friendship_id, sender_id, bucket)
);
create index duel_friend_chat_recent_idx on public.duel_friend_chat (friendship_id, sent_at desc, id desc);
create index duel_friend_chat_room_idx on public.duel_friend_chat (room_id) where room_id is not null;

alter table public.duel_room_chat enable row level security;
alter table public.duel_social_profiles enable row level security;
alter table public.duel_friendships enable row level security;
alter table public.duel_friend_chat enable row level security;

revoke all on public.duel_room_chat, public.duel_social_profiles, public.duel_friendships, public.duel_friend_chat from public, anon, authenticated;
grant select, insert on public.duel_room_chat, public.duel_friend_chat to service_role;
grant select, insert, update on public.duel_social_profiles, public.duel_friendships to service_role;
