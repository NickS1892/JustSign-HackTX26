# JustSign: recognition and game interface

Open the app to enter JustSign, or use `#/game/justsign`. The original MediaPipe demos remain at `#/home`.

## Playing

Enable the camera, pick a mode, and press start. Camera access needs HTTPS or localhost; the published GitHub Pages site is HTTPS, so it works as-is.

**Practice** plays eight signs with no clock pressure. **10-second sprint** runs one ten-second clock for the whole session and counts how many signs you land.

In both modes the rule is the same: form the shape with either hand and hold it. **There is no moment you have to hit.** The round is won the instant the shape has been held for `holdMs` (350 ms by default) — a second in, fifteen seconds in, it counts the same. In practice, points carry a speed bonus; completion does not.

Landing a sign flashes the screen green and plays a short rising chime. The chime is synthesized in the browser, so nothing downloads; audio can only start after a click, so the first press of **Enable camera** or **Start** turns it on. The **Sound** checkbox mutes it, and the flash is enough on its own for anyone playing silently.

Live coaching under the target names the single thing you are doing worst ("Curl your ring finger into the fist"), and the skeleton over your camera warms toward lime as the hold fills. **Skip this sign** moves on without points. In practice, a round that runs past `roundMs` is a miss and the session continues; in sprint, the clock ends the session wherever it is.

### High scores

Your best practice score and best sprint count are kept separately in this browser's `localStorage` and shown under **BEST**. A session you stop early still records what you landed. Storage can be unavailable — a private window, blocked site data — in which case the game plays normally without a saved best. Scores are per-browser; they are not shared between devices or players.

## The sign database

The vocabulary lives in `src/game/sign-database.ts` and is deliberately not reachable from the UI. The table is module-private and `Object.freeze`d; the only exports are `allSigns()` (for the recogniser), `findSign(id)` and `drawSigns(n)`, which hands the game a shuffled round list. There is no import, no listing, no edit and no removal, so a player sees the sign they were asked for and nothing else. Nothing is persisted but the high score.

It holds **the full ASL alphabet, A–Z, plus the UT "Hook 'em Horns" handshape** — 27 entries. Each row describes a handshape as bands over the measurements below, with a `coach` line per band:

```ts
{ key: 'indexExtension', min: 0.8, weight: 1.4, coach: 'Point your index finger straight up' }
```

**J and Z are movements, not poses**, so their rows also carry a `motion` template: an ordered list of legs the fingertip has to travel, in palm widths. J traces the I handshape down and then hooks sideways; Z points the index finger and draws across, down, across.

### Letters that are genuinely close

Some letters differ by things landmarks barely see, and the bands separating them are narrow. Expect these to need tuning against real hands before a demo, and check them first if recognition feels wrong:

| Pair | What separates them here |
|---|---|
| M / N / T | which finger gap the thumb tip sits in (ring, middle, index) |
| A / S / E | thumb at the side, across the front, or under the fingertips |
| U / V | how far the two fingers fan apart |
| U / R | whether the two fingers are side by side or crossed |
| G / Q and K / P | which way the hand points — sideways, up or down |
| C / O | how round the fingers stay; O is open, C has a visible gap at the thumb |

## Recognition

`src/game/recognizer.ts` turns 21 hand landmarks into twenty-one measurements, all 0–1:

| Group | Keys |
|---|---|
| Finger straightness | `thumbExtension`, `indexExtension`, `middleExtension`, `ringExtension`, `pinkyExtension` |
| Fanning | `indexMiddleSpread`, `middleRingSpread`, `ringPinkySpread`, `thumbSplay` |
| Contact | `thumbIndexPinch`, `thumbMiddlePinch`, `thumbRingPinch`, `thumbPinkyPinch`, `thumbAcrossPalm`, `fingertipGather` |
| Thumb placement | `thumbInIndexGap`, `thumbInMiddleGap`, `thumbInRingGap`, `thumbUnderFingers` |
| Shape and pose | `indexMiddleConverge`, `pointingUp` |

