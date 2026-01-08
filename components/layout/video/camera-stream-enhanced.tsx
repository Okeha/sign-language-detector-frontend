"use client";

import { Button } from "@/components/ui/button";
import {
  Camera,
  CameraOff,
  RefreshCw,
  Activity,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import { useWebcam } from "@/hooks/use-webcam";
import { useFrameBuffer } from "@/hooks/use-frame-buffer";
import { useSignLanguageStream } from "@/hooks/use-sign-language-stream";
import { GlossPrediction } from "@/types/sign-language";

interface CameraStreamProps {
  onPrediction?: (prediction: GlossPrediction) => void;
  onSessionId?: (sessionId: string) => void;
  onStreamingChange?: (isStreaming: boolean) => void;
  backendUrl?: string;
  autoStart?: boolean;
}

export default function CameraStream({
  onPrediction,
  onSessionId,
  onStreamingChange,
  backendUrl = "ws://localhost:8000",
  autoStart = true,
}: CameraStreamProps) {
  const {
    videoRef,
    stream,
    isActive,
    error: cameraError,
    startCamera,
    stopCamera,
    captureFrame,
  } = useWebcam();

  const frameBuffer = useFrameBuffer(60); // 60 frames for 2 seconds at 30fps

  // Wrap onPrediction to add logging
  const handlePredictionWithLogging = useCallback(
    (prediction: GlossPrediction) => {
      console.log(
        "📹 [CAMERA] Prediction received from WebSocket:",
        prediction
      );
      console.log("📹 [CAMERA] Calling parent onPrediction callback");
      onPrediction?.(prediction);
    },
    [onPrediction]
  );

  const {
    isConnected,
    isStreaming,
    lastPrediction,
    error: wsError,
    sessionId,
    connect,
    disconnect,
    startStreaming,
    stopStreaming,
    sendFrames,
  } = useSignLanguageStream(
    backendUrl,
    handlePredictionWithLogging
  ) as ReturnType<typeof useSignLanguageStream> & {
    sendFrames: (frames: string[]) => boolean;
  };

  const frameIntervalRef = useRef<NodeJS.Timeout>();
  const sendIntervalRef = useRef<NodeJS.Timeout>();
  const [isMounted, setIsMounted] = useState(false);

  // Track client-side mount to prevent hydration mismatch
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Notify parent when streaming state changes
  useEffect(() => {
    if (onStreamingChange) {
      onStreamingChange(isStreaming);
    }
  }, [isStreaming, onStreamingChange]);

  // Pass sessionId to parent
  useEffect(() => {
    if (sessionId && onSessionId) {
      onSessionId(sessionId);
    }
  }, [sessionId, onSessionId]);

  // Auto-start camera and WebSocket on mount
  useEffect(() => {
    if (autoStart) {
      startCamera();
      connect();
    }

    return () => {
      stopCamera();
      disconnect();
    };
  }, [autoStart]);

  // Frame capture loop (30 fps)
  useEffect(() => {
    if (!isActive || !isStreaming) {
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
      }
      return;
    }

    console.log("📹 Camera frame capture started (30 fps)");
    frameIntervalRef.current = setInterval(() => {
      const frame = captureFrame();
      if (frame) {
        frameBuffer.addFrame(frame);
      }
    }, 1000 / 30); // 30 fps

    return () => {
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
      }
    };
  }, [isActive, isStreaming, captureFrame]);

  // Send frames to backend every 2 seconds when buffer is ready
  useEffect(() => {
    if (!frameBuffer.isReady || !isConnected || !isStreaming) {
      if (sendIntervalRef.current) {
        clearInterval(sendIntervalRef.current);
      }
      return;
    }

    // Send immediately when ready
    if (frameBuffer.frames.length === 60) {
      console.log("📤 Sending 60 frames to backend...");
      const success = sendFrames(frameBuffer.frames);
      if (success) {
        console.log("✅ Frames sent successfully");
        frameBuffer.clear();
      } else {
        console.error("❌ Failed to send frames");
      }
    }

    // Set up interval to send every 2 seconds
    sendIntervalRef.current = setInterval(() => {
      if (frameBuffer.isReady) {
        console.log("📤 Sending 60 frames to backend...");
        const success = sendFrames(frameBuffer.frames);
        if (success) {
          console.log("✅ Frames sent successfully");
          frameBuffer.clear();
        } else {
          console.error("❌ Failed to send frames");
        }
      }
    }, 2000);

    return () => {
      if (sendIntervalRef.current) {
        clearInterval(sendIntervalRef.current);
      }
    };
  }, [frameBuffer.isReady, isConnected, isStreaming]);

  const handleToggleStreaming = () => {
    if (isStreaming) {
      console.log("⏹️ Streaming stopped");
      stopStreaming();
      frameBuffer.clear();
    } else {
      if (!isConnected) {
        console.log("🔌 Connecting to WebSocket...");
        connect();
      }
      console.log("🚀 WebSocket streaming started!");
      startStreaming();
    }
  };

  const error = cameraError || wsError;

  return (
    <div className="flex flex-col h-full gap-2">
      <div className="flex-1 bg-black rounded-md overflow-hidden relative min-h-[200px]">
        {/* Status Indicators */}
        <div className="absolute top-2 left-2 z-10 flex gap-2">
          {/* WebSocket Status */}
          <div
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${
              isConnected
                ? "bg-green-500/90 text-white"
                : "bg-red-500/90 text-white"
            }`}
          >
            {isConnected ? (
              <>
                <Wifi className="h-3 w-3" />
                Connected
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3" />
                Disconnected
              </>
            )}
          </div>

          {/* Streaming Status */}
          {isStreaming && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-blue-500/90 text-white animate-pulse">
              <Activity className="h-3 w-3" />
              Streaming
            </div>
          )}
        </div>

        {/* Progress Bar */}
        {isStreaming && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-800 z-10">
            <div
              className="h-full bg-blue-500 transition-all duration-100"
              style={{ width: `${frameBuffer.progress}%` }}
            />
          </div>
        )}

        {/* Error Display */}
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-white p-4 z-20">
            <div className="text-center space-y-2">
              <CameraOff className="h-8 w-8 mx-auto text-red-400" />
              <p className="text-sm">Error</p>
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

        {/* Video Element */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="w-full h-full object-cover"
        />

        {/* Last Prediction Overlay */}
        {lastPrediction && isStreaming && (
          <div className="absolute top-12 left-2 right-2 z-10">
            <div className="bg-black/70 backdrop-blur-sm rounded-lg p-3 text-white">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs text-gray-400 mb-1">Detected Sign:</p>
                  <p className="text-lg font-bold">{lastPrediction.gloss}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">Confidence</p>
                  <p className="text-sm font-semibold">
                    {(lastPrediction.confidence * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex justify-center gap-2">
        {isActive ? (
          <Button onClick={stopCamera} size="sm" variant="destructive">
            <CameraOff className="h-3 w-3 mr-1" />
            Stop Camera
          </Button>
        ) : (
          <Button onClick={startCamera} size="sm">
            <Camera className="h-3 w-3 mr-1" />
            Start Camera
          </Button>
        )}

        <Button
          onClick={handleToggleStreaming}
          size="sm"
          variant={isStreaming ? "secondary" : "default"}
          disabled={!isActive}
        >
          <Activity className="h-3 w-3 mr-1" />
          {isStreaming ? "Stop Streaming" : "Start Streaming"}
        </Button>

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

      {/* Debug Info */}
      <div className="text-xs text-muted-foreground text-center">
        {isMounted ? (
          <>
            Session: {sessionId.slice(0, 20)}... | Frames:{" "}
            {frameBuffer.frames.length}/60
          </>
        ) : (
          <span>Loading...</span>
        )}
      </div>
    </div>
  );
}
