export type CameraFacingMode = "user" | "environment";

export interface CameraSourceOption {
  deviceId: string;
  label: string;
}

const FRONT_CAMERA_PATTERN = /\b(front|user|selfie|facetime|trước)\b/i;
const BACK_CAMERA_PATTERN = /\b(back|rear|environment|world|sau)\b/i;

/**
 * Infers camera facing direction from MediaTrackSettings and/or track label.
 * Returns null if the active camera cannot be reliably identified as front or rear
 * (e.g., external USB webcam or Windows Virtual Camera on a laptop).
 */
export function detectCameraFacing(
  facingMode?: string | null,
  label?: string | null
): CameraFacingMode | null {
  if (facingMode === "user") return "user";
  if (facingMode === "environment") return "environment";
  if (label) {
    if (FRONT_CAMERA_PATTERN.test(label)) return "user";
    if (BACK_CAMERA_PATTERN.test(label)) return "environment";
  }
  return null;
}

export function getCameraFacingLabel(
  facing: CameraFacingMode | null
): string | null {
  if (facing === "user") return "Camera trước";
  if (facing === "environment") return "Camera sau";
  return null;
}

export function getOppositeFacingMode(
  current: CameraFacingMode | null
): CameraFacingMode {
  return current === "user" ? "environment" : "user";
}

export function isCameraSwitchLocked(params: {
  isRecording: boolean;
  countdownActive: boolean;
  switching: boolean;
}): boolean {
  return params.isRecording || params.countdownActive || params.switching;
}

export function normalizeVideoInputDevices(
  devices: ReadonlyArray<{ kind: string; deviceId: string; label: string }>
): CameraSourceOption[] {
  const videoInputs = devices.filter(
    (device) => device.kind === "videoinput" && Boolean(device.deviceId)
  );
  return videoInputs.map((device, index) => ({
    deviceId: device.deviceId,
    label: device.label.trim() || `Camera ${index + 1}`,
  }));
}

/**
 * Picks the next camera deviceId when toggling cameras on a device with multiple
 * video inputs (or when facingMode constraints are unsupported).
 */
export function pickAlternateCameraDeviceId(
  devices: ReadonlyArray<CameraSourceOption>,
  currentDeviceId: string | null,
  targetFacing: CameraFacingMode
): string | null {
  if (devices.length < 2) return null;

  const targetMatch = devices.find(
    (device) =>
      device.deviceId !== currentDeviceId &&
      detectCameraFacing(null, device.label) === targetFacing
  );
  if (targetMatch) return targetMatch.deviceId;

  const currentIndex = devices.findIndex(
    (device) => device.deviceId === currentDeviceId
  );
  if (currentIndex >= 0) {
    return devices[(currentIndex + 1) % devices.length].deviceId;
  }
  return devices[0].deviceId;
}

export function buildCameraConstraints(options: {
  deviceId?: string | null;
  facingMode?: CameraFacingMode;
  exactFacing?: boolean;
}): MediaStreamConstraints {
  if (options.deviceId) {
    return {
      video: { deviceId: { exact: options.deviceId } },
      audio: false,
    };
  }
  const facing = options.facingMode ?? "environment";
  return {
    video: {
      facingMode: options.exactFacing ? { exact: facing } : { ideal: facing },
    },
    audio: false,
  };
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
