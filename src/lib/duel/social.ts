export type ChatMessage = {
  id: string;
  sent_at: string;
  body: string | null;
  sender_name?: string;
  mine: boolean;
  room_id?: string | null;
};

export type FriendLink = {
  id: string;
  name: string;
  status: "pending" | "accepted";
  incoming: boolean;
};

export function chatBody(value: unknown) {
  if (typeof value !== "string") return null;
  const body = value.trim();
  return body.length > 0 && body.length <= 400 ? body : null;
}


export type FriendSearchResult = {
  id: string;
  name: string;
  tag: string;
  status: FriendLink["status"] | null;
  incoming: boolean;
};

export function friendSearchPrefix(value: string) {
  return value.trim().normalize("NFD").replace(/\p{M}/gu, "")
    .toLowerCase().replaceAll("đ", "d").replace(/[\\%_]/g, "\\$&");
}
