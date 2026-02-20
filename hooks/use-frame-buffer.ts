"use client";

import { useState, useCallback } from "react";
import { UseFrameBufferReturn } from "@/types/sign-language";

/**
 * Hook to manage frame buffering
 * Collects 60 frames over 2 seconds (30 fps)
 */
export function useFrameBuffer(targetFrames: number = 60): UseFrameBufferReturn {
    const [frames, setFrames] = useState<string[]>([]);

    const addFrame = useCallback(
        (frame: string) => {
            setFrames((prev) => {
                const newFrames = [...prev, frame];
                // console.log(`📹 Frame captured. Buffer: ${newFrames.length}/${targetFrames}`);

                // Keep only the last targetFrames
                if (newFrames.length > targetFrames) {
                    return newFrames.slice(-targetFrames);
                }

                if (newFrames.length === targetFrames) {
                    // console.log(`🎬 ${targetFrames} frames collected! Ready to send...`);
                }

                return newFrames;
            });
        },
        [targetFrames]
    );

    const clear = useCallback(() => {
        setFrames([]);
    }, []);

    const isReady = frames.length >= targetFrames;
    const progress = Math.min((frames.length / targetFrames) * 100, 100);

    return {
        addFrame,
        frames,
        isReady,
        clear,
        progress,
    };
}
