// =============================================
// LEGACY BONE MAPPER (WITH REST POSE RESET)
// ===============================================
import * as THREE from "three";
import { FaceBlendshapes } from "@/types/motion";

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
  DEBUG: false,
  POSITION_SCALE: 1.0,
  SWAP_SIDES: false,

  ARM_Z_OFFSET: 0.35,
  ARM_X_OFFSET: -0.035,
  ARM_Y_OFFSET_LEFT: 0.1,
  ARM_Y_OFFSET_RIGHT: 0.0,

  // Finger settings
  FINGER_CURL_MULTIPLIER: 1.0,
  FINGER_SPREAD_MULTIPLIER: 0.5,

  // Smoothing
  ARM_SMOOTHING: 0.3,
  WRIST_SMOOTHING: 0.4,
  FINGER_SMOOTHING: 0.5,
};

// Debug helpers
if (typeof window !== "undefined") {
  (window as any).__MOTION_CONFIG = CONFIG;
  (window as any).setArmOffset = (val: number) => {
    CONFIG.ARM_Z_OFFSET = val;
    console.log(`ARM_Z_OFFSET set to ${val}`);
  };
  (window as any).setArmXOffset = (val: number) => {
    CONFIG.ARM_X_OFFSET = val;
    console.log(`ARM_X_OFFSET set to ${val}`);
  };
  (window as any).setFingerCurl = (val: number) => {
    CONFIG.FINGER_CURL_MULTIPLIER = val;
    console.log(`FINGER_CURL_MULTIPLIER set to ${val}`);
  };
  (window as any).setFingerSmoothing = (val: number) => {
    CONFIG.FINGER_SMOOTHING = val;
    console.log(`FINGER_SMOOTHING set to ${val}`);
  };
  (window as any).setArmSmoothing = (val: number) => {
    CONFIG.ARM_SMOOTHING = val;
    console.log(`ARM_SMOOTHING set to ${val}`);
  };
  (window as any).setWristSmoothing = (val: number) => {
    CONFIG.WRIST_SMOOTHING = val;
    console.log(`WRIST_SMOOTHING set to ${val}`);
  };
}

// ============================================
// MEDIAPIPE HAND LANDMARK INDICES
// ============================================
const HL = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
};

// Finger joint chains: [base, proximal, intermediate, distal, tip]
const FINGER_CHAINS = {
  thumb: [HL.WRIST, HL.THUMB_CMC, HL.THUMB_MCP, HL.THUMB_IP, HL.THUMB_TIP],
  index: [HL.WRIST, HL.INDEX_MCP, HL.INDEX_PIP, HL.INDEX_DIP, HL.INDEX_TIP],
  middle: [
    HL.WRIST,
    HL.MIDDLE_MCP,
    HL.MIDDLE_PIP,
    HL.MIDDLE_DIP,
    HL.MIDDLE_TIP,
  ],
  ring: [HL.WRIST, HL.RING_MCP, HL.RING_PIP, HL.RING_DIP, HL.RING_TIP],
  pinky: [HL.WRIST, HL.PINKY_MCP, HL.PINKY_PIP, HL.PINKY_DIP, HL.PINKY_TIP],
};

// RPM bone names
const FINGER_BONES = {
  left: {
    thumb: [
      "LeftHandThumb1",
      "LeftHandThumb2",
      "LeftHandThumb3",
      "LeftHandThumb4",
    ],
    index: [
      "LeftHandIndex1",
      "LeftHandIndex2",
      "LeftHandIndex3",
      "LeftHandIndex4",
    ],
    middle: [
      "LeftHandMiddle1",
      "LeftHandMiddle2",
      "LeftHandMiddle3",
      "LeftHandMiddle4",
    ],
    ring: ["LeftHandRing1", "LeftHandRing2", "LeftHandRing3", "LeftHandRing4"],
    pinky: [
      "LeftHandPinky1",
      "LeftHandPinky2",
      "LeftHandPinky3",
      "LeftHandPinky4",
    ],
  },
  right: {
    thumb: [
      "RightHandThumb1",
      "RightHandThumb2",
      "RightHandThumb3",
      "RightHandThumb4",
    ],
    index: [
      "RightHandIndex1",
      "RightHandIndex2",
      "RightHandIndex3",
      "RightHandIndex4",
    ],
    middle: [
      "RightHandMiddle1",
      "RightHandMiddle2",
      "RightHandMiddle3",
      "RightHandMiddle4",
    ],
    ring: [
      "RightHandRing1",
      "RightHandRing2",
      "RightHandRing3",
      "RightHandRing4",
    ],
    pinky: [
      "RightHandPinky1",
      "RightHandPinky2",
      "RightHandPinky3",
      "RightHandPinky4",
    ],
  },
};

const WRIST_BONES = {
  left: "LeftHand",
  right: "RightHand",
};

// ============================================
// REST POSE STORAGE
// ============================================
const restPoseQuaternions: Map<string, THREE.Quaternion> = new Map();
let restPoseCaptured = false;

/**
 * Call ONCE after the model loads but BEFORE any animation.
 * Captures the A-pose rest orientation of every bone.
 */
export function captureRestPose(boneMap: Map<string, THREE.Bone>): void {
  // Force a world matrix update first
  boneMap.forEach((bone) => {
    bone.updateWorldMatrix(true, false);
  });

  boneMap.forEach((bone, name) => {
    restPoseQuaternions.set(name, bone.quaternion.clone());
  });

  restPoseCaptured = true;
  console.log("📐 Rest pose captured for", restPoseQuaternions.size, "bones");
}

/**
 * Instantly snaps all bones back to their captured A-pose.
 */
export function resetToRestPose(boneMap: Map<string, THREE.Bone>): void {
  if (!restPoseCaptured) {
    console.warn("⚠️ No rest pose captured — cannot reset");
    return;
  }

  boneMap.forEach((bone, name) => {
    const restQuat = restPoseQuaternions.get(name);
    if (restQuat) {
      bone.quaternion.copy(restQuat);
    }
  });

  // Clear smoothing cache so next animation starts clean
  previousQuaternions.clear();
  console.log("🔄 Reset to A-pose");
}

/**
 * Smoothly blends all bones toward their A-pose over multiple frames.
 * Call this every frame during the transition.
 * Returns `true` when the blend is complete.
 *
 * @param boneMap     The bone map for the model
 * @param blendFactor 0→1 how fast to blend per call (e.g. 0.08 = gentle, 0.3 = fast)
 * @param threshold   How close quaternions must be to count as "done"
 */
