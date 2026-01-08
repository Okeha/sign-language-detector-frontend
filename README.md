# Sign Language Detector — Frontend

This repository contains the frontend for a real-time Sign Language Detector application built with Next.js, React, and React Three Fiber. The app provides:

- A chatbot-style main UI for interacting with the system and viewing interpreted sign language.
- Real-time sign language detection via WebSocket connection to a FastAPI backend.
- Automatic gloss interpretation using AI when detection stops.
- A right-side visual feedback panel containing a live camera feed and a 3D model viewer (React Three Fiber) for sign visualization.
- Frame buffering and streaming (60 frames at 30fps sent every 2 seconds for optimal detection).

This README explains how to run the project locally, what is implemented, and the architecture of the real-time detection system.

## Quick start (development)

This project uses pnpm as the primary package manager.

### Prerequisites

- Node.js 18+ installed
- A running FastAPI backend at `http://localhost:8000` with WebSocket support at `ws://localhost:8000/ws/stream/{session_id}`
- Camera/webcam access

### Running the frontend

Windows (cmd.exe or PowerShell):

```bash
pnpm install
pnpm dev
### Core Architecture

- `app/` — Next.js app routes and layout
  - `app/src/root-enhanced.tsx` — Main application layout orchestrating all components and state management
- `components/layout/` — Layout components
  - `3d/model-viewer.tsx` — React Three Fiber canvas with fallback geometric character and GLB/GLTF support
  - `video/camera-stream-enhanced.tsx` — Real-time camera capture with frame buffering and WebSocket streaming
  - `chat/chat-interface-enhanced.tsx` — Chat UI with real-time gloss detection and automatic AI interpretation
  - `right-panel/right-panel-enhanced.tsx` — Visual panel housing camera feed and 3D viewer
- `hooks/` — Custom React hooks
  - `use-webcam.ts` — Camera access and frame capture
  - `use-frame-buffer.ts` — Frame buffering (60 frames at 30fps)
  - `use-sign-language-stream.ts` — WebSocket connection and prediction handling
- `types/sign-language.ts` — TypeScript definitions for predictions and WebSocket messages

### Real-time Detection Flow

1. **Camera Capture** (30 fps): Captures frames from the user's webcam
2. **Frame Buffering**: Collects 60 frames (2 seconds of video)
3. **WebSocket Streaming**: Sends buffered frames to backend every 2 seconds
4. **BackenFeatures

### ✅ Implemented

- **Real-time Sign Detection**: WebSocket-based streaming to FastAPI backend with VideoMAE model
- **Frame Buffering**: Intelligent 60-frame buffering system for optimal detection accuracy
- **Automatic Interpretation**: AI-powered gloss-to-sentence conversion when streaming stops
- **Word Choices System**: Tracks top-5 predictions for each detected sign for improved accuracy
- **Chat Interface**: Clean UI for viewing interpreted signs and chatting with AI
- **Camera Controls**: Start/stop camera, start/stop streaming, with connection status indicators
- **3D Model Viewer**: React Three Fiber-based 3D visualization with GLB/GLTF support
- **Session Management**: Unique session IDs for each detection session
- **Error Handling**: Comprehensive error handling and connection recovery

### 🚧 In Progress

- Animation mapping: Connecting detected signs to 3D character animations
- Performance optimization: Reducing frame processing overhead
- UI polish: Enhanced visual feedback and status indicators
     top5: [["WATER", 0.87], ["DRINK", 0.05], ["MILK", 0.03], ...],
     timestamp: 1704713024123,
     latency_ms: 45.2
   Usage

1. **Start the camera**: Click "Start Camera" button in the right panel
2. **Connect WebSocket**: Click "Start Streaming" to begin detection
3. **Perform signs**: The system captures 60 frames every 2 seconds
4. **View predictions**: Detected glosses appear in real-time in the input field
5. **Stop streaming**: Click "Stop Streaming" to end detection
6. **Auto-interpretation**: The system automatically interprets glosses into natural language
7. **Send to chat**: Click send icon to add interpreted sentence to chat history
8. **Clear**: Click trash icon to clear current glosses and start over

### Controls

- 🎥 **Camera**: Start/Stop webcam access
- 📡 **Streaming**: Start/Stop detection and frame transmission
- 📤 **Send**: Send interpreted sentence to chat
- **Animation Sync**: Map detected signs to 3D character animations in real-time
- **Multi-model Support**: Support switching between different detection models
- **Performance Dashboard**: Real-time metrics for FPS, latency, and accuracy
- **Offline Mode**: Local model inference using TensorFlow.js or ONNX Runtime
- **Mobile Support**: Responsive design and touch controls for mobile devices
- **Recording**: Save and replay detection sessions
- **Custom Vocabulary**: Allow users to train custom sign mappings
- **Multi-language**: Support for different sign languages (ASL, BSL, etc.)

## Architecture NotesThe project follows:
- TypeScript for type safety
- React hooks for state management
- Shadcn/ui for component library
- TailwindCSS for styling

For major changes (model pipelines, ML integration), let's discuss the API contract first.

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Styling**: TailwindCSS + Shadcn/ui
- **3D Rendering**: React Three Fiber + Three.js
- **State Management**: React hooks and callbacks
- **WebSocket**: Native WebSocket API
- **Package Manager**: pnpm

## License

This project is currently private/personal. Add a LICENSE file if you want to open-source it.

---

**Note**: This frontend is designed to work with a FastAPI backend that provides real-time sign language detection using the VideoMAE model. See the backend repository for setup instructions
  "gloss": "WATER",
  "confidence": 0.87,
  "top5": [["WATER", 0.87], ["DRINK", 0.05], ...],
  "timestamp": 1704713024123,
  "latency_ms": 45.2
}
```

