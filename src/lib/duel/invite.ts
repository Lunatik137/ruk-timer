const roomIdPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

export function isDuelRoomId(value: string) {
  return roomIdPattern.test(value);
}

export function readDuelInvite(input: string, origin: string): string | null {
  const value = input.trim();
  if (isDuelRoomId(value.toLowerCase())) return value.toLowerCase();
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin && url.origin !== "https://ruk-timer.vercel.app") return null;
    if (url.username || url.password || !["/duel", "/duel/"].includes(url.pathname)) return null;
    const rooms = url.searchParams.getAll("room");
    const id = rooms[0]?.toLowerCase();
    return rooms.length === 1 && isDuelRoomId(id) ? id : null;
  } catch {
    return null;
  }
}
