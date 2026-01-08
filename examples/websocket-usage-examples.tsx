/**
 * EXAMPLE: Using the WebSocket hooks directly
 *
 * This example shows how to use the custom hooks in your own components
 */

"use client";

import { useEffect } from "react";
import { useWebcam } from "@/hooks/use-webcam";
import { useFrameBuffer } from "@/hooks/use-frame-buffer";
import { useSignLanguageStream } from "@/hooks/use-sign-language-stream";

export default function SimpleExample() {
  // 1. Setup webcam with frame capture
  const { videoRef, isActive, startCamera, captureFrame } = useWebcam();

  // 2. Setup frame buffer (60 frames)
  const { addFrame, frames, isReady, clear } = useFrameBuffer(60);

  // 3. Setup WebSocket connection
  const {
    isConnected,
    isStreaming,
    lastPrediction,
    connect,
    startStreaming,
    sendFrames,
  } = useSignLanguageStream("ws://localhost:8000", (prediction) => {
    console.log("Got prediction:", prediction.gloss);
  }) as ReturnType<typeof useSignLanguageStream> & {
    sendFrames: (frames: string[]) => boolean;
  };

  // Auto-start camera and connect
  useEffect(() => {
    startCamera();
    connect();
  }, []);

  // Capture frames at 30fps when streaming
  useEffect(() => {
    if (!isActive || !isStreaming) return;

    const interval = setInterval(() => {
      const frame = captureFrame();
      if (frame) {
        addFrame(frame);
      }
    }, 1000 / 30);

    return () => clearInterval(interval);
  }, [isActive, isStreaming, captureFrame, addFrame]);

  // Send frames when buffer is ready
  useEffect(() => {
    if (isReady && isConnected) {
      sendFrames(frames);
      clear();
    }
  }, [isReady, isConnected, frames, sendFrames, clear]);

  return (
    <div>
      <video ref={videoRef} autoPlay muted playsInline />

      <div>
        <p>Connected: {isConnected ? "Yes" : "No"}</p>
        <p>Frames: {frames.length}/60</p>
        <p>Last Prediction: {lastPrediction?.gloss || "None"}</p>
      </div>

      <button onClick={startStreaming}>Start Streaming</button>
    </div>
  );
}

/**
 * EXAMPLE 2: Custom frame processing
 */
export function CustomFrameProcessing() {
  const { captureFrame } = useWebcam();

  const handleCustomCapture = () => {
    const frame = captureFrame();
    if (frame) {
      // Do something custom with the frame
      console.log("Captured frame:", frame.substring(0, 50) + "...");

      // You could:
      // - Save frames locally
      // - Process frames with TensorFlow.js
      // - Send to different backend
      // - Apply filters/transformations
    }
  };

  return <button onClick={handleCustomCapture}>Capture Frame</button>;
}

/**
 * EXAMPLE 3: Using with different backend
 */
export function DifferentBackend() {
  const stream = useSignLanguageStream(
    "ws://my-custom-backend.com:9000",
    (prediction) => {
      // Custom handling
      console.log("Gloss:", prediction.gloss);
      console.log("Confidence:", prediction.confidence);
    }
  );

  return (
    <div>
      <button onClick={stream.connect}>Connect</button>
      <button onClick={stream.disconnect}>Disconnect</button>
      <p>Status: {stream.isConnected ? "Connected" : "Disconnected"}</p>
    </div>
  );
}

/**
 * EXAMPLE 4: Different frame buffer sizes
 */
export function DifferentBufferSize() {
  // Collect 30 frames instead of 60 (1 second at 30fps)
  const buffer30 = useFrameBuffer(30);

  // Collect 120 frames (4 seconds)
  const buffer120 = useFrameBuffer(120);

  return (
    <div>
      <p>Buffer 30: {buffer30.progress}%</p>
      <p>Buffer 120: {buffer120.progress}%</p>
    </div>
  );
}
