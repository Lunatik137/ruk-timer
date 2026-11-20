"use client";

import { useEffect, useRef, useState } from "react";
import { Timer } from "lucide-react";
import { formatTimeMs } from "@/lib/stats";
import type { Result } from "@/lib/duel/match";
import type { PenaltyType } from "@/types/cubing";

type Phase = "idle" | "armed" | "inspection" | "running" | "review";

export default function DuelTimer({ busy, inspection, submit }: { busy: boolean; inspection: boolean; submit: (result: Result) => void }) {
  const initialPhase = inspection ? "idle" : "armed";
  const phase = useRef<Phase>(initialPhase);
  const inspectionAt = useRef(0);
  const startedAt = useRef(0);
  const heldAt = useRef<number | null>(null);
  const source = useRef<"keyboard" | "pointer" | null>(null);
  const automaticPenalty = useRef<PenaltyType>("OK");
  const focusInspection = useRef(false);
  const surface = useRef<HTMLButtonElement>(null);
  const [screen, setScreen] = useState<Phase>(initialPhase);
  const [clock, setClock] = useState(0);
  const [holding, setHolding] = useState(false);
  const [ready, setReady] = useState(false);
  const [result, setResult] = useState<Result>({ ms: 0, penalty: "OK" });

  function change(next: Phase) {
    phase.current = next;
    setScreen(next);
  }

  function cancelHold() {
    heldAt.current = null;
    source.current = null;
    setHolding(false);
    setReady(false);
  }

  function review(value: Result) {
    cancelHold();
    setResult(value);
    change("review");
  }

  function down(input: "keyboard" | "pointer") {
    if (phase.current === "running") {
      const elapsed = performance.now() - startedAt.current;
      review(elapsed >= 600_000 ? { ms: 0, penalty: "DNF" } :
        { ms: Math.max(10, Math.floor(elapsed)), penalty: automaticPenalty.current });
    } else if ((phase.current === "inspection" || phase.current === "armed") && heldAt.current === null) {
      heldAt.current = performance.now();
      source.current = input;
      setHolding(true);
    }
  }

  function up(input: "keyboard" | "pointer") {
    if (source.current !== input || heldAt.current === null) return;
    const now = performance.now();
    const armed = now - heldAt.current >= 300;
    cancelHold();
    if (!armed || (phase.current !== "inspection" && phase.current !== "armed")) return;
    const elapsed = phase.current === "inspection" ? now - inspectionAt.current : 0;
    if (elapsed >= 17_000) return review({ ms: 0, penalty: "DNF" });
    automaticPenalty.current = elapsed >= 15_000 ? "+2" : "OK";
    startedAt.current = now;
    setClock(0);
    change("running");
  }

  useEffect(() => {
    if (screen !== "inspection" && screen !== "running" && screen !== "armed") return;
    let frame: number;
    function tick(now: number) {
      if (phase.current === "inspection" || phase.current === "armed") {
        const held = heldAt.current;
        setReady(held !== null && now - held >= 300);
        if (phase.current === "inspection") {
          const elapsed = now - inspectionAt.current;
          if (elapsed >= 17_000) return review({ ms: 0, penalty: "DNF" });
          setClock(Math.ceil(Math.max(0, 15_000 - elapsed) / 1000));
        }
      } else if (phase.current === "running") {
        const elapsed = now - startedAt.current;
        if (elapsed >= 600_000) return review({ ms: 0, penalty: "DNF" });
        setClock(elapsed);
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);

    function keyDown(event: KeyboardEvent) {
      if (event.code !== "Space" || event.isComposing || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && target !== surface.current &&
          target.closest("button, input, textarea, select, a[href], summary, video, audio, [contenteditable]")) return;
      event.preventDefault();
      down("keyboard");
    }
    function keyUp(event: KeyboardEvent) {
      if (event.code !== "Space" || source.current !== "keyboard") return;
      event.preventDefault();
      up("keyboard");
    }
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", cancelHold);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", cancelHold);
    };
  }, [screen]);

  useEffect(() => {
    if (screen === "inspection" && focusInspection.current) {
      focusInspection.current = false;
      surface.current?.focus({ preventScroll: true });
    }
  }, [screen]);

  if (screen === "idle") return (
    <div className="space-y-2">
      <button type="button" className="rk-primary w-full justify-center" disabled={busy} onClick={(event) => {
        focusInspection.current = event.detail === 0;
        inspectionAt.current = performance.now();
        setClock(15);
        change("inspection");
      }}>
        <Timer aria-hidden="true" size={18} /> Bắt đầu Inspection (15 giây)
      </button>
      <p className="px-1 text-sm text-slate-300">Khi sẵn sàng giải, giữ Space hoặc chạm giữ đồng hồ.</p>
    </div>
  );

  if (screen === "review") {
    const allowed: PenaltyType[] = result.ms === 0 ? ["DNF"] : automaticPenalty.current === "+2" ? ["+2", "DNF"] : ["OK", "+2", "DNF"];
    return (
      <div className="space-y-4">
        <p className="font-mono text-4xl tabular-nums">{result.ms ? formatTimeMs(result.ms, 2) : "DNF"}</p>
        <fieldset disabled={busy} className="flex flex-wrap gap-2">
          <legend className="mb-2 text-sm text-slate-300">Án phạt</legend>
          {allowed.map((penalty) => (
            <label key={penalty} className="rk-control cursor-pointer">
              <input type="radio" name="duel-penalty" checked={result.penalty === penalty}
                onChange={() => setResult({ ...result, penalty })} />
              {penalty}
            </label>
          ))}
        </fieldset>
        <button type="button" className="rk-primary w-full justify-center disabled:opacity-50" disabled={busy} onClick={() => submit(result)}>
          {busy ? "Đang gửi…" : "Gửi kết quả"}
        </button>
      </div>
    );
  }

  const running = screen === "running";
  return (
    <div className="space-y-3">
      <button
        ref={surface}
        type="button"
        aria-label={running ? "Dừng đồng hồ" : "Giữ Space hoặc chạm giữ để bắt đầu giải"}
        className="grid min-h-36 w-full touch-none select-none content-center justify-items-center gap-2 rounded-xl border border-white/15 bg-[var(--rk-canvas)] p-3 focus-visible:outline-offset-[-3px] sm:min-h-44"
        onPointerDown={(event) => {
          if (event.button !== 0 || !event.isPrimary) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          down("pointer");
        }}
        onPointerUp={() => up("pointer")}
        onPointerCancel={cancelHold}
        onLostPointerCapture={cancelHold}
        onClick={(event) => { if (event.detail === 0 && phase.current === "running") down("keyboard"); }}
      >
        <span aria-hidden="true" className="text-sm font-medium text-slate-300">{running ? "Đang giải" : screen === "inspection" ? "Inspection" : "Đồng hồ"}</span>
        <span aria-hidden="true" className={`font-mono text-5xl tabular-nums sm:text-7xl ${ready ? "text-green-300" : holding || !running ? "text-amber-300" : "text-white"}`}>
          {running || screen === "armed" ? formatTimeMs(clock, 2) : clock || "+2"}
        </span>
      </button>
      <p role="status" className="text-sm text-slate-300">
        {running ? "Space hoặc chạm để dừng" : ready ? "Thả để bắt đầu giải" : "Giữ Space hoặc chạm giữ đến khi đồng hồ chuyển xanh."}
      </p>
    </div>
  );
}
