import * as THREE from 'three';
import { FaceBlendshapes } from '@/types/motion';

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    DEBUG: false,
    POSITION_SCALE: 1.0,
    SWAP_SIDES: false,

    // Arm offsets to prevent clipping/awkward poses
    ARM_Z_OFFSET: 0.3,
    ARM_X_OFFSET: -0.05,

    // Finger settings
    FINGER_CURL_MULTIPLIER: 0.35,

    // Smoothing (0 = none, 0.5 = moderate, 0.8 = very smooth)
    ARM_SMOOTHING: 0.3,
    FINGER_SMOOTHING: 0.6,
};

if (typeof window !== 'undefined') {
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
    console.log('🎮 Config: setArmOffset(n) | setArmXOffset(n) | setFingerCurl(n) | setFingerSmoothing(n) | setArmSmoothing(n)');
}

// ============================================
// MEDIAPIPE HAND LANDMARK INDICES
// ============================================
const HL = {
    WRIST: 0,
    THUMB_CMC: 1, THUMB_MCP: 2, THUMB_IP: 3, THUMB_TIP: 4,
    INDEX_MCP: 5, INDEX_PIP: 6, INDEX_DIP: 7, INDEX_TIP: 8,
    MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_DIP: 11, MIDDLE_TIP: 12,
    RING_MCP: 13, RING_PIP: 14, RING_DIP: 15, RING_TIP: 16,
    PINKY_MCP: 17, PINKY_PIP: 18, PINKY_DIP: 19, PINKY_TIP: 20,
};

// Finger landmark chains: [base, joint1, joint2, joint3, tip]
const FINGER_CHAINS = {
    thumb: [HL.WRIST, HL.THUMB_CMC, HL.THUMB_MCP, HL.THUMB_IP, HL.THUMB_TIP],
    index: [HL.WRIST, HL.INDEX_MCP, HL.INDEX_PIP, HL.INDEX_DIP, HL.INDEX_TIP],
    middle: [HL.WRIST, HL.MIDDLE_MCP, HL.MIDDLE_PIP, HL.MIDDLE_DIP, HL.MIDDLE_TIP],
    ring: [HL.WRIST, HL.RING_MCP, HL.RING_PIP, HL.RING_DIP, HL.RING_TIP],
    pinky: [HL.WRIST, HL.PINKY_MCP, HL.PINKY_PIP, HL.PINKY_DIP, HL.PINKY_TIP],
};

// RPM bone names - 4 bones per finger
const FINGER_BONES = {
    left: {
        thumb: ['LeftHandThumb1', 'LeftHandThumb2', 'LeftHandThumb3', 'LeftHandThumb4'],
        index: ['LeftHandIndex1', 'LeftHandIndex2', 'LeftHandIndex3', 'LeftHandIndex4'],
        middle: ['LeftHandMiddle1', 'LeftHandMiddle2', 'LeftHandMiddle3', 'LeftHandMiddle4'],
        ring: ['LeftHandRing1', 'LeftHandRing2', 'LeftHandRing3', 'LeftHandRing4'],
        pinky: ['LeftHandPinky1', 'LeftHandPinky2', 'LeftHandPinky3', 'LeftHandPinky4'],
    },
    right: {
        thumb: ['RightHandThumb1', 'RightHandThumb2', 'RightHandThumb3', 'RightHandThumb4'],
        index: ['RightHandIndex1', 'RightHandIndex2', 'RightHandIndex3', 'RightHandIndex4'],
        middle: ['RightHandMiddle1', 'RightHandMiddle2', 'RightHandMiddle3', 'RightHandMiddle4'],
        ring: ['RightHandRing1', 'RightHandRing2', 'RightHandRing3', 'RightHandRing4'],
        pinky: ['RightHandPinky1', 'RightHandPinky2', 'RightHandPinky3', 'RightHandPinky4'],
    },
};

// ============================================
// SMOOTHING CACHE
// ============================================
const previousQuaternions: Map<string, THREE.Quaternion> = new Map();

