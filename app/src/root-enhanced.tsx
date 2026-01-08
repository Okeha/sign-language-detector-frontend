"use client";

import { AppSidebar } from "@/components/layout/nav/sidebar";
import { SiteHeader } from "@/components/layout/nav/site-header";
import ChatInterfaceEnhanced from "@/components/layout/chat/chat-interface-enhanced";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { RightPanelEnhanced } from "@/components/layout/right-panel/right-panel-enhanced";
import { useState, useCallback, useEffect } from "react";
import { GlossPrediction } from "@/types/sign-language";

export const iframeHeight = "800px";
export const description = "Sign Language Detection Application";

export default function BaseLayoutEnhanced() {
  const [predictions, setPredictions] = useState<GlossPrediction[]>([]);
  const [sessionId, setSessionId] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState<boolean>(false);

  // Callback to handle new predictions from camera stream
  const handlePrediction = useCallback((prediction: GlossPrediction) => {
    console.log("🎯 [ROOT] New prediction received:", prediction);
    setPredictions((prev) => {
      const updated = [...prev, prediction];
      console.log(
        "📊 [ROOT] Predictions array updated. Total:",
        updated.length
      );
      return updated;
    });
  }, []);

  // Clear predictions when streaming starts (new session)
  useEffect(() => {
    if (isStreaming) {
      console.log("🚀 [ROOT] Streaming started - clearing old predictions");
      setPredictions([]);
    } else {
      console.log(
        "⏹️ [ROOT] Streaming stopped. Final predictions count:",
        predictions.length
      );
    }
  }, [isStreaming]);

  return (
    <div className="[--header-height:calc(--spacing(14))]">
      <SidebarProvider className="flex flex-col">
        <SiteHeader />
        <div className="flex flex-1">
          <AppSidebar />
          <SidebarInset className="flex-1">
            <div className="flex h-full gap-4 p-4">
              {/* Main Chat Area */}
              <div className="flex-1 min-w-0">
                <ChatInterfaceEnhanced
                  predictions={predictions}
                  sessionId={sessionId}
                  isStreaming={isStreaming}
                  backendUrl="http://localhost:8000"
                />
              </div>

              {/* Right Panel with Camera + 3D Model */}
              <RightPanelEnhanced
                onPrediction={handlePrediction}
                onSessionId={setSessionId}
                onStreamingChange={setIsStreaming}
                backendUrl="ws://localhost:8000"
              />
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}