export function blendToRestPose(
  boneMap: Map<string, THREE.Bone>,
  blendFactor: number = 0.1,
  threshold: number = 0.001,
): boolean {
  if (!restPoseCaptured) return true;

  let allDone = true;

  boneMap.forEach((bone, name) => {
    const restQuat = restPoseQuaternions.get(name);
    if (!restQuat) return;

    // Check if already close enough
    const dot = Math.abs(bone.quaternion.dot(restQuat));
    if (dot >= 1 - threshold) {
      bone.quaternion.copy(restQuat);
      return;
    }

    allDone = false;

    // Ensure shortest path SLERP
    const target = restQuat.clone();
    if (bone.quaternion.dot(target) < 0) {
      target.set(-target.x, -target.y, -target.z, -target.w);
    }

    // SLERP toward rest pose
    bone.quaternion.slerp(target, blendFactor);
  });

  if (allDone) {
    // Clear smoothing cache once settled
    previousQuaternions.clear();
    console.log("✅ Blend to A-pose complete");
  }

  return allDone;
}

/**
 * Returns whether a rest pose has been captured.
 */
export function isRestPoseCaptured(): boolean {
  return restPoseCaptured;
}

// ============================================
// SMOOTHING STATE
// ============================================
const previousQuaternions: Map<string, THREE.Quaternion> = new Map();

/**
 * Ensures shortest-path SLERP by flipping the target quaternion
 * if it's in the opposite hemisphere from the previous one.
 * Mutates targetQuat in place.
 */
function ensureShortestPath(
  prev: THREE.Quaternion,
  target: THREE.Quaternion,
): void {
  if (prev.dot(target) < 0) {
    target.set(-target.x, -target.y, -target.z, -target.w);
  }
}

function getSmoothedQuaternion(
  boneName: string,
  targetQuat: THREE.Quaternion,
  smoothing: number,
): THREE.Quaternion {
  const result = new THREE.Quaternion();

  if (smoothing <= 0) {
    previousQuaternions.set(boneName, targetQuat.clone());
    return targetQuat.clone();
  }

  const prevQuat = previousQuaternions.get(boneName);
  if (prevQuat) {
    // Fix: enforce shortest rotation path before interpolation
    ensureShortestPath(prevQuat, targetQuat);
    result.slerpQuaternions(prevQuat, targetQuat, 1 - smoothing);
  } else {
    result.copy(targetQuat);
  }

  previousQuaternions.set(boneName, result.clone());
  return result;
}

// ============================================
// UTILITIES
// ============================================

function getBone(
  boneMap: Map<string, THREE.Bone>,
  name: string,
): THREE.Bone | undefined {
  return boneMap.get(name) || boneMap.get(name.toLowerCase());
}

function landmarkToVec3(lm: {
  x: number;
  y: number;
  z: number;
}): THREE.Vector3 {
  return new THREE.Vector3(lm.x, lm.y, lm.z);
}

function vec3FromLandmarks(
  landmarks: Array<{ x: number; y: number; z: number }>,
  index: number,
): THREE.Vector3 {
  return landmarkToVec3(landmarks[index]);
}

/**
 * Safe version of setFromUnitVectors that handles the degenerate case
 * where from and to are nearly opposite (which causes singularity).
 */
function safeSetFromUnitVectors(
  from: THREE.Vector3,
  to: THREE.Vector3,
  fallbackAxis: THREE.Vector3 = new THREE.Vector3(0, 0, 1),
): THREE.Quaternion {
  const quat = new THREE.Quaternion();
  const dot = from.dot(to);

  if (dot > 0.9999) {
    // Nearly identical — identity rotation
    return quat.identity();
  } else if (dot < -0.9999) {
    // Nearly opposite — 180° rotation around fallback axis
    return quat.setFromAxisAngle(fallbackAxis, Math.PI);
  }

  return quat.setFromUnitVectors(from, to);
}

// ============================================
// ARM IK SOLVER
// ============================================

function solveArmIK(
  shoulderBone: THREE.Bone | undefined,
  elbowBone: THREE.Bone | undefined,
  shoulderPos: { x: number; y: number; z: number },
  elbowPos: { x: number; y: number; z: number },
  wristPos: { x: number; y: number; z: number },
  isLeftArm: boolean = true,
): void {
  if (!shoulderBone || !elbowBone) return;

  const scale = CONFIG.POSITION_SCALE;
  const zOffset = CONFIG.ARM_Z_OFFSET;
  const xOffset = CONFIG.ARM_X_OFFSET;
  const yOffset = isLeftArm
    ? CONFIG.ARM_Y_OFFSET_LEFT
    : CONFIG.ARM_Y_OFFSET_RIGHT;

  const xSign = isLeftArm ? 1 : -1;

  const shoulder = new THREE.Vector3(
    shoulderPos.x * scale,
    -shoulderPos.y * scale,
    shoulderPos.z * scale,
  );
  const elbow = new THREE.Vector3(
    elbowPos.x * scale + xOffset * 0.5 * xSign,
    -elbowPos.y * scale - yOffset * 0.5,
    elbowPos.z * scale + zOffset * 0.5,
  );
  const wrist = new THREE.Vector3(
    wristPos.x * scale + xOffset * xSign,
    -wristPos.y * scale - yOffset,
    wristPos.z * scale + zOffset,
  );

  const upperArmDir = new THREE.Vector3()
    .subVectors(elbow, shoulder)
    .normalize();
  const lowerArmDir = new THREE.Vector3().subVectors(wrist, elbow).normalize();

  const restDir = new THREE.Vector3(0, 1, 0);

  // Use fallback axis appropriate for arms (Z axis works well for side-to-side)
  const armFallback = new THREE.Vector3(0, 0, isLeftArm ? 1 : -1);

  // Upper arm
  const upperArmQuat = safeSetFromUnitVectors(
    restDir,
    upperArmDir,
    armFallback,
  );
  const parentWorldQuat = new THREE.Quaternion();
  if (shoulderBone.parent) {
    shoulderBone.parent.getWorldQuaternion(parentWorldQuat);
  }
  const localUpperQuat = parentWorldQuat
    .clone()
    .invert()
    .multiply(upperArmQuat);

  const smoothedUpperQuat = getSmoothedQuaternion(
    shoulderBone.name,
    localUpperQuat,
    CONFIG.ARM_SMOOTHING,
  );
  shoulderBone.quaternion.copy(smoothedUpperQuat);

  // Lower arm
  const lowerArmQuat = safeSetFromUnitVectors(
    restDir,
    lowerArmDir,
    armFallback,
  );
  const elbowParentWorldQuat = new THREE.Quaternion();
  shoulderBone.getWorldQuaternion(elbowParentWorldQuat);
  const localLowerQuat = elbowParentWorldQuat
    .clone()
    .invert()
    .multiply(lowerArmQuat);

  const smoothedLowerQuat = getSmoothedQuaternion(
    elbowBone.name,
    localLowerQuat,
    CONFIG.ARM_SMOOTHING,
  );
  elbowBone.quaternion.copy(smoothedLowerQuat);
}

