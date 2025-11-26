"use client";

import { Button } from "@/components/ui/button";
import { Camera, CameraOff, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export default function CameraStream() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);

  const startCamera = async () => {
    try {
      setError(null);
      const constraints = {
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(
        constraints
      );
      setStream(mediaStream);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play();
        setIsActive(true);
      }
    } catch (err: any) {
      console.error("Camera error:", err);
      setError(err.message || "Failed to access camera");
      setIsActive(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
      setIsActive(false);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    // Auto-start camera on mount
    startCamera();

    return () => {
      // Cleanup on unmount
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return (
    <div className="flex flex-col h-full gap-2">
      <div className="flex-1 bg-black rounded-md overflow-hidden relative min-h-[200px]">
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-white p-4">
            <div className="text-center space-y-2">
              <CameraOff className="h-8 w-8 mx-auto text-red-400" />
              <p className="text-sm">Camera Error</p>
              <p className="text-xs text-gray-400">{error}</p>
            </div>
          </div>
        ) : !isActive ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-white">
            <div className="text-center space-y-2">
              <Camera className="h-8 w-8 mx-auto text-gray-400" />
              <p className="text-sm">Starting camera...</p>
            </div>
          </div>
        ) : null}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="w-full h-full object-cover"
        />
      </div>

      <div className="flex justify-center gap-2">
        {isActive ? (
          <Button onClick={stopCamera} size="sm" variant="destructive">
            <CameraOff className="h-3 w-3 mr-1" />
            Stop
          </Button>
        ) : (
          <Button onClick={startCamera} size="sm">
            <Camera className="h-3 w-3 mr-1" />
            Start
          </Button>
        )}
        <Button
          onClick={() => {
            stopCamera();
            setTimeout(startCamera, 100);
          }}
          size="sm"
          variant="outline"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
