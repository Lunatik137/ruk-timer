// Synthesized sound effects via Web Audio API + Optional WCA Voice Referee (Web Speech API)

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (Ctx) {
      audioCtx = new Ctx();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function playBeep(freq = 880, durationMs = 120, volume = 0.12) {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      ctx.currentTime + durationMs / 1000
    );

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
  } catch {
    // Ignore audio context errors if user hasn't interacted yet
  }
}

export function speakRefereeCall(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "en-US";
    utter.rate = 1.15;
    utter.volume = 0.85;
    window.speechSynthesis.speak(utter);
  } catch {
    // Ignore speech synthesis errors
  }
}

export function playInspection8s(voiceEnabled = false) {
  playBeep(740, 140, 0.15);
  if (voiceEnabled) {
    speakRefereeCall("Eight seconds");
  }
}

export function playInspection12s(voiceEnabled = false) {
  playBeep(988, 110, 0.18);
  setTimeout(() => playBeep(988, 140, 0.18), 160);
  if (voiceEnabled) {
    speakRefereeCall("Twelve seconds");
  }
}

export function playSplitTick() {
  playBeep(660, 55, 0.1);
}

export function playPbCelebration() {
  playBeep(523.25, 100, 0.12); // C5
  setTimeout(() => playBeep(659.25, 100, 0.12), 110); // E5
  setTimeout(() => playBeep(783.99, 120, 0.12), 220); // G5
  setTimeout(() => playBeep(1046.5, 220, 0.15), 340); // C6
}
