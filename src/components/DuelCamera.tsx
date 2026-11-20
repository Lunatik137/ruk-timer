"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Phone, PhoneOff, RefreshCcw, SwitchCamera, Video, VideoOff, Volume2 } from "lucide-react";
import type { CameraPeer, CameraSignals, CameraSnapshot } from "@/lib/duel/camera";

type RemoteMedia = { id: string; name: string; stream: MediaStream };
type Peer = { session: string; pc: RTCPeerConnection; id: string; answered?: boolean };
type Session = { stream: MediaStream | null; id: string };
type Device = "video" | "audio";

async function gather(pc: RTCPeerConnection): Promise<string | null> {
  if (pc.iceGatheringState !== "complete") {
    await new Promise<void>((resolve) => {
      function finish() {
        clearTimeout(timeout);
        pc.removeEventListener("icegatheringstatechange", changed);
        resolve();
      }
      function changed() { if (pc.iceGatheringState === "complete") finish(); }
      const timeout = setTimeout(finish, 4000);
      pc.addEventListener("icegatheringstatechange", changed);
    });
  }
  return pc.localDescription?.sdp ?? null;
}

function LiveMedia({ stream, label, preview = false }: { stream: MediaStream; label: string; preview?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [blocked, setBlocked] = useState(false);
  const hasVideo = stream.getVideoTracks().length > 0;
  const audioOnly = !preview && !hasVideo && stream.getAudioTracks().length > 0;
  useEffect(() => {
    const media = videoRef.current ?? audioRef.current;
    if (!media) return;
    let active = true;
    media.srcObject = stream;
    void media.play().then(() => { if (active) setBlocked(false); }, () => { if (active) setBlocked(true); });
    return () => { active = false; media.srcObject = null; };
  }, [stream, hasVideo, audioOnly]);
  return <figure className="relative min-w-0">
    {hasVideo && <video ref={videoRef} autoPlay playsInline muted={preview}
      className="block aspect-video w-full bg-black object-contain" aria-label={label} />}
    {audioOnly && <audio ref={audioRef} autoPlay aria-label={label} />}
    <figcaption className={`flex min-w-0 items-center gap-1 px-2 py-1 text-xs text-white [overflow-wrap:anywhere] ${hasVideo ? "absolute inset-x-0 bottom-0 bg-black/70" : ""}`}>
      {!hasVideo && <Volume2 size={16} aria-hidden="true" />}{label}
    </figcaption>
    {blocked && !preview && <button type="button" className="rk-control absolute left-2 top-2 z-10" onClick={() => {
      void (videoRef.current ?? audioRef.current)?.play().then(() => setBlocked(false), () => setBlocked(true));
    }}>Phát luồng của {label}</button>}
  </figure>;
}

export default function DuelCamera({ room, player, canJoin }: { room: string; player: boolean; canJoin: boolean }) {
  const [session, setSession] = useState<Session | null>(null);
  const [devices, setDevices] = useState<MediaStream | null>(null);
  const [media, setMedia] = useState<RemoteMedia[]>([]);
  const [error, setError] = useState("");
  const [canReconnect, setCanReconnect] = useState(false);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [pending, setPending] = useState<Device | null>(null);
  const request = useRef(0);
  const local = useRef<MediaStream | null>(null);

  useEffect(() => () => {
    request.current++;
    local.current?.getTracks().forEach((track) => track.stop());
  }, []);

  function stop() {
    request.current++;
    local.current?.getTracks().forEach((track) => track.stop());
    local.current = null;
    setPending(null);
    setDevices(null);
    setMedia([]);
    setSession(null);
    setError("");
    setCanReconnect(false);
  }

  useEffect(() => {
    if (!player && (local.current || pending)) stop();
  }, [player, pending]);

  function updateDevices(stream: MediaStream | null) {
    setError("");
    setCanReconnect(false);
    local.current = stream;
    setDevices(stream);
    setMedia([]);
    const id = crypto.randomUUID();
    setSession((active) => active ? { stream, id } : null);
  }

  function connectMedia() {
    setError("");
    setCanReconnect(false);
    setMedia([]);
    setSession({ stream: local.current, id: crypto.randomUUID() });
  }

  function disable(track: MediaStreamTrack) {
    const remaining = local.current?.getTracks().filter((item) => item !== track && item.readyState === "live") ?? [];
    track.stop();
    updateDevices(remaining.length ? new MediaStream(remaining) : null);
  }

  async function share(device: Device, nextFacing = facing, switching = false) {
    const expected = ++request.current;
    setPending(device);
    setError("");
    const open = (direction: typeof facing, exact = false) => navigator.mediaDevices.getUserMedia({
      audio: device === "audio" && { echoCancellation: true, noiseSuppression: true },
      video: device === "video" && {
        width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 24, max: 30 },
        facingMode: exact ? { exact: direction } : { ideal: direction },
      },
    });
    const oldCamera = switching ? local.current?.getVideoTracks()[0] : undefined;
    oldCamera?.stop();
    let restored = false;
    try {
      let stream: MediaStream;
      try {
        stream = await open(nextFacing, switching);
      } catch (failure) {
        if (!oldCamera || expected !== request.current) throw failure;
        restored = true;
        stream = await open(facing);
      }
      if (expected !== request.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const [track] = stream.getTracks();
      if (!track) throw new Error("Missing capture track");
      track.addEventListener("ended", () => {
        if (local.current?.getTracks().includes(track)) {
          disable(track);
          setError(device === "video" ? "Camera đã ngắt. Bạn có thể bật lại." : "Mic đã ngắt. Bạn có thể bật lại.");
        }
      }, { once: true });
      const previous = local.current?.getTracks() ?? [];
      if (device === "video") {
        setFacing(track.getSettings().facingMode === "environment" ? "environment" : track.getSettings().facingMode === "user" ? "user" : restored ? facing : nextFacing);
        previous.filter((item) => item.kind === "video").forEach((item) => item.stop());
      }
      updateDevices(new MediaStream([...previous.filter((item) => item.kind !== track.kind), track]));
      if (restored) setError("Không đổi được camera. Đang dùng lại camera trước đó.");
    } catch {
      if (expected === request.current) {
        if (oldCamera) disable(oldCamera);
        setError(switching ? "Không đổi được camera. Bạn có thể bật lại camera."
          : device === "video" ? "Không mở được camera. Hãy kiểm tra quyền camera rồi thử lại."
            : "Không mở được mic. Hãy kiểm tra quyền mic rồi thử lại.");
      }
    } finally {
      if (expected === request.current) setPending(null);
    }
  }

  useEffect(() => {
    if (!session) return;
    const { id, stream } = session;
    const controller = new AbortController();
    const outgoing = new Map<string, Peer>();
    const incoming = new Map<string, Peer>();
    const signals: CameraSignals = {};
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    let lastAnswer = Date.now();

    function message(peer: CameraPeer) {
      if (signals[peer.id]?.session !== peer.session) signals[peer.id] = { session: peer.session };
      return signals[peer.id];
    }

    function peerConnection(iceServers: RTCIceServer[]) {
      const pc = new RTCPeerConnection({ iceServers });
      pc.onconnectionstatechange = () => {
        if (!controller.signal.aborted && pc.connectionState === "failed") {
          setCanReconnect(true);
          setError("Hình và tiếng bị ngắt.");
        }
      };
      return pc;
    }

    function connectingError() {
      if (!controller.signal.aborted) {
        setCanReconnect(true);
        setError("Chưa kết nối được hình và tiếng.");
      }
    }

    async function watch(peer: CameraPeer, iceServers: RTCIceServer[]) {
      const pc = peerConnection(iceServers);
      const offerId = crypto.randomUUID();
      const entry = { pc, session: peer.session, id: offerId };
      incoming.set(peer.id, entry);
      pc.addTransceiver("video", { direction: "recvonly" });
      pc.addTransceiver("audio", { direction: "recvonly" });
      const remoteStream = new MediaStream();
      pc.ontrack = ({ track }) => {
        if (controller.signal.aborted || incoming.get(peer.id) !== entry) return;
        remoteStream.addTrack(track);
        const feed = { id: peer.id, name: peer.name, stream: remoteStream };
        setMedia((current) => [...current.filter((item) => item.id !== peer.id), feed]);
      };
      await pc.setLocalDescription(await pc.createOffer());
      const sdp = await gather(pc);
      if (sdp && incoming.get(peer.id) === entry && !controller.signal.aborted) message(peer).offer = { id: offerId, sdp };
    }

    async function publish(peer: CameraPeer, iceServers: RTCIceServer[]) {
      if (!stream || !peer.offer) return;
      const offer = peer.offer;
      const pc = peerConnection(iceServers);
      const entry = { pc, session: peer.session, id: offer.id };
      outgoing.get(peer.id)?.pc.close();
      delete message(peer).answer;
      outgoing.set(peer.id, entry);
      await pc.setRemoteDescription({ type: "offer", sdp: offer.sdp });
      for (const transceiver of pc.getTransceivers()) {
        const track = stream.getTracks().find((item) => item.kind === transceiver.receiver.track.kind);
        if (track) await transceiver.sender.replaceTrack(track);
        transceiver.direction = track ? "sendonly" : "inactive";
      }
      await pc.setLocalDescription(await pc.createAnswer());
      const sdp = await gather(pc);
      if (sdp && outgoing.get(peer.id) === entry && !controller.signal.aborted) message(peer).answer = { id: offer.id, sdp };
    }

    function sync({ peers, iceServers }: CameraSnapshot) {
      for (const [peerId, entry] of incoming) {
        if (!peers.some((peer) => peer.id === peerId && peer.session === entry.session && peer.publishing)) {
          incoming.delete(peerId);
          entry.pc.close();
          if (signals[peerId]) delete signals[peerId].offer;
          setMedia((current) => current.filter((item) => item.id !== peerId));
        }
      }
      for (const [peerId, entry] of outgoing) {
        if (!peers.some((peer) => peer.id === peerId && peer.session === entry.session && peer.offer?.id === entry.id)) {
          outgoing.delete(peerId);
          entry.pc.close();
          if (signals[peerId]) delete signals[peerId].answer;
        }
      }
      for (const peerId of Object.keys(signals)) {
        if (!peers.some((peer) => peer.id === peerId)) delete signals[peerId];
      }
      for (const peer of peers) {
        const receiver = incoming.get(peer.id);
        if (peer.publishing && !receiver) void watch(peer, iceServers).catch(connectingError);
        if (receiver && !receiver.answered && peer.answer?.id === receiver.id) {
          receiver.answered = true;
          void receiver.pc.setRemoteDescription({ type: "answer", sdp: peer.answer.sdp }).catch(connectingError);
        }
        if (stream && peer.offer && outgoing.get(peer.id)?.id !== peer.offer.id) void publish(peer, iceServers).catch(connectingError);
      }
    }

    async function poll() {
      const attempt = new AbortController();
      const cancel = () => attempt.abort();
      controller.signal.addEventListener("abort", cancel, { once: true });
      const deadline = setTimeout(cancel, 5000);
      try {
        const res = await fetch("/api/duel/camera", {
          method: "POST", headers: { "Content-Type": "application/json" }, signal: attempt.signal,
          body: JSON.stringify({ room, session: id, publishing: Boolean(stream), signals }),
        });
        if (controller.signal.aborted) return;
        if (res.status === 403 || res.status === 404) {
          stop();
          setError("Cuộc gọi đã kết thúc.");
          return;
        }
        if (!res.ok) throw new Error("Camera signaling unavailable");
        const snapshot: CameraSnapshot = await res.json();
        if (controller.signal.aborted) return;
        if (failures) setError("");
        failures = 0;
        lastAnswer = Date.now();
        sync(snapshot);
      } catch {
        if (controller.signal.aborted) return;
        failures++;
        if (Date.now() - lastAnswer > 12_000) {
          stop();
          setError("Mất kết nối với phòng. Bạn có thể vào lại cuộc gọi.");
          return;
        }
        setError("Đang kết nối lại cuộc gọi…");
      } finally {
        clearTimeout(deadline);
        controller.signal.removeEventListener("abort", cancel);
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 1500);
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
      for (const peer of [...incoming.values(), ...outgoing.values()]) peer.pc.close();
      void fetch("/api/duel/camera", {
        method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
        body: JSON.stringify({ room, session: id, publishing: false, signals: {}, close: true }),
      }).catch(() => {});
    };
  }, [room, session]);

  const camera = player && devices?.getVideoTracks()[0];
  const mic = player && devices?.getAudioTracks()[0];
  const toggles = "grid size-11 shrink-0 place-items-center rounded-full border border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 disabled:opacity-50";
  const hasRemoteVideo = media.some((item) => item.stream.getVideoTracks().length > 0);
  const cameraLabel = camera ? "Tắt camera" : "Bật camera";
  const micLabel = mic ? "Tắt mic" : "Bật mic";

  return <section className="rk-panel space-y-3 p-3 sm:p-4" aria-labelledby="duel-camera-heading">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="duel-camera-heading" className="text-sm font-semibold">{session ? "Cuộc gọi" : "Camera và mic"}</h2>
      {session && <span className="text-xs text-slate-300">Đã vào cuộc gọi</span>}
    </div>
    <div className="relative isolate grid overflow-hidden rounded-xl bg-[var(--rk-canvas)]">
      {!hasRemoteVideo && <div className="grid aspect-video content-center justify-items-center gap-2 p-3 text-center text-sm text-slate-300">
        <VideoOff aria-hidden="true" size={24} />
        {session ? "Chưa có camera đối thủ" : "Camera chưa phát vào phòng"}
      </div>}
      {media.filter((item) => item.stream.getVideoTracks().length > 0).map((item) =>
        <LiveMedia key={item.id} stream={item.stream} label={item.name} />)}
      {camera && devices && <div className={session
        ? "absolute bottom-8 right-2 z-20 w-[30%] min-w-[5rem] max-w-36 overflow-hidden rounded-lg border border-white/30 shadow-md"
        : "absolute inset-0 overflow-hidden rounded-xl"}>
        <LiveMedia stream={devices} label="Bạn" preview />
      </div>}
    </div>
    {media.filter((item) => item.stream.getVideoTracks().length === 0).map((item) =>
      <div className="min-h-8 rounded-lg bg-[var(--rk-canvas)]" key={item.id}><LiveMedia stream={item.stream} label={item.name} /></div>)}
    <div className="flex flex-wrap items-center justify-center gap-2" role="group" aria-label="Điều khiển cuộc gọi">
      {player && <>
        <button type="button" className={toggles} aria-pressed={Boolean(mic)} aria-label={micLabel} title={micLabel} disabled={pending !== null}
          onClick={() => mic ? disable(mic) : void share("audio")}>
          {mic ? <Mic size={18} aria-hidden="true" /> : <MicOff size={18} aria-hidden="true" />}
        </button>
        <button type="button" className={toggles} aria-pressed={Boolean(camera)} aria-label={cameraLabel} title={cameraLabel} disabled={pending !== null}
          onClick={() => camera ? disable(camera) : void share("video")}>
          {camera ? <Video size={18} aria-hidden="true" /> : <VideoOff size={18} aria-hidden="true" />}
        </button>
        <button type="button" className={toggles} aria-label="Đổi camera" title="Đổi camera" disabled={pending !== null}
          onClick={() => void share("video", facing === "user" ? "environment" : "user", true)}>
          <SwitchCamera size={18} aria-hidden="true" />
        </button>
      </>}
      {!session && canJoin && <button type="button" className="rk-control" disabled={pending !== null} onClick={connectMedia}>
        <Phone size={16} aria-hidden="true" /> Vào cuộc gọi
      </button>}
      {session && canReconnect && <button type="button" className={toggles} aria-label="Kết nối lại cuộc gọi" title="Kết nối lại cuộc gọi" disabled={pending !== null} onClick={connectMedia}>
        <RefreshCcw size={18} aria-hidden="true" />
      </button>}
      {(session || pending) && <button type="button" className={`${toggles} border-rose-400/40 bg-rose-500/15 text-rose-200`} aria-label={session ? "Rời cuộc gọi" : "Hủy yêu cầu"} title={session ? "Rời cuộc gọi" : "Hủy yêu cầu"} onClick={stop}>
        <PhoneOff size={18} aria-hidden="true" />
      </button>}
    </div>
    {pending && <p role="status" className="text-center text-xs text-slate-300">Đang mở {pending === "video" ? "camera" : "mic"}…</p>}
    {error && <p role="status" className="text-sm text-amber-200">{error}</p>}
  </section>;
}
