import './game.css';
import { GAME_CONFIG as C } from './config';
import { compareSigns, compareHandImage } from './matcher';
import { deleteReference, extractReference, loadReferences, saveReference } from './references';
import { createSignTracker } from './tracker';
import type { MatchResult, SignFrame, SignReference, SignTracker } from './types';

const BUILTIN_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
const referenceImageUrl = (letter: string) => `${import.meta.env.BASE_URL}references/asl/${letter}.png`;

type Phase = 'setup' | 'watch' | 'countdown' | 'starting' | 'perform' | 'feedback' | 'results';
interface RoundResult { name: string; result: MatchResult; points: number }

export class JustSignGame {
  private refs: SignReference[] = [];
  private tracker?: SignTracker;
  private trackerPromise?: Promise<SignTracker>;
  private stream?: MediaStream;
  private abort = new AbortController();
  private phase: Phase = 'setup';
  private busy = false;
  private cameraPending = false;
  private disposed = false;
  private raf = 0;
  private lastSample = 0;
  private phaseStart = 0;
  private round = 0;
  private attempt: SignFrame[] = [];
  private results: RoundResult[] = [];
  private camera: HTMLVideoElement;
  private demo: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private onVisibility = () => {
    if (document.hidden && this.phase !== 'setup' && this.phase !== 'results') this.cancel('Round stopped while the tab was hidden. Start again when ready.');
  };

  constructor(private root: HTMLElement, private trackerFactory = createSignTracker) {
    root.innerHTML = `
      <section class="justsign">
        <header class="js-header"><a class="js-brand" href="#/game/justsign">✦ JustSign</a><span>WATCH. SIGN. SHINE.</span><a href="#/home">MediaPipe demos ↗</a></header>
        <div class="js-intro"><p class="js-eyebrow">YOUR HANDS. YOUR RHYTHM.</p><h1>Make your next move.</h1><p>Watch a sign, follow the timing, and see how closely your movements match.</p></div>
        <div class="js-stats"><div><small>ROUND</small><strong data-round>—</strong></div><div><small>TOTAL POINTS</small><strong data-total>0</strong></div><div><small>SIGNS COMPLETED</small><strong data-completed>0</strong></div><div><small>MATCH</small><strong data-match>—</strong></div></div>
        <div class="js-stage">
          <article class="js-panel"><div class="js-panel-head"><span>01 / THE DEMONSTRATION</span><strong data-sign>Your sign goes here</strong></div><div class="js-video-wrap"><img data-reference-image hidden alt="Reference handshape"><video data-demo playsinline muted controls preload="auto"></video><div class="js-empty" data-empty>✧<h2>Build your sign playlist</h2><p>Choose a clear photo of one handshape. No training video needed.</p></div><div class="js-overlay" data-overlay hidden></div></div></article>
          <article class="js-panel"><div class="js-panel-head"><span>02 / YOUR MOVEMENT</span><strong data-tracking>Camera off</strong></div><div class="js-video-wrap js-camera-wrap"><video data-camera autoplay muted playsinline></video><canvas data-landmarks></canvas><div class="js-camera-hint" data-camera-hint>Enable your camera.<br>Keep your face, shoulders and hands in view.</div></div></article>
        </div>
        <div class="js-progress" role="progressbar" aria-label="Round progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div></div></div>
        <div class="js-feedback"><p role="status" aria-live="polite" data-status>Import a handshape photo, then enable your camera.</p><strong data-timer></strong></div>
        <div class="js-controls"><button data-camera-button>Enable camera</button><button class="js-primary" data-start disabled>Start playlist →</button><button data-stop disabled>Stop game</button><label class="js-mirror"><input data-mirror type="checkbox"> Mirror the demonstration</label></div>
        <section class="js-library"><h2>Start with A–F</h2><p class="js-help">Choose the built-in set, enable your camera, then start the playlist.</p><div class="js-reference-grid">${BUILTIN_LETTERS.map(letter => `<figure><img src="${referenceImageUrl(letter)}" alt="ASL fingerspelling reference for ${letter}"><figcaption>${letter}</figcaption></figure>`).join('')}</div><button data-builtin>Load A–F practice set</button><div class="js-library-heading"><div><p class="js-eyebrow">YOUR PRACTICE SET</p><h2>Sign playlist</h2></div><label class="js-upload">+ Import sign images or videos<input data-upload type="file" accept="image/png,image/jpeg,image/webp,video/*" multiple></label></div><p class="js-help">Use a JPG, PNG or WebP photo showing one complete hand. Static photos cannot represent J or Z motion. Video clips may also be used: 0.6–15 seconds each, up to 100 MB. File names become sign names. Videos and coordinates stay in this browser.</p><ol data-playlist></ol><p data-storage></p></section>
        <section class="js-results" data-results hidden><p class="js-eyebrow">NICE PRACTICE</p><h2>Session complete.</h2><div data-result-list></div></section>
        <footer>Movement similarity is practice feedback, not a certified assessment of ASL accuracy. Use reference signs reviewed by an ASL-fluent signer.</footer>
      </section>`;
    this.camera = this.el('[data-camera]'); this.demo = this.el('[data-demo]'); this.canvas = this.el('[data-landmarks]');
    this.el<HTMLButtonElement>('[data-camera-button]').onclick = () => void this.enableCamera();
    this.el<HTMLButtonElement>('[data-start]').onclick = () => void this.start();
    this.el<HTMLButtonElement>('[data-stop]').onclick = () => this.cancel('Game stopped. Your playlist is ready for another try.');
    this.el<HTMLButtonElement>('[data-builtin]').onclick = () => void this.loadBuiltin();
    this.el<HTMLInputElement>('[data-upload]').onchange = e => void this.importVideos(e.target as HTMLInputElement);
    this.el<HTMLInputElement>('[data-mirror]').onchange = () => this.demo.classList.toggle('js-mirrored', this.mirror);
    this.demo.onended = () => { if (this.phase === 'watch') this.beginCountdown(); };
    this.demo.onerror = () => { if (this.phase !== 'setup' && this.phase !== 'results') this.cancel('The demonstration could not play. Remove it and import a supported video.'); };
    document.addEventListener('visibilitychange', this.onVisibility);
    void this.restore();
    this.raf = requestAnimationFrame(this.tick);
  }

