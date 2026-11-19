// Lightweight per-user in-memory burst guard (supplements Postgres daily quota)
const burstHitsByUser = new Map<string, number[]>();

export const DEFAULT_BURST_WINDOW_MS = 60_000;
export const DEFAULT_BURST_MAX_REQUESTS = 5;

export function checkBurstLimit(
  userId: string,
  nowMs = Date.now(),
  maxReq = DEFAULT_BURST_MAX_REQUESTS,
  windowMs = DEFAULT_BURST_WINDOW_MS
): { allowed: boolean; retryAfterSec: number } {
  const prev = burstHitsByUser.get(userId) ?? [];
  const recent = prev.filter((ts) => nowMs - ts < windowMs);
  if (recent.length >= maxReq) {
    const oldest = recent[0];
    const retryAfterSec = Math.max(
      1,
      Math.ceil((windowMs - (nowMs - oldest)) / 1000)
    );
    burstHitsByUser.set(userId, recent);
    return { allowed: false, retryAfterSec };
  }
  recent.push(nowMs);
  burstHitsByUser.set(userId, recent);
  return { allowed: true, retryAfterSec: 0 };
}

export function resetBurstLimiter(): void {
  burstHitsByUser.clear();
}
