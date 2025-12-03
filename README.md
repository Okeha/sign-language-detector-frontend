# Sign Language Detector — Frontend

This repository contains the frontend for a Sign Language Detector application built with Next.js and React Three Fiber. The app provides:

- A chatbot-style main UI for interacting with the system.
- A right-side visual feedback panel containing a live camera feed and a 3D model viewer (React Three Fiber) for sign visualization.
- Camera handling and a basic demo 3D human model; support for loading GLB/GLTF character models and animations.

This README explains how to run the project locally, what is implemented today, what is a work-in-progress, and where the project is headed.

## Quick start (development)

This project uses pnpm as the primary package manager. Run the dev server locally:

Windows (cmd.exe or PowerShell):

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000 in your browser (Next.js will pick an available port if 3000 is busy).

If you prefer npm or yarn, the app also supports them but pnpm is recommended for faster installs.

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
