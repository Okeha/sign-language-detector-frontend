"use client";

import { useState, useCallback, useRef } from "react";
import { MotionClip, MotionFrame, MotionPlaybackState } from "@/types/motion";
import { loadMotion } from "@/lib/motion-loader";
import * as THREE from "three";

// ============================================
// FRAME INTERPOLATION
// ============================================

/**
 * SLERP two quaternion-like objects with shortest-path enforcement.
 */
function slerpQuatData(
  a: { x: number; y: number; z: number; w: number },
  b: { x: number; y: number; z: number; w: number },
  t: number,
): { x: number; y: number; z: number; w: number } {
  const qa = new THREE.Quaternion(a.x, a.y, a.z, a.w);
  const qb = new THREE.Quaternion(b.x, b.y, b.z, b.w);

  // Enforce shortest path
  if (qa.dot(qb) < 0) {
    qb.set(-qb.x, -qb.y, -qb.z, -qb.w);
  }

  const result = new THREE.Quaternion();
  result.slerpQuaternions(qa, qb, t);

  return { x: result.x, y: result.y, z: result.z, w: result.w };
}

/**
 * LERP two {x,y,z} position objects.
 */
function lerpPos(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  t: number,
): { x: number; y: number; z: number } {
  return {
    x: THREE.MathUtils.lerp(a.x, b.x, t),
    y: THREE.MathUtils.lerp(a.y, b.y, t),
    z: THREE.MathUtils.lerp(a.z, b.z, t),
  };
}

/**
 * Interpolate body data between two frames.
 */
function interpolateBody(bodyA: any, bodyB: any, t: number): any {
  if (!bodyA || !bodyB) return bodyA || bodyB || null;

  const result: any = {};

  // Position keys
  const posKeys = [
    "left_shoulder",
    "left_elbow",
    "left_wrist",
    "right_shoulder",
    "right_elbow",
    "right_wrist",
  ];

  for (const key of posKeys) {
    if (bodyA[key] && bodyB[key]) {
      result[key] = lerpPos(bodyA[key], bodyB[key], t);
    } else {
      result[key] = bodyA[key] || bodyB[key] || null;
    }
  }

  // Quaternion keys
  const quatKeys = [
    "left_shoulder_quat",
    "left_elbow_quat",
    "right_shoulder_quat",
    "right_elbow_quat",
  ];

  for (const key of quatKeys) {
    if (bodyA[key] && bodyB[key]) {
      result[key] = slerpQuatData(bodyA[key], bodyB[key], t);
    } else {
      result[key] = bodyA[key] || bodyB[key] || null;
    }
  }

  return result;
}

/**
 * Interpolate a single hand's data between two frames.
 */
function interpolateHand(handA: any, handB: any, t: number): any {
  if (!handA || !handB) return handA || handB || null;

  const result: any = {};

  // Interpolate landmarks
  if (
    handA.landmarks &&
    handB.landmarks &&
    handA.landmarks.length === handB.landmarks.length
  ) {
    result.landmarks = handA.landmarks.map(
      (lmA: { x: number; y: number; z: number }, i: number) => {
        const lmB = handB.landmarks[i];
        return lerpPos(lmA, lmB, t);
      },
    );
  } else {
    result.landmarks = handA?.landmarks || handB?.landmarks || null;
  }

  // Interpolate wrist quaternion
  if (handA.wrist_quaternion && handB.wrist_quaternion) {
    result.wrist_quaternion = slerpQuatData(
      handA.wrist_quaternion,
      handB.wrist_quaternion,
      t,
    );
  } else {
    result.wrist_quaternion =
      handA?.wrist_quaternion || handB?.wrist_quaternion || null;
  }

  return result;
}

/**
 * Interpolate hands data (left + right) between two frames.
 */
function interpolateHands(handsA: any, handsB: any, t: number): any {
  if (!handsA || !handsB) return handsA || handsB || null;

  return {
    left: interpolateHand(handsA?.left, handsB?.left, t),
    right: interpolateHand(handsA?.right, handsB?.right, t),
  };
}

