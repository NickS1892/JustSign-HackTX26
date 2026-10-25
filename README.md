# JustSign

The app now opens the JustSign sign-matching game. Import reference videos, enable your camera, and play a playlist of demonstration and performance rounds. See [JUSTSIGN.md](JUSTSIGN.md) for setup, matcher integration and validation details. The original MediaPipe demos remain at `#/home`.

# MediaPipe Tasks Demo

Experience the power of on-device Machine Learning with MediaPipe Tasks. This
demo showcases real-time audio, vision and text demos using CPU and GPU
acceleration on Web.

Play with the demos here: https://google-ai-edge.github.io/mediapipe-samples-web/

## Supported Tasks

### Vision
- **Face Detection**: Detect faces in images and video.
- **Face Landmarker**: Detect 478 3D face landmarks.
- **Gesture Recognizer**: Recognize hand gestures (e.g., "Thumbs Up", "Peace").
- **Hand Landmarker**: Track 21 3D hand landmarks for both hands.
- **Holistic Landmarker**: Simultaneous tracking of face, hands, and pose.
- **Image Classifier**: Categorize images into defined classes.
- **Image Embedding**: Compare image similarity using vector embeddings.
- **Image Segmentation**: Pixel-perfect masking of objects.
- **Interactive Segmentation**: Click to segment specific objects of interest.
- **Object Detection**: Detect multiple objects with bounding boxes.
- **Pose Landmarker**: Full-body pose tracking with segmentation support.

### Audio
- **Audio Classifier**: Classify ambient sounds in real-time.

### Decision
- **Decision Maker**: Make decisions from text or JSON input using logic rules.
- **Decision Maker - Dino Game**: Watch the Decision Maker play a runner game by choosing to jump, duck or wait.

### Retrieval
- **Semantic Retriever**: Index content into a vector store and retrieve it with natural-language queries.
- **Universal Embedder**: Embed text and images into a shared vector space across modalities.

### Text
- **Language Detection**: Identify the language of input text.
- **Text Classification**: Classify text sentiment (positive/negative).
- **Text Embedding**: Semantic similarity comparison for text.

## Quick Start

1. **Install Node.js 24 LTS**, then close and reopen your terminal (and restart your IDE if using its terminal). Check `node --version` and `npm --version`. If either command is missing, fix the Node installation or PATH before continuing.
2. **Clone the repository** and open a terminal in its root folder, where `package.json` lives.
3. **Install dependencies**: `npm install`.
4. **Run the app**: `npm run dev`. Leave that terminal running.
5. **Open Chrome** at **http://localhost:5174/mediapipe-samples-web/#/game/justsign**. Do not open `index.html` directly.

On Windows PowerShell, use `npm.cmd install` and `npm.cmd run dev` if PowerShell blocks `npm.ps1`. If `npm.cmd` is also not recognized, Node.js is missing from PATH; reinstall Node and restart the terminal.

For the pnpm workflow, use `pnpm install` and `pnpm dev`. If pnpm reports an incompatible lockfile, run `pnpm install --no-frozen-lockfile` to let it regenerate the lockfile for your version.

If port 5174 is occupied, stop the previous dev server or run `npm run dev -- --port 5175` and use that port in the URL. A first camera/model load needs internet access.

This version is **single player** and needs imported reference videos. To check it on two devices, run it on localhost on each laptop, import the same clips, and test each independently. A hosted version needs HTTPS for cameras; a plain HTTP LAN address will not provide camera access. Room codes and synchronized battles are not implemented yet.

## Testing

We ensure robustness with a comprehensive End-to-End (E2E) test suite using Playwright.

```bash
pnpm test
```

