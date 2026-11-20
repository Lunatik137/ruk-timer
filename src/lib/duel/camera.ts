export type CameraDescription = { id: string; sdp: string };
export type CameraSignals = Record<string, {
  session: string;
  offer?: CameraDescription;
  answer?: CameraDescription;
}>;
export type CameraPeer = {
  id: string;
  session: string;
  name: string;
  publishing: boolean;
  offer?: CameraDescription;
  answer?: CameraDescription;
};
export type CameraSnapshot = { peers: CameraPeer[]; iceServers: RTCIceServer[] };
