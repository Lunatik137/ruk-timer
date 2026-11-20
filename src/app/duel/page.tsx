import type { Metadata } from "next";
import DuelRoom from "@/components/DuelRoom";

export const metadata: Metadata = {
  title: "Đấu 1v1 | RukTimer",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function DuelPage({ searchParams }: { searchParams: Promise<{ room?: string }> }) {
  const { room } = await searchParams;
  return <DuelRoom initialRoom={typeof room === "string" ? room : ""} />;
}
