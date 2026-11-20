import type { Metadata } from "next";
import DuelRoom from "@/components/DuelRoom";

export const metadata: Metadata = {
  title: "Đấu 1v1 | RukTimer",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function DuelPage({ searchParams }: { searchParams: Promise<{ room?: string; friends?: string }> }) {
  const { room, friends } = await searchParams;
  const id = typeof room === "string" ? room : "";
  return <DuelRoom key={id} initialRoom={id} lobbyFriends={friends === "1"} />;
}