// ============================================
// BODY MOTION
// ============================================

export function applyBodyMotion(
  boneMap: Map<string, THREE.Bone>,
  bodyData: any,
): void {
  if (!bodyData) return;

  const leftArm = getBone(boneMap, "LeftArm");
  const leftForeArm = getBone(boneMap, "LeftForeArm");
  const rightArm = getBone(boneMap, "RightArm");
  const rightForeArm = getBone(boneMap, "RightForeArm");

  if (CONFIG.SWAP_SIDES) {
    if (bodyData.left_shoulder && bodyData.left_elbow && bodyData.left_wrist) {
      solveArmIK(
        rightArm,
        rightForeArm,
        bodyData.left_shoulder,
        bodyData.left_elbow,
        bodyData.left_wrist,
        false,
      );
    }
    if (
      bodyData.right_shoulder &&
      bodyData.right_elbow &&
      bodyData.right_wrist
    ) {
      solveArmIK(
        leftArm,
        leftForeArm,
        bodyData.right_shoulder,
        bodyData.right_elbow,
        bodyData.right_wrist,
        true,
      );
    }
  } else {
    if (bodyData.left_shoulder && bodyData.left_elbow && bodyData.left_wrist) {
      solveArmIK(
        leftArm,
        leftForeArm,
        bodyData.left_shoulder,
        bodyData.left_elbow,
        bodyData.left_wrist,
        true,
      );
    }
    if (
      bodyData.right_shoulder &&
      bodyData.right_elbow &&
      bodyData.right_wrist
    ) {
      solveArmIK(
        rightArm,
        rightForeArm,
        bodyData.right_shoulder,
        bodyData.right_elbow,
        bodyData.right_wrist,
        false,
      );
    }
  }
}

// ============================================
// WRIST ORIENTATION
// ============================================

function applyWristOrientation(
  boneMap: Map<string, THREE.Bone>,
  handData: any,
  side: "left" | "right",
): void {
  const wristBoneName = WRIST_BONES[side];
  const wristBone = getBone(boneMap, wristBoneName);

  if (!wristBone || !handData?.wrist_quaternion) return;

  const wq = handData.wrist_quaternion;
  const targetQuat = new THREE.Quaternion(wq.x, wq.y, wq.z, wq.w);

  // Convert from world space to local space
  const parentWorldQuat = new THREE.Quaternion();
  if (wristBone.parent) {
    wristBone.parent.getWorldQuaternion(parentWorldQuat);
  }

  // RPM rest pose offset
  const restPoseOffset = new THREE.Quaternion();
  if (side === "left") {
    restPoseOffset.setFromEuler(new THREE.Euler(0, 0, 0));
  } else {
    restPoseOffset.setFromEuler(new THREE.Euler(0, 0, 0));
  }

  const localQuat = parentWorldQuat
    .clone()
    .invert()
    .multiply(targetQuat)
    .multiply(restPoseOffset);

  const smoothedQuat = getSmoothedQuaternion(
    wristBoneName,
    localQuat,
    CONFIG.WRIST_SMOOTHING,
  );

  wristBone.quaternion.copy(smoothedQuat);
}

// ============================================
// FINGER PROCESSING
// ============================================

function calculateFingerRotations(
  landmarks: Array<{ x: number; y: number; z: number }>,
  fingerName: keyof typeof FINGER_CHAINS,
  side: "left" | "right",
): THREE.Quaternion[] {
  const chain = FINGER_CHAINS[fingerName];
  const rotations: THREE.Quaternion[] = [];

  const isThumb = fingerName === "thumb";
  const isLeft = side === "left";

  const positions = chain.map((idx) => vec3FromLandmarks(landmarks, idx));

  for (let i = 0; i < 4; i++) {
    const p0 = positions[Math.max(0, i)];
    const p1 = positions[i + 1];
    const p2 = positions[Math.min(i + 2, 4)];

    const v1 = new THREE.Vector3().subVectors(p0, p1).normalize();
    const v2 = new THREE.Vector3().subVectors(p2, p1).normalize();

    const dot = THREE.MathUtils.clamp(v1.dot(v2), -1, 1);
    const bendAngle = Math.acos(dot);

    let curlAmount = (Math.PI - bendAngle) * CONFIG.FINGER_CURL_MULTIPLIER;

    let maxCurl = Math.PI * 0.5;
    if (i === 0) maxCurl = Math.PI * 0.4;
    if (i === 3) maxCurl = Math.PI * 0.35;

    curlAmount = THREE.MathUtils.clamp(curlAmount, 0, maxCurl);

    let rotation: THREE.Quaternion;

    if (isThumb) {
      const curlAxis = new THREE.Vector3(1, 0, 0);
      const spreadAxis = new THREE.Vector3(0, 0, 1);

      const spreadAngle = calculateThumbSpread(landmarks, i, isLeft);

      const curlQuat = new THREE.Quaternion().setFromAxisAngle(
        curlAxis,
        curlAmount,
      );
      const spreadQuat = new THREE.Quaternion().setFromAxisAngle(
        spreadAxis,
        spreadAngle,
      );

      rotation = spreadQuat.multiply(curlQuat);
    } else {
      const curlAxis = new THREE.Vector3(1, 0, 0);
      rotation = new THREE.Quaternion().setFromAxisAngle(curlAxis, curlAmount);

      if (i === 0) {
        const spreadAngle = calculateFingerSpread(
          landmarks,
          fingerName,
          isLeft,
        );
        const spreadAxis = new THREE.Vector3(0, isLeft ? -1 : 1, 0);
        const spreadQuat = new THREE.Quaternion().setFromAxisAngle(
          spreadAxis,
          spreadAngle,
        );
        rotation.premultiply(spreadQuat);
      }
    }

    rotations.push(rotation);
  }

  return rotations;
}

