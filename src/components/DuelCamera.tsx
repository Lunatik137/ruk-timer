"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video, VideoOff, Volume2 } from "lucide-react";
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
  return <figure className="min-w-0 space-y-2">
    {hasVideo && <video ref={videoRef} autoPlay playsInline muted={preview}
      className="aspect-video w-full rounded-lg bg-black object-contain" aria-label={label} />}
    {audioOnly && <audio ref={audioRef} autoPlay aria-label={label} />}
    <figcaption className="flex items-center gap-2 break-words text-sm text-slate-300">
      {!hasVideo && <Volume2 size={16} aria-hidden="true" />}{label}
    </figcaption>
    {blocked && !preview && <button type="button" className="rk-control" onClick={() => {
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

  async function share(device: Device) {
    const expected = ++request.current;
    setPending(device);
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: device === "audio" && { echoCancellation: true, noiseSuppression: true },
        video: device === "video" && { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 30 } },
      });
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
      updateDevices(new MediaStream([...(local.current?.getTracks() ?? []), track]));
    } catch {
      if (expected === request.current) setError(device === "video"
        ? "Không mở được camera. Kiểm tra quyền camera trong trình duyệt rồi thử lại."
        : "Không mở được mic. Kiểm tra quyền mic trong trình duyệt rồi thử lại.");
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
  return <section className="rk-panel space-y-3 p-4 sm:p-5" aria-labelledby="duel-camera-heading">
    <h2 id="duel-camera-heading" className="flex items-center gap-2 text-lg font-semibold">
      <Video size={18} aria-hidden="true" /> {session ? "Hình và tiếng" : "Chuẩn bị cuộc gọi"}
    </h2>
    <p className="text-sm text-slate-300">{player && !session
      ? "Kiểm tra camera và mic trước khi vào. Chỉ thành viên phòng mới xem và nghe được sau khi bạn vào cuộc gọi."
      : player
      ? "Thành viên trong phòng có thể xem hoặc nghe khi bạn bật camera hoặc mic."
      : "Xem và nghe trực tiếp khi người chơi bật camera hoặc mic."}</p>
    <div className="flex flex-wrap gap-2">
      {player && <>
        <button type="button" className="rk-control" disabled={pending !== null}
          onClick={() => camera ? disable(camera) : void share("video")}>
          {camera ? <VideoOff size={16} aria-hidden="true" /> : <Video size={16} aria-hidden="true" />}
          {pending === "video" ? "Đang xin quyền camera…" : camera ? "Tắt camera" : "Bật camera"}
        </button>
        <button type="button" className="rk-control" disabled={pending !== null}
          onClick={() => mic ? disable(mic) : void share("audio")}>
          {mic ? <MicOff size={16} aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}
          {pending === "audio" ? "Đang xin quyền mic…" : mic ? "Tắt mic" : "Bật mic"}
        </button>
      </>}
      {!session && canJoin && <button type="button" className="rk-control" disabled={pending !== null}
        onClick={connectMedia}>Vào cuộc gọi</button>}
      {session && canReconnect && <button type="button" className="rk-control" disabled={pending !== null}
        onClick={connectMedia}>Kết nối lại hình và tiếng</button>}
      {(session || pending) && <button type="button" className="rk-control" onClick={stop}>{session ? "Rời cuộc gọi" : "Hủy yêu cầu"}</button>}
    </div>
    {error && <p role="status" className="text-sm text-amber-200">{error}</p>}
    {mic && <p role="status" className="text-sm text-slate-300">{session ? "Mic của bạn đang phát." : "Mic đã bật để kiểm tra."}</p>}
    {session && media.length === 0 && !error && <p role="status" className="text-sm text-slate-300">Đang chờ người chơi chia sẻ hình hoặc tiếng…</p>}
    {(camera || media.length > 0) && <div className="grid gap-3 sm:grid-cols-2">
      {camera && devices && <LiveMedia stream={devices} label={session ? "Camera của bạn · đang phát" : "Xem trước camera của bạn"} preview />}
      {media.map((item) => <LiveMedia key={item.id} stream={item.stream} label={item.name} />)}
    </div>}
  </section>;
}
