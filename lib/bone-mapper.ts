import * as THREE from 'three';
import { FaceBlendshapes } from '@/types/motion';

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    DEBUG: false,
    POSITION_SCALE: 1.0,
    SWAP_SIDES: false,  // Try false first since you said arms are switched
};

if (typeof window !== 'undefined') {
    (window as any).__MOTION_CONFIG = CONFIG;
    console.log('🎮 Motion config: window.__MOTION_CONFIG');
}

// ============================================
// UTILITIES
// ============================================

function getBone(boneMap: Map<string, THREE.Bone>, name: string): THREE.Bone | undefined {
    if (boneMap.has(name)) return boneMap.get(name);
    if (boneMap.has(name.toLowerCase())) return boneMap.get(name.toLowerCase());
    return undefined;
}

// ============================================
// POSITION-BASED ARM SOLVER (IK)
// ============================================

function solveArmIK(
    shoulderBone: THREE.Bone | undefined,
    elbowBone: THREE.Bone | undefined,
    shoulderPos: { x: number; y: number; z: number },
    elbowPos: { x: number; y: number; z: number },
    wristPos: { x: number; y: number; z: number },
    label: string = ''
): void {
    if (!shoulderBone || !elbowBone) return;

    const scale = CONFIG.POSITION_SCALE;

    // Convert positions - NEGATE Y for Three.js coordinate system
    const shoulder = new THREE.Vector3(
        shoulderPos.x * scale,
        -shoulderPos.y * scale,
        shoulderPos.z * scale
    );
    const elbow = new THREE.Vector3(
        elbowPos.x * scale,
        -elbowPos.y * scale,
        elbowPos.z * scale
    );
    const wrist = new THREE.Vector3(
        wristPos.x * scale,
        -wristPos.y * scale,
        wristPos.z * scale
    );

    // Calculate direction vectors
    const upperArmDir = new THREE.Vector3().subVectors(elbow, shoulder).normalize();
    const lowerArmDir = new THREE.Vector3().subVectors(wrist, elbow).normalize();

    // RPM arms point along +Y in local space
    const restDir = new THREE.Vector3(0, 1, 0);

    // Calculate and apply upper arm rotation
    const upperArmQuat = new THREE.Quaternion().setFromUnitVectors(restDir, upperArmDir);

    const parentWorldQuat = new THREE.Quaternion();
    if (shoulderBone.parent) {
        shoulderBone.parent.getWorldQuaternion(parentWorldQuat);
    }
    const localUpperQuat = parentWorldQuat.clone().invert().multiply(upperArmQuat);
    shoulderBone.quaternion.copy(localUpperQuat);

    // Calculate and apply lower arm rotation
    const lowerArmQuat = new THREE.Quaternion().setFromUnitVectors(restDir, lowerArmDir);

    const elbowParentWorldQuat = new THREE.Quaternion();
    shoulderBone.getWorldQuaternion(elbowParentWorldQuat);
    const localLowerQuat = elbowParentWorldQuat.clone().invert().multiply(lowerArmQuat);
    elbowBone.quaternion.copy(localLowerQuat);

    if (CONFIG.DEBUG) {
        console.log(`${label} shoulder→elbow:`, upperArmDir);
        console.log(`${label} elbow→wrist:`, lowerArmDir);
    }
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

    const jsonLeftShoulder = bodyData.left_shoulder;
    const jsonLeftElbow = bodyData.left_elbow;
    const jsonLeftWrist = bodyData.left_wrist;

    const jsonRightShoulder = bodyData.right_shoulder;
    const jsonRightElbow = bodyData.right_elbow;
    const jsonRightWrist = bodyData.right_wrist;

    if (CONFIG.SWAP_SIDES) {
        if (jsonLeftShoulder && jsonLeftElbow && jsonLeftWrist) {
            solveArmIK(rightArm, rightForeArm, jsonLeftShoulder, jsonLeftElbow, jsonLeftWrist, '[R_ARM]');
        }
        if (jsonRightShoulder && jsonRightElbow && jsonRightWrist) {
            solveArmIK(leftArm, leftForeArm, jsonRightShoulder, jsonRightElbow, jsonRightWrist, '[L_ARM]');
        }
    } else {
        if (jsonLeftShoulder && jsonLeftElbow && jsonLeftWrist) {
            solveArmIK(leftArm, leftForeArm, jsonLeftShoulder, jsonLeftElbow, jsonLeftWrist, '[L_ARM]');
        }
        if (jsonRightShoulder && jsonRightElbow && jsonRightWrist) {
            solveArmIK(rightArm, rightForeArm, jsonRightShoulder, jsonRightElbow, jsonRightWrist, '[R_ARM]');
        }
    }
}

// ============================================
// HAND MOTION
// ============================================

export function applyHandMotion(
    boneMap: Map<string, THREE.Bone>,
    handsData: any
): void {
    // Skip for now
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

    console.log(`🦴 Bone map: ${boneMap.size} entries`);
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