function calculateThumbSpread(
  landmarks: Array<{ x: number; y: number; z: number }>,
  jointIndex: number,
  isLeft: boolean,
): number {
  const thumbTip = vec3FromLandmarks(landmarks, HL.THUMB_TIP);
  const indexMcp = vec3FromLandmarks(landmarks, HL.INDEX_MCP);
  const wrist = vec3FromLandmarks(landmarks, HL.WRIST);

  const thumbDir = new THREE.Vector3().subVectors(thumbTip, wrist).normalize();
  const indexDir = new THREE.Vector3().subVectors(indexMcp, wrist).normalize();

  const cross = new THREE.Vector3().crossVectors(indexDir, thumbDir);

  let spreadAngle = Math.asin(THREE.MathUtils.clamp(cross.y, -1, 1));
  spreadAngle *= CONFIG.FINGER_SPREAD_MULTIPLIER;
  spreadAngle *= 1 - jointIndex * 0.3;

  return isLeft ? -spreadAngle : spreadAngle;
}

function calculateFingerSpread(
  landmarks: Array<{ x: number; y: number; z: number }>,
  fingerName: keyof typeof FINGER_CHAINS,
  isLeft: boolean,
): number {
  const fingerMcpIndices: Record<string, number> = {
    index: HL.INDEX_MCP,
    middle: HL.MIDDLE_MCP,
    ring: HL.RING_MCP,
    pinky: HL.PINKY_MCP,
  };

  const mcpIdx = fingerMcpIndices[fingerName];
  if (!mcpIdx) return 0;

  const wrist = vec3FromLandmarks(landmarks, HL.WRIST);
  const middleMcp = vec3FromLandmarks(landmarks, HL.MIDDLE_MCP);
  const fingerMcp = vec3FromLandmarks(landmarks, mcpIdx);

  const refDir = new THREE.Vector3().subVectors(middleMcp, wrist).normalize();
  const fingerDir = new THREE.Vector3()
    .subVectors(fingerMcp, wrist)
    .normalize();

  const cross = new THREE.Vector3().crossVectors(refDir, fingerDir);
  let spreadAngle = Math.asin(THREE.MathUtils.clamp(cross.z, -1, 1));

  spreadAngle *= CONFIG.FINGER_SPREAD_MULTIPLIER;

  return spreadAngle;
}

function applyFingerRotations(
  boneMap: Map<string, THREE.Bone>,
  landmarks: Array<{ x: number; y: number; z: number }>,
  fingerName: keyof typeof FINGER_CHAINS,
  side: "left" | "right",
): void {
  const boneNames = FINGER_BONES[side][fingerName];
  const rotations = calculateFingerRotations(landmarks, fingerName, side);

  for (let i = 0; i < 4; i++) {
    const boneName = boneNames[i];
    const bone = getBone(boneMap, boneName);

    if (!bone) continue;

    const smoothedQuat = getSmoothedQuaternion(
      boneName,
      rotations[i],
      CONFIG.FINGER_SMOOTHING,
    );

    bone.quaternion.copy(smoothedQuat);
  }
}

// ============================================
// HAND MOTION
// ============================================

export function applyHandMotion(
  boneMap: Map<string, THREE.Bone>,
  handsData: any,
): void {
  if (!handsData) return;

  const fingers: Array<keyof typeof FINGER_CHAINS> = [
    "thumb",
    "index",
    "middle",
    "ring",
    "pinky",
  ];

  if (handsData.left?.landmarks?.length === 21) {
    applyWristOrientation(boneMap, handsData.left, "left");

    for (const finger of fingers) {
      applyFingerRotations(boneMap, handsData.left.landmarks, finger, "left");
    }
  }

  if (handsData.right?.landmarks?.length === 21) {
    applyWristOrientation(boneMap, handsData.right, "right");

    for (const finger of fingers) {
      applyFingerRotations(boneMap, handsData.right.landmarks, finger, "right");
    }
  }
}

// ============================================
// FACE MOTION
// ============================================

export function applyFaceMotion(
  skinnedMesh: THREE.SkinnedMesh,
  faceData: FaceBlendshapes,
): void {
  if (!skinnedMesh.morphTargetDictionary || !skinnedMesh.morphTargetInfluences)
    return;

  const dict = skinnedMesh.morphTargetDictionary;
  const influences = skinnedMesh.morphTargetInfluences;

  if (faceData.jawOpen !== undefined && dict["jawOpen"] !== undefined) {
    influences[dict["jawOpen"]] = faceData.jawOpen;
  }

  if (faceData.mouthSmile !== undefined) {
    if (dict["mouthSmile"] !== undefined) {
      influences[dict["mouthSmile"]] = faceData.mouthSmile;
    } else if (dict["mouthSmileLeft"] !== undefined) {
      influences[dict["mouthSmileLeft"]] = faceData.mouthSmile;
      if (dict["mouthSmileRight"]) {
        influences[dict["mouthSmileRight"]] = faceData.mouthSmile;
      }
    }
  }

  const avgBrow =
    ((faceData.eyeBrowRaise_L || 0) + (faceData.eyeBrowRaise_R || 0)) / 2;
  if (dict["browInnerUp"] !== undefined) {
    influences[dict["browInnerUp"]] = avgBrow;
  }
}

// ============================================
// SETUP
// ============================================

export function buildBoneMap(scene: THREE.Object3D): Map<string, THREE.Bone> {
  const boneMap = new Map<string, THREE.Bone>();

  scene.traverse((child) => {
    if (child instanceof THREE.Bone) {
      boneMap.set(child.name, child);
      boneMap.set(child.name.toLowerCase(), child);
    }
  });

  return boneMap;
}

export function findSkinnedMesh(
  scene: THREE.Object3D,
): THREE.SkinnedMesh | null {
  let result: THREE.SkinnedMesh | null = null;
  scene.traverse((child) => {
    if (child instanceof THREE.SkinnedMesh && !result) {
      result = child;
    }
  });
  return result;
}

export function resetSmoothingCache(): void {
  previousQuaternions.clear();
  console.log("🔄 Smoothing cache reset");
}


