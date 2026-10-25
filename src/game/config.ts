/** Tune recognition here after testing several signers and camera distances. */
export const GAME_CONFIG = {
  sampleFps: 12,
  countdownMs: 3000,
  feedbackMs: 2500,
  minVideoSeconds: 0.6,
  maxVideoSeconds: 15,
  maxVideoBytes: 100 * 1024 * 1024,
  minFrames: 6,
  minCoverage: 0.7,
  completionScore: 72,
  spatialTolerance: 0.35,
  alignmentWindow: 0.25,
  maxRoundPoints: 1000,
} as const;
