import * as THREE from 'three';
import * as Kalidokit from 'kalidokit';
import { FaceBlendshapes } from '@/types/motion';

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    BLEND_FACTOR: 0.5,
    DEBUG: false,
};

if (typeof window !== 'undefined') {
    (window as any).__MOTION_CONFIG = CONFIG;
    console.log('🎮 Motion config available at window.__MOTION_CONFIG');
}

// ============================================
// UTILITIES
// ============================================

function getBone(boneMap: Map<string, THREE.Bone>, name: string): THREE.Bone | undefined {
    if (boneMap.has(name)) return boneMap.get(name);
    if (boneMap.has(name.toLowerCase())) return boneMap.get(name.toLowerCase());
    return undefined;
}

// Helper to apply rotation with blending AND clamping
function applyRotation(
    bone: THREE.Bone | undefined,
    rotation: { x: number; y: number; z: number } | undefined,
    label: string = ''
): void {
    if (!bone || !rotation) return;

    // Clamp rotations to reasonable range (prevent crazy spinning)
    const clamp = (val: number, limit: number = Math.PI) => {
        return Math.max(-limit, Math.min(limit, val));
    };

    const x = clamp(rotation.x);
    const y = clamp(rotation.y);
    const z = clamp(rotation.z);

    // Skip if values are NaN or Infinity
    if (!isFinite(x) || !isFinite(y) || !isFinite(z)) {
        if (CONFIG.DEBUG) {
            console.warn(`${label} Invalid rotation:`, rotation);
        }
        return;
    }

    const target = new THREE.Euler(x, y, z);

    if (CONFIG.BLEND_FACTOR >= 1) {
        bone.rotation.copy(target);
    } else {
        bone.rotation.x += (target.x - bone.rotation.x) * CONFIG.BLEND_FACTOR;
        bone.rotation.y += (target.y - bone.rotation.y) * CONFIG.BLEND_FACTOR;
        bone.rotation.z += (target.z - bone.rotation.z) * CONFIG.BLEND_FACTOR;
    }

    if (CONFIG.DEBUG) {
        console.log(`${label} ${bone.name}:`, { x: x.toFixed(3), y: y.toFixed(3), z: z.toFixed(3) });
    }
}

// ============================================
// BODY MOTION (Using Kalidokit) - FIXED
// ============================================

export function applyBodyMotion(
    boneMap: Map<string, THREE.Bone>,
    bodyData: any
): void {
    if (!bodyData?.worldLandmarks) return;

    const landmarks = bodyData.worldLandmarks;

    // Kalidokit expects: Pose.solve(landmarks2D, landmarks3D)
    // Since we only have world landmarks, create fake 2D by projecting
    const landmarks2D = landmarks.map((lm: any) => ({
        x: (lm.x + 1) / 2,
        y: (-lm.y + 1) / 2,  // Flip Y for screen coords
        z: lm.z,
        visibility: lm.visibility ?? 1
    }));

    // Solve pose
    const pose = Kalidokit.Pose.solve(landmarks2D, landmarks);

    if (!pose) return;

    // Only apply arm rotations for sign language
    // Skip Hips/Spine/Legs to prevent model from flying away

    // Left Arm
    applyRotation(getBone(boneMap, 'LeftArm'), pose.LeftUpperArm, '[L_ARM]');
    applyRotation(getBone(boneMap, 'LeftForeArm'), pose.LeftLowerArm, '[L_FOREARM]');

    // Right Arm
    applyRotation(getBone(boneMap, 'RightArm'), pose.RightUpperArm, '[R_ARM]');
    applyRotation(getBone(boneMap, 'RightForeArm'), pose.RightLowerArm, '[R_FOREARM]');
}

// ============================================
// HAND MOTION (Using Kalidokit)
// ============================================

function applyFingerRotations(
    boneMap: Map<string, THREE.Bone>,
    handResult: any,
    side: 'Left' | 'Right'
): void {
    // Wrist
    applyRotation(getBone(boneMap, `${side}Hand`), handResult[`${side}Wrist`], `[${side}_WRIST]`);

    // Fingers
    const fingers = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];
    const segments = ['Metacarpal', 'Proximal', 'Intermediate', 'Distal'];
    const boneNumbers = ['1', '2', '3', '4'];

    for (const finger of fingers) {
        for (let i = 0; i < segments.length; i++) {
            const kalidokitKey = `${side}${finger}${segments[i]}`;
            const boneName = `${side}Hand${finger}${boneNumbers[i]}`;

            if (handResult[kalidokitKey]) {
                applyRotation(getBone(boneMap, boneName), handResult[kalidokitKey], `[${boneName}]`);
            }
        }
    }
}

export function applyHandMotion(
    boneMap: Map<string, THREE.Bone>,
    handsData: any
): void {
    if (!handsData) return;

    // Left hand
    if (handsData.left?.landmarks && Array.isArray(handsData.left.landmarks)) {
        const leftHand = Kalidokit.Hand.solve(handsData.left.landmarks, 'Left');
        if (leftHand) {
            applyFingerRotations(boneMap, leftHand, 'Left');
        }
    }

    // Right hand
    if (handsData.right?.landmarks && Array.isArray(handsData.right.landmarks)) {
        const rightHand = Kalidokit.Hand.solve(handsData.right.landmarks, 'Right');
        if (rightHand) {
            applyFingerRotations(boneMap, rightHand, 'Right');
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