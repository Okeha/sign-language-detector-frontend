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

export interface FaceBlendshapes {
    jawOpen?: number;
    mouthSmile?: number;
    eyeBrowRaise_L?: number;
    eyeBrowRaise_R?: number;
}

export interface LandmarkPoint {
    x: number;
    y: number;
    z: number;
    visibility?: number;
}

export interface BodyData {
    worldLandmarks: LandmarkPoint[];
}

export interface HandData {
    landmarks: LandmarkPoint[];
}

export interface HandsData {
    left?: HandData | null;
    right?: HandData | null;
}

export interface MotionFrame {
    timestamp: number;
    body?: BodyData | null;
    hands?: HandsData | null;
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
    sequence: string[];
    sequenceIndex: number;
    isSequencePlaying: boolean;
}