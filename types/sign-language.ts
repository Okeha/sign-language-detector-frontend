/**
 * Type definitions for Sign Language Detection System
 */

// WebSocket Message Types
export interface FrameData {
    session_id: string;
    frames: string[]; // Base64 encoded frames
    timestamp: number;
    frame_count: number;
}

export interface GlossPrediction {
    gloss: string;
    confidence: number;
    top5?: Array<[string, number]>; // API returns tuple format
    timestamp: number;
    latency_ms?: number;
}

export interface WebSocketMessage {
    type: "prediction" | "error" | "status" | "connected";
    data?: GlossPrediction | string;
    error?: string;
    message?: string;
}

// Hook Return Types
export interface UseWebcamReturn {
    videoRef: React.RefObject<HTMLVideoElement | null>;
    stream: MediaStream | null;
    isActive: boolean;
    error: string | null;
    startCamera: () => Promise<void>;
    stopCamera: () => void;
    captureFrame: () => string | null;
}

export interface UseSignLanguageStreamReturn {
    isConnected: boolean;
    isStreaming: boolean;
    lastPrediction: GlossPrediction | null;
    error: string | null;
    sessionId: string;
    connect: () => void;
    disconnect: () => void;
    startStreaming: () => void;
    stopStreaming: () => void;
}

export interface UseFrameBufferReturn {
    addFrame: (frame: string) => void;
    frames: string[];
    isReady: boolean;
    clear: () => void;
    progress: number; // 0-100
}