function getSmoothedQuaternion(
    boneName: string,
    targetQuat: THREE.Quaternion,
    smoothing: number
): THREE.Quaternion {
    const result = new THREE.Quaternion();

    if (smoothing <= 0) {
        return targetQuat.clone();
    }

    const prevQuat = previousQuaternions.get(boneName);

    if (prevQuat) {
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

function getBone(boneMap: Map<string, THREE.Bone>, name: string): THREE.Bone | undefined {
    return boneMap.get(name) || boneMap.get(name.toLowerCase());
}

function landmarkToVec3(
    lm: { x: number; y: number; z: number },
    mirrorX: boolean = false
): THREE.Vector3 {
    // Mirror X for left hand to fix inverted wrist
    const x = mirrorX ? -(lm.x - 0.5) : (lm.x - 0.5);

    return new THREE.Vector3(
        x,
        -(lm.y - 0.5),
        -lm.z
    );
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
    isLeftArm: boolean = true
): void {
    if (!shoulderBone || !elbowBone) return;

    const scale = CONFIG.POSITION_SCALE;
    const zOffset = CONFIG.ARM_Z_OFFSET;
    const xOffset = CONFIG.ARM_X_OFFSET;

    const xSign = isLeftArm ? 1 : -1;

    const shoulder = new THREE.Vector3(
        shoulderPos.x * scale,
        -shoulderPos.y * scale,
        shoulderPos.z * scale
    );
    const elbow = new THREE.Vector3(
        elbowPos.x * scale + (xOffset * 0.5 * xSign),
        -elbowPos.y * scale,
        elbowPos.z * scale + (zOffset * 0.5)
    );
    const wrist = new THREE.Vector3(
        wristPos.x * scale + (xOffset * xSign),
        -wristPos.y * scale,
        wristPos.z * scale + zOffset
    );

    const upperArmDir = new THREE.Vector3().subVectors(elbow, shoulder).normalize();
    const lowerArmDir = new THREE.Vector3().subVectors(wrist, elbow).normalize();

    const restDir = new THREE.Vector3(0, 1, 0);

    // Upper arm
    const upperArmQuat = new THREE.Quaternion().setFromUnitVectors(restDir, upperArmDir);
    const parentWorldQuat = new THREE.Quaternion();
    if (shoulderBone.parent) {
        shoulderBone.parent.getWorldQuaternion(parentWorldQuat);
    }
    const localUpperQuat = parentWorldQuat.clone().invert().multiply(upperArmQuat);

    const smoothedUpperQuat = getSmoothedQuaternion(
        shoulderBone.name,
        localUpperQuat,
        CONFIG.ARM_SMOOTHING
    );
    shoulderBone.quaternion.copy(smoothedUpperQuat);

    // Lower arm
    const lowerArmQuat = new THREE.Quaternion().setFromUnitVectors(restDir, lowerArmDir);
    const elbowParentWorldQuat = new THREE.Quaternion();
    shoulderBone.getWorldQuaternion(elbowParentWorldQuat);
    const localLowerQuat = elbowParentWorldQuat.clone().invert().multiply(lowerArmQuat);

    const smoothedLowerQuat = getSmoothedQuaternion(
        elbowBone.name,
        localLowerQuat,
        CONFIG.ARM_SMOOTHING
    );
    elbowBone.quaternion.copy(smoothedLowerQuat);
}

// ============================================
// BODY MOTION
// ============================================

export function applyBodyMotion(
    boneMap: Map<string, THREE.Bone>,
    bodyData: any
): void {
    if (!bodyData) return;

    const leftArm = getBone(boneMap, 'LeftArm');
    const leftForeArm = getBone(boneMap, 'LeftForeArm');
    const rightArm = getBone(boneMap, 'RightArm');
    const rightForeArm = getBone(boneMap, 'RightForeArm');

    if (CONFIG.SWAP_SIDES) {
        if (bodyData.left_shoulder && bodyData.left_elbow && bodyData.left_wrist) {
            solveArmIK(rightArm, rightForeArm, bodyData.left_shoulder, bodyData.left_elbow, bodyData.left_wrist, false);
        }
        if (bodyData.right_shoulder && bodyData.right_elbow && bodyData.right_wrist) {
            solveArmIK(leftArm, leftForeArm, bodyData.right_shoulder, bodyData.right_elbow, bodyData.right_wrist, true);
        }
    } else {
        if (bodyData.left_shoulder && bodyData.left_elbow && bodyData.left_wrist) {
            solveArmIK(leftArm, leftForeArm, bodyData.left_shoulder, bodyData.left_elbow, bodyData.left_wrist, true);
        }
        if (bodyData.right_shoulder && bodyData.right_elbow && bodyData.right_wrist) {
            solveArmIK(rightArm, rightForeArm, bodyData.right_shoulder, bodyData.right_elbow, bodyData.right_wrist, false);
        }
    }
}

// ============================================
// FINGER PROCESSING
// ============================================

function getJointBendAngle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): number {
    const ba = new THREE.Vector3().subVectors(a, b).normalize();
    const bc = new THREE.Vector3().subVectors(c, b).normalize();
    const dot = THREE.MathUtils.clamp(ba.dot(bc), -1, 1);
    return Math.acos(dot);
}

function processFingerCurlOnly(
    boneMap: Map<string, THREE.Bone>,
    landmarks: Array<{ x: number; y: number; z: number }>,
    fingerName: keyof typeof FINGER_CHAINS,
    side: 'left' | 'right'
): void {
    const chain = FINGER_CHAINS[fingerName];
    const boneNames = FINGER_BONES[side][fingerName];

    const isThumb = fingerName === 'thumb';
    const isLeft = side === 'left';

    // Mirror X for left hand to fix inverted wrist
    const positions = chain.map(idx => landmarkToVec3(landmarks[idx], isLeft));

    for (let i = 0; i < 4; i++) {
        const boneName = boneNames[i];
        const bone = getBone(boneMap, boneName);

        if (!bone) continue;

        const p0 = positions[Math.max(0, i)];
        const p1 = positions[Math.min(i + 1, 4)];
        const p2 = positions[Math.min(i + 2, 4)];

        const bendAngle = getJointBendAngle(p0, p1, p2);

        // Convert to curl amount
        let curlAmount = (Math.PI - bendAngle) * CONFIG.FINGER_CURL_MULTIPLIER;

        // Clamp to prevent hyper-extension
        curlAmount = THREE.MathUtils.clamp(curlAmount, 0, Math.PI * 0.5);

        // Rotation axis
        let axis: THREE.Vector3;

        if (isThumb) {
            // Thumb curls on a diagonal axis
            axis = new THREE.Vector3(1, 0, isLeft ? 0.5 : -0.5).normalize();
        } else {
            // Regular fingers curl around local X axis
            axis = new THREE.Vector3(1, 0, 0);
        }

        const targetQuat = new THREE.Quaternion().setFromAxisAngle(axis, curlAmount);

        const smoothedQuat = getSmoothedQuaternion(
            boneName,
            targetQuat,
            CONFIG.FINGER_SMOOTHING
        );

        bone.quaternion.copy(smoothedQuat);
    }
}

// ============================================
// HAND MOTION
// ============================================

export function applyHandMotion(
    boneMap: Map<string, THREE.Bone>,
    handsData: any
): void {
    if (!handsData) return;

    const fingers: Array<keyof typeof FINGER_CHAINS> = ['thumb', 'index', 'middle', 'ring', 'pinky'];

    if (handsData.left?.landmarks?.length === 21) {
        const landmarks = handsData.left.landmarks;
        for (const finger of fingers) {
            processFingerCurlOnly(boneMap, landmarks, finger, 'left');
        }
    }

    if (handsData.right?.landmarks?.length === 21) {
        const landmarks = handsData.right.landmarks;
        for (const finger of fingers) {
            processFingerCurlOnly(boneMap, landmarks, finger, 'right');
        }
    }
}

// ============================================
// FACE MOTION
// ============================================

export function applyFaceMotion(
    skinnedMesh: THREE.SkinnedMesh,
    faceData: FaceBlendshapes
): void {
    if (!skinnedMesh.morphTargetDictionary || !skinnedMesh.morphTargetInfluences) return;

    const dict = skinnedMesh.morphTargetDictionary;
    const influences = skinnedMesh.morphTargetInfluences;

    if (faceData.jawOpen !== undefined && dict['jawOpen'] !== undefined) {
        influences[dict['jawOpen']] = faceData.jawOpen;
    }

    if (faceData.mouthSmile !== undefined) {
        if (dict['mouthSmile'] !== undefined) {
            influences[dict['mouthSmile']] = faceData.mouthSmile;
        } else if (dict['mouthSmileLeft'] !== undefined) {
            influences[dict['mouthSmileLeft']] = faceData.mouthSmile;
            if (dict['mouthSmileRight']) {
                influences[dict['mouthSmileRight']] = faceData.mouthSmile;
            }
        }
    }

    const avgBrow = ((faceData.eyeBrowRaise_L || 0) + (faceData.eyeBrowRaise_R || 0)) / 2;
    if (dict['browInnerUp'] !== undefined) {
        influences[dict['browInnerUp']] = avgBrow;
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

    console.log(`🦴 Bone map: ${boneMap.size / 2} bones`);

    return boneMap;
}

export function findSkinnedMesh(scene: THREE.Object3D): THREE.SkinnedMesh | null {
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
    console.log('🔄 Smoothing cache reset');
}