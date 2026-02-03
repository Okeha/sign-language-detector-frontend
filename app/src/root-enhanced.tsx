// "use client";

// import { AppSidebar } from "@/components/layout/nav/sidebar";
// import { SiteHeader } from "@/components/layout/nav/site-header";
// import ChatInterfaceEnhanced from "@/components/layout/chat/chat-interface-enhanced";
// import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
// import { RightPanelEnhanced } from "@/components/layout/right-panel/right-panel-enhanced";
// import { useState, useCallback, useEffect } from "react";
// import { GlossPrediction } from "@/types/sign-language";

// export const iframeHeight = "800px";
// export const description = "Sign Language Detection Application";

// export default function BaseLayoutEnhanced() {
//   const [predictions, setPredictions] = useState<GlossPrediction[]>([]);
//   const [sessionId, setSessionId] = useState<string>("");
//   const [isStreaming, setIsStreaming] = useState<boolean>(false);
//   const [currentGloss, setCurrentGloss] = useState<string | null>(null);
//   const [glossSequence, setGlossSequence] = useState<string[] | null>(null);

//   // Callback to handle new predictions from camera stream
//   const handlePrediction = useCallback((prediction: GlossPrediction) => {
//     console.log("🎯 [ROOT] New prediction received:", prediction);
//     setPredictions((prev) => {
//       const updated = [...prev, prediction];
//       console.log(
//         "📊 [ROOT] Predictions array updated. Total:",
//         updated.length,
//       );
//       return updated;
//     });

//     // Update current gloss for 3D animation (single gloss from camera)
//     if (prediction.gloss && prediction.gloss !== "NONE") {
//       console.log(
//         "🎬 [ROOT] Setting current gloss for animation:",
//         prediction.gloss,
//       );
//       setCurrentGloss(prediction.gloss);
//     }
//   }, []);

//   // Clear predictions when streaming starts (new session)
//   useEffect(() => {
//     if (isStreaming) {
//       console.log("🚀 [ROOT] Streaming started - clearing old predictions");
//       setPredictions([]);
//       setCurrentGloss(null);
//       setGlossSequence(null);
//     } else {
//       console.log(
//         "⏹️ [ROOT] Streaming stopped. Final predictions count:",
//         predictions.length,
//       );
//     }
//   }, [isStreaming]);

//   // TESTING: Expose function to manually set sequence from browser console
//   useEffect(() => {
//     (window as any).__setGlossSequence = (glosses: string[]) => {
//       console.log("🎬 [MANUAL] Setting gloss sequence:", glosses);
//       setGlossSequence(glosses);
//     };
//     return () => {
//       delete (window as any).__setGlossSequence;
//     };
//   }, []);

//   return (
//     <div className="[--header-height:calc(--spacing(14))]">
//       <SidebarProvider className="flex flex-col">
//         <SiteHeader />
//         <div className="flex flex-1">
//           <AppSidebar />
//           <SidebarInset className="flex-1">
//             <div className="flex h-full gap-4 p-4">
//               {/* Main Chat Area */}
//               <div className="flex-1 min-w-0">
//                 <ChatInterfaceEnhanced
//                   predictions={predictions}
//                   sessionId={sessionId}
//                   isStreaming={isStreaming}
//                   backendUrl="http://localhost:8000"
//                 />
//               </div>

//               {/* Right Panel with Camera + 3D Model */}
//               <RightPanelEnhanced
//                 onPrediction={handlePrediction}
//                 onSessionId={setSessionId}
//                 onStreamingChange={setIsStreaming}
//                 backendUrl="ws://localhost:8000"
//                 currentGloss={currentGloss}
//                 glossSequence={glossSequence}
//               />
//             </div>
//           </SidebarInset>
//         </div>
//       </SidebarProvider>
//     </div>
//   );
// }

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
  const [currentGloss, setCurrentGloss] = useState<string | null>(null);
  const [glossSequence, setGlossSequence] = useState<string[] | null>(null);

  // Callback to handle new predictions from camera stream
  const handlePrediction = useCallback((prediction: GlossPrediction) => {
    console.log("🎯 [ROOT] New prediction received:", prediction);
    setPredictions((prev) => {
      const updated = [...prev, prediction];
      console.log(
        "📊 [ROOT] Predictions array updated. Total:",
        updated.length,
      );
      return updated;
    });

    // Update current gloss for 3D animation (single gloss from camera)
    if (prediction.gloss && prediction.gloss !== "NONE") {
      console.log(
        "🎬 [ROOT] Setting current gloss for animation:",
        prediction.gloss,
      );
      setCurrentGloss(prediction.gloss);
    }
  }, []);

  // Callback to handle gloss sequence from AI response conversion
  const handleGlossSequenceReady = useCallback((glosses: string[]) => {
    console.log("🎬 [ROOT] Gloss sequence ready for 3D animation:", glosses);

    // Clear current single gloss when playing a sequence
    setCurrentGloss(null);

    // Set the sequence for the 3D model
    setGlossSequence(glosses);
  }, []);

  // Clear predictions when streaming starts (new session)
  useEffect(() => {
    if (isStreaming) {
      console.log("🚀 [ROOT] Streaming started - clearing old predictions");
      setPredictions([]);
      setCurrentGloss(null);
      setGlossSequence(null);
    } else {
      console.log(
        "⏹️ [ROOT] Streaming stopped. Final predictions count:",
        predictions.length,
      );
    }
  }, [isStreaming]);

  // TESTING: Expose function to manually set sequence from browser console
  useEffect(() => {
    (window as any).__setGlossSequence = (glosses: string[]) => {
      console.log("🎬 [MANUAL] Setting gloss sequence:", glosses);
      setGlossSequence(glosses);
    };
    (window as any).__setCurrentGloss = (gloss: string) => {
      console.log("🎬 [MANUAL] Setting current gloss:", gloss);
      setCurrentGloss(gloss);
    };
    return () => {
      delete (window as any).__setGlossSequence;
      delete (window as any).__setCurrentGloss;
    };
  }, []);

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
                  onGlossSequenceReady={handleGlossSequenceReady}
                />
              </div>

              {/* Right Panel with Camera + 3D Model */}
              <RightPanelEnhanced
                onPrediction={handlePrediction}
                onSessionId={setSessionId}
                onStreamingChange={setIsStreaming}
                backendUrl="ws://localhost:8000"
                currentGloss={currentGloss}
                glossSequence={glossSequence}
              />
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}
