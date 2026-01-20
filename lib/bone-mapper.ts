import * as THREE from 'three';
import { BodyData, HandsData, FaceBlendshapes, BodyJoint, Quaternion } from '@/types/motion';

const DEG_TO_RAD = THREE.MathUtils.degToRad;

/**
 * Apply body positions and rotations from motion frame to Ready Player Me skeleton
 * uses robust vector alignment with determining correct coordinate space
 */
export function applyBodyMotion(
    boneMap: Map<string, THREE.Bone>,
    bodyData: BodyData
): void {
    const leftArm = boneMap.get('LeftArm');
    const leftForeArm = boneMap.get('LeftForeArm');
    const leftHand = boneMap.get('LeftHand');

    const rightArm = boneMap.get('RightArm');
    const rightForeArm = boneMap.get('RightForeArm');
    const rightHand = boneMap.get('RightHand');

    // Helper to apply quaternion if available
    const applyRot = (bone: THREE.Bone | undefined, q: Quaternion | undefined) => {
        if (bone && q) {
            bone.quaternion.set(q.x, q.y, q.z, q.w);
        }
    };

    // 1. Priority: Apply Quaternions (Direct Rotation)
    // This allows exact orientation including wrist twists which are impossible with just positions
    if (bodyData.left_shoulder_rot) applyRot(leftArm, bodyData.left_shoulder_rot);
    if (bodyData.left_elbow_rot) applyRot(leftForeArm, bodyData.left_elbow_rot);
    if (bodyData.left_wrist_rot) applyRot(leftHand, bodyData.left_wrist_rot);

    if (bodyData.right_shoulder_rot) applyRot(rightArm, bodyData.right_shoulder_rot);
    if (bodyData.right_elbow_rot) applyRot(rightForeArm, bodyData.right_elbow_rot);
    if (bodyData.right_wrist_rot) applyRot(rightHand, bodyData.right_wrist_rot);

    // If quaternions were applied, we might skip the IK part. 
    // However, if only some are present, we might need fallback.
    // For now, if shoulder/elbow rotations exist, we skip IK for that arm.
    const hasLeftRot = !!bodyData.left_shoulder_rot;
    const hasRightRot = !!bodyData.right_shoulder_rot;

    // 2. Fallback: Position-based IK
    // Only run if rotations are missing

    // Correction: Remove coordinate double-negation (Bug #4)
    // Now assuming (x, y, z) is correct 
    const toVec3 = (joint: BodyJoint) => new THREE.Vector3(joint.x, joint.y, joint.z);

    const alignBone = (
        bone: THREE.Bone,
        start: THREE.Vector3,
        end: THREE.Vector3,
        next: THREE.Vector3 | null,
        boneForward: THREE.Vector3
    ) => {
        // 1. Target Direction (World)
        const targetDir = new THREE.Vector3().subVectors(end, start).normalize();

        // 2. Parent Rotation Adjustment
        // We need to calculate the Local Rotation that results in this World Direction
        const parentQuat = new THREE.Quaternion();
        if (bone.parent) {
            bone.parent.getWorldQuaternion(parentQuat);
        }

        const localTargetDir = targetDir.clone().applyQuaternion(parentQuat.clone().invert());
        const alignQuat = new THREE.Quaternion().setFromUnitVectors(boneForward, localTargetDir);
        bone.quaternion.copy(alignQuat);

        // 4. Pole Vector / Roll Correction
        if (next) {
            const forearmDir = new THREE.Vector3().subVectors(next, end).normalize();
            const planeNormal = new THREE.Vector3().crossVectors(targetDir, forearmDir).normalize();

            if (planeNormal.lengthSq() > 0.01) {
                const currentZ = new THREE.Vector3(0, 0, 1).applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()));

                const projectOnPlane = (v: THREE.Vector3, n: THREE.Vector3) =>
                    v.clone().sub(n.clone().multiplyScalar(v.dot(n))).normalize();

                const projCurrent = projectOnPlane(currentZ, targetDir);
                const projTarget = projectOnPlane(planeNormal, targetDir);

                let angle = projCurrent.angleTo(projTarget);
                const cross = new THREE.Vector3().crossVectors(projCurrent, projTarget);
                if (cross.dot(targetDir) < 0) angle = -angle;

                if (!isNaN(angle)) {
                    const twist = new THREE.Quaternion().setFromAxisAngle(boneForward, angle * 0.5);
                    bone.quaternion.multiply(twist);
                }
            }
        }
    };

    // LEFT ARM IK
    if (!hasLeftRot && bodyData.left_shoulder && bodyData.left_elbow && leftArm) {
        const s = toVec3(bodyData.left_shoulder);
        const e = toVec3(bodyData.left_elbow);
        const w = bodyData.left_wrist ? toVec3(bodyData.left_wrist) : null;
        alignBone(leftArm, s, e, w, new THREE.Vector3(1, 0, 0));
    }

    if (!hasLeftRot && bodyData.left_elbow && bodyData.left_wrist && leftForeArm) {
        const e = toVec3(bodyData.left_elbow);
        const w = toVec3(bodyData.left_wrist);
        alignBone(leftForeArm, e, w, null, new THREE.Vector3(1, 0, 0));
    }

    // RIGHT ARM IK
    if (!hasRightRot && bodyData.right_shoulder && bodyData.right_elbow && rightArm) {
        const s = toVec3(bodyData.right_shoulder);
        const e = toVec3(bodyData.right_elbow);
        const w = bodyData.right_wrist ? toVec3(bodyData.right_wrist) : null;
        alignBone(rightArm, s, e, w, new THREE.Vector3(-1, 0, 0));
    }

    if (!hasRightRot && bodyData.right_elbow && bodyData.right_wrist && rightForeArm) {
        const e = toVec3(bodyData.right_elbow);
        const w = toVec3(bodyData.right_wrist);
        alignBone(rightForeArm, e, w, null, new THREE.Vector3(-1, 0, 0));
    }
}

