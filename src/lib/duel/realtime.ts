import { createClient } from "@supabase/supabase-js";

export function subscribeToDuelRoom(
  topic: string,
  signal: AbortSignal,
  onChange: () => void,
  onConnected: (connected: boolean) => void,
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || signal.aborted) return;

  // The socket uses the project's public API key, independent of app sign-in.
  const client = createClient(url, key, { accessToken: async () => null });
  const channel = client.channel(topic, { config: { private: true } })
    .on("broadcast", { event: "room_changed" }, () => { if (!signal.aborted) onChange(); });
  signal.addEventListener("abort", () => {
    client.realtime.disconnect();
    void client.removeChannel(channel).catch(() => {});
  }, { once: true });
  channel.subscribe((status) => {
    if (!signal.aborted) onConnected(status === "SUBSCRIBED");
  });
}
