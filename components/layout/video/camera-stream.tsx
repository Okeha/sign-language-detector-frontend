"use client";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { PauseIcon, PlayIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export default function CameraStream() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>(
    []
  );
  useEffect(() => {
    let mounted = true;
    async function start() {
      try {
        setError(null);
        const constraints = {
          video: deviceId
            ? { deviceId: { exact: deviceId } }
            : {
                facingMode: { ideal: facing },
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 },
              },
          audio: false,
        };

        const mediaStream = await navigator.mediaDevices.getUserMedia(
          constraints
        );

        if (!mounted) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }
        setStream(mediaStream);

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;

          await videoRef.current.play().catch(() => {});
        }
      } catch (err: any) {
        setError(err.message);
        setStream(null);
      }
    }
    start();
    return () => {
      if (stream) stream.getTracks().forEach((track) => track.stop());
    };
  }, [facing, deviceId]);
  return (
    <div className="bg-white/50 min-h-[100vh] flex-1 rounded-xl md:min-h-[70vh] video-container">
      <video
        style={{
          width: "80%",
          height: "90%",
          //   objectFit: "contain",
          objectFit: "cover",
          margin: "auto",
        }}
        ref={videoRef}
        playsInline
        muted
        autoPlay
      />

      <div className="mt-4 flex justify-center">
        <Button className="video-control-button">
          <PlayIcon />
        </Button>
        <Separator
          orientation="vertical"
          className="mx-2 h-6"
          style={{ color: "gainsboro" }}
        />
        <Button className="video-control-button">
          <PauseIcon />
        </Button>
      </div>
    </div>
  );
}
