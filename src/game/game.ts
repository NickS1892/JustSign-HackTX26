import './game.css';
import { GAME_CONFIG as C } from './config';
import { playCorrectChime, playMissTone, isMuted, setMuted, unlockAudio, closeAudio } from './feedback';
import { highScore, recordScore } from './high-scores';
import { HoldTracker, MotionTracker, evaluateTarget, isDecisive, recognizeFrame } from './recognizer';
import { drawSigns } from './sign-database';
import { createHandTracker } from './tracker';
import type { GameMode, HandObservation, HandTracker, Recognition, SignAttempt, SignDefinition } from './types';

type Phase = 'setup' | 'ready' | 'signing' | 'feedback' | 'results';

const HAND_CONNECTIONS = [
  [0, 1, 2, 3, 4],
  [0, 5, 6, 7, 8],
  [5, 9, 10, 11, 12],
  [9, 13, 14, 15, 16],
  [13, 17, 18, 19, 20],
  [0, 17],
];

export class JustSignGame {
  private tracker?: HandTracker;
  private trackerPromise?: Promise<HandTracker>;
  private stream?: MediaStream;
  private phase: Phase = 'setup';
  private mode: GameMode = 'practice';
  private cameraPending = false;
  private disposed = false;
  private raf = 0;
  private lastSample = 0;
  private phaseStart = 0;
  private sessionStart = 0;
  private round = 0;
  /** The signs for this session, drawn from the database and never listed. */
  private plan: SignDefinition[] = [];
  private attempts: SignAttempt[] = [];
  private bestMatch = 0;
  private hold = new HoldTracker();
  private motion?: MotionTracker;
  private flashUntil = 0;
  private camera: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private onVisibility = () => {
    // Hold time cannot accrue while the page is hidden; restart it on return.
    if (document.hidden) {
      this.hold.reset();
      this.motion?.reset();
    }
  };