// // =============================================
// // LEGACY BONE MAPPER
// // ===============================================
// import * as THREE from "three";
// import { FaceBlendshapes } from "@/types/motion";

// // ============================================
// // CONFIGURATION
// // ============================================
// const CONFIG = {
//   DEBUG: false,
//   POSITION_SCALE: 1.0,
//   SWAP_SIDES: false,

//   ARM_Z_OFFSET: 0.35,
//   ARM_X_OFFSET: -0.035,
//   ARM_Y_OFFSET_LEFT: 0.1,   // ← NEW: pulls left wrist target down (increase to lower the hand)
//   ARM_Y_OFFSET_RIGHT: 0.0,

//   // Finger settings
//   FINGER_CURL_MULTIPLIER: 1.0,
//   FINGER_SPREAD_MULTIPLIER: 0.5,

//   // Smoothing
//   ARM_SMOOTHING: 0.3,
//   WRIST_SMOOTHING: 0.4,
//   FINGER_SMOOTHING: 0.5,
// };

// // Debug helpers
// if (typeof window !== "undefined") {
//   (window as any).__MOTION_CONFIG = CONFIG;
//   (window as any).setArmOffset = (val: number) => {
//     CONFIG.ARM_Z_OFFSET = val;
//     console.log(`ARM_Z_OFFSET set to ${val}`);
//   };
//   (window as any).setArmXOffset = (val: number) => {
//     CONFIG.ARM_X_OFFSET = val;
//     console.log(`ARM_X_OFFSET set to ${val}`);
//   };
//   (window as any).setFingerCurl = (val: number) => {
//     CONFIG.FINGER_CURL_MULTIPLIER = val;
//     console.log(`FINGER_CURL_MULTIPLIER set to ${val}`);
//   };
//   (window as any).setFingerSmoothing = (val: number) => {
//     CONFIG.FINGER_SMOOTHING = val;
//     console.log(`FINGER_SMOOTHING set to ${val}`);
//   };
//   (window as any).setArmSmoothing = (val: number) => {
//     CONFIG.ARM_SMOOTHING = val;
//     console.log(`ARM_SMOOTHING set to ${val}`);
//   };
//   (window as any).setWristSmoothing = (val: number) => {
//     CONFIG.WRIST_SMOOTHING = val;
//     console.log(`WRIST_SMOOTHING set to ${val}`);
//   };
//   // console.log(
//   //   "🎮 Config: setArmOffset(n) | setArmXOffset(n) | setFingerCurl(n) | setFingerSmoothing(n) | setArmSmoothing(n) | setWristSmoothing(n)",
//   // );
// }

// // ============================================
// // MEDIAPIPE HAND LANDMARK INDICES
// // ============================================
// const HL = {
//   WRIST: 0,
//   THUMB_CMC: 1,
//   THUMB_MCP: 2,
//   THUMB_IP: 3,
//   THUMB_TIP: 4,
//   INDEX_MCP: 5,
//   INDEX_PIP: 6,
//   INDEX_DIP: 7,
//   INDEX_TIP: 8,
//   MIDDLE_MCP: 9,
//   MIDDLE_PIP: 10,
//   MIDDLE_DIP: 11,
//   MIDDLE_TIP: 12,
//   RING_MCP: 13,
//   RING_PIP: 14,
//   RING_DIP: 15,
//   RING_TIP: 16,
//   PINKY_MCP: 17,
//   PINKY_PIP: 18,
//   PINKY_DIP: 19,
//   PINKY_TIP: 20,
// };

// // Finger joint chains: [base, proximal, intermediate, distal, tip]
// const FINGER_CHAINS = {
//   thumb: [HL.WRIST, HL.THUMB_CMC, HL.THUMB_MCP, HL.THUMB_IP, HL.THUMB_TIP],
//   index: [HL.WRIST, HL.INDEX_MCP, HL.INDEX_PIP, HL.INDEX_DIP, HL.INDEX_TIP],
//   middle: [
//     HL.WRIST,
//     HL.MIDDLE_MCP,
//     HL.MIDDLE_PIP,
//     HL.MIDDLE_DIP,
//     HL.MIDDLE_TIP,
//   ],
//   ring: [HL.WRIST, HL.RING_MCP, HL.RING_PIP, HL.RING_DIP, HL.RING_TIP],
//   pinky: [HL.WRIST, HL.PINKY_MCP, HL.PINKY_PIP, HL.PINKY_DIP, HL.PINKY_TIP],
// };

// // RPM bone names
// const FINGER_BONES = {
//   left: {
//     thumb: [
//       "LeftHandThumb1",
//       "LeftHandThumb2",
//       "LeftHandThumb3",
//       "LeftHandThumb4",
//     ],
//     index: [
//       "LeftHandIndex1",
//       "LeftHandIndex2",
//       "LeftHandIndex3",
//       "LeftHandIndex4",
//     ],
//     middle: [
//       "LeftHandMiddle1",
//       "LeftHandMiddle2",
//       "LeftHandMiddle3",
//       "LeftHandMiddle4",
//     ],
//     ring: ["LeftHandRing1", "LeftHandRing2", "LeftHandRing3", "LeftHandRing4"],
//     pinky: [
//       "LeftHandPinky1",
//       "LeftHandPinky2",
//       "LeftHandPinky3",
//       "LeftHandPinky4",
//     ],
//   },
//   right: {
//     thumb: [
//       "RightHandThumb1",
//       "RightHandThumb2",
//       "RightHandThumb3",
//       "RightHandThumb4",
//     ],
//     index: [
//       "RightHandIndex1",
//       "RightHandIndex2",
//       "RightHandIndex3",
//       "RightHandIndex4",
//     ],
//     middle: [
//       "RightHandMiddle1",
//       "RightHandMiddle2",
//       "RightHandMiddle3",
//       "RightHandMiddle4",
//     ],
//     ring: [
//       "RightHandRing1",
//       "RightHandRing2",
//       "RightHandRing3",
//       "RightHandRing4",
//     ],
//     pinky: [
//       "RightHandPinky1",
//       "RightHandPinky2",
//       "RightHandPinky3",
//       "RightHandPinky4",
//     ],
//   },
// };

// const WRIST_BONES = {
//   left: "LeftHand",
//   right: "RightHand",
// };

// // ============================================
// // SMOOTHING STATE
// // ============================================
// const previousQuaternions: Map<string, THREE.Quaternion> = new Map();

