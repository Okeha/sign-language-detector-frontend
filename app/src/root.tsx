import { AppSidebar } from "@/components/layout/nav/sidebar";
import { SiteHeader } from "@/components/layout/nav/site-header";
import CameraStream from "@/components/layout/video/camera-stream";
import ChatInterface from "@/components/layout/chat/chat-interface";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { RightPanel } from "@/components/layout/right-panel/right-panel";
export const iframeHeight = "800px";
export const description = "A sidebar with a header and a search form.";

export default function BaseLayout() {
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
                <ChatInterface />
              </div>
              <RightPanel />

              {/* Right Sidebar - Video Stream */}
              {/* <div className="w-[400px] flex-shrink-0">
                <div className="bg-muted/50 rounded-xl h-full flex flex-col">
                  <div className="p-4 border-b">
                    <h3 className="font-semibold">Camera Feed</h3>
                    <p className="text-xs text-muted-foreground">
                      Real-time sign detection
                    </p>
                  </div>
                  <div className="flex-1 p-4">
                    <CameraStream />
                  </div>
                </div>
              </div> */}
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}
