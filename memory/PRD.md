# AiForge — Product Requirements (live)

## Mission
Mobile-first AI generator app for makers: text → image, video, and 3D-printable STL/SCAD models, with on-device viewer + slicer settings + G-code preview + share/export to any iOS slicer app.

## Stack
- Backend: FastAPI + MongoDB (motor) + emergentintegrations (Gemini Nano Banana, Claude Sonnet 4.5, Sora 2) + trimesh + Stripe.
- Frontend: Expo Router (React Native) with react-native-svg, react-native-reanimated, expo-video, react-native-webview (for Three.js STL viewer).
- Theme: Cyber-galaxy dark — starfield bg, blue/cyan energy bolts on touch, glowing animated card borders.

## Features delivered
- **Auth**: JWT email/password (register / login / me / logout). Admin seeded.
- **Credits system**: 10 free on signup; image=1, model=2, video=5. Stripe checkout for 50 / 200 / 1000 credit packs (test card 4242…).
- **Image gen** (Gemini Nano Banana, ~10s, sync).
- **Video gen** (Sora 2): async job pattern — POST returns job_id, frontend polls. Fixes the 60s ingress timeout bug. 4/8/12s, 4 resolutions.
- **3D model gen**: Claude Sonnet 4.5 writes OpenSCAD + JSON primitives, backend builds STL with trimesh. Stats (tris, dimensions, volume) + print estimate (layers, time, filament).
- **Interactive STL viewer**: Three.js inside WebView — orbit / pinch zoom / wireframe overlay on iOS.
- **Slicer**: layer height, infill, supports, print speed, nozzle/bed temps. Live estimate updates. G-code preview text.
- **Mini video editor**: native expo-video player + play/pause, ±5s scrub, 0.5×/1×/1.5×/2× speed.
- **AI chat assistant**: Claude-powered; detects "make image", "design 3D", "generate video" intents and kicks off real jobs; saves to library.
- **Library**: filter by type, tap to open, delete.
- **Export**: native share sheet for PNG/MP4/STL — send STL directly to any iOS slicer app.
- **Energy/lightning theme**: starfield + fractal lightning on touch + glowing animated card borders across every screen.

## Known issue
- Emergent LLM key is over budget at handoff (`Max budget: 21.90, Current cost: 22.65`). All AI calls return 500 until topped up at **Profile → Universal Key → Add Balance** in the Emergent dashboard. The app code is fully working — only the key balance is exhausted.

## Out of scope (for now)
- Azure DALL-E / Cognitive Services fallback (skipped — Emergent universal key already covers all three providers; can be added later by introducing a fallback adapter in `generate_image` / `generate_video`).
- Supabase migration (we use MongoDB).
- Vercel/V0 deploy (Emergent Publish button handles iOS + web deploy).
- Full timeline-based video editor with trim cuts (planned next).
