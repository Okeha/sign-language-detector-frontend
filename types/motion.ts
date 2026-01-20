/**
 * Type definitions for MediaPipe Motion JSON files
 */

export interface Vector3 {
    x: number;
    y: number;
    z: number;
}

export interface Quaternion {
    x: number;
    y: number;
    z: number;
    w: number;
}

export interface EulerRotation {
    yaw: number;
    pitch: number;
    roll: number;
}

export interface BodyJoint {
    x: number;
    y: number;
    z: number;
}

export interface BodyPositions {
    left_shoulder?: BodyJoint;
    right_shoulder?: BodyJoint;
    left_elbow?: BodyJoint;
    right_elbow?: BodyJoint;
    left_wrist?: BodyJoint;
    right_wrist?: BodyJoint;
}

export interface ArmsRotation {
    left?: EulerRotation;
    right?: EulerRotation;
}

export interface BodyData {
    // Joint positions (Three.js coordinates in meters)
    left_shoulder?: BodyJoint;
    right_shoulder?: BodyJoint;
    left_elbow?: BodyJoint;
    right_elbow?: BodyJoint;
    left_wrist?: BodyJoint;
    right_wrist?: BodyJoint;
    left_hip?: BodyJoint;
    right_hip?: BodyJoint;

    // Arm rotations (Quaternions preferred)
    left_shoulder_rot?: Quaternion;
    left_elbow_rot?: Quaternion;
    left_wrist_rot?: Quaternion;

    right_shoulder_rot?: Quaternion;
    right_elbow_rot?: Quaternion;
    right_wrist_rot?: Quaternion;

    // Legacy/Fallback rotations
    left_arm_rotation?: EulerRotation;
    right_arm_rotation?: EulerRotation;
}

// Per-joint finger angles (MCP, PIP, DIP in degrees)
export interface FingerJoints {
    mcp: number;  // Metacarpophalangeal (knuckle) 0-180°
    pip: number;  // Proximal interphalangeal (middle) 0-180°
    dip: number;  // Distal interphalangeal (tip) 0-180°
}

export interface HandData {
    thumb?: FingerJoints;
    index?: FingerJoints;
    middle?: FingerJoints;
    ring?: FingerJoints;
    pinky?: FingerJoints;
}

export interface HandsData {
    left?: HandData;
    right?: HandData;
}

export interface FaceBlendshapes {
    jawOpen?: number;          // 0-1: closed to open
    mouthSmile?: number;        // 0-1: neutral to smile
    eyeBrowRaise_L?: number;    // 0-1: neutral to raised
    eyeBrowRaise_R?: number;    // 0-1: neutral to raised
}

export interface MotionFrame {
    frame_index?: number;
    timestamp: number;
    body?: BodyData | null;
    face?: FaceBlendshapes;
}

export interface MotionClip {
    gloss: string;
    fps: number;
    duration: number;
    frame_count: number;
    frames: MotionFrame[];
}

export interface MotionPlaybackState {
    isPlaying: boolean;
    currentGloss: string | null;
    currentFrame: number;
    totalFrames: number;
    progress: number;
    motion: MotionClip | null;
    // Sequence playback
    sequence: string[];
    sequenceIndex: number;
    isSequencePlaying: boolean;
}
