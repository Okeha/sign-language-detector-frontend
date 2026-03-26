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
  ARM_Y_OFFSET_RIGHT: 0,

  // Smoothing factors (0 = instant, 1 = frozen)
  ARM_SMOOTHING: 0.3,
  WRIST_SMOOTHING: 0.3,
  FINGER_SMOOTHING: 0.35,
  LANDMARK_SMOOTHING: 0.3,
};

// Runtime config tweaks
if (typeof window !== "undefined") {
  (window as any).__MOTION_CONFIG = CONFIG;
  (window as any).setArmOffset = (val: number) => { CONFIG.ARM_Z_OFFSET = val; };
  (window as any).setArmXOffset = (val: number) => { CONFIG.ARM_X_OFFSET = val; };
  (window as any).setFingerSmoothing = (val: number) => { CONFIG.FINGER_SMOOTHING = val; };
}

// ============================================
// MEDIAPIPE HAND LANDMARK INDICES
// ============================================
const HL = {
  WRIST: 0, THUMB_CMC: 1, THUMB_MCP: 2, THUMB_IP: 3, THUMB_TIP: 4,
  INDEX_MCP: 5, INDEX_PIP: 6, INDEX_DIP: 7, INDEX_TIP: 8,
  MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_DIP: 11, MIDDLE_TIP: 12,
  RING_MCP: 13, RING_PIP: 14, RING_DIP: 15, RING_TIP: 16,
  PINKY_MCP: 17, PINKY_PIP: 18, PINKY_DIP: 19, PINKY_TIP: 20,
};

const FINGER_BONES = {
  left: {
    thumb: ["LeftHandThumb1", "LeftHandThumb2", "LeftHandThumb3", "LeftHandThumb4"],
    index: ["LeftHandIndex1", "LeftHandIndex2", "LeftHandIndex3", "LeftHandIndex4"],
    middle: ["LeftHandMiddle1", "LeftHandMiddle2", "LeftHandMiddle3", "LeftHandMiddle4"],
    ring: ["LeftHandRing1", "LeftHandRing2", "LeftHandRing3", "LeftHandRing4"],
    pinky: ["LeftHandPinky1", "LeftHandPinky2", "LeftHandPinky3", "LeftHandPinky4"],
  },
  right: {
    thumb: ["RightHandThumb1", "RightHandThumb2", "RightHandThumb3", "RightHandThumb4"],
    index: ["RightHandIndex1", "RightHandIndex2", "RightHandIndex3", "RightHandIndex4"],
    middle: ["RightHandMiddle1", "RightHandMiddle2", "RightHandMiddle3", "RightHandMiddle4"],
    ring: ["RightHandRing1", "RightHandRing2", "RightHandRing3", "RightHandRing4"],
    pinky: ["RightHandPinky1", "RightHandPinky2", "RightHandPinky3", "RightHandPinky4"],
  },
};

// Landmark pairs for direction-based finger IK (3 active bones per finger)
const FINGER_SEGMENTS: Record<string, [number, number][]> = {
  thumb: [[HL.THUMB_CMC, HL.THUMB_MCP], [HL.THUMB_MCP, HL.THUMB_IP], [HL.THUMB_IP, HL.THUMB_TIP]],
  index: [[HL.INDEX_MCP, HL.INDEX_PIP], [HL.INDEX_PIP, HL.INDEX_DIP], [HL.INDEX_DIP, HL.INDEX_TIP]],
  middle: [[HL.MIDDLE_MCP, HL.MIDDLE_PIP], [HL.MIDDLE_PIP, HL.MIDDLE_DIP], [HL.MIDDLE_DIP, HL.MIDDLE_TIP]],
  ring: [[HL.RING_MCP, HL.RING_PIP], [HL.RING_PIP, HL.RING_DIP], [HL.RING_DIP, HL.RING_TIP]],
  pinky: [[HL.PINKY_MCP, HL.PINKY_PIP], [HL.PINKY_PIP, HL.PINKY_DIP], [HL.PINKY_DIP, HL.PINKY_TIP]],
};

