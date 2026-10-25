# JustSign

Form an ASL handshape in front of your webcam and hold it. The moment the shape is right, it counts — there is no beat to hit and nothing to import. Two modes: **Practice** (eight signs, no rush) and a **10-second sprint** (land as many as you can). Both keep a high score in your browser.

It knows **the whole ASL alphabet, A–Z**, plus the UT **Hook 'em Horns** handshape. J and Z are movements rather than poses, so those two are drawn in the air. See [JUSTSIGN.md](JUSTSIGN.md) for how recognition, the sign database and tuning work — including the letters that are genuinely hard to tell apart.

## Play it

The site is published as a static build on GitHub Pages. Every push to `main` rebuilds and republishes it, so day-to-day changes need no local server:

**https://nicks1892.github.io/JustSign-HackTX26/**

Turn it on once under **Settings → Pages → Build and deployment → Source: GitHub Actions**. After that, `.github/workflows/deploy.yml` does the rest; you can also publish any branch on demand from the **Actions** tab (**Deploy to GitHub Pages → Run workflow**).

Cameras need HTTPS, which the Pages URL provides. A plain `http://` LAN address will not get camera access.

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

## Working on it locally

You only need this to change code; to play, use the link above.

1. **Install Node.js 24 LTS**, then close and reopen your terminal (and restart your IDE if using its terminal). Check `node --version` and `npm --version`. If either command is missing, fix the Node installation or PATH before continuing.
2. **Clone the repository** and open a terminal in its root folder, where `package.json` lives.
3. **Install dependencies**: `npm install` (or `pnpm install`).
4. **Run the app**: `npm run dev`. Leave that terminal running.
5. **Open Chrome** at **http://localhost:5174/JustSign-HackTX26/**. Do not open `index.html` directly.

`npm run build` writes the same static site to `dist/`, and `npm run preview` serves it. The site is built for `/JustSign-HackTX26/`; set `BASE_PATH` to build it for a different path.

On Windows PowerShell, use `npm.cmd install` and `npm.cmd run dev` if PowerShell blocks `npm.ps1`. If `npm.cmd` is also not recognized, Node.js is missing from PATH; reinstall Node and restart the terminal.

For the pnpm workflow, use `pnpm install` and `pnpm dev`. If pnpm reports an incompatible lockfile, run `pnpm install --no-frozen-lockfile` to let it regenerate the lockfile for your version.

If port 5174 is occupied, stop the previous dev server or run `npm run dev -- --port 5175` and use that port in the URL. A first camera/model load needs internet access.

This version is **single player**. Room codes and synchronized battles are not implemented yet.

## Testing

```bash
pnpm test      # recognition, high scores and startup: no browser, camera or model download
pnpm test:e2e  # the Playwright suite covering the MediaPipe demos
```

`pnpm test` is what gates a deploy.
