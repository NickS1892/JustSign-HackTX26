# JustSign: matching and game interface

Open the app to enter JustSign, or use `#/game/justsign`. Existing MediaPipe demos remain at `#/home`.

1. Run the repository's existing install and dev commands (`pnpm install`, `pnpm dev`). Use HTTPS or localhost for camera access. Vite currently serves at `http://localhost:5174/mediapipe-samples-web/`.
2. Import front-facing MP4/WebM reference clips, each 0.6–15 seconds and under 100 MB. Include the signer's face, shoulders, elbows and signing hands. Name the files after the signs. Use reviewed demonstrations: this repository does not ship an ASL video dataset.
3. Wait for coordinate extraction, enable the camera, and start the playlist. The initial MediaPipe model download requires network access.
4. Each round plays the demonstration, counts down for three seconds, then replays the video while capturing the player's attempt. Feedback and points appear before the next round. Results report overall match, movement, timing and completion per sign. Start again to replay.
5. Use **Mirror the demonstration** if you want to copy its mirrored hand. The matcher explicitly reflects and swaps the player's anatomical hand channels in this mode.

Imported video blobs and raw landmark sequences persist in this browser's IndexedDB. No webcam video is uploaded or recorded. Clear individual references with Remove. Storage failures leave imports usable for the current session. Different devices maintain separate playlists; this is a single-player game, with no multiplayer networking.

## Integration with Person 1

`src/game/types.ts` defines `SignTracker.detect(video, timestampMs): SignFrame` and `close()`. The included `createSignTracker` uses the existing MediaPipe Tasks Vision dependency with HolisticLandmarker, local WASM, cached model downloads and GPU-to-CPU fallback. To use another tracking implementation, replace this adapter or inject a factory into `new JustSignGame(container, factory)`.

Frames use unmirrored image coordinates and anatomical left/right hands, with 33 pose landmarks and 21 landmarks per detected hand. Missing hands are empty arrays. Reference timestamps and attempt timestamps start at zero for their respective clip/round, in milliseconds. Mirroring the camera preview is visual only.

## Matching

`compareSigns(referenceFrames, attemptFrames, durationMs, mirror)` returns:

```ts
{ score, completed, movementScore, timingScore, coverage, feedback }
```

Scores are 0–100. Shoulder-centered, shoulder-width-scaled body coordinates retain hand placement; palm-scaled, wrist-relative coordinates retain finger shape and orientation. The matcher uses image x/y because hand and body depth values have different origins. Bounded dynamic time warping measures movement similarity, and unwarped comparison penalizes timing differences. Missing or invalid tracking remains a gap rather than becoming a matching pose. A stationary pose cannot pass the tested moving-sign fixture. Defaults require at least 70% tracking coverage and a 72% match score for completion; points are match score × 10, including partial credit for incomplete attempts.

All thresholds, time limits, sampling rate and points live in `src/game/config.ts`. Detection and extraction target 12 FPS. If the device cannot sustain tracking, it may reject attempts for insufficient coverage. Inference uses the main thread in this first implementation; the tracker contract can be moved to an asynchronous worker in a later performance pass.

This compares an attempt to the expected reference; it is not a trained sign classifier. It does not validate language meaning, facial expression or full 3D palm orientation. Thresholds need calibration with real signers and ASL-fluent review before claiming recognition accuracy.

## Validation

Run `node --test tests/sign-matcher.test.mjs` with Node 24+. These tests require no downloads, camera or model. They cover exact matches, body translation/scale, stationary and reversed movement, timing shifts, sparse/lost tracking, explicit mirroring and invalid data. `pnpm build` remains the full TypeScript and Vite check; existing Playwright tests cover the original demo suite.

Manual browser checks:

- Import one- and two-handed signs; try the right movement, a different sign and no visible hands.
- Verify watch → countdown → perform → feedback → next round → results, then replay.
- Stop mid-round, switch tabs, navigate to demos, and disconnect the camera. Interrupted rounds must not add points; route cleanup must release the camera.
- Refresh to verify saved clips restore; remove a clip and refresh again.
- Deny camera permission or disconnect the network during model loading; retry after correcting the issue.
- Test a narrow phone viewport and a laptop. On a second device served over HTTPS, import the same clips and repeat; no synchronization is intended.

In the implementation environment, all nine matcher tests and parsing of the new TypeScript modules passed. A full build and browser execution could not run: the environment returned HTTP 403 for npm package downloads and Chromium downloads. Live-camera accuracy and rendered layouts still need browser verification.


## Still-image references

Import a JPG, PNG or WebP photo of exactly one complete hand, including the wrist. No recorded training video is required. Use a photo from a reviewed fingerspelling reference; multi-panel alphabet charts must be cropped to one hand. Illustrations may not be detected by MediaPipe. There is no bundled image dataset.

The image stays visible through countdown and a four-second attempt. HandLandmarker compares wrist-relative, palm-scaled 2D finger coordinates; either hand and horizontal mirroring are accepted. The live Match readout shows current similarity; the final score averages the attempt, including missing frames as zero. Completion requires tracking coverage and a continuous 300ms matching hold. Configurable values live in src/game/config.ts. These scores are heuristic similarity, not calibrated ASL accuracy, and cannot assess motion letters J/Z or signs requiring body location. Video references retain their existing movement matcher.

Validation: 13 Node tests pass, including image matches with translation, scale and mirroring, and rejection of missing/sparse tracking and a changed finger shape. Full build and real-camera accuracy remain unverified in the restricted environment. Test a photo on each laptop independently, enable camera, start the playlist, try the target shape, another shape and no hand, then refresh to verify image persistence.

## Built-in A–F practice set

The six project-owner-supplied images are bundled under public/references/asl. Click Load A–F practice set to extract hand landmarks locally, then enable the camera and start. No file upload is needed. Loading again skips letters already in the playlist. Images that MediaPipe cannot track are reported individually and are not silently accepted. Original source/credit has not yet been supplied; the images are low resolution and need live recognition validation.