const WRIST_BONES = {
  left: "LeftHand",
  right: "RightHand",
};

// ============================================
// REST POSE STORAGE
// ============================================
const restPoseQuaternions: Map<string, THREE.Quaternion> = new Map();
const restWorldQuaternions: Map<string, THREE.Quaternion> = new Map();
let restPoseCaptured = false;

export function captureRestPose(boneMap: Map<string, THREE.Bone>): void {
  boneMap.forEach((bone) => bone.updateWorldMatrix(true, false));
  boneMap.forEach((bone, name) => {
    const localQuat = bone.quaternion.clone();
    restPoseQuaternions.set(name, localQuat);
    bone.userData.__restQuat = localQuat.clone();

    // Also store world-space quaternion (needed for twist-free finger IK)
    const worldQuat = new THREE.Quaternion();
    bone.getWorldQuaternion(worldQuat);
    restWorldQuaternions.set(name, worldQuat);
    bone.userData.__restWorldQuat = worldQuat.clone();
  });
  restPoseCaptured = true;
}

function getRestQuat(bone: THREE.Bone, boneName: string): THREE.Quaternion | undefined {
  return restPoseQuaternions.get(boneName) || bone.userData?.__restQuat;
}

function getRestWorldQuat(bone: THREE.Bone, boneName: string): THREE.Quaternion | undefined {
  return restWorldQuaternions.get(boneName) || bone.userData?.__restWorldQuat;
}

function recoverRestPoses(boneMap: Map<string, THREE.Bone>): void {
  if (restPoseCaptured) return;
  let recovered = 0;
  boneMap.forEach((bone, name) => {
    if (bone.userData?.__restQuat && !restPoseQuaternions.has(name)) {
      restPoseQuaternions.set(name, (bone.userData.__restQuat as THREE.Quaternion).clone());
      if (bone.userData.__restWorldQuat) {
        restWorldQuaternions.set(name, (bone.userData.__restWorldQuat as THREE.Quaternion).clone());
      }
      recovered++;
    }
  });
  if (recovered > 0) {
    restPoseCaptured = true;
    console.log(`[bone-mapper] Recovered ${recovered} rest poses from bone userData`);
  }
}

export function resetToRestPose(boneMap: Map<string, THREE.Bone>): void {
  recoverRestPoses(boneMap);
  if (!restPoseCaptured) return;
  boneMap.forEach((bone, name) => {
    const restQuat = getRestQuat(bone, name);
    if (restQuat) bone.quaternion.copy(restQuat);
  });
  previousQuaternions.clear();
}

export function blendToRestPose(boneMap: Map<string, THREE.Bone>, blendFactor: number = 0.1, threshold: number = 0.001): boolean {
  recoverRestPoses(boneMap);
  if (!restPoseCaptured) return true;
  let allDone = true;

  boneMap.forEach((bone, name) => {
    const restQuat = getRestQuat(bone, name);
    if (!restQuat) return;

    if (Math.abs(bone.quaternion.dot(restQuat)) >= 1 - threshold) {
      bone.quaternion.copy(restQuat);
      return;
    }

    allDone = false;
    const target = restQuat.clone();
    if (bone.quaternion.dot(target) < 0) target.set(-target.x, -target.y, -target.z, -target.w);
    bone.quaternion.slerp(target, blendFactor);
  });

  if (allDone) previousQuaternions.clear();
  return allDone;
}

export function isRestPoseCaptured(): boolean {
  return restPoseCaptured;
}

// ============================================
// SMOOTHING STATE
// ============================================
const previousQuaternions: Map<string, THREE.Quaternion> = new Map();
const previousLandmarks: Map<string, Array<{ x: number; y: number; z: number }>> = new Map();

function ensureShortestPath(prev: THREE.Quaternion, target: THREE.Quaternion): void {
  if (prev.dot(target) < 0) target.set(-target.x, -target.y, -target.z, -target.w);
}

