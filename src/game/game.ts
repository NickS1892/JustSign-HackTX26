import './game.css';
import { GAME_CONFIG as C } from './config';
import { HoldTracker, evaluateTarget, isDecisive, recognizeFrame } from './recognizer';
import { drawSigns } from './sign-database';
import { createHandTracker } from './tracker';
import type { HandObservation, HandTracker, Recognition, SignAttempt, SignDefinition } from './types';

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
  private cameraPending = false;
  private disposed = false;
  private raf = 0;
  private lastSample = 0;
  private phaseStart = 0;
  private round = 0;
  /** The signs for this session, drawn from the database and never listed. */
  private plan: SignDefinition[] = [];
  private attempts: SignAttempt[] = [];
  private bestMatch = 0;
  private hold = new HoldTracker();
  private camera: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private onVisibility = () => {
    // Hold time cannot accrue while the page is hidden; restart it on return.
    if (document.hidden) this.hold.reset();
  };

  constructor(private root: HTMLElement, private trackerFactory = createHandTracker) {
    root.innerHTML = `
      <section class="justsign">
        <header class="js-header"><a class="js-brand" href="#/game/justsign">✦ JustSign</a><span>WATCH. SIGN. SHINE.</span><a href="#/home">MediaPipe demos ↗</a></header>
        <div class="js-intro"><p class="js-eyebrow">YOUR HANDS. YOUR RHYTHM.</p><h1>Make your next move.</h1><p>We show you a handshape. Form it with either hand and hold it steady — the moment it is right, it counts.</p></div>
        <div class="js-stats"><div><small>ROUND</small><strong data-round>—</strong></div><div><small>TOTAL POINTS</small><strong data-total>0</strong></div><div><small>SIGNS COMPLETED</small><strong data-completed>0</strong></div><div><small>MATCH</small><strong data-match>—</strong></div></div>
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
        <div class="js-controls"><button data-camera-button>Enable camera</button><button class="js-primary" data-start disabled>Start session →</button><button data-stop disabled>Stop session</button><button data-skip disabled>Skip this sign</button><label class="js-mirror"><input data-mirror type="checkbox" checked> Mirror my camera</label></div>
        <section class="js-results" data-results hidden><p class="js-eyebrow">NICE PRACTICE</p><h2>Session complete.</h2><div data-result-list></div></section>
        <footer>Shape matching is practice feedback, not a certified assessment of ASL accuracy. ASL is a living language of the Deaf community; this is an introduction to fingerspelling, not fluency.</footer>
      </section>`;
    this.camera = this.el('[data-camera]');
    this.canvas = this.el('[data-landmarks]');
    this.el<HTMLButtonElement>('[data-camera-button]').onclick = () => void this.enableCamera();
    this.el<HTMLButtonElement>('[data-start]').onclick = () => this.start();
    this.el<HTMLButtonElement>('[data-stop]').onclick = () => this.cancel('Session stopped. Start again whenever you are ready.');
    this.el<HTMLButtonElement>('[data-skip]').onclick = () => this.skip();
    this.el<HTMLInputElement>('[data-mirror]').onchange = () => this.applyMirror();
    document.addEventListener('visibilitychange', this.onVisibility);
    this.applyMirror();
    this.raf = requestAnimationFrame(this.tick);
  }

  private el<T extends HTMLElement>(selector: string): T { return this.root.querySelector<T>(selector)!; }
  private status(message: string) { if (!this.disposed) this.el('[data-status]').textContent = message; }
  private get active() { return this.phase === 'ready' || this.phase === 'signing' || this.phase === 'feedback'; }
  private applyMirror() {
    this.el('.js-camera-wrap').classList.toggle('js-mirrored', this.el<HTMLInputElement>('[data-mirror]').checked);
  }
  private updateControls() {
    if (this.disposed) return;
    const ready = !!this.stream?.active && !this.cameraPending;
    this.el<HTMLButtonElement>('[data-start]').disabled = this.active || !ready;
    this.el<HTMLButtonElement>('[data-camera-button]').disabled = this.cameraPending || !!this.stream?.active;
    this.el<HTMLButtonElement>('[data-stop]').disabled = !this.active;
    this.el<HTMLButtonElement>('[data-skip]').disabled = this.phase !== 'signing';
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
    this.plan = drawSigns(C.roundsPerSession);
    this.el('[data-results]').hidden = true;
    this.el('[data-total]').textContent = '0';
    this.el('[data-completed]').textContent = '0';
    this.beginRound();
  }

  private get target(): SignDefinition { return this.plan[this.round]; }

  private beginRound() {
    const sign = this.target;
    this.phase = 'ready';
    this.phaseStart = performance.now();
    this.bestMatch = 0;
    this.hold.reset();
    this.el('[data-round]').textContent = `${this.round + 1} / ${this.plan.length}`;
    this.el('[data-sign]').textContent = sign.label;
    this.el('[data-letter]').textContent = sign.letter;
    this.el('[data-hint]').textContent = sign.hint;
    this.el('[data-coach]').textContent = '';
    this.el('[data-match]').textContent = '0%';
    this.overlay('Get ready');
    this.progress(0);
    this.status(`Form the ${sign.label}. Take as long as you need — hold it steady and it counts.`);
    this.updateControls();
  }

  /** Called the moment the target shape has been held long enough. */
  private completeRound(elapsedMs: number) {
    const remaining = Math.max(0, 1 - elapsedMs / C.roundMs);
    const points = Math.round(C.basePoints + C.speedBonusPoints * remaining);
    this.recordAttempt({ completed: true, timeMs: elapsedMs, points });
    this.overlay('Sign held ✦');
    this.status(`${this.target.label} — held it. +${points} points.`);
  }

  private missRound(elapsedMs: number, reason: string) {
    this.recordAttempt({ completed: false, timeMs: elapsedMs, points: 0 });
    this.overlay('Keep practicing');
    this.status(`${reason} Best match this round: ${this.bestMatch}%.`);
  }

  private recordAttempt(outcome: { completed: boolean; timeMs: number; points: number }) {
    const sign = this.target;
    this.attempts.push({ letter: sign.letter, label: sign.label, bestMatch: this.bestMatch, ...outcome });
    this.phase = 'feedback';
    this.phaseStart = performance.now();
    this.el('[data-total]').textContent = String(this.attempts.reduce((sum, a) => sum + a.points, 0));
    this.el('[data-completed]').textContent = String(this.attempts.filter(a => a.completed).length);
    this.el('[data-timer]').textContent = '';
    this.updateControls();
  }

  private skip() {
    if (this.phase !== 'signing') return;
    this.missRound(performance.now() - this.phaseStart, 'Skipped.');
  }

  private showResults() {
    this.phase = 'results';
    this.overlay('Session complete');
    this.idleTargetPanel();
    this.progress(0);
    this.el('[data-results]').hidden = false;
    const list = this.el('[data-result-list]'); list.replaceChildren();
    const table = document.createElement('table');
    const head = table.createTHead().insertRow();
    for (const label of ['Sign', 'Best match', 'Time', 'Points', 'Result']) {
      const th = document.createElement('th'); th.textContent = label; th.scope = 'col'; head.append(th);
    }
    const body = table.createTBody();
    for (const attempt of this.attempts) {
      const row = body.insertRow();
      const cells = [
        attempt.label,
        `${attempt.bestMatch}%`,
        attempt.completed ? `${(attempt.timeMs / 1000).toFixed(1)}s` : '—',
        String(attempt.points),
        attempt.completed ? 'Held' : 'Practice again',
      ];
      for (const value of cells) row.insertCell().textContent = value;
    }
    list.append(table);
    this.status('Session complete. Review your signs below, or start another session.');
    this.updateControls();
  }

  private cancel(message: string) {
    this.phase = 'setup';
    this.hold.reset();
    this.overlay('');
    this.idleTargetPanel();
    this.el('[data-timer]').textContent = '';
    this.progress(0);
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
    const warmth = this.phase === 'signing' ? this.hold.progress : 0;
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

    if (this.phase === 'ready' && elapsed >= C.readyMs) {
      this.phase = 'signing';
      this.phaseStart = now;
      this.hold.reset();
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

    if (this.phase === 'signing') {
      const left = Math.max(0, C.roundMs - (now - this.phaseStart));
      this.el('[data-timer]').textContent = `${(left / 1000).toFixed(1)}s`;
      if (left === 0) this.missRound(C.roundMs, 'Out of time on this one.');
    }

    if (this.phase === 'feedback' && now - this.phaseStart >= C.feedbackMs) {
      this.round++;
      if (this.round < this.plan.length) this.beginRound(); else this.showResults();
    }

    this.raf = requestAnimationFrame(this.tick);
  };

  /**
   * One sample of the player's hand during an open round.
   *
   * The round is won by holding the target shape, not by being in position at
   * a particular instant: as soon as `HoldTracker` has seen the shape for long
   * enough, the round ends in a win — early, late or anywhere in between.
   */
  private sample(now: number, hands: readonly HandObservation[]) {
    const { confidence, matching, weakest } = evaluateTarget(hands, this.target);
    const percent = Math.round(confidence * 100);
    this.bestMatch = Math.max(this.bestMatch, percent);
    this.el('[data-match]').textContent = `${percent}%`;
    this.el('[data-coach]').textContent = matching ? '' : (weakest?.coach ?? '');
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
  }
}

let active: JustSignGame | undefined;
export function setupJustSign(container: HTMLElement) { active = new JustSignGame(container); }
export function cleanupJustSign() { active?.dispose(); active = undefined; }