  private el<T extends HTMLElement>(selector: string): T { return this.root.querySelector<T>(selector)!; }
  private get mirror() { return this.el<HTMLInputElement>('[data-mirror]').checked; }
  private status(message: string) { if (!this.disposed) this.el('[data-status]').textContent = message; }
  private get active() { return this.phase !== 'setup' && this.phase !== 'results'; }
  private updateControls() {
    if (this.disposed) return;
    this.el<HTMLButtonElement>('[data-start]').disabled = this.active || this.busy || this.cameraPending || !this.stream?.active || !this.refs.length;
    this.el<HTMLButtonElement>('[data-camera-button]').disabled = this.active || this.busy || this.cameraPending || !!this.stream?.active;
    this.el<HTMLButtonElement>('[data-stop]').disabled = !this.active;
    this.el<HTMLButtonElement>('[data-builtin]').disabled = this.active || this.busy || this.cameraPending;
    this.el<HTMLInputElement>('[data-upload]').disabled = this.active || this.busy || this.cameraPending;
    this.el<HTMLInputElement>('[data-mirror]').disabled = this.active;
    this.root.querySelectorAll<HTMLButtonElement>('[data-remove]').forEach(b => b.disabled = this.active || this.busy);
  }
  private async restore() {
    this.busy = true; this.updateControls();
    try {
      const refs = await loadReferences();
      if (this.disposed) { refs.forEach(r => URL.revokeObjectURL(r.videoUrl)); return; }
      this.refs = refs; this.renderPlaylist();
    } catch { if (!this.disposed) this.el('[data-storage]').textContent = 'Browser storage is unavailable. Imported signs will work for this session.'; }
    finally { this.busy = false; this.updateControls(); }
  }
  private async getTracker(): Promise<SignTracker> {
    if (!this.trackerPromise) {
      this.status('Loading hand and body tracking. The first download can take a moment…');
      this.trackerPromise = this.trackerFactory().then(tracker => {
        if (this.disposed) { tracker.close(); throw new Error('Game closed.'); }
        this.tracker = tracker; return tracker;
      }).catch(error => { this.trackerPromise = undefined; throw error; });
    }
    return this.trackerPromise;
  }
  private async enableCamera() {
    this.cameraPending = true; this.updateControls();
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access needs HTTPS or localhost.');
      await this.getTracker();
      if (this.disposed) return;
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
      if (this.disposed) { stream.getTracks().forEach(t => t.stop()); return; }
      this.stream = stream; this.camera.srcObject = stream;
      stream.getVideoTracks()[0].onended = () => { this.stream = undefined; this.cancel('Camera disconnected. Enable it again to continue.'); };
      await this.camera.play();
      if (this.disposed) return;
      this.el('[data-camera-hint]').hidden = true;
      this.status('Camera ready. Import your signs or start your playlist.');
    } catch (error) {
      this.stream?.getTracks().forEach(t => t.stop()); this.stream = undefined;
      this.status(`Camera could not start: ${error instanceof Error ? error.message : 'check camera permissions and try again.'}`);
    } finally { this.cameraPending = false; this.updateControls(); }
  }
  private async loadBuiltin() {
    if (this.active || this.busy || this.cameraPending) return;
    this.busy = true; this.updateControls();
    const errors: string[] = []; let added = 0;
    try {
      const tracker = await this.getTracker();
      for (const letter of BUILTIN_LETTERS) {
        if (this.refs.some(ref => ref.id === `builtin-${letter}`)) continue;
        if (this.disposed) return;
        try {
          this.status(`Preparing ${letter}…`);
          const response = await fetch(referenceImageUrl(letter), { signal: this.abort.signal });
          if (!response.ok) throw new Error('Reference image could not load.');
          const file = new File([await response.blob()], `${letter}.png`, { type: 'image/png' });
          const ref = await extractReference(file, tracker, this.abort.signal, () => {});
          if (this.disposed) { URL.revokeObjectURL(ref.videoUrl); return; }
          ref.id = `builtin-${letter}`;
          this.refs.push(ref); added++;
          try { await saveReference(ref, file); }
          catch { this.el('[data-storage]').textContent = 'Practice set loaded for this session; browser storage is unavailable.'; }
        } catch (error) { if (!this.disposed) errors.push(`${letter}: ${error instanceof Error ? error.message : 'Could not prepare image.'}`); }
      }
      if (!this.disposed) { this.renderPlaylist(); this.status(`${added} letters added. ${errors.length ? errors.join(' ') : 'Enable your camera and start the playlist.'}`); }
    } catch (error) { this.status(`Could not prepare the practice set: ${error instanceof Error ? error.message : 'Try again.'}`); }
    finally { this.busy = false; this.updateControls(); }
  }
  private async importVideos(input: HTMLInputElement) {
    const files = Array.from(input.files ?? []); if (!files.length) return;
    this.busy = true; this.updateControls();
    let added = 0; const errors: string[] = [];
    try {
      const tracker = await this.getTracker();
      for (const file of files) {
        if (this.disposed) break;
        try {
          const ref = await extractReference(file, tracker, this.abort.signal, fraction => this.status(`Extracting ${file.name}: ${Math.round(fraction * 100)}%`));
          if (this.disposed) { URL.revokeObjectURL(ref.videoUrl); break; }
          this.refs.push(ref); added++; this.renderPlaylist();
          try { await saveReference(ref, file); }
          catch { if (!this.disposed) this.el('[data-storage]').textContent = 'Could not save videos to browser storage. Keep this tab open to retain this session.'; }
        } catch (error) { errors.push(`${file.name}: ${error instanceof Error ? error.message : 'Import failed.'}`); }
      }
      this.status(`${added} sign${added === 1 ? '' : 's'} imported.${errors.length ? ` ${errors.join(' ')}` : ' Ready to practice!'}`);
    } catch (error) { this.status(`Tracking could not load: ${error instanceof Error ? error.message : 'Please retry.'}`); }
    finally { this.busy = false; input.value = ''; this.updateControls(); }
  }
  private renderPlaylist() {
    const list = this.el('[data-playlist]'); list.replaceChildren();
    for (const ref of this.refs) {
      const li = document.createElement('li');
      const text = document.createElement('span'); text.textContent = `${ref.name} · ${(ref.durationMs / 1000).toFixed(1)}s · ${ref.frames.length} frames`;
      const button = document.createElement('button'); button.textContent = 'Remove'; button.dataset.remove = ref.id; button.setAttribute('aria-label', `Remove ${ref.name}`);
      button.onclick = () => void this.remove(ref);
      li.append(text, button); list.append(li);
    }
    this.el('[data-empty]').hidden = this.refs.length > 0;
    if (this.refs.length && !this.active) { this.showReference(this.refs[0]); this.el('[data-sign]').textContent = this.refs[0].name; }
    if (!this.refs.length) { this.el<HTMLImageElement>('[data-reference-image]').hidden = true; this.demo.removeAttribute('src'); this.demo.load(); this.el('[data-sign]').textContent = 'Your sign goes here'; }
    this.updateControls();
  }
  private async remove(ref: SignReference) {
    if (this.active || this.busy) return;
    this.busy = true; this.updateControls();
    try { await deleteReference(ref.id); }
    catch { this.status('Could not update browser storage. The sign may return after a refresh.'); }
    if (this.disposed) return;
    this.refs = this.refs.filter(r => r.id !== ref.id); URL.revokeObjectURL(ref.videoUrl);
    this.busy = false; this.renderPlaylist();
  }
  private async start() {
    if (this.active || this.busy || !this.refs.length || !this.stream?.active) return;
    this.round = 0; this.results = []; this.el('[data-results]').hidden = true;
    this.el('[data-total]').textContent = '0'; this.el('[data-completed]').textContent = '0';
    await this.watch();
  }
  private showReference(ref: SignReference) {
    const img = this.el<HTMLImageElement>('[data-reference-image]');
    img.hidden = ref.kind !== 'image'; this.demo.hidden = ref.kind === 'image';
    if (ref.kind === 'image') { this.demo.pause(); img.src = ref.videoUrl; }
    else { img.removeAttribute('src'); this.demo.src = ref.videoUrl; }
  }
  private async watch() {
    const ref = this.refs[this.round];
    this.phase = 'watch'; this.phaseStart = performance.now(); this.updateControls();
    this.el('[data-round]').textContent = `${this.round + 1} / ${this.refs.length}`;
    this.el('[data-sign]').textContent = ref.name; this.el('[data-match]').textContent = '—';
    this.showReference(ref);
    if (ref.kind === 'image') { this.beginCountdown(); return; }
    this.demo.src = ref.videoUrl; this.demo.currentTime = 0; this.demo.controls = false; this.demo.playbackRate = 1;
    this.overlay('Watch first'); this.status(`Watch “${ref.name}”. Your turn starts after a 3-second countdown.`);
    try { await this.demo.play(); }
    catch { if (this.phase === 'watch') this.cancel('Could not play the demonstration. Press Start playlist to retry.'); }
  }
  private beginCountdown() {
    this.phase = 'countdown'; this.phaseStart = performance.now(); this.demo.pause(); this.demo.currentTime = 0;
    this.status('Get ready. Repeat the sign with the demonstration.');
  }
  private async perform() {
    this.phase = 'starting'; this.phaseStart = performance.now(); this.lastSample = 0; this.attempt = [];
    this.overlay(''); this.status('Your turn! Match the reference.');
    if (this.refs[this.round].kind === 'image') { this.phase = 'perform'; return; }
    try {
      await this.demo.play();
      if (this.phase === 'starting') { this.phase = 'perform'; this.phaseStart = performance.now() - this.demo.currentTime * 1000; }
    } catch { if (this.phase === 'starting') this.cancel('Demonstration playback stopped. Start again when ready.'); }
  }
  private finishRound() {
    const ref = this.refs[this.round];
    const result = ref.kind === 'image' ? compareHandImage(ref.frames[0], this.attempt) : compareSigns(ref.frames, this.attempt, ref.durationMs, this.mirror);
    const points = Math.round(result.score / 100 * C.maxRoundPoints);
    this.results.push({ name: ref.name, result, points }); this.phase = 'feedback'; this.phaseStart = performance.now();
    this.demo.pause(); this.el('[data-match]').textContent = `${result.score}%`;
    this.el('[data-total]').textContent = String(this.results.reduce((sum, r) => sum + r.points, 0));
    this.el('[data-completed]').textContent = String(this.results.filter(r => r.result.completed).length);
    this.overlay(result.completed ? 'Sign completed ✦' : 'Keep practicing'); this.status(`${result.feedback} +${points} points.`);
  }
  private showResults() {
    this.phase = 'results'; this.overlay('Session complete'); this.demo.controls = true;
    this.el('[data-results]').hidden = false;
    const list = this.el('[data-result-list]'); list.replaceChildren();
    const table = document.createElement('table');
    const head = table.createTHead().insertRow();
    for (const label of ['Sign', 'Match', 'Shape / movement', 'Hold / timing', 'Result']) { const th = document.createElement('th'); th.textContent = label; th.scope = 'col'; head.append(th); }
    const body = table.createTBody();
    for (const r of this.results) {
      const row = body.insertRow();
      for (const value of [r.name, `${r.result.score}%`, `${r.result.movementScore}%`, `${r.result.timingScore}%`, r.result.completed ? 'Completed' : 'Practice again']) row.insertCell().textContent = value;
    }
    list.append(table); this.status('Session complete. Review your signs below, or play again.'); this.updateControls();
  }
  private cancel(message: string) {
    this.phase = 'setup'; this.demo.pause(); this.demo.controls = true; this.overlay('');
    this.el('[data-timer]').textContent = ''; this.progress(0); this.status(message); this.updateControls();
  }
  private overlay(text: string) { this.el('[data-overlay]').textContent = text; this.el('[data-overlay]').hidden = !text; }
  private progress(fraction: number) {
    const bar = this.el('.js-progress'); bar.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
    this.el('.js-progress > div').style.width = `${fraction * 100}%`;
  }
  private draw(frame: SignFrame) {
    this.canvas.width = this.camera.videoWidth; this.canvas.height = this.camera.videoHeight;
    const ctx = this.canvas.getContext('2d'); if (!ctx) return;
    const connections = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [5, 9, 10, 11, 12], [9, 13, 14, 15, 16], [13, 17, 18, 19, 20], [0, 17]];
    for (const hand of [frame.leftHand, frame.rightHand]) {
      ctx.strokeStyle = '#b9fa6d'; ctx.lineWidth = 3;
      for (const chain of connections) {
        ctx.beginPath(); chain.forEach((index, i) => { const p = hand[index]; if (p) { if (i === 0) ctx.moveTo(p.x * this.canvas.width, p.y * this.canvas.height); else ctx.lineTo(p.x * this.canvas.width, p.y * this.canvas.height); } }); ctx.stroke();
      }
    }
    this.el('[data-tracking]').textContent = frame.leftHand.length || frame.rightHand.length ? 'Hands detected ●' : 'Show your hands';
  }
  private tick = (now: number) => {
    if (this.disposed) return;
    const elapsed = now - this.phaseStart;
    if ((this.phase === 'starting' || this.phase === 'watch') && elapsed > 30000) this.cancel('Demonstration loading timed out. Start again to retry.');
    if (this.phase === 'countdown') {
      this.overlay(String(Math.max(1, Math.ceil((C.countdownMs - elapsed) / 1000)))); this.progress(elapsed / C.countdownMs);
      if (elapsed >= C.countdownMs) void this.perform();
    }
    if (this.phase === 'perform') {
      const duration = this.refs[this.round].durationMs;
      this.progress(Math.min(1, (now - this.phaseStart) / duration));
      this.el('[data-timer]').textContent = `${Math.max(0, (duration - (now - this.phaseStart)) / 1000).toFixed(1)}s`;
      if (now - this.phaseStart >= duration) { this.finishRound(); this.el('[data-timer]').textContent = ''; }
    }
    if (this.phase === 'feedback' && now - this.phaseStart >= C.feedbackMs) {
      this.round++;
      if (this.round < this.refs.length) void this.watch(); else this.showResults();
    }
    if (this.stream?.active && this.tracker && !this.busy && this.camera.readyState >= 2 && now - this.lastSample >= 1000 / C.sampleFps) {
      this.lastSample = now;
      try {
        const detect = this.refs[this.round]?.kind === 'image' && this.tracker.detectHands ? this.tracker.detectHands.bind(this.tracker) : this.tracker.detect.bind(this.tracker);
        const frame = detect(this.camera, this.phase === 'perform' ? now - this.phaseStart : 0);
        this.draw(frame);
        if (this.phase === 'perform') {
          this.attempt.push(frame);
          const ref = this.refs[this.round];
          if (ref.kind === 'image') this.el('[data-match]').textContent = `${compareHandImage(ref.frames[0], [frame]).score}%`;
        }
      } catch { this.cancel('Tracking stopped. Enable your camera again to retry.'); this.stream.getTracks().forEach(t => t.stop()); this.stream = undefined; this.updateControls(); }
    }
    this.raf = requestAnimationFrame(this.tick);
  };
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.abort.abort(); cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.demo.pause(); this.demo.removeAttribute('src'); this.demo.load();
    this.stream?.getTracks().forEach(t => { t.onended = null; t.stop(); }); this.camera.srcObject = null;
    this.tracker?.close(); this.refs.forEach(r => URL.revokeObjectURL(r.videoUrl));
  }
}

let active: JustSignGame | undefined;
export function setupJustSign(container: HTMLElement) { active = new JustSignGame(container); }
export function cleanupJustSign() { active?.dispose(); active = undefined; }