// /**
//  * Ensures shortest-path SLERP by flipping the target quaternion
//  * if it's in the opposite hemisphere from the previous one.
//  * Mutates targetQuat in place.
//  */
// function ensureShortestPath(
//   prev: THREE.Quaternion,
//   target: THREE.Quaternion,
// ): void {
//   if (prev.dot(target) < 0) {
//     target.set(-target.x, -target.y, -target.z, -target.w);
//   }
// }

// function getSmoothedQuaternion(
//   boneName: string,
//   targetQuat: THREE.Quaternion,
//   smoothing: number,
// ): THREE.Quaternion {
//   const result = new THREE.Quaternion();

//   if (smoothing <= 0) {
//     previousQuaternions.set(boneName, targetQuat.clone());
//     return targetQuat.clone();
//   }

//   const prevQuat = previousQuaternions.get(boneName);
//   if (prevQuat) {
//     // Fix: enforce shortest rotation path before interpolation
//     ensureShortestPath(prevQuat, targetQuat);
//     result.slerpQuaternions(prevQuat, targetQuat, 1 - smoothing);
//   } else {
//     result.copy(targetQuat);
//   }

//   previousQuaternions.set(boneName, result.clone());
//   return result;
// }

// // ============================================
// // UTILITIES
// // ============================================

// function getBone(
//   boneMap: Map<string, THREE.Bone>,
//   name: string,
// ): THREE.Bone | undefined {
//   return boneMap.get(name) || boneMap.get(name.toLowerCase());
// }

// function landmarkToVec3(lm: {
//   x: number;
//   y: number;
//   z: number;
// }): THREE.Vector3 {
//   return new THREE.Vector3(lm.x, lm.y, lm.z);
// }

// function vec3FromLandmarks(
//   landmarks: Array<{ x: number; y: number; z: number }>,
//   index: number,
// ): THREE.Vector3 {
//   return landmarkToVec3(landmarks[index]);
// }

// /**
//  * Safe version of setFromUnitVectors that handles the degenerate case
//  * where from and to are nearly opposite (which causes singularity).
//  */
// function safeSetFromUnitVectors(
//   from: THREE.Vector3,
//   to: THREE.Vector3,
//   fallbackAxis: THREE.Vector3 = new THREE.Vector3(0, 0, 1),
// ): THREE.Quaternion {
//   const quat = new THREE.Quaternion();
//   const dot = from.dot(to);

//   if (dot > 0.9999) {
//     // Nearly identical — identity rotation
//     return quat.identity();
//   } else if (dot < -0.9999) {
//     // Nearly opposite — 180° rotation around fallback axis
//     return quat.setFromAxisAngle(fallbackAxis, Math.PI);
//   }

//   return quat.setFromUnitVectors(from, to);
// }

// // ============================================
// // ARM IK SOLVER
// // ============================================

// function solveArmIK(
//   shoulderBone: THREE.Bone | undefined,
//   elbowBone: THREE.Bone | undefined,
//   shoulderPos: { x: number; y: number; z: number },
//   elbowPos: { x: number; y: number; z: number },
//   wristPos: { x: number; y: number; z: number },
//   isLeftArm: boolean = true,
// ): void {
//   if (!shoulderBone || !elbowBone) return;

//   const scale = CONFIG.POSITION_SCALE;
//   const zOffset = CONFIG.ARM_Z_OFFSET;
//   const xOffset = CONFIG.ARM_X_OFFSET;
//   const yOffset = isLeftArm ? CONFIG.ARM_Y_OFFSET_LEFT : CONFIG.ARM_Y_OFFSET_RIGHT;


//   const xSign = isLeftArm ? 1 : -1;

//   const shoulder = new THREE.Vector3(
//     shoulderPos.x * scale,
//     -shoulderPos.y * scale,
//     shoulderPos.z * scale,
//   );
//   const elbow = new THREE.Vector3(
//     elbowPos.x * scale + xOffset * 0.5 * xSign,
//     -elbowPos.y * scale - yOffset * 0.5,
//     elbowPos.z * scale + zOffset * 0.5,
//   );
//   // const wrist = new THREE.Vector3(
//   //   wristPos.x * scale + xOffset * xSign,
//   //   -wristPos.y * scale,
//   //   wristPos.z * scale + zOffset,
//   // );

//   const wrist = new THREE.Vector3(
//     wristPos.x * scale + xOffset * xSign,
//     -wristPos.y * scale - yOffset,
//     wristPos.z * scale + zOffset,
//   );

//   const upperArmDir = new THREE.Vector3()
//     .subVectors(elbow, shoulder)
//     .normalize();
//   const lowerArmDir = new THREE.Vector3().subVectors(wrist, elbow).normalize();

//   const restDir = new THREE.Vector3(0, 1, 0);

//   // Use fallback axis appropriate for arms (Z axis works well for side-to-side)
//   const armFallback = new THREE.Vector3(0, 0, isLeftArm ? 1 : -1);

//   // Upper arm
//   const upperArmQuat = safeSetFromUnitVectors(
//     restDir,
//     upperArmDir,
//     armFallback,
//   );
//   const parentWorldQuat = new THREE.Quaternion();
//   if (shoulderBone.parent) {
//     shoulderBone.parent.getWorldQuaternion(parentWorldQuat);
//   }
//   const localUpperQuat = parentWorldQuat
//     .clone()
//     .invert()
//     .multiply(upperArmQuat);

//   const smoothedUpperQuat = getSmoothedQuaternion(
//     shoulderBone.name,
//     localUpperQuat,
//     CONFIG.ARM_SMOOTHING,
//   );
//   shoulderBone.quaternion.copy(smoothedUpperQuat);

//   // Lower arm
//   const lowerArmQuat = safeSetFromUnitVectors(
//     restDir,
//     lowerArmDir,
//     armFallback,
//   );
//   const elbowParentWorldQuat = new THREE.Quaternion();
//   shoulderBone.getWorldQuaternion(elbowParentWorldQuat);
//   const localLowerQuat = elbowParentWorldQuat
//     .clone()
//     .invert()
//     .multiply(lowerArmQuat);

//   const smoothedLowerQuat = getSmoothedQuaternion(
//     elbowBone.name,
//     localLowerQuat,
//     CONFIG.ARM_SMOOTHING,
//   );
//   elbowBone.quaternion.copy(smoothedLowerQuat);
// }

