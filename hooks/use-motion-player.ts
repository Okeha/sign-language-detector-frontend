"use client";

import { useState, useCallback, useRef } from "react";
import { MotionClip, MotionFrame, MotionPlaybackState } from "@/types/motion";
import { loadMotion } from "@/lib/motion-loader";

export function useMotionPlayer() {
    const [playbackState, setPlaybackState] = useState<MotionPlaybackState>({
        isPlaying: false,
        currentGloss: null,
        currentFrame: 0,
        totalFrames: 0,
        progress: 0,
        motion: null,
        sequence: [],
        sequenceIndex: 0,
        isSequencePlaying: false,
    });

    const currentMotionRef = useRef<MotionClip | null>(null);
    const frameIndexRef = useRef(0);
    const lastFrameTimeRef = useRef(0);

    /**
     * Play a motion by gloss name
     */
    const playMotion = useCallback(async (gloss: string) => {
        console.log(`🎬 Playing motion: ${gloss}`);

        // Load the motion clip
        const motion = await loadMotion(gloss);

        if (!motion) {
            console.error(`❌ Cannot play motion: ${gloss} - not found`);
            return;
        }

        currentMotionRef.current = motion;
        frameIndexRef.current = 0;
        lastFrameTimeRef.current = Date.now();

        setPlaybackState({
            isPlaying: true,
            currentGloss: gloss,
            currentFrame: 0,
            totalFrames: motion.frames.length,
            progress: 0,
            motion: motion,
            sequence: [],
            sequenceIndex: 0,
            isSequencePlaying: false,
        });
    }, []);

    /**
     * Play a sequence of motions by gloss names
     */
    const playSequence = useCallback(async (glosses: string[]) => {
        if (glosses.length === 0) {
            console.warn('⚠️ Empty gloss sequence provided');
            return;
        }

        console.log(`🎬 Playing sequence: [${glosses.join(', ')}]`);

        // Start with the first gloss
        const firstGloss = glosses[0];
        const motion = await loadMotion(firstGloss);

        if (!motion) {
            console.error(`❌ Cannot start sequence: ${firstGloss} - not found`);
            return;
        }

        currentMotionRef.current = motion;
        frameIndexRef.current = 0;
        lastFrameTimeRef.current = Date.now();

        setPlaybackState({
            isPlaying: true,
            currentGloss: firstGloss,
            currentFrame: 0,
            totalFrames: motion.frames.length,
            progress: 0,
            motion: motion,
            sequence: glosses,
            sequenceIndex: 0,
            isSequencePlaying: true,
        });
    }, []);

    /**
     * Advance to next gloss in sequence
     */
    const playNextInSequence = useCallback(async () => {
        if (!playbackState.isSequencePlaying || playbackState.sequence.length === 0) {
            return;
        }

        const nextIndex = playbackState.sequenceIndex + 1;

        if (nextIndex >= playbackState.sequence.length) {
            console.log('✅ Sequence complete!');
            setPlaybackState(prev => ({
                ...prev,
                isPlaying: false,
                isSequencePlaying: false,
            }));
            return;
        }

        const nextGloss = playbackState.sequence[nextIndex];
        console.log(`➡️ Next in sequence: ${nextGloss} (${nextIndex + 1}/${playbackState.sequence.length})`);

        const motion = await loadMotion(nextGloss);

        if (!motion) {
            console.error(`❌ Cannot play ${nextGloss} - skipping`);
            // Skip this one and try next
            setPlaybackState(prev => ({
                ...prev,
                sequenceIndex: nextIndex,
            }));
            return;
        }

        currentMotionRef.current = motion;
        frameIndexRef.current = 0;
        lastFrameTimeRef.current = Date.now();

        setPlaybackState(prev => ({
            ...prev,
            currentGloss: nextGloss,
            currentFrame: 0,
            totalFrames: motion.frames.length,
            progress: 0,
            motion: motion,
            sequenceIndex: nextIndex,
        }));
    }, [playbackState.isSequencePlaying, playbackState.sequence, playbackState.sequenceIndex]);

    /**
     * Stop the current motion
     */
    const stopMotion = useCallback(() => {
        console.log(`⏹️ Stopping motion`);
        setPlaybackState(prev => ({
            ...prev,
            isPlaying: false,
            isSequencePlaying: false,
            sequence: [],
            sequenceIndex: 0,
        }));
        currentMotionRef.current = null;
    }, []);

    /**
     * Get the current frame data for rendering
     */
    const getCurrentFrame = useCallback((): MotionFrame | null => {
        if (!currentMotionRef.current || !playbackState.isPlaying) {
            return null;
        }

        const motion = currentMotionRef.current;
        const frameIndex = frameIndexRef.current;

        if (frameIndex >= motion.frames.length) {
            // Animation finished
            return null;
        }

        return motion.frames[frameIndex];
    }, [playbackState.isPlaying]);

    /**
     * Update frame index based on FPS (call this in useFrame)
     */
    const updateFrame = useCallback((deltaTime: number) => {
        if (!currentMotionRef.current || !playbackState.isPlaying) {
            return;
        }

        const motion = currentMotionRef.current;
        const targetFrameTime = 1000 / motion.fps; // milliseconds per frame

        const now = Date.now();
        const elapsed = now - lastFrameTimeRef.current;

        if (elapsed >= targetFrameTime) {
            frameIndexRef.current += 1;
            lastFrameTimeRef.current = now;

            const newFrameIndex = frameIndexRef.current;

            if (newFrameIndex >= motion.frames.length) {
                // Animation complete
                if (playbackState.isSequencePlaying) {
                    console.log(`✅ Motion complete - advancing to next in sequence`);
                    playNextInSequence();
                } else {
                    console.log(`✅ Motion complete: ${playbackState.currentGloss}`);
                    setPlaybackState(prev => ({
                        ...prev,
                        isPlaying: false,
                        progress: 1,
                    }));
                }
            } else {
                setPlaybackState(prev => ({
                    ...prev,
                    currentFrame: newFrameIndex,
                    progress: newFrameIndex / motion.frames.length,
                }));
            }
        }
    }, [playbackState.isPlaying, playbackState.currentGloss, playbackState.isSequencePlaying, playNextInSequence]);

    return {
        playbackState,
        playMotion,
        playSequence,
        stopMotion,
        getCurrentFrame,
        updateFrame,
    };
}
