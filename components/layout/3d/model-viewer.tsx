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

// Custom 3D Model Component - Load your GLTF/GLB model with motion integration
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

  // Load the GLTF model
  const { scene, animations } = useGLTF(modelPath);
  const { actions } = useAnimations(animations, groupRef);

  // Motion player hook
  const {
    playbackState,
    playMotion,
    playSequence,
    stopMotion,
    getCurrentFrame,
    updateFrame,
  } = useMotionPlayer();

  // Build bone map and find skinned mesh once on mount
  const boneMap = useRef<Map<string, THREE.Bone> | null>(null);
  const skinnedMesh = useRef<THREE.SkinnedMesh | null>(null);
  const frameCounter = useRef(0); // Throttle updates

  useEffect(() => {
    if (scene) {
      try {
        (window as any).__MAPPER_DEBUG = true;
      } catch (e) {
        // ignore in non-browser contexts
      }

      boneMap.current = buildBoneMap(scene);
      skinnedMesh.current = findSkinnedMesh(scene);
      console.log(`🦴 Built bone map with ${boneMap.current.size} bones`);
      try {
        // Always print bone keys and morph targets once to help mapping
        console.debug(
          "MAPPER DEBUG — boneMap keys:",
          Array.from(boneMap.current.keys()),
        );
        if (skinnedMesh.current && skinnedMesh.current.morphTargetDictionary) {
          console.debug(
            "MAPPER DEBUG — morph targets:",
            Object.keys(skinnedMesh.current.morphTargetDictionary),
          );
        }
      } catch (e) {
        // ignore
      }
    }

    // Cleanup on unmount
    return () => {
      boneMap.current = null;
      skinnedMesh.current = null;
    };
  }, [scene]);

  // DISABLED: Debug code causes GPU crash on hot reload
  /*
  // Debug model structure for motion JSON compatibility
  useEffect(() => {
    console.log("=== 🔍 MODEL STRUCTURE DEBUG ===");

    // Find all bones, skinned meshes, and morph targets
    const bones: THREE.Bone[] = [];
    const skinnedMeshes: THREE.SkinnedMesh[] = [];
    const morphTargets: Record<string, string[]> = {};

    scene.traverse((node) => {
      if (node instanceof THREE.Bone) {
        bones.push(node);
      }
      if (node instanceof THREE.SkinnedMesh) {
        skinnedMeshes.push(node);
        if (node.morphTargetDictionary) {
          morphTargets[node.name] = Object.keys(node.morphTargetDictionary);
        }
      }
    });

    console.log(`✅ Found ${bones.length} bones`);
    console.log(`✅ Found ${skinnedMeshes.length} skinned meshes`);
    console.log(`✅ Animations: ${animations.length}`);

    if (bones.length > 0) {
      console.log("\n📋 BONE NAMES (first 30):");
      bones.slice(0, 30).forEach((bone) => console.log(`  - ${bone.name}`));

      // Check for key bones needed for motion JSON
      const requiredBones = [
        "LeftShoulder",
        "RightShoulder",
        "LeftArm",
        "RightArm",
        "LeftForeArm",
        "RightForeArm",
        "LeftHand",
        "RightHand",
        "Hips",
        "Spine",
        "Head",
        "LeftHandThumb1",
        "RightHandThumb1",
        "LeftHandIndex1",
        "RightHandIndex1",
      ];

      console.log("\n🔍 KEY BONES CHECK (needed for MediaPipe motion):");
      requiredBones.forEach((boneName) => {
        const found = bones.find((b) => b.name === boneName);
        console.log(`  ${found ? "✅" : "❌"} ${boneName}`);
      });

      console.log("\n💡 RECOMMENDATION:");
      const hasArmBones = bones.some(
        (b) => b.name.includes("Arm") || b.name.includes("arm"),
      );
      const hasHandBones = bones.some(
        (b) => b.name.includes("Hand") || b.name.includes("hand"),
      );

      if (hasArmBones && hasHandBones) {
        console.log("  ✅ Model looks compatible! Has arm and hand bones.");
      } else if (bones.length === 0) {
        console.log(
          "  ❌ NO BONES FOUND! This model won't work for motion JSON.",
        );
        console.log("     You need a rigged Ready Player Me avatar.");
      } else {
        console.log("  ⚠️  Model has bones but needs name mapping.");
        console.log("     Bone names might be different from standard.");
      }
    } else {
      console.log("\n❌ CRITICAL: No skeleton found!");
      console.log("   This model is NOT compatible with motion JSON.");
      console.log("   You need a rigged character with bones/armature.");
    }

    if (Object.keys(morphTargets).length > 0) {
      console.log("\n😊 MORPH TARGETS (for facial expressions):");
      Object.entries(morphTargets).forEach(([mesh, targets]) => {
        console.log(
          `  ${mesh}: ${targets.slice(0, 5).join(", ")}${targets.length > 5 ? "..." : ""}`,
        );
      });
    }

    console.log("\n=== END DEBUG ===\n");
  }, [scene, animations]);
  */

  // Load motion when gloss or sequence changes
  useEffect(() => {
    // Prioritize sequence over single gloss
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
    // Play the first animation if available
    if (actions && Object.keys(actions).length > 0) {
      const firstAnimation = Object.values(actions)[0];
      firstAnimation?.play();
    }
  }, [actions]);

  // // Apply motion to bones each frame
  // useFrame((state, delta) => {
  //   if (groupRef.current) {
  //     // Gentle rotation (optional - comment out if you don't want rotation)
  //     // groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.3;
  //   }

  //   // Update motion playback and apply to bones
  //   if (playbackState.isPlaying && playbackState.motion) {
  //     // Only update every 3 frames to reduce GPU load
  //     frameCounter.current++;
  //     if (frameCounter.current % 3 !== 0) {
  //       return;
  //     }

  //     // Update frame timing
  //     updateFrame(delta);

  //     // Get current frame data
  //     const frame = getCurrentFrame();

  //     if (frame && boneMap.current) {
  //       // Apply body motion (positions + rotations)
  //       if (frame.body) {
  //         applyBodyMotion(boneMap.current, frame.body);
  //       }

  //       // Apply per-joint hand rotations
  //       if (frame.hands) {
  //         applyHandMotion(boneMap.current, frame.hands);
  //       }

  //       // Apply face blendshapes
  //       if (frame.face && skinnedMesh.current) {
  //         applyFaceMotion(skinnedMesh.current, frame.face);
  //       }
  //     }
  //   }
  // });

  // The useFrame should just be:
  useFrame((state, delta) => {
    if (playbackState.isPlaying && playbackState.motion) {
      updateFrame(delta);

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

// Fallback: Simple 3D Human Figure Component (if no model provided)
function HumanFigure() {
  const groupRef = useRef<THREE.Group>(null);

  // Animate the figure
  useFrame((state) => {
    if (groupRef.current) {
      // Gentle rotation
      groupRef.current.rotation.y =
        Math.sin(state.clock.elapsedTime * 0.5) * 0.3;

      // Wave animation for right arm
      const rightArm = groupRef.current.children[4]; // Right arm
      if (rightArm) {
        rightArm.rotation.z = Math.sin(state.clock.elapsedTime * 2) * 0.5 - 0.3;
      }
    }
  });

  return (
    <group ref={groupRef}>
      {/* Head */}
      <mesh position={[0, 1.6, 0]} castShadow>
        <sphereGeometry args={[0.25, 32, 32]} />
        <meshStandardMaterial color="#ffdbac" />
      </mesh>

      {/* Body */}
      <mesh position={[0, 0.9, 0]} castShadow>
        <boxGeometry args={[0.6, 0.8, 0.3]} />
        <meshStandardMaterial color="#4a90e2" />
      </mesh>

      {/* Left Arm */}
      <mesh position={[-0.4, 0.9, 0]} rotation={[0, 0, 0.3]} castShadow>
        <boxGeometry args={[0.15, 0.7, 0.15]} />
        <meshStandardMaterial color="#ffdbac" />
      </mesh>

      {/* Right Arm (animated) */}
      <mesh position={[0.4, 0.9, 0]} rotation={[0, 0, -0.3]} castShadow>
        <boxGeometry args={[0.15, 0.7, 0.15]} />
        <meshStandardMaterial color="#ffdbac" />
      </mesh>

      {/* Left Leg */}
      <mesh position={[-0.18, 0.1, 0]} castShadow>
        <boxGeometry args={[0.18, 0.8, 0.18]} />
        <meshStandardMaterial color="#2c3e50" />
      </mesh>

      {/* Right Leg */}
      <mesh position={[0.18, 0.1, 0]} castShadow>
        <boxGeometry args={[0.18, 0.8, 0.18]} />
        <meshStandardMaterial color="#2c3e50" />
      </mesh>
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

  // CONFIGURE YOUR MODEL HERE:
  // Set to null to use the default geometric figure, or provide path to your GLTF/GLB model
  const customModelPath: string | null = "/models/Static_Me.glb";

  useEffect(() => {
    console.log("3D Model Viewer initialized with Three.js");

    // Enable mapper debug by default for easier troubleshooting in dev
    try {
      (window as any).__MAPPER_DEBUG = true;
    } catch (e) {
      // ignore in non-browser contexts
    }

    // Preload the model if path is provided
    if (customModelPath) {
      useGLTF.preload(customModelPath);
    }

    // Check for dark mode
    const checkDarkMode = () => {
      setIsDark(document.documentElement.classList.contains("dark"));
    };

    checkDarkMode();

    // Watch for theme changes
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
        <Canvas
          shadows
          gl={{ antialias: true, alpha: true }}
          dpr={[1, 2]}
          onCreated={({ gl }) => {
            gl.setClearColor(isDark ? "#1a1a2e" : "#f0f4f8");
          }}
        >
          <PerspectiveCamera makeDefault position={[0, 1.5, 1.5]} />
          <OrbitControls
            enablePan={false}
            minDistance={1.5}
            maxDistance={5}
            target={[0, 1, 0]}
          />

          {/* Lighting */}
          <ambientLight intensity={isDark ? 0.4 : 0.6} />
          <directionalLight
            position={[5, 5, 5]}
            intensity={isDark ? 0.8 : 1.2}
            castShadow
            shadow-mapSize={[1024, 1024]}
          />
          <pointLight position={[-5, 5, -5]} intensity={0.4} color="#a78bfa" />
          <pointLight position={[5, 2, -5]} intensity={0.3} color="#60a5fa" />

          {/* Background color - adapts to theme */}
          <color attach="background" args={[isDark ? "#1a1a2e" : "#f0f4f8"]} />

          {/* 3D Model - Use custom model if provided, otherwise use default figure */}
          {customModelPath ? (
            <CustomModel
              modelPath={customModelPath}
              currentGloss={currentGloss}
              glossSequence={glossSequence}
            />
          ) : (
            <HumanFigure />
          )}

          {/* Ground */}
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, -0.3, 0]}
            receiveShadow
          >
            <planeGeometry args={[10, 10]} />
            <shadowMaterial opacity={isDark ? 0.5 : 0.3} />
          </mesh>
        </Canvas>
      </Suspense>
    </div>
  );
}
