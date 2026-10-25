# JustSign: recognition and game interface

Open the app to enter JustSign, or use `#/game/justsign`. The original MediaPipe demos remain at `#/home`.

## Playing

1. Enable the camera. Camera access needs HTTPS or localhost; the published GitHub Pages site is HTTPS, so it works as-is.
2. Press **Start session**. The game shows one handshape at a time, drawn from its own vocabulary.
3. Form the shape with either hand and hold it. **There is no moment you have to hit.** The round is won the instant the shape has been held for `holdMs` (350 ms by default) — a second in, fifteen seconds in, it counts the same. Points carry a speed bonus, but completion does not.
4. Live coaching under the target names the single thing you are doing worst ("Curl your ring finger into the fist"), and the skeleton over your camera warms toward lime as the hold fills.
5. **Skip this sign** moves on without points. A round that runs past `roundMs` is scored as a miss and the session continues.

Nothing is uploaded or recorded: landmarks are computed in the browser and never leave it.

## The sign database

The vocabulary lives in `src/game/sign-database.ts` and is deliberately not reachable from the UI. The table is module-private and `Object.freeze`d; the only exports are `allSigns()` (for the recogniser), `findSign(id)` and `drawSigns(n)`, which hands the game a shuffled round list. There is no import, no listing, no edit and no removal, so a player sees the sign they were asked for and nothing else. Nothing is persisted to the browser either — the old IndexedDB reference store is gone.

Each row describes a handshape as bands over the measurements below, with a `coach` line per band:

```ts
{ key: 'indexExtension', min: 0.8, weight: 1.4, coach: 'Point your index finger straight up' }
```

Scope is static ASL fingerspelling: **A, B, C, D, I, L, O, V, W, Y** — the ten letters that are easiest to tell apart. J and Z need motion and are out of scope. Widening the table is a matter of adding rows, but do it alongside accuracy testing with real signers.

## Recognition

`src/game/recognizer.ts` turns 21 hand landmarks into thirteen measurements, all 0–1:

| Group | Keys |
|---|---|
| Finger straightness | `thumbExtension`, `indexExtension`, `middleExtension`, `ringExtension`, `pinkyExtension` |
| Fanning | `indexMiddleSpread`, `middleRingSpread`, `ringPinkySpread`, `thumbSplay` |
| Contact | `thumbIndexPinch`, `thumbMiddlePinch`, `thumbAcrossPalm`, `fingertipGather` |

Every one is a ratio of distances or an unsigned angle, so none of them changes with hand size, camera distance, rotation or which hand is signing. Left-handed signers and a mirrored preview need no special case; the **Mirror my camera** toggle is purely cosmetic.

`scoreSign` takes the weighted mean of how well each band is met, scaled by the worst-met band so an otherwise perfect shape with one finger in the wrong place cannot quietly pass. `evaluateTarget` judges each hand in frame separately, so a second hand resting in shot can never outvote the signing one. A hold only counts when a hand both clears `minConfidence` for the target **and** reads as that target rather than as some other letter.

`HoldTracker` accumulates hold time and absorbs a dropped frame shorter than `holdGraceMs` instead of restarting, so tracker flicker does not cost a hold. A gap longer than that, or a stall over 250 ms between samples (a hidden tab, a stalled camera), banks nothing.

All thresholds, the hold duration, the round length and the points live in `src/game/config.ts`. Tune them there after testing with several signers and camera distances.

This is shape matching against hand-written geometric rules, not a trained sign classifier. It does not judge language meaning, facial expression or full 3D palm orientation, and the bands need calibration with real signers and ASL-fluent review before anyone claims recognition accuracy.

## Tracking

`src/game/tracker.ts` wraps MediaPipe `HandLandmarker` in `VIDEO` mode with local WASM, cached model downloads and a GPU-to-CPU fallback. `SignTracker`'s replacement, `HandTracker` in `src/game/types.ts`, is a two-method contract — `detect(video, timestampMs): TrackedFrame` and `close()` — so another tracking implementation can be dropped in via `new JustSignGame(container, factory)` without touching recognition or the UI.

## Validation

```bash
pnpm test        # recognition + startup suites, no browser, camera or download
pnpm test:e2e    # the original Playwright demo suite
pnpm build       # full TypeScript and Vite check
```

`tests/sign-recognition.test.mjs` builds hands joint by joint (`tests/helpers/synthetic-hand.mjs`) rather than hand-writing feature vectors, so it exercises the real feature maths. It covers scale, translation, rotation and mirror invariance; every letter in the table recognising as itself clear of the others; open and half-formed hands not being forced into a letter; the second-hand case; and the hold rules, including that holding the sign late counts exactly as much as holding it early.

Manual browser checks:

- Hold each letter; check the coaching line names something useful while the shape is wrong.
- Hold the right shape immediately, then try again holding it only in the last seconds of the round. Both must pass.
- Form a letter, break it briefly, re-form it: a short flicker should not reset the bar, a real break should.
- Put both hands in frame with the off hand forming a different letter.
- Stop mid-session, switch tabs, navigate to the demos and disconnect the camera. Interrupted rounds must not add points; leaving the route must release the camera.
- Deny camera permission or disconnect the network during model loading; retry after correcting the issue.
- Test a narrow phone viewport and a laptop, and both left- and right-handed signing.