// // ============================================
// // BODY MOTION
// // ============================================

// export function applyBodyMotion(
//   boneMap: Map<string, THREE.Bone>,
//   bodyData: any,
// ): void {
//   if (!bodyData) return;

//   const leftArm = getBone(boneMap, "LeftArm");
//   const leftForeArm = getBone(boneMap, "LeftForeArm");
//   const rightArm = getBone(boneMap, "RightArm");
//   const rightForeArm = getBone(boneMap, "RightForeArm");

//   if (CONFIG.SWAP_SIDES) {
//     if (bodyData.left_shoulder && bodyData.left_elbow && bodyData.left_wrist) {
//       solveArmIK(
//         rightArm,
//         rightForeArm,
//         bodyData.left_shoulder,
//         bodyData.left_elbow,
//         bodyData.left_wrist,
//         false,
//       );
//     }
//     if (
//       bodyData.right_shoulder &&
//       bodyData.right_elbow &&
//       bodyData.right_wrist
//     ) {
//       solveArmIK(
//         leftArm,
//         leftForeArm,
//         bodyData.right_shoulder,
//         bodyData.right_elbow,
//         bodyData.right_wrist,
//         true,
//       );
//     }
//   } else {
//     if (bodyData.left_shoulder && bodyData.left_elbow && bodyData.left_wrist) {
//       solveArmIK(
//         leftArm,
//         leftForeArm,
//         bodyData.left_shoulder,
//         bodyData.left_elbow,
//         bodyData.left_wrist,
//         true,
//       );
//     }
//     if (
//       bodyData.right_shoulder &&
//       bodyData.right_elbow &&
//       bodyData.right_wrist
//     ) {
//       solveArmIK(
//         rightArm,
//         rightForeArm,
//         bodyData.right_shoulder,
//         bodyData.right_elbow,
//         bodyData.right_wrist,
//         false,
//       );
//     }
//   }
// }

// // ============================================
// // WRIST ORIENTATION
// // ============================================

// function applyWristOrientation(
//   boneMap: Map<string, THREE.Bone>,
//   handData: any,
//   side: "left" | "right",
// ): void {
//   const wristBoneName = WRIST_BONES[side];
//   const wristBone = getBone(boneMap, wristBoneName);

//   if (!wristBone || !handData?.wrist_quaternion) return;

//   const wq = handData.wrist_quaternion;
//   const targetQuat = new THREE.Quaternion(wq.x, wq.y, wq.z, wq.w);

//   // Convert from world space to local space
//   const parentWorldQuat = new THREE.Quaternion();
//   if (wristBone.parent) {
//     wristBone.parent.getWorldQuaternion(parentWorldQuat);
//   }

//   // RPM rest pose offset
//   const restPoseOffset = new THREE.Quaternion();
//   if (side === "left") {
//     restPoseOffset.setFromEuler(new THREE.Euler(0, 0, 0));
//   } else {
//     restPoseOffset.setFromEuler(new THREE.Euler(0, 0, 0));
//   }

//   const localQuat = parentWorldQuat
//     .clone()
//     .invert()
//     .multiply(targetQuat)
//     .multiply(restPoseOffset);

//   const smoothedQuat = getSmoothedQuaternion(
//     wristBoneName,
//     localQuat,
//     CONFIG.WRIST_SMOOTHING,
//   );

//   wristBone.quaternion.copy(smoothedQuat);
// }

// // ============================================
// // FINGER PROCESSING
// // ============================================

// function calculateFingerRotations(
//   landmarks: Array<{ x: number; y: number; z: number }>,
//   fingerName: keyof typeof FINGER_CHAINS,
//   side: "left" | "right",
// ): THREE.Quaternion[] {
//   const chain = FINGER_CHAINS[fingerName];
//   const rotations: THREE.Quaternion[] = [];

//   const isThumb = fingerName === "thumb";
//   const isLeft = side === "left";

//   const positions = chain.map((idx) => vec3FromLandmarks(landmarks, idx));

//   for (let i = 0; i < 4; i++) {
//     const p0 = positions[Math.max(0, i)];
//     const p1 = positions[i + 1];
//     const p2 = positions[Math.min(i + 2, 4)];

//     const v1 = new THREE.Vector3().subVectors(p0, p1).normalize();
//     const v2 = new THREE.Vector3().subVectors(p2, p1).normalize();

//     const dot = THREE.MathUtils.clamp(v1.dot(v2), -1, 1);
//     const bendAngle = Math.acos(dot);

//     let curlAmount = (Math.PI - bendAngle) * CONFIG.FINGER_CURL_MULTIPLIER;

//     let maxCurl = Math.PI * 0.5;
//     if (i === 0) maxCurl = Math.PI * 0.4;
//     if (i === 3) maxCurl = Math.PI * 0.35;

//     curlAmount = THREE.MathUtils.clamp(curlAmount, 0, maxCurl);

//     let rotation: THREE.Quaternion;

//     if (isThumb) {
//       const curlAxis = new THREE.Vector3(1, 0, 0);
//       const spreadAxis = new THREE.Vector3(0, 0, 1);

//       const spreadAngle = calculateThumbSpread(landmarks, i, isLeft);

//       const curlQuat = new THREE.Quaternion().setFromAxisAngle(
//         curlAxis,
//         curlAmount,
//       );
//       const spreadQuat = new THREE.Quaternion().setFromAxisAngle(
//         spreadAxis,
//         spreadAngle,
//       );

//       rotation = spreadQuat.multiply(curlQuat);
//     } else {
//       const curlAxis = new THREE.Vector3(1, 0, 0);
//       rotation = new THREE.Quaternion().setFromAxisAngle(curlAxis, curlAmount);

//       if (i === 0) {
//         const spreadAngle = calculateFingerSpread(
//           landmarks,
//           fingerName,
//           isLeft,
//         );
//         const spreadAxis = new THREE.Vector3(0, isLeft ? -1 : 1, 0);
//         const spreadQuat = new THREE.Quaternion().setFromAxisAngle(
//           spreadAxis,
//           spreadAngle,
//         );
//         rotation.premultiply(spreadQuat);
//       }
//     }

//     rotations.push(rotation);
//   }

//   return rotations;
// }

