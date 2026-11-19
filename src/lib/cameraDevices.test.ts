import { describe, expect, it } from "vitest";
import {
  buildCameraConstraints,
  detectCameraFacing,
  getCameraFacingLabel,
  getOppositeFacingMode,
  isCameraSwitchLocked,
  normalizeVideoInputDevices,
  pickAlternateCameraDeviceId,
} from "./cameraDevices";

describe("cameraDevices helpers", () => {
  it("detects front and rear camera facing from settings or labels and returns null for desktop webcams", () => {
    expect(detectCameraFacing("user", "")).toBe("user");
    expect(detectCameraFacing("environment", "")).toBe("environment");
    expect(detectCameraFacing(undefined, "Front Camera")).toBe("user");
    expect(detectCameraFacing(undefined, "Camera sau 0")).toBe("environment");
    expect(detectCameraFacing(undefined, "Windows Virtual Camera")).toBeNull();
    expect(detectCameraFacing(undefined, "Logitech C920 HD Pro")).toBeNull();

    expect(getCameraFacingLabel("user")).toBe("Camera trước");
    expect(getCameraFacingLabel("environment")).toBe("Camera sau");
    expect(getCameraFacingLabel(null)).toBeNull();
  });

  it("toggles opposite facing mode and locks switching during countdown, recording, or active switch", () => {
    expect(getOppositeFacingMode("environment")).toBe("user");
    expect(getOppositeFacingMode("user")).toBe("environment");
    expect(getOppositeFacingMode(null)).toBe("user");

    expect(
      isCameraSwitchLocked({
        isRecording: false,
        countdownActive: false,
        switching: false,
      })
    ).toBe(false);
    expect(
      isCameraSwitchLocked({
        isRecording: true,
        countdownActive: false,
        switching: false,
      })
    ).toBe(true);
    expect(
      isCameraSwitchLocked({
        isRecording: false,
        countdownActive: true,
        switching: false,
      })
    ).toBe(true);
    expect(
      isCameraSwitchLocked({
        isRecording: false,
        countdownActive: false,
        switching: true,
      })
    ).toBe(true);
  });

  it("normalizes video inputs and preserves virtual/external camera labels", () => {
    const normalized = normalizeVideoInputDevices([
      { kind: "audioinput", deviceId: "mic-1", label: "Mic" },
      { kind: "videoinput", deviceId: "cam-1", label: "Windows Virtual Camera" },
      { kind: "videoinput", deviceId: "cam-2", label: "" },
    ]);
    expect(normalized).toEqual([
      { deviceId: "cam-1", label: "Windows Virtual Camera" },
      { deviceId: "cam-2", label: "Camera 2" },
    ]);
  });

  it("picks an alternate camera device matching target facing or cycling to the next device", () => {
    const mobileDevices = [
      { deviceId: "rear-id", label: "Back Camera" },
      { deviceId: "front-id", label: "Front Camera" },
    ];
    expect(pickAlternateCameraDeviceId(mobileDevices, "rear-id", "user")).toBe(
      "front-id"
    );

    const laptopDevices = [
      { deviceId: "integrated", label: "Integrated Webcam" },
      { deviceId: "virtual", label: "Windows Virtual Camera" },
    ];
    expect(
      pickAlternateCameraDeviceId(laptopDevices, "integrated", "user")
    ).toBe("virtual");
    expect(
      pickAlternateCameraDeviceId([laptopDevices[0]], "integrated", "user")
    ).toBeNull();
  });

  it("builds video-only constraints for deviceId or facingMode", () => {
    expect(buildCameraConstraints({ deviceId: "virtual-cam" })).toEqual({
      video: { deviceId: { exact: "virtual-cam" } },
      audio: false,
    });
    expect(
      buildCameraConstraints({ facingMode: "user", exactFacing: true })
    ).toEqual({
      video: { facingMode: { exact: "user" } },
      audio: false,
    });
    expect(buildCameraConstraints({ facingMode: "environment" })).toEqual({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
  });
});