function getSmoothedQuaternion(boneName: string, targetQuat: THREE.Quaternion, smoothing: number): THREE.Quaternion {
  const result = new THREE.Quaternion();

  if (smoothing <= 0) {
    previousQuaternions.set(boneName, targetQuat.clone());
    return targetQuat.clone();
  }

  const prevQuat = previousQuaternions.get(boneName);
  if (prevQuat) {
    ensureShortestPath(prevQuat, targetQuat);
    result.slerpQuaternions(prevQuat, targetQuat, 1 - smoothing);
  } else {
    result.copy(targetQuat);
  }

  previousQuaternions.set(boneName, result.clone());
  return result;
}

function getSmoothedLandmarks(
  landmarks: Array<{ x: number; y: number; z: number }>,
  key: string,
): Array<{ x: number; y: number; z: number }> {
  const prev = previousLandmarks.get(key);
  const alpha = 1 - CONFIG.LANDMARK_SMOOTHING;

  if (!prev || prev.length !== landmarks.length) {
    previousLandmarks.set(key, landmarks.map(lm => ({ x: lm.x, y: lm.y, z: lm.z })));
    return landmarks;
  }

  const result = landmarks.map((lm, i) => ({
    x: prev[i].x + alpha * (lm.x - prev[i].x),
    y: prev[i].y + alpha * (lm.y - prev[i].y),
    z: prev[i].z + alpha * (lm.z - prev[i].z),
  }));

  previousLandmarks.set(key, result.map(lm => ({ x: lm.x, y: lm.y, z: lm.z })));
  return result;
}

// ============================================
// UTILITIES
// ============================================

function getBone(boneMap: Map<string, THREE.Bone>, name: string): THREE.Bone | undefined {
  return boneMap.get(name) || boneMap.get(name.toLowerCase());
}

function landmarkToVec3(lm: { x: number; y: number; z: number }): THREE.Vector3 {
  return new THREE.Vector3(lm.x, lm.y, lm.z);
}

function vec3FromLandmarks(landmarks: Array<{ x: number; y: number; z: number }>, index: number): THREE.Vector3 {
  return landmarkToVec3(landmarks[index]);
}

function safeSetFromUnitVectors(from: THREE.Vector3, to: THREE.Vector3, fallbackAxis: THREE.Vector3 = new THREE.Vector3(0, 0, 1)): THREE.Quaternion {
  const quat = new THREE.Quaternion();
  const dot = from.dot(to);
  if (dot > 0.9999) return quat.identity();
  else if (dot < -0.9999) return quat.setFromAxisAngle(fallbackAxis, Math.PI);
  return quat.setFromUnitVectors(from, to);
}

// ============================================
// ARM IK SOLVER
// ============================================

