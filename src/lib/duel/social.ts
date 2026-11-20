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