/**
 * Interpolate face blendshape data between two frames.
 */
function interpolateFace(faceA: any, faceB: any, t: number): any {
  if (!faceA || !faceB) return faceA || faceB || null;

  const result: any = {};
  const keys = new Set([
    ...Object.keys(faceA || {}),
    ...Object.keys(faceB || {}),
  ]);

  for (const key of keys) {
    const a = faceA?.[key];
    const b = faceB?.[key];
    if (typeof a === "number" && typeof b === "number") {
      result[key] = THREE.MathUtils.lerp(a, b, t);
    } else {
      result[key] = a ?? b ?? 0;
    }
  }

  return result;
}

/**
 * Interpolate between two complete motion frames.
 */
function interpolateFrames(
  frameA: MotionFrame,
  frameB: MotionFrame,
  t: number,
): MotionFrame {
  return {
    timestamp: THREE.MathUtils.lerp(frameA.timestamp, frameB.timestamp, t),
    body: interpolateBody(frameA.body, frameB.body, t),
    hands: interpolateHands(frameA.hands, frameB.hands, t),
    face: interpolateFace(frameA.face, frameB.face, t),
  };
}

// ============================================
// HOOK
// ============================================

export function useMotionPlayer() {
  // React state — only for UI display purposes
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

  // Animation state — refs only, no React re-renders during playback
  const currentMotionRef = useRef<MotionClip | null>(null);
  const playTimeRef = useRef(0);
  const isPlayingRef = useRef(false);
  const sequenceRef = useRef<string[]>([]);
  const sequenceIndexRef = useRef(0);
  const isSequencePlayingRef = useRef(false);

  // Throttle UI state updates to avoid flooding React
  const lastUIUpdateRef = useRef(0);
  const UI_UPDATE_INTERVAL = 100; // ms

  /**
   * Advance to the next gloss in a sequence.
   */
  const advanceSequence = useCallback(async () => {
    const nextIndex = sequenceIndexRef.current + 1;

    if (nextIndex >= sequenceRef.current.length) {
      console.log("✅ Sequence complete!");
      isPlayingRef.current = false;
      isSequencePlayingRef.current = false;
      currentMotionRef.current = null;
      setPlaybackState((prev) => ({
        ...prev,
        isPlaying: false,
        isSequencePlaying: false,
        progress: 1,
      }));
      return;
    }

    const nextGloss = sequenceRef.current[nextIndex];
    console.log(
      `➡️ Next: ${nextGloss} (${nextIndex + 1}/${sequenceRef.current.length})`,
    );

    const motion = await loadMotion(nextGloss);

    if (!motion) {
      console.error(`❌ Skipping ${nextGloss}`);
      sequenceIndexRef.current = nextIndex;
      // Try the one after
      advanceSequence();
      return;
    }

    currentMotionRef.current = motion;
    playTimeRef.current = 0;
    sequenceIndexRef.current = nextIndex;

    setPlaybackState((prev) => ({
      ...prev,
      currentGloss: nextGloss,
      currentFrame: 0,
      totalFrames: motion.frames.length,
      progress: 0,
      motion: motion,
      sequenceIndex: nextIndex,
    }));
  }, []);

  /**
   * Play a single motion by gloss name.
   */
  const playMotion = useCallback(async (gloss: string) => {
    console.log(`🎬 Playing motion: ${gloss}`);

    const motion = await loadMotion(gloss);

    if (!motion) {
      console.error(`❌ Cannot play motion: ${gloss} - not found`);
      return;
    }

    currentMotionRef.current = motion;
    playTimeRef.current = 0;
    isPlayingRef.current = true;
    isSequencePlayingRef.current = false;
    sequenceRef.current = [];
    sequenceIndexRef.current = 0;

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
   * Play a sequence of motions by gloss names.
   */
  const playSequence = useCallback(async (glosses: string[]) => {
    if (glosses.length === 0) {
      console.warn("⚠️ Empty gloss sequence provided");
      return;
    }

    console.log(`🎬 Playing sequence: [${glosses.join(", ")}]`);

    const firstGloss = glosses[0];
    const motion = await loadMotion(firstGloss);

    if (!motion) {
      console.error(`❌ Cannot start sequence: ${firstGloss} - not found`);
      return;
    }

    currentMotionRef.current = motion;
    playTimeRef.current = 0;
    isPlayingRef.current = true;
    isSequencePlayingRef.current = true;
    sequenceRef.current = glosses;
    sequenceIndexRef.current = 0;

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
   * Stop the current motion.
   */
  const stopMotion = useCallback(() => {
    console.log("⏹️ Stopping motion");
    isPlayingRef.current = false;
    isSequencePlayingRef.current = false;
    currentMotionRef.current = null;
    sequenceRef.current = [];
    sequenceIndexRef.current = 0;
    playTimeRef.current = 0;

    setPlaybackState((prev) => ({
      ...prev,
      isPlaying: false,
      isSequencePlaying: false,
      sequence: [],
      sequenceIndex: 0,
    }));
  }, []);

  /**
   * Get the current interpolated frame. Call this from useFrame().
   * @param delta - Three.js delta time in SECONDS
   * @returns Interpolated MotionFrame or null
   */
  const getInterpolatedFrame = useCallback(
    (delta: number): MotionFrame | null => {
      const motion = currentMotionRef.current;
      if (!motion || !isPlayingRef.current) return null;

      // Advance playback time
      playTimeRef.current += delta;

      const fps = motion.fps || 30;
      const totalDuration = motion.frames.length / fps;

      // Check if this clip is finished
      if (playTimeRef.current >= totalDuration) {
        // Return the last frame while we transition
        const lastFrame = motion.frames[motion.frames.length - 1];

        if (isSequencePlayingRef.current) {
          advanceSequence();
        } else {
          isPlayingRef.current = false;
          setPlaybackState((prev) => ({
            ...prev,
            isPlaying: false,
            progress: 1,
          }));
        }

        return lastFrame;
      }

      // Calculate fractional frame index
      const exactFrame = playTimeRef.current * fps;
      const indexA = Math.floor(exactFrame);
      const indexB = Math.min(indexA + 1, motion.frames.length - 1);
      const t = exactFrame - indexA; // fractional part: 0..1

      const clampedA = Math.min(indexA, motion.frames.length - 1);

      // Throttled UI update (not every render frame)
      const now = performance.now();
      if (now - lastUIUpdateRef.current > UI_UPDATE_INTERVAL) {
        lastUIUpdateRef.current = now;
        setPlaybackState((prev) => ({
          ...prev,
          currentFrame: clampedA,
          progress: playTimeRef.current / totalDuration,
        }));
      }

      // If both indices are the same, no interpolation needed
      if (clampedA === indexB) {
        return motion.frames[clampedA];
      }

      // Interpolate between the two adjacent frames
      return interpolateFrames(
        motion.frames[clampedA],
        motion.frames[indexB],
        t,
      );
    },
    [advanceSequence],
  );

  /**
   * @deprecated Use getInterpolatedFrame(delta) instead.
   * Kept for API compatibility.
   */
  const getCurrentFrame = useCallback((): MotionFrame | null => {
    const motion = currentMotionRef.current;
    if (!motion || !isPlayingRef.current) return null;
    const fps = motion.fps || 30;
    const idx = Math.floor(playTimeRef.current * fps);
    const clamped = Math.min(idx, motion.frames.length - 1);
    return motion.frames[clamped] ?? null;
  }, []);

  /**
   * @deprecated No longer needed — timing handled by getInterpolatedFrame.
   * Kept for API compatibility.
   */
  const updateFrame = useCallback((_deltaTime?: number) => {}, []);

  return {
    playbackState,
    playMotion,
    playSequence,
    stopMotion,
    getInterpolatedFrame,
    getCurrentFrame,
    updateFrame,
  };
}