function solveArmIK(
  shoulderBone: THREE.Bone | undefined, elbowBone: THREE.Bone | undefined,
  shoulderPos: { x: number; y: number; z: number }, elbowPos: { x: number; y: number; z: number }, wristPos: { x: number; y: number; z: number },
  isLeftArm: boolean = true,
): void {
  if (!shoulderBone || !elbowBone) return;

  const scale = CONFIG.POSITION_SCALE;
  const zOffset = CONFIG.ARM_Z_OFFSET;
  const xOffset = CONFIG.ARM_X_OFFSET;
  const yOffset = isLeftArm ? CONFIG.ARM_Y_OFFSET_LEFT : CONFIG.ARM_Y_OFFSET_RIGHT;
  const xSign = isLeftArm ? 1 : -1;

  const shoulder = new THREE.Vector3(shoulderPos.x * scale, -shoulderPos.y * scale, shoulderPos.z * scale);
  const elbow = new THREE.Vector3(elbowPos.x * scale + xOffset * 0.5 * xSign, -elbowPos.y * scale - yOffset * 0.5, elbowPos.z * scale + zOffset * 0.5);
  const wrist = new THREE.Vector3(wristPos.x * scale + xOffset * xSign, -wristPos.y * scale - yOffset, wristPos.z * scale + zOffset);

  const upperArmDir = new THREE.Vector3().subVectors(elbow, shoulder).normalize();
  const lowerArmDir = new THREE.Vector3().subVectors(wrist, elbow).normalize();
  const restDir = new THREE.Vector3(0, 1, 0);
  const armFallback = new THREE.Vector3(0, 0, isLeftArm ? 1 : -1);

  const upperArmQuat = safeSetFromUnitVectors(restDir, upperArmDir, armFallback);
  const parentWorldQuat = new THREE.Quaternion();
  if (shoulderBone.parent) shoulderBone.parent.getWorldQuaternion(parentWorldQuat);
  const localUpperQuat = parentWorldQuat.clone().invert().multiply(upperArmQuat);
  const smoothedUpperQuat = getSmoothedQuaternion(shoulderBone.name, localUpperQuat, CONFIG.ARM_SMOOTHING);
  shoulderBone.quaternion.copy(smoothedUpperQuat);

  const lowerArmQuat = safeSetFromUnitVectors(restDir, lowerArmDir, armFallback);
  const elbowParentWorldQuat = new THREE.Quaternion();
  shoulderBone.getWorldQuaternion(elbowParentWorldQuat);
  const localLowerQuat = elbowParentWorldQuat.clone().invert().multiply(lowerArmQuat);
  const smoothedLowerQuat = getSmoothedQuaternion(elbowBone.name, localLowerQuat, CONFIG.ARM_SMOOTHING);
  elbowBone.quaternion.copy(smoothedLowerQuat);
}

export function applyBodyMotion(boneMap: Map<string, THREE.Bone>, bodyData: any): void {
  if (!bodyData) return;

  const leftArm = getBone(boneMap, "LeftArm");
  const leftForeArm = getBone(boneMap, "LeftForeArm");
  const rightArm = getBone(boneMap, "RightArm");
  const rightForeArm = getBone(boneMap, "RightForeArm");

  if (CONFIG.SWAP_SIDES) {
    if (bodyData.left_shoulder) solveArmIK(rightArm, rightForeArm, bodyData.left_shoulder, bodyData.left_elbow, bodyData.left_wrist, false);
    if (bodyData.right_shoulder) solveArmIK(leftArm, leftForeArm, bodyData.right_shoulder, bodyData.right_elbow, bodyData.right_wrist, true);
  } else {
    if (bodyData.left_shoulder) solveArmIK(leftArm, leftForeArm, bodyData.left_shoulder, bodyData.left_elbow, bodyData.left_wrist, true);
    if (bodyData.right_shoulder) solveArmIK(rightArm, rightForeArm, bodyData.right_shoulder, bodyData.right_elbow, bodyData.right_wrist, false);
  }
}

// ============================================
// WRIST ORIENTATION
// ============================================