**Wrapped** (with type field):
```json
{
  "type": "prediction",
  "data": {
    "gloss": "WATER",
    "confidence": 0.87,
    ...
  }
}
```

### State Management

The app uses React state and callbacks to manage:
- Predictions flow from camera → WebSocket → chat
- Streaming state synchronized across components
- Word choices array built during streaming
- Automatic cleanup on stream stop

```bash
pnpm dev
```

Visit the app and open DevTools (F12) to view detailed console logs:
- `✅ WebSocket OPENED` — Connection established
- `🔔 ONMESSAGE FIRED` — Prediction received
- `🎯 Prediction extracted` — Gloss parsed
- `📥 [CHAT] Received predictions` — Chat received update
- `⏹️ Streaming stopped` — Auto-interpretation triggered

Common issues:

- **Camera permission denied**: Ensure you allow camera access and run on `localhost` or over HTTPS
- **WebSocket connection failed**: Verify backend is running at `ws://localhost:8000`
- **No predictions received**: Check backend logs to confirm predictions are being sent through WebSocket
- **Performance issues**: Reduce frame rate or disable AccumulativeShadows in 3D viewer
8. **Display**: Shows interpreted natural language sentence in the input field

The app expects the backend to provide:
- WebSocket endpoint: `ws://localhost:8000/ws/stream/{session_id}` for real-time frame streaming
- REST endpoint: `http://localhost:8000/interpret-glosses` for gloss interpretation (POST)

If your backend runs on a different URL, update the `backendUrl` prop in `app/src/root-enhanced.tsx`.

## What is in this frontend

- `app/` — Next.js app routes and layout.
- `components/layout/3d/model-viewer.tsx` — React Three Fiber canvas with a fallback geometric character and support for loading a GLB/GLTF model (drop your model into `public/` and point the `customModelPath` at it).
- `components/layout/video/camera-stream.tsx` — Camera access, start/stop controls, and basic stream handling.
- `components/layout/chat/chat-interface.tsx` — A minimal chatbot UI (messages, input, simulated replies).
- `components/layout/right-panel/right-panel.tsx` — Visual panel that houses the camera feed and 3D viewer.

## Current stage / status

- Core layout: implemented — header, left navigation, main chat area, right visual feedback panel.
- Camera feed: implemented with user media, start/stop and error handling (works in supported browsers over https or localhost).
- 3D viewer: integrated using `three`, `@react-three/fiber`, and `@react-three/drei`. Includes a simple geometric human fallback and support for loading GLB/GLTF files. Lighting presets and soft shadows added.
- Sign detection model: NOT included in this frontend. The app is prepared to receive detection signals (e.g., via API or WebSocket) and map them to 3D animations or chat responses, but the ML inference and mapping are TODO.

## How to use a custom 3D model

1. Place your GLB/GLTF file in the `public/` folder, for example `public/models/human.glb`.
2. Open `components/layout/3d/model-viewer.tsx` and set the `customModelPath` constant to `"/models/human.glb"`.
3. Restart the dev server if running; the model is preloaded by the viewer and should appear in the right panel. If the model has animations, the code will attempt to play the first animation clip automatically.

Notes:

- If your model appears too large or off-center, adjust the `scale` and `position` props on the `<primitive />` inside `CustomModel`.
- For best results use a rigged character with animation clips (Mixamo exports work well). Keep model size reasonable to avoid heavy memory usage.

## Lighting and visuals

The 3D scene includes multiple lighting presets and soft ground shadows (AccumulativeShadows + ContactShadows). These produce a pleasing demo look but can be expensive; reduce `frames` or remove accumulative shadows for lower-end devices.

## Running and testing

Start the dev server:

```bash
pnpm dev
```

Visit the app and open DevTools (F12) to view console logs for the model viewer and camera. Common issues:

- Camera permission denied: ensure you allow camera access and run on `localhost` or over HTTPS.
- Model 404 / CORS errors: ensure GLB files are in `public/` or served with proper CORS headers.
- Performance: disable `AccumulativeShadows` or lower `frames` when iterating.

## Future goals

- Integrate a sign language detection ML model (web-based or server-hosted) and wire its output to both:
  - The chatbot for contextual feedback and explanations.
  - The 3D model to play corresponding sign animations in real time.
- Add a UI for switching lighting presets and tuning model scale/position at runtime.
- Support multiple models and animation banks, plus a mapping editor to pair detected signs with animation clips.
- Add tests and CI (linting, type checking, build validation) and package a simple deploy flow.

## Contributing

Open a PR or create issues describing features you want. For big changes (model pipelines, ML integration), let's discuss an API contract for detected gestures and animation triggers.

## License

This project is currently private/personal. Add a LICENSE file if you want to open-source it.

---

If you'd like, I can also add a short Quickstart section with example models (Mixamo export tips) and a small script to convert or optimize GLTFs for the web.
