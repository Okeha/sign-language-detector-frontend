"use client";

import * as React from "react";
import CameraStreamEnhanced from "@/components/layout/video/camera-stream-enhanced";
import ModelViewer from "@/components/layout/3d/model-viewer";
import { Camera, User } from "lucide-react";
import { GlossPrediction } from "@/types/sign-language";

interface RightPanelEnhancedProps {
  onPrediction: (prediction: GlossPrediction) => void;
  onSessionId: (sessionId: string) => void;
  onStreamingChange?: (isStreaming: boolean) => void;
  backendUrl: string;
  currentGloss?: string | null;
  glossSequence?: string[] | null;
}

export function RightPanelEnhanced({
  onPrediction,
  onSessionId,
  onStreamingChange,
  backendUrl,
  currentGloss,
  glossSequence,
}: RightPanelEnhancedProps) {
  return (
    <aside className="flex h-full w-[450px] flex-col border-l bg-sidebar">
      {/* Header */}
      <div className="flex h-14 items-center border-b px-6">
        <h2 className="text-sm font-semibold text-sidebar-foreground">
          Visual Feedback
        </h2>
      </div>

      {/* Content - Two Equal Sections */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Camera Feed Section - 50% height */}
        <div className="flex-1 flex flex-col p-4 border-b">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Camera className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-sidebar-foreground">
                Camera Feed
              </h3>
              <p className="text-xs text-muted-foreground">Live detection</p>
            </div>
          </div>
          <div
            className="flex-1 rounded-lg overflow-hidden bg-gradient-to-br shadow-inner"
            style={{ paddingBottom: "12px" }}
          >
            <CameraStreamEnhanced
              onPrediction={onPrediction}
              onSessionId={onSessionId}
              onStreamingChange={onStreamingChange}
              backendUrl={backendUrl}
              autoStart={false}
            />
          </div>
        </div>

        {/* 3D Model Section - 50% height */}
        <div className="flex-1 flex flex-col p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10">
              <User className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-sidebar-foreground">
                Sign Language Demo
              </h3>
              <p className="text-xs text-muted-foreground">3D visualization</p>
            </div>
          </div>
          <div className="flex-1 rounded-lg overflow-hidden bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20 shadow-inner">
            <ModelViewer
              currentGloss={currentGloss}
              glossSequence={glossSequence}
            />
          </div>
        </div>
      </div>
    </aside>
  );
}