Everything but `pointingUp` is a ratio of distances or an unsigned angle, so it does not change with hand size, camera distance, rotation or which hand is signing. Left-handed signers and a mirrored preview need no special case; the **Mirror my camera** toggle is purely cosmetic.

`pointingUp` is the deliberate exception: it reads where the hand points in the image, which is the only thing separating K from P and G from Q. Only the rows that ask for it give up rotation tolerance, so most letters still read at any angle.

The three gap features are scored *relatively* — how much nearer the thumb is to one gap than to its neighbours, damped by how close it is to any of them. A plain distance reads high for all three at once, because the gaps are a finger's width apart; the relative form is what makes M, N and T separable.

`scoreSign` takes the weighted mean of how well each band is met, scaled by the worst-met band, so an otherwise perfect shape with one finger in the wrong place cannot quietly pass. `evaluateTarget` judges each hand in frame separately, so a second hand resting in shot can never outvote the signing one. A hold counts when a hand clears `minConfidence` for the target **and** reads as that target rather than as some other letter — except for J and Z, where the handshape is shared and the path is what decides.

`HoldTracker` accumulates hold time and absorbs a dropped frame shorter than `holdGraceMs` instead of restarting, so tracker flicker does not cost a hold. A gap longer than that, or a stall over 250 ms between samples (a hidden tab, a stalled camera), banks nothing. `MotionTracker` does the same job for a path: legs must complete in order, within the row's `windowMs`, and losing the handshape drops the path rather than banking half of it.

All thresholds, the hold duration, the sprint clock and the points live in `src/game/config.ts`. Tune them there after testing with several signers and camera distances.

This is shape matching against hand-written geometric rules, not a trained sign classifier. It does not judge language meaning, facial expression or full 3D palm orientation, and the bands need calibration with real signers and ASL-fluent review before anyone claims recognition accuracy.

## Tracking

`src/game/tracker.ts` wraps MediaPipe `HandLandmarker` in `VIDEO` mode with local WASM, cached model downloads and a GPU-to-CPU fallback. `HandTracker` in `src/game/types.ts` is a two-method contract — `detect(video, timestampMs): TrackedFrame` and `close()` — so another tracking implementation can be dropped in via `new JustSignGame(container, factory)` without touching recognition or the UI.

## Validation

```bash
pnpm test        # recognition, high scores and startup; no browser, camera or download
pnpm test:e2e    # the original Playwright demo suite
pnpm build       # full TypeScript and Vite check
```

`tests/sign-recognition.test.mjs` builds hands joint by joint (`tests/helpers/synthetic-hand.mjs`) rather than hand-writing feature vectors, so it exercises the real feature maths. It covers scale and position invariance; mirror invariance; that rotation moves `pointingUp` and nothing else; every one of the 25 still signs recognising as itself clear of the other 24; that a still frame can never read as J or Z; open and half-formed hands not being forced into a letter; the second-hand case; both motion paths including order, size and losing the shape partway; and the hold rules, including that holding the sign late counts exactly as much as holding it early.

Manual browser checks:

- Work through the alphabet; check the coaching line names something useful while the shape is wrong, and note which letters fight each other on your hands.
- Hold the right shape immediately, then try again holding it only in the last seconds of the round. Both must pass.
- Draw a J and a Z. Check that holding the handshape still does nothing, and that a half-drawn path does not pass.
- Form a letter, break it briefly, re-form it: a short flicker should not reset the bar, a real break should.
- Run a sprint; confirm the clock governs, the flash and chime fire on each landed sign, and a better run replaces the BEST figure while a worse one does not.
- Mute the sound and confirm the flash alone still reads as success.
- Put both hands in frame with the off hand forming a different letter.
- Stop mid-session, switch tabs, navigate to the demos and disconnect the camera. Leaving the route must release the camera.
- Deny camera permission or disconnect the network during model loading; retry after correcting the issue.
- Test a narrow phone viewport and a laptop, and both left- and right-handed signing.
