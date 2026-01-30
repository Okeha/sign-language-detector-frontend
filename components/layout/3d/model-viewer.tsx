"use client";

import { useEffect, useRef, Suspense, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  OrbitControls,
  PerspectiveCamera,
  useGLTF,
  useAnimations,
} from "@react-three/drei";
import * as THREE from "three";
import { useMotionPlayer } from "@/hooks/use-motion-player";
import {
  buildBoneMap,
  findSkinnedMesh,
  applyBodyMotion,
  applyHandMotion,
  applyFaceMotion,
} from "@/lib/bone-mapper";

// Custom 3D Model Component
// In model-viewer.tsx, update the CustomModel component:

function CustomModel({
  modelPath,
  currentGloss,
  glossSequence,
}: {
  modelPath: string;
  currentGloss?: string | null;
  glossSequence?: string[] | null;
}) {
  const groupRef = useRef<THREE.Group>(null);

  const { scene, animations } = useGLTF(modelPath);
  const { actions } = useAnimations(animations, groupRef);

  const {
    playbackState,
    playMotion,
    playSequence,
    stopMotion,
    getCurrentFrame,
    updateFrame,
  } = useMotionPlayer();

  const boneMap = useRef<Map<string, THREE.Bone> | null>(null);
  const skinnedMesh = useRef<THREE.SkinnedMesh | null>(null);

  // FPS throttling
  const lastFrameTime = useRef(0);

  useEffect(() => {
    if (scene) {
      boneMap.current = buildBoneMap(scene);
      skinnedMesh.current = findSkinnedMesh(scene);
      console.log(`🦴 Built bone map with ${boneMap.current.size} bones`);

      // Restore leg bones (in case cached)
      const LEG_BONES = [
        "LeftUpLeg",
        "RightUpLeg",
        "LeftLeg",
        "RightLeg",
        "LeftFoot",
        "RightFoot",
        "LeftToeBase",
        "RightToeBase",
        "LeftToe_End",
        "RightToe_End",
        "Hips",
      ];

      LEG_BONES.forEach((boneName) => {
        const bone = boneMap.current?.get(boneName);
        if (bone) {
          bone.scale.set(1, 1, 1);
        }
      });
    }

    return () => {
      boneMap.current = null;
      skinnedMesh.current = null;
    };
  }, [scene]);

  useEffect(() => {
    if (glossSequence && glossSequence.length > 0) {
      console.log(`🎬 Loading motion sequence: [${glossSequence.join(", ")}]`);
      playSequence(glossSequence);
    } else if (currentGloss && currentGloss.trim() !== "") {
      console.log(`🎬 Loading motion for gloss: ${currentGloss}`);
      playMotion(currentGloss);
    } else {
      stopMotion();
    }
  }, [currentGloss, glossSequence, playMotion, playSequence, stopMotion]);

  useEffect(() => {
    if (actions && Object.keys(actions).length > 0) {
      const firstAnimation = Object.values(actions)[0];
      firstAnimation?.play();
    }
  }, [actions]);

  // OPTIMIZED: Synced to motion data fps (30fps)
  useFrame((state, delta) => {
    if (playbackState.isPlaying && playbackState.motion) {
      // Get fps from motion data (default 30)
      const motionFps = playbackState.motion.fps || 30;
      const frameDuration = 1 / motionFps;

      // Accumulate time
      lastFrameTime.current += delta;

      // Only update when enough time has passed for next frame
      if (lastFrameTime.current < frameDuration) return;

      // Reset timer (keep remainder for accuracy)
      lastFrameTime.current = lastFrameTime.current % frameDuration;

      // Now do the actual update
      updateFrame(frameDuration);

      const frame = getCurrentFrame();

      if (frame && boneMap.current) {
        if (frame.body) {
          applyBodyMotion(boneMap.current, frame.body);
        }
        if (frame.hands) {
          applyHandMotion(boneMap.current, frame.hands);
        }
        if (frame.face && skinnedMesh.current) {
          applyFaceMotion(skinnedMesh.current, frame.face);
        }
      }
    }
  });

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      <primitive object={scene} scale={1} castShadow receiveShadow />
    </group>
  );
}

// Loading fallback
function LoadingFallback() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-50/50 to-blue-50/50 dark:from-purple-950/20 dark:to-blue-950/20">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 mx-auto rounded-full border-4 border-purple-500 border-t-transparent animate-spin"></div>
        <p className="text-xs text-muted-foreground">Loading 3D Model...</p>
      </div>
    </div>
  );
}

export default function ModelViewer({
  currentGloss,
  glossSequence,
}: {
  currentGloss?: string | null;
  glossSequence?: string[] | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDark, setIsDark] = useState(false);

  const customModelPath: string | null = "/models/Static_Me.glb";

  useEffect(() => {
    console.log("3D Model Viewer initialized");

    if (customModelPath) {
      useGLTF.preload(customModelPath);
    }

    const checkDarkMode = () => {
      setIsDark(document.documentElement.classList.contains("dark"));
    };

    checkDarkMode();

    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full">
      <Suspense fallback={<LoadingFallback />}>
        <Canvas shadows gl={{ antialias: true, alpha: true }} dpr={[1, 2]}>
          {/* Camera - framed on upper body but can see arms */}
          <PerspectiveCamera makeDefault position={[0, 1.6, 2]} fov={32} />

          {/* Locked orbit controls - slight rotation allowed */}
          <OrbitControls
            enableZoom={false}
            enablePan={false}
            minPolarAngle={Math.PI / 2.2}
            maxPolarAngle={Math.PI / 1.9}
            minAzimuthAngle={-Math.PI / 6}
            maxAzimuthAngle={Math.PI / 6}
            target={[0, 1.35, 0]}
            enableDamping={true}
            dampingFactor={0.05}
          />

          {/* Lighting */}
          <ambientLight intensity={isDark ? 0.5 : 0.7} />

          {/* Key light */}
          <directionalLight
            position={[2, 3, 3]}
            intensity={isDark ? 1.0 : 1.4}
            castShadow
            shadow-mapSize={[1024, 1024]}
          />

          {/* Fill light */}
          <directionalLight
            position={[-2, 2, 2]}
            intensity={isDark ? 0.4 : 0.6}
          />

          {/* Rim light */}
          <directionalLight
            position={[0, 2, -3]}
            intensity={isDark ? 0.3 : 0.4}
          />

          {/* Accent lights */}
          <pointLight
            position={[-2, 1.5, 1]}
            intensity={0.3}
            color={isDark ? "#a78bfa" : "#8b5cf6"}
            distance={5}
          />
          <pointLight
            position={[2, 1, 0]}
            intensity={0.2}
            color={isDark ? "#60a5fa" : "#3b82f6"}
            distance={5}
          />

          {/* Background */}
          <color attach="background" args={[isDark ? "#1a1a2e" : "#f0f4f8"]} />

          {/* Model */}
          {customModelPath && (
            <CustomModel
              modelPath={customModelPath}
              currentGloss={currentGloss}
              glossSequence={glossSequence}
            />
          )}

          {/* Ground shadow */}
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, -0.01, 0]}
            receiveShadow
          >
            <planeGeometry args={[10, 10]} />
            <shadowMaterial opacity={isDark ? 0.4 : 0.2} />
          </mesh>
        </Canvas>
      </Suspense>
    </div>
  );
}