  constructor(private root: HTMLElement, private trackerFactory = createHandTracker) {
    root.innerHTML = `
      <section class="justsign">
        <div class="js-flash" data-flash aria-hidden="true"></div>
        <header class="js-header"><a class="js-brand" href="#/game/justsign">✦ JustSign</a><a href="#/home">MediaPipe demos ↗</a></header>
        <div class="js-intro"><p class="js-eyebrow">SIGN AT YOUR PACE</p><h1>Make your next move.</h1><p>We show you a handshape. Form it with either hand and hold it steady — the moment it is right, it counts.</p></div>
        <div class="js-modes" role="radiogroup" aria-label="Game mode">
          <button data-mode="practice" role="radio" aria-checked="true" class="js-mode-on"><strong>Practice</strong><small>8 signs, no rush</small></button>
          <button data-mode="sprint" role="radio" aria-checked="false"><strong>10-second sprint</strong><small>As many signs as you can</small></button>
        </div>
        <div class="js-stats"><div><small data-stat-1-label>ROUND</small><strong data-round>—</strong></div><div><small data-stat-2-label>TOTAL POINTS</small><strong data-total>0</strong></div><div><small>BEST</small><strong data-best>—</strong></div><div><small>MATCH</small><strong data-match>—</strong></div></div>
        <div class="js-stage">
          <article class="js-panel"><div class="js-panel-head"><span>01 / FORM THIS SIGN</span><strong data-sign>Ready when you are</strong></div>
            <div class="js-video-wrap js-target">
              <div class="js-letter" data-letter>✦</div>
              <div class="js-overlay" data-overlay hidden></div>
            </div>
            <div class="js-coach"><p data-hint>Enable your camera to begin a session.</p><p class="js-coach-live" data-coach></p></div>
          </article>
          <article class="js-panel"><div class="js-panel-head"><span>02 / YOUR MOVEMENT</span><strong data-tracking>Camera off</strong></div><div class="js-video-wrap js-camera-wrap"><video data-camera autoplay muted playsinline></video><canvas data-landmarks></canvas><div class="js-camera-hint" data-camera-hint>Enable your camera.<br>Keep your signing hand fully in view.</div></div>
            <div class="js-coach"><p data-reading>No hand detected yet.</p></div>
          </article>
        </div>
        <div class="js-progress" role="progressbar" aria-label="Hold progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div></div></div>
        <div class="js-feedback"><p role="status" aria-live="polite" data-status>Enable your camera, then start a session.</p><strong data-timer></strong></div>
        <div class="js-controls"><button data-camera-button>Enable camera</button><button class="js-primary" data-start disabled>Start session →</button><button data-stop disabled>Stop session</button><button data-skip disabled>Skip this sign</button><label class="js-toggle"><input data-sound type="checkbox" checked> Sound</label><label class="js-toggle"><input data-mirror type="checkbox" checked> Mirror my camera</label></div>
        <section class="js-results" data-results hidden><p class="js-eyebrow" data-results-eyebrow>NICE PRACTICE</p><h2 data-results-title>Session complete.</h2><div data-result-list></div></section>
        <footer>Shape matching is practice feedback, not a certified assessment of ASL accuracy. ASL is a living language of the Deaf community; this is an introduction to fingerspelling, not fluency.</footer>
      </section>`;
    this.camera = this.el('[data-camera]');
    this.canvas = this.el('[data-landmarks]');
    this.el<HTMLButtonElement>('[data-camera-button]').onclick = () => { unlockAudio(); void this.enableCamera(); };
    this.el<HTMLButtonElement>('[data-start]').onclick = () => { unlockAudio(); this.start(); };
    this.el<HTMLButtonElement>('[data-stop]').onclick = () => this.cancel('Session stopped. Start again whenever you are ready.');
    this.el<HTMLButtonElement>('[data-skip]').onclick = () => this.skip();
    this.el<HTMLInputElement>('[data-mirror]').onchange = () => this.applyMirror();
    this.el<HTMLInputElement>('[data-sound]').onchange = e => setMuted(!(e.target as HTMLInputElement).checked);
    this.root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => {
      button.onclick = () => this.setMode(button.dataset.mode as GameMode);
    });
    document.addEventListener('visibilitychange', this.onVisibility);
    this.el<HTMLInputElement>('[data-sound]').checked = !isMuted();
    this.applyMirror();
    this.setMode('practice');
    this.raf = requestAnimationFrame(this.tick);
  }

  private el<T extends HTMLElement>(selector: string): T { return this.root.querySelector<T>(selector)!; }
  private status(message: string) { if (!this.disposed) this.el('[data-status]').textContent = message; }
  private get active() { return this.phase === 'ready' || this.phase === 'signing' || this.phase === 'feedback'; }
  private get sprinting() { return this.mode === 'sprint'; }

  private applyMirror() {
    this.el('.js-camera-wrap').classList.toggle('js-mirrored', this.el<HTMLInputElement>('[data-mirror]').checked);
  }

  private setMode(mode: GameMode) {
    if (this.active) return;
    this.mode = mode;
    this.root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => {
      const on = button.dataset.mode === mode;
      button.classList.toggle('js-mode-on', on);
      button.setAttribute('aria-checked', String(on));
    });
    this.el('[data-stat-1-label]').textContent = this.sprinting ? 'TIME LEFT' : 'ROUND';
    this.el('[data-stat-2-label]').textContent = this.sprinting ? 'SIGNS LANDED' : 'TOTAL POINTS';
    this.el('[data-start]').textContent = this.sprinting ? 'Start sprint →' : 'Start session →';
    this.el('[data-round]').textContent = this.sprinting ? `${(C.sprintMs / 1000).toFixed(0)}.0s` : '—';
    this.el('[data-total]').textContent = '0';
    this.el('[data-results]').hidden = true;
    this.showBest();
    this.status(
      this.sprinting
        ? `Sprint: land as many signs as you can in ${C.sprintMs / 1000} seconds.`
        : `Practice: ${C.roundsPerSession} signs, as long as you need on each.`,
    );
  }

  private showBest() {
    const best = highScore(this.mode);
    this.el('[data-best]').textContent = best
      ? this.sprinting ? `${best.score}` : `${best.score}`
      : '—';
  }

  private updateControls() {
    if (this.disposed) return;
    const ready = !!this.stream?.active && !this.cameraPending;
    this.el<HTMLButtonElement>('[data-start]').disabled = this.active || !ready;
    this.el<HTMLButtonElement>('[data-camera-button]').disabled = this.cameraPending || !!this.stream?.active;
    this.el<HTMLButtonElement>('[data-stop]').disabled = !this.active;
    this.el<HTMLButtonElement>('[data-skip]').disabled = this.phase !== 'signing';
    this.root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b => { b.disabled = this.active; });
  }

  private async getTracker(): Promise<HandTracker> {
    if (!this.trackerPromise) {
      this.status('Loading hand tracking. The first download can take a moment…');
      this.trackerPromise = this.trackerFactory().then(tracker => {
        if (this.disposed) { tracker.close(); throw new Error('Game closed.'); }
        this.tracker = tracker;
        return tracker;
      }).catch(error => { this.trackerPromise = undefined; throw error; });
    }
    return this.trackerPromise;
  }

  private async enableCamera() {
    this.cameraPending = true; this.updateControls();
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('camera access needs HTTPS or localhost.');
      await this.getTracker();
      if (this.disposed) return;
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
      if (this.disposed) { stream.getTracks().forEach(t => t.stop()); return; }
      this.stream = stream; this.camera.srcObject = stream;
      stream.getVideoTracks()[0].onended = () => { this.stream = undefined; this.cancel('Camera disconnected. Enable it again to continue.'); };
      await this.camera.play();
      if (this.disposed) return;
      this.el('[data-camera-hint]').hidden = true;
      this.status('Camera ready. Start a session when you are.');
    } catch (error) {
      this.stream?.getTracks().forEach(t => t.stop()); this.stream = undefined;
      this.status(`Camera could not start: ${error instanceof Error ? error.message : 'check camera permissions and try again.'}`);
    } finally { this.cameraPending = false; this.updateControls(); }
  }

  private start() {
    if (this.active || !this.stream?.active) return;
    this.round = 0;
    this.attempts = [];
    // Sprint keeps drawing signs until the clock runs out, so it needs a
    // longer plan than it will usually get through.
    this.plan = drawSigns(this.sprinting ? 40 : C.roundsPerSession);
    this.sessionStart = performance.now();
    this.el('[data-results]').hidden = true;
    this.el('[data-total]').textContent = '0';
    this.beginRound();
  }

  private get target(): SignDefinition { return this.plan[this.round]; }

  private get sprintLeft(): number {
    return Math.max(0, C.sprintMs - (performance.now() - this.sessionStart));
  }

  private beginRound() {
    const sign = this.target;
    this.phase = 'ready';
    this.phaseStart = performance.now();
    this.bestMatch = 0;
    this.hold.reset();
    this.motion = sign.motion ? new MotionTracker(sign.motion) : undefined;
    if (!this.sprinting) this.el('[data-round]').textContent = `${this.round + 1} / ${this.plan.length}`;
    this.el('[data-sign]').textContent = sign.label;
    this.el('[data-letter]').textContent = sign.letter;
    this.el('[data-hint]').textContent = sign.hint;
    this.el('[data-coach]').textContent = '';
    this.el('[data-match]').textContent = '0%';
    this.overlay(this.sprinting ? 'Go' : 'Get ready');
    this.progress(0);
    this.status(
      sign.motion
        ? `${sign.label}: hold the handshape and draw the path.`
        : this.sprinting
          ? `Form the ${sign.label}.`
          : `Form the ${sign.label}. Take as long as you need — hold it steady and it counts.`,
    );
    this.updateControls();
  }

  /** Called the moment the target shape has been held, or its path traced. */
  private completeRound(elapsedMs: number) {
    const points = this.sprinting
      ? 1
      : Math.round(C.basePoints + C.speedBonusPoints * Math.max(0, 1 - elapsedMs / C.roundMs));
    this.recordAttempt({ completed: true, timeMs: elapsedMs, points });
    this.flash();
    playCorrectChime();
    this.overlay(this.sprinting ? '✦' : 'Sign held ✦');
    this.status(this.sprinting ? `${this.target.label} — landed!` : `${this.target.label} — held it. +${points} points.`);
  }

  private missRound(elapsedMs: number, reason: string) {
    this.recordAttempt({ completed: false, timeMs: elapsedMs, points: 0 });
    if (!this.sprinting) playMissTone();
    this.overlay('Keep practicing');
    this.status(`${reason} Best match this round: ${this.bestMatch}%.`);
  }

  private recordAttempt(outcome: { completed: boolean; timeMs: number; points: number }) {
    const sign = this.target;
    this.attempts.push({ letter: sign.letter, label: sign.label, bestMatch: this.bestMatch, ...outcome });
    this.phase = 'feedback';
    this.phaseStart = performance.now();
    this.el('[data-total]').textContent = String(this.score);
    this.el('[data-timer]').textContent = '';
    this.updateControls();
  }

  private get score(): number {
    return this.sprinting
      ? this.attempts.filter(a => a.completed).length
      : this.attempts.reduce((sum, a) => sum + a.points, 0);
  }

  private flash() {
    this.flashUntil = performance.now() + C.flashMs;
    const flash = this.el('[data-flash]');
    flash.classList.remove('js-flash-on');
    // Restart the animation even when two signs land back to back.
    void flash.offsetWidth;
    flash.classList.add('js-flash-on');
  }

  private skip() {
    if (this.phase !== 'signing') return;
    this.missRound(performance.now() - this.phaseStart, 'Skipped.');
  }

  private showResults() {
    this.phase = 'results';
    const { best, isNew } = recordScore(this.mode, this.score);
    this.showBest();
    this.overlay(isNew ? 'New best ✦' : 'Session complete');
    this.idleTargetPanel();
    this.progress(0);
    this.el('[data-timer]').textContent = '';
    this.el('[data-results]').hidden = false;
    this.el('[data-results-eyebrow]').textContent = isNew ? 'NEW HIGH SCORE' : 'NICE PRACTICE';
    this.el('[data-results-title]').textContent = this.sprinting
      ? `${this.score} sign${this.score === 1 ? '' : 's'} in ${C.sprintMs / 1000} seconds.`
      : 'Session complete.';

    const list = this.el('[data-result-list]'); list.replaceChildren();
    const table = document.createElement('table');
    const head = table.createTHead().insertRow();
    const columns = this.sprinting
      ? ['Sign', 'Best match', 'Time', 'Result']
      : ['Sign', 'Best match', 'Time', 'Points', 'Result'];
    for (const label of columns) { const th = document.createElement('th'); th.textContent = label; th.scope = 'col'; head.append(th); }
    const body = table.createTBody();
    for (const attempt of this.attempts) {
      const row = body.insertRow();
      const cells = [
        attempt.label,
        `${attempt.bestMatch}%`,
        attempt.completed ? `${(attempt.timeMs / 1000).toFixed(1)}s` : '—',
        ...(this.sprinting ? [] : [String(attempt.points)]),
        attempt.completed ? 'Landed' : 'Practice again',
      ];
      for (const value of cells) row.insertCell().textContent = value;
    }
    list.append(table);
    this.status(
      isNew
        ? `New best: ${best}. Review your signs below, or go again.`
        : `Session complete. Your best is ${best}. Review your signs below, or go again.`,
    );
    this.updateControls();
  }

  private cancel(message: string) {
    const wasPlaying = this.active;
    this.phase = 'setup';
    this.hold.reset();
    this.motion?.reset();
    this.overlay('');
    this.idleTargetPanel();
    this.el('[data-timer]').textContent = '';
    this.progress(0);
    // A session the player walked away from still counts what they landed.
    if (wasPlaying && this.attempts.length) {
      recordScore(this.mode, this.score);
      this.showBest();
    }
    if (this.sprinting) this.el('[data-round]').textContent = `${(C.sprintMs / 1000).toFixed(0)}.0s`;
    this.status(message);
    this.updateControls();
  }

  /** Clears the round's sign so a finished session does not look like a live one. */
  private idleTargetPanel() {
    this.el('[data-letter]').textContent = '✦';
    this.el('[data-sign]').textContent = 'Ready when you are';
    this.el('[data-hint]').textContent = 'Start a session and we will show you a handshape to form.';
    this.el('[data-coach]').textContent = '';
    this.el('[data-match]').textContent = '—';
  }

  private overlay(text: string) {
    const overlay = this.el('[data-overlay]');
    overlay.textContent = text;
    overlay.hidden = !text;
  }

  private progress(fraction: number) {
    this.el('.js-progress').setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
    this.el<HTMLElement>('.js-progress > div').style.width = `${fraction * 100}%`;
  }

  private draw(hands: readonly HandObservation[]) {
    if (this.canvas.width !== this.camera.videoWidth || this.canvas.height !== this.camera.videoHeight) {
      this.canvas.width = this.camera.videoWidth;
      this.canvas.height = this.camera.videoHeight;
    }
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    // The skeleton warms from grey to lime as the held shape approaches a match.
    const warmth = this.phase === 'signing' ? this.roundProgress : 0;
    ctx.strokeStyle = warmth > 0 ? `rgb(${Math.round(140 - 55 * warmth)}, ${Math.round(190 + 60 * warmth)}, ${Math.round(150 - 41 * warmth)})` : '#8ebe96';
    ctx.lineWidth = 3;
    for (const hand of hands) {
      for (const chain of HAND_CONNECTIONS) {
        ctx.beginPath();
        chain.forEach((index, i) => {
          const p = hand.landmarks[index];
          if (!p) return;
          const x = p.x * this.canvas.width;
          const y = p.y * this.canvas.height;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }
    }
    this.el('[data-tracking]').textContent = hands.length ? 'Hand detected ●' : 'Show your hand';
  }

  /** How far through the current sign the player is: held, or path traced. */
  private get roundProgress(): number {
    return this.motion ? this.motion.progress : this.hold.progress;
  }

  /** Live readout of what the database currently thinks it is looking at. */
  private describe(reading: Recognition, hands: readonly HandObservation[]) {
    if (!hands.length) { this.el('[data-reading]').textContent = 'No hand detected yet.'; return; }
    this.el('[data-reading]').textContent = isDecisive(reading) && reading.sign
      ? `Reading: ${reading.sign.label} (${Math.round(reading.confidence * 100)}%)`
      : 'Reading: hold a clear handshape in view.';
  }

  private tick = (now: number) => {
    if (this.disposed) return;
    const elapsed = now - this.phaseStart;

    if (this.phase === 'ready' && elapsed >= (this.sprinting ? C.sprintGapMs : C.readyMs)) {
      this.phase = 'signing';
      this.phaseStart = now;
      this.hold.reset();
      this.motion?.reset();
      this.overlay('');
    }

    if (this.stream?.active && this.tracker && this.camera.readyState >= 2 && now - this.lastSample >= 1000 / C.sampleFps) {
      this.lastSample = now;
      try {
        const frame = this.tracker.detect(this.camera, now);
        const reading = recognizeFrame(frame.hands);
        this.draw(frame.hands);
        this.describe(reading, frame.hands);
        if (this.phase === 'signing') this.sample(now, frame.hands);
      } catch {
        this.stream.getTracks().forEach(t => t.stop());
        this.stream = undefined;
        this.cancel('Tracking stopped. Enable your camera again to retry.');
      }
    }

    // The sprint clock governs the whole session, not the individual sign.
    if (this.sprinting && this.active) {
      const left = this.sprintLeft;
      this.el('[data-round]').textContent = `${(left / 1000).toFixed(1)}s`;
      if (left === 0) { this.endSprint(); this.raf = requestAnimationFrame(this.tick); return; }
    }

    if (this.phase === 'signing' && !this.sprinting) {
      const left = Math.max(0, C.roundMs - (now - this.phaseStart));
      this.el('[data-timer]').textContent = `${(left / 1000).toFixed(1)}s`;
      if (left === 0) this.missRound(C.roundMs, 'Out of time on this one.');
    }

    if (this.phase === 'feedback' && now - this.phaseStart >= (this.sprinting ? C.sprintGapMs : C.feedbackMs)) {
      this.round++;
      if (this.round < this.plan.length) this.beginRound(); else this.showResults();
    }

    if (this.flashUntil && now > this.flashUntil) {
      this.flashUntil = 0;
      this.el('[data-flash]').classList.remove('js-flash-on');
    }

    this.raf = requestAnimationFrame(this.tick);
  };

  /** The sprint ends on the clock, mid-sign if need be. */
  private endSprint() {
    if (this.phase === 'signing') this.attempts.push({
      letter: this.target.letter, label: this.target.label, bestMatch: this.bestMatch,
      timeMs: performance.now() - this.phaseStart, completed: false, points: 0,
    });
    this.showResults();
  }

  /**
   * One sample of the player's hand during an open round.
   *
   * The round is won by holding the target shape, not by being in position at
   * a particular instant: as soon as `HoldTracker` has seen the shape for long
   * enough, the round ends in a win — early, late or anywhere in between. The
   * two moving letters instead have to trace their path while the shape holds.
   */
  private sample(now: number, hands: readonly HandObservation[]) {
    const { confidence, matching, weakest, landmarks } = evaluateTarget(hands, this.target);
    const percent = Math.round(confidence * 100);
    this.bestMatch = Math.max(this.bestMatch, percent);
    this.el('[data-match]').textContent = `${percent}%`;
    this.el('[data-coach]').textContent = matching ? '' : (weakest?.coach ?? '');

    if (this.motion) {
      // The path only advances while the handshape is right, so a hand
      // wandering across the frame cannot draw a J by accident.
      this.progress(this.motion.update(now, matching ? landmarks ?? null : null));
      if (this.motion.complete) this.completeRound(now - this.phaseStart);
      return;
    }
    this.progress(this.hold.update(now, matching));
    if (this.hold.complete) this.completeRound(now - this.phaseStart);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.stream?.getTracks().forEach(t => { t.onended = null; t.stop(); });
    this.camera.srcObject = null;
    this.tracker?.close();
    closeAudio();
  }
}

let active: JustSignGame | undefined;
export function setupJustSign(container: HTMLElement) { active = new JustSignGame(container); }
export function cleanupJustSign() { active?.dispose(); active = undefined; }