function applyWristFromLandmarks(
  boneMap: Map<string, THREE.Bone>,
  landmarks: Array<{ x: number; y: number; z: number }>,
  side: "left" | "right",
): void {
  const wristBoneName = WRIST_BONES[side];
  const wristBone = getBone(boneMap, wristBoneName);
  if (!wristBone) return;

  // Build wrist orientation directly from the same smoothed landmarks that
  // drive the finger IK.  This guarantees the wrist frame and finger target
  // directions are in the same coordinate convention for both hands.

  const wristLm = vec3FromLandmarks(landmarks, HL.WRIST);
  const indexMcp = vec3FromLandmarks(landmarks, HL.INDEX_MCP);
  const middleMcp = vec3FromLandmarks(landmarks, HL.MIDDLE_MCP);
  const ringMcp = vec3FromLandmarks(landmarks, HL.RING_MCP);
  const pinkyMcp = vec3FromLandmarks(landmarks, HL.PINKY_MCP);

  // Y-axis: forward (wrist → palm center) — same convention as arm IK bone direction
  const palmCenter = new THREE.Vector3()
    .addVectors(indexMcp, middleMcp).add(ringMcp).add(pinkyMcp).multiplyScalar(0.25);
  const yAxis = new THREE.Vector3().subVectors(palmCenter, wristLm);
  if (yAxis.lengthSq() < 1e-10) return;
  yAxis.normalize();

  // Raw palm normal: cross(index-wrist, pinky-wrist).
  // For the left hand the cross product points the opposite way, so negate it
  // to keep the wrist orientation consistent with the rig's mirrored bones.
  const vecToIndex = new THREE.Vector3().subVectors(indexMcp, wristLm);
  const vecToPinky = new THREE.Vector3().subVectors(pinkyMcp, wristLm);
  const rawNormal = new THREE.Vector3().crossVectors(vecToIndex, vecToPinky);
  if (rawNormal.lengthSq() < 1e-10) return;
  if (side === "left") rawNormal.negate();

  // Z-axis: palm normal, orthogonalized against forward
  const zAxis = rawNormal.normalize()
    .addScaledVector(yAxis, -rawNormal.dot(yAxis))
    .normalize();

  // X-axis: lateral, completes right-handed basis
  const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();

  // Rotation matrix: [xAxis | yAxis | zAxis] as columns
  const m = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
  const targetQuat = new THREE.Quaternion().setFromRotationMatrix(m);

  // Convert to parent-local space (same approach as arm IK)
  const parentWorldQuat = new THREE.Quaternion();
  if (wristBone.parent) wristBone.parent.getWorldQuaternion(parentWorldQuat);

  const localQuat = parentWorldQuat.clone().invert().multiply(targetQuat);
  const smoothedQuat = getSmoothedQuaternion(wristBoneName, localQuat, CONFIG.WRIST_SMOOTHING);
  wristBone.quaternion.copy(smoothedQuat);
}

// ============================================
// FINGER PROCESSING (v6 -- Parent-local Delta IK)
//
// v4/v5 mixed rest-pose world directions with animated parent
// world quaternions, which introduces large spurious rotations
// whenever the arm/wrist has moved away from the T-pose.
//
// v6 works entirely in parent-local space:
// 1. restLocalDir = restLocalQ * +Y  (bone direction in parent-local space at rest)
// 2. targetDir    = landmark direction in "world" (MediaPipe) space
// 3. targetLocalDir = parentWorldQ_current^-1 * targetDir  (in parent-local space)
// 4. deltaQ       = minimal rotation from restLocalDir to targetLocalDir
// 5. localQ       = deltaQ * restLocalQ  (preserves rig twist, only changes swing)
//
// Both directions are in the SAME coordinate frame (parent-local),
// so the delta is small and twist-free.
// ============================================

let fingerBoneWarningLogged = false;
let fingerDebugLogged = false;

