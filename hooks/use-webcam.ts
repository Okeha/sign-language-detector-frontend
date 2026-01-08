"use client";

import { useRef, useState, useCallback } from "react";
import { UseWebcamReturn } from "@/types/sign-language";

export function useWebcam(): UseWebcamReturn {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isActive, setIsActive] = useState(false);

    const startCamera = useCallback(async () => {
        try {
            setError(null);
            const constraints = {
                video: {
                    facingMode: "user",
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 },
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
                console.log("🎥 Webcam started");
            }
        } catch (err: any) {
            console.error("Camera error:", err);
            setError(err.message || "Failed to access camera");
            setIsActive(false);
        }
    }, []);

    const stopCamera = useCallback(() => {
        if (stream) {
            stream.getTracks().forEach((track) => track.stop());
            setStream(null);
            setIsActive(false);
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    }, [stream]);

    const captureFrame = useCallback((): string | null => {
        if (!videoRef.current || !isActive) {
            return null;
        }

        try {
            const video = videoRef.current;
            const canvas = document.createElement("canvas");
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            const ctx = canvas.getContext("2d");
            if (!ctx) {
                console.error("Failed to get canvas context");
                return null;
            }

            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            // Convert to base64 (remove data:image/jpeg;base64, prefix for backend)
            const base64 = canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
            return base64;
        } catch (err) {
            console.error("Frame capture error:", err);
            return null;
        }
    }, [isActive]);

    return {
        videoRef,
        stream,
        isActive,
        error,
        startCamera,
        stopCamera,
        captureFrame,
    };
}