// function calculateThumbSpread(
//   landmarks: Array<{ x: number; y: number; z: number }>,
//   jointIndex: number,
//   isLeft: boolean,
// ): number {
//   const thumbTip = vec3FromLandmarks(landmarks, HL.THUMB_TIP);
//   const indexMcp = vec3FromLandmarks(landmarks, HL.INDEX_MCP);
//   const wrist = vec3FromLandmarks(landmarks, HL.WRIST);

//   const thumbDir = new THREE.Vector3().subVectors(thumbTip, wrist).normalize();
//   const indexDir = new THREE.Vector3().subVectors(indexMcp, wrist).normalize();

//   const cross = new THREE.Vector3().crossVectors(indexDir, thumbDir);

//   let spreadAngle = Math.asin(THREE.MathUtils.clamp(cross.y, -1, 1));
//   spreadAngle *= CONFIG.FINGER_SPREAD_MULTIPLIER;
//   spreadAngle *= 1 - jointIndex * 0.3;

//   return isLeft ? -spreadAngle : spreadAngle;
// }

// function calculateFingerSpread(
//   landmarks: Array<{ x: number; y: number; z: number }>,
//   fingerName: keyof typeof FINGER_CHAINS,
//   isLeft: boolean,
// ): number {
//   const fingerMcpIndices: Record<string, number> = {
//     index: HL.INDEX_MCP,
//     middle: HL.MIDDLE_MCP,
//     ring: HL.RING_MCP,
//     pinky: HL.PINKY_MCP,
//   };

//   const mcpIdx = fingerMcpIndices[fingerName];
//   if (!mcpIdx) return 0;

//   const wrist = vec3FromLandmarks(landmarks, HL.WRIST);
//   const middleMcp = vec3FromLandmarks(landmarks, HL.MIDDLE_MCP);
//   const fingerMcp = vec3FromLandmarks(landmarks, mcpIdx);

//   const refDir = new THREE.Vector3().subVectors(middleMcp, wrist).normalize();
//   const fingerDir = new THREE.Vector3()
//     .subVectors(fingerMcp, wrist)
//     .normalize();

//   const cross = new THREE.Vector3().crossVectors(refDir, fingerDir);
//   let spreadAngle = Math.asin(THREE.MathUtils.clamp(cross.z, -1, 1));

//   spreadAngle *= CONFIG.FINGER_SPREAD_MULTIPLIER;

//   return spreadAngle;
// }

// function applyFingerRotations(
//   boneMap: Map<string, THREE.Bone>,
//   landmarks: Array<{ x: number; y: number; z: number }>,
//   fingerName: keyof typeof FINGER_CHAINS,
//   side: "left" | "right",
// ): void {
//   const boneNames = FINGER_BONES[side][fingerName];
//   const rotations = calculateFingerRotations(landmarks, fingerName, side);

//   for (let i = 0; i < 4; i++) {
//     const boneName = boneNames[i];
//     const bone = getBone(boneMap, boneName);

//     if (!bone) continue;

//     const smoothedQuat = getSmoothedQuaternion(
//       boneName,
//       rotations[i],
//       CONFIG.FINGER_SMOOTHING,
//     );

//     bone.quaternion.copy(smoothedQuat);
//   }
// }

// // ============================================
// // HAND MOTION
// // ============================================

// export function applyHandMotion(
//   boneMap: Map<string, THREE.Bone>,
//   handsData: any,
// ): void {
//   if (!handsData) return;

//   const fingers: Array<keyof typeof FINGER_CHAINS> = [
//     "thumb",
//     "index",
//     "middle",
//     "ring",
//     "pinky",
//   ];

//   if (handsData.left?.landmarks?.length === 21) {
//     applyWristOrientation(boneMap, handsData.left, "left");

//     for (const finger of fingers) {
//       applyFingerRotations(boneMap, handsData.left.landmarks, finger, "left");
//     }
//   }

//   if (handsData.right?.landmarks?.length === 21) {
//     applyWristOrientation(boneMap, handsData.right, "right");

//     for (const finger of fingers) {
//       applyFingerRotations(boneMap, handsData.right.landmarks, finger, "right");
//     }
//   }
// }

// // ============================================
// // FACE MOTION
// // ============================================

// export function applyFaceMotion(
//   skinnedMesh: THREE.SkinnedMesh,
//   faceData: FaceBlendshapes,
// ): void {
//   if (!skinnedMesh.morphTargetDictionary || !skinnedMesh.morphTargetInfluences)
//     return;

//   const dict = skinnedMesh.morphTargetDictionary;
//   const influences = skinnedMesh.morphTargetInfluences;

//   if (faceData.jawOpen !== undefined && dict["jawOpen"] !== undefined) {
//     influences[dict["jawOpen"]] = faceData.jawOpen;
//   }

//   if (faceData.mouthSmile !== undefined) {
//     if (dict["mouthSmile"] !== undefined) {
//       influences[dict["mouthSmile"]] = faceData.mouthSmile;
//     } else if (dict["mouthSmileLeft"] !== undefined) {
//       influences[dict["mouthSmileLeft"]] = faceData.mouthSmile;
//       if (dict["mouthSmileRight"]) {
//         influences[dict["mouthSmileRight"]] = faceData.mouthSmile;
//       }
//     }
//   }

//   const avgBrow =
//     ((faceData.eyeBrowRaise_L || 0) + (faceData.eyeBrowRaise_R || 0)) / 2;
//   if (dict["browInnerUp"] !== undefined) {
//     influences[dict["browInnerUp"]] = avgBrow;
//   }
// }

// // ============================================
// // SETUP
// // ============================================

// export function buildBoneMap(scene: THREE.Object3D): Map<string, THREE.Bone> {
//   const boneMap = new Map<string, THREE.Bone>();

//   scene.traverse((child) => {
//     if (child instanceof THREE.Bone) {
//       boneMap.set(child.name, child);
//       boneMap.set(child.name.toLowerCase(), child);
//     }
//   });

//   // console.log(`🦴 Bone map: ${boneMap.size / 2} bones`);

//   return boneMap;
// }

// export function findSkinnedMesh(
//   scene: THREE.Object3D,
// ): THREE.SkinnedMesh | null {
//   let result: THREE.SkinnedMesh | null = null;
//   scene.traverse((child) => {
//     if (child instanceof THREE.SkinnedMesh && !result) {
//       result = child;
//     }
//   });
//   return result;
// }

// export function resetSmoothingCache(): void {
//   previousQuaternions.clear();
//   console.log("🔄 Smoothing cache reset");
// }