/**
 * Apply per-joint finger rotations (MCP, PIP, DIP angles in degrees)
 * Standard RPM Rig: Z-axis is the hinge for finger curl. 
 * X-axis is length. Y-axis is splay.
 */
export function applyHandMotion(
    boneMap: Map<string, THREE.Bone>,
    handsData: HandsData
): void {
    const fingers = ['thumb', 'index', 'middle', 'ring', 'pinky'] as const;
    const joints = ['mcp', 'pip', 'dip'] as const;
    const boneNumbers = ['1', '2', '3']; // RPM bone naming

    // Bug #6: Remove scale factor
    // const SCALE = 0.8; 
    const SCALE = 1.0;

    // Helper for clamping (Bug #5)
    // Fingers typically don't bend backwards much (-10 deg) or curl more than 100 deg
    const clampRotation = (val: number, isLeft: boolean) => {
        // If Left Hand: Curl is Negative Z (0 to -100?)
        // If Right Hand: Curl is Positive Z (0 to 100?)
        // Assuming input 'val' is positive degrees of curl from backend logic

        // Let's assume input is 0..180 degrees.
        // We'll clamp to reasonable human limits [0, 110]
        const clamped = Math.max(0, Math.min(110, val));

        // Chirality
        return isLeft ? -clamped : clamped;
    };

    // LEFT HAND
    if (handsData.left) {
        fingers.forEach(finger => {
            const fingerData = handsData.left?.[finger];
            if (!fingerData) return;

            joints.forEach((joint, idx) => {
                const boneName = `LeftHand${finger.charAt(0).toUpperCase() + finger.slice(1)}${boneNumbers[idx]}`;
                const bone = boneMap.get(boneName);

                if (bone && fingerData[joint] !== undefined) {
                    // Bug #1: Invert finger angles
                    // Assuming data comes in as positive "curl amount"
                    const angle = fingerData[joint];

                    // Apply rotation with clamping and chirality
                    bone.rotation.z = DEG_TO_RAD(clampRotation(angle, true));

                    // Do NOT reset X/Y
                }
            });
        });
    }

    // RIGHT HAND
    if (handsData.right) {
        fingers.forEach(finger => {
            const fingerData = handsData.right?.[finger];
            if (!fingerData) return;

            joints.forEach((joint, idx) => {
                const boneName = `RightHand${finger.charAt(0).toUpperCase() + finger.slice(1)}${boneNumbers[idx]}`;
                const bone = boneMap.get(boneName);

                if (bone && fingerData[joint] !== undefined) {
                    const angle = fingerData[joint];
                    bone.rotation.z = DEG_TO_RAD(clampRotation(angle, false));
                }
            });
        });
    }
}

/**
 * Apply ARKit blendshapes (0-1 normalized) to Ready Player Me morph targets\n */
export function applyFaceMotion(
    skinnedMesh: THREE.SkinnedMesh,
    faceData: FaceBlendshapes
): void {
    if (!skinnedMesh.morphTargetDictionary || !skinnedMesh.morphTargetInfluences) return;

    const morphDict = skinnedMesh.morphTargetDictionary;
    const influences = skinnedMesh.morphTargetInfluences;

    // Apply jaw open (mouth open)
    if (faceData.jawOpen !== undefined && morphDict['jawOpen'] !== undefined) {
        influences[morphDict['jawOpen']] = faceData.jawOpen;
    }

    // Apply mouth smile
    if (faceData.mouthSmile !== undefined && morphDict['mouthSmile'] !== undefined) {
        influences[morphDict['mouthSmile']] = faceData.mouthSmile;
    }

    // Apply eyebrow raise (average left + right for browInnerUp)
    if (faceData.eyeBrowRaise_L !== undefined && faceData.eyeBrowRaise_R !== undefined) {
        const avgBrowRaise = (faceData.eyeBrowRaise_L + faceData.eyeBrowRaise_R) / 2;
        if (morphDict['browInnerUp'] !== undefined) {
            influences[morphDict['browInnerUp']] = avgBrowRaise;
        }
    }
}

/**
 * Build a map of bone names to bone objects for quick lookup
 */
export function buildBoneMap(scene: THREE.Object3D): Map<string, THREE.Bone> {
    const boneMap = new Map<string, THREE.Bone>();

    scene.traverse((child) => {
        if (child instanceof THREE.Bone) {
            boneMap.set(child.name, child);
        }
    });

    return boneMap;
}

/**
 * Find the first skinned mesh in the scene (for morph targets)
 */
export function findSkinnedMesh(scene: THREE.Object3D): THREE.SkinnedMesh | null {
    let skinnedMesh: THREE.SkinnedMesh | null = null;

    scene.traverse((child) => {
        if (child instanceof THREE.SkinnedMesh && !skinnedMesh) {
            skinnedMesh = child;
        }
    });

    return skinnedMesh;
}