function applyFingerIK(
  boneMap: Map<string, THREE.Bone>,
  landmarks: Array<{ x: number; y: number; z: number }>,
  fingerName: string,
  side: "left" | "right",
): void {
  const segments = FINGER_SEGMENTS[fingerName];
  const boneNames = FINGER_BONES[side][fingerName as keyof typeof FINGER_BONES["left"]];
  if (!segments || !boneNames) return;

  const upVec = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < 3; i++) {
    const boneName = boneNames[i];
    const bone = getBone(boneMap, boneName);

    if (!bone) {
      if (!fingerBoneWarningLogged) {
        console.warn(`[bone-mapper] Finger bone "${boneName}" not found. Available hand bones:`,
          Array.from(boneMap.keys()).filter(k => k.toLowerCase().includes("hand") && k[0] === k[0].toUpperCase()).join(", "));
        fingerBoneWarningLogged = true;
      }
      continue;
    }

    // Rest local quaternion (captured in T-pose)
    const restLocalQ = getRestQuat(bone, boneName);
    if (!restLocalQ) continue;

    // 1. Direction the bone points in parent-local space at rest
    const restLocalDir = upVec.clone().applyQuaternion(restLocalQ).normalize();

    // 2. Target direction from landmarks (in MediaPipe / ~model world space)
    const [fromIdx, toIdx] = segments[i];
    const from = vec3FromLandmarks(landmarks, fromIdx);
    const to = vec3FromLandmarks(landmarks, toIdx);
    const targetWorldDir = new THREE.Vector3().subVectors(to, from);

    if (targetWorldDir.lengthSq() < 1e-10) continue;
    targetWorldDir.normalize();

    // 3. Transform target direction into parent-local space
    //    This uses the CURRENT animated parent world quat, so it correctly
    //    accounts for the entire chain (shoulder + arm + wrist + prev finger bones)
    const parentWorldQuat = new THREE.Quaternion();
    if (bone.parent) bone.parent.getWorldQuaternion(parentWorldQuat);
    const targetLocalDir = targetWorldDir.clone()
      .applyQuaternion(parentWorldQuat.clone().invert())
      .normalize();

    // 4. Delta rotation from rest to target, both in parent-local space
    //    This is a minimal swing-only rotation -- no spurious twist
    const deltaQuat = safeSetFromUnitVectors(restLocalDir, targetLocalDir);

    // 5. Apply delta to rest local quaternion (preserves the rig's natural twist)
    const localQuat = deltaQuat.clone().multiply(restLocalQ);

    // 6. Smooth and apply
    const smoothed = getSmoothedQuaternion(boneName, localQuat, CONFIG.FINGER_SMOOTHING);
    bone.quaternion.copy(smoothed);

    // Debug log (once per animation start)
    if (!fingerDebugLogged && side === "left" && fingerName === "index" && i === 0) {
      console.log(`[finger-IK] ${boneName}: restLocalDir=(${restLocalDir.x.toFixed(3)},${restLocalDir.y.toFixed(3)},${restLocalDir.z.toFixed(3)}) targetLocalDir=(${targetLocalDir.x.toFixed(3)},${targetLocalDir.y.toFixed(3)},${targetLocalDir.z.toFixed(3)})`);
      fingerDebugLogged = true;
    }
  }

  // 4th bone (fingertip terminator): keep at rest pose
  const tipBoneName = boneNames[3];
  const tipBone = getBone(boneMap, tipBoneName);
  if (tipBone) {
    const rq = getRestQuat(tipBone, tipBoneName);
    if (rq) tipBone.quaternion.copy(rq);
  }
}

export function applyHandMotion(boneMap: Map<string, THREE.Bone>, handsData: any): void {
  if (!handsData) return;

  // Ensure rest poses are available (guards against HMR module reload)
  recoverRestPoses(boneMap);

  const fingerNames = ["thumb", "index", "middle", "ring", "pinky"];

  if (handsData.left?.landmarks?.length === 21) {
    const smoothedLandmarks = getSmoothedLandmarks(handsData.left.landmarks, "left_hand");
    applyWristFromLandmarks(boneMap, smoothedLandmarks, "left");
    for (const finger of fingerNames) applyFingerIK(boneMap, smoothedLandmarks, finger, "left");
  }

  if (handsData.right?.landmarks?.length === 21) {
    const smoothedLandmarks = getSmoothedLandmarks(handsData.right.landmarks, "right_hand");
    applyWristFromLandmarks(boneMap, smoothedLandmarks, "right");
    for (const finger of fingerNames) applyFingerIK(boneMap, smoothedLandmarks, finger, "right");
  }
}

// ============================================
// FACE MOTION
// ============================================

function setMorphTarget(
  dict: Record<string, number>,
  influences: number[],
  name: string,
  value: number,
): boolean {
  if (dict[name] !== undefined) {
    influences[dict[name]] = value;
    return true;
  }
  return false;
}

let faceDebugLogged = false;

