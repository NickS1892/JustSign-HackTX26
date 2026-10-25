/** Tune recognition here after testing several signers and camera distances. */
export const GAME_CONFIG = {
  /** Landmark detection runs at most this often. */
  sampleFps: 24,

  /**
   * How long the target shape has to stay the best match before it counts.
   * This is the whole "hold it and it's there" rule: there is no deadline to
   * hit, only a shape to settle into.
   */
  holdMs: 350,
  /** Tracking may flicker for this long inside a hold without resetting it. */
  holdGraceMs: 200,
  /** A shape below this confidence is not recognised as anything. */
  minConfidence: 0.72,
  /** The best shape must beat the runner-up by this much to be unambiguous. */
  minMargin: 0.03,

  /** How long a player gets on one sign before it is scored as a miss. */
  roundMs: 20000,
  /** A short beat before each round opens. */
  readyMs: 900,
  /** How long the result card stays up between rounds. */
  feedbackMs: 1700,
  /** Signs drawn from the database for one session. */
  roundsPerSession: 8,

  /** Points for holding a sign, plus a bonus that decays over the round. */
  basePoints: 600,
  speedBonusPoints: 400,

  /** Hands below this tracker score are ignored. */
  minHandScore: 0.5,

  /** Sprint mode: how long the clock runs, and the pause between signs. */
  sprintMs: 10_000,
  sprintGapMs: 450,
  /** Sprint scores one point per sign landed, so it has no points maths. */

  /** How long the green flash stays on screen after a correct sign. */
  flashMs: 420,
} as const;
