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

// Custom 3D Model Component - Load your GLTF/GLB model
function CustomModel({ modelPath }: { modelPath: string }) {
  const groupRef = useRef<THREE.Group>(null);

  try {
    // Load the GLTF model
    const { scene, animations } = useGLTF(modelPath);
    const { actions } = useAnimations(animations, groupRef);

    useEffect(() => {
      // Play the first animation if available
      if (actions && Object.keys(actions).length > 0) {
        const firstAnimation = Object.values(actions)[0];
        firstAnimation?.play();
      }
    }, [actions]);

    // Optional: Add custom animations
    useFrame((state) => {
      if (groupRef.current) {
        // Gentle rotation (optional - comment out if you don't want rotation)
        // groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.3;
      }
    });

    return (
      <group ref={groupRef} position={[0, 0, 0]}>
        <primitive object={scene} scale={1} castShadow receiveShadow />
      </group>
    );
  } catch (error) {
    console.error("Error loading 3D model:", error);
    return null;
  }
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

export default function ModelViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDark, setIsDark] = useState(false);

  // CONFIGURE YOUR MODEL HERE:
  // Set to null to use the default geometric figure, or provide path to your GLTF/GLB model
  const customModelPath: string | null = "/Static_Me.glb";

  useEffect(() => {
    console.log("3D Model Viewer initialized with Three.js");

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
          {/* <OrbitControls
            enablePan={false}
            minDistance={1.5}
            maxDistance={5}
            target={[0, 1, 0]}
          /> */}

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
            <CustomModel modelPath={customModelPath} />
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