function applyFaceMotionToMesh(mesh: THREE.SkinnedMesh, faceData: FaceBlendshapes, logDiag: boolean): void {
  if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;

  const dict = mesh.morphTargetDictionary;
  const influences = mesh.morphTargetInfluences;

  if (logDiag) {
    const names = Object.keys(dict);
    console.log(`[face] Mesh "${mesh.name}" has ${names.length} morph targets:`, names.join(", "));
  }

  // jawOpen: try "jawOpen" first, fall back to "mouthOpen"
  if (faceData.jawOpen !== undefined) {
    if (!setMorphTarget(dict, influences, "jawOpen", faceData.jawOpen)) {
      setMorphTarget(dict, influences, "mouthOpen", faceData.jawOpen);
    }
  }

  // mouthSmile: single or split
  if (faceData.mouthSmile !== undefined) {
    if (!setMorphTarget(dict, influences, "mouthSmile", faceData.mouthSmile)) {
      setMorphTarget(dict, influences, "mouthSmileLeft", faceData.mouthSmile);
      setMorphTarget(dict, influences, "mouthSmileRight", faceData.mouthSmile);
    }
  }

  // eyeBrowRaise
  const browL = faceData.eyeBrowRaise_L || 0;
  const browR = faceData.eyeBrowRaise_R || 0;
  const avgBrow = (browL + browR) / 2;

  setMorphTarget(dict, influences, "browInnerUp", avgBrow);
  setMorphTarget(dict, influences, "browOuterUpLeft", browL);
  setMorphTarget(dict, influences, "browOuterUpRight", browR);
}

export function applyFaceMotion(meshes: THREE.SkinnedMesh[], faceData: FaceBlendshapes): void {
  const logDiag = !faceDebugLogged;
  for (const mesh of meshes) {
    applyFaceMotionToMesh(mesh, faceData, logDiag);
  }
  if (logDiag) faceDebugLogged = true;
}

// ============================================
// SCENE SETUP
// ============================================

export function buildBoneMap(scene: THREE.Object3D): Map<string, THREE.Bone> {
  const boneMap = new Map<string, THREE.Bone>();
  const uniqueNames: string[] = [];
  scene.traverse((child) => {
    if (child instanceof THREE.Bone) {
      boneMap.set(child.name, child);
      boneMap.set(child.name.toLowerCase(), child);
      uniqueNames.push(child.name);
    }
  });
  console.log(`[bone-mapper] ${uniqueNames.length} bones:`, uniqueNames.join(", "));
  return boneMap;
}

export function findAllMorphMeshes(scene: THREE.Object3D): THREE.SkinnedMesh[] {
  const meshes: THREE.SkinnedMesh[] = [];

  scene.traverse((child) => {
    if (child instanceof THREE.SkinnedMesh) {
      const mesh = child as THREE.SkinnedMesh;
      if (mesh.morphTargetDictionary && Object.keys(mesh.morphTargetDictionary).length > 0) {
        meshes.push(mesh);
      }
    }
  });

  if (meshes.length > 0) {
    console.log(`[face] Found ${meshes.length} mesh(es) with morph targets:`,
      meshes.map(m => `"${m.name}" (${Object.keys(m.morphTargetDictionary!).length})`).join(", "));
  } else {
    console.warn("[face] No SkinnedMesh with morph targets found.");
  }

  return meshes;
}

/** @deprecated Use findAllMorphMeshes instead */
export function findSkinnedMesh(scene: THREE.Object3D): THREE.SkinnedMesh | null {
  const meshes = findAllMorphMeshes(scene);
  return meshes[0] || null;
}

export function resetSmoothingCache(): void {
  previousQuaternions.clear();
  previousLandmarks.clear();
  faceDebugLogged = false;
  fingerBoneWarningLogged = false;
  fingerDebugLogged = false;
  console.log("[bone-mapper] Smoothing cache reset");
}

// ============================================
// DEBUG
// ============================================
if (typeof window !== "undefined") {
  (window as any).testFist = () => {
    console.log("[debug] Rest pose status for finger bones:");
    const sides = ["left", "right"] as const;
    const fingerKeys = ["thumb", "index", "middle", "ring", "pinky"] as const;
    for (const side of sides) {
      for (const finger of fingerKeys) {
        const boneNames = FINGER_BONES[side][finger];
        for (let i = 0; i < 3; i++) {
          const boneName = boneNames[i];
          const has = restPoseQuaternions.has(boneName);
          console.log(`  ${boneName}: restQuat ${has ? "OK" : "MISSING"}`);
        }
      }
    }
  };
}

