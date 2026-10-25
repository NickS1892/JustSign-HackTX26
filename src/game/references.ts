import { GAME_CONFIG as C } from './config';
import { normalizeFrame } from './matcher';
import type { SignReference, SignTracker } from './types';

function waitFor(video: HTMLVideoElement, event: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timeout); video.removeEventListener(event, done); video.removeEventListener('error', error); signal.removeEventListener('abort', error); };
    const done = () => { cleanup(); resolve(); };
    const error = () => { cleanup(); reject(new Error(signal.aborted ? 'Import cancelled.' : 'Could not decode this video. Try an MP4 or WebM.')); };
    const timeout = setTimeout(error, 15000);
    video.addEventListener(event, done, { once: true });
    video.addEventListener('error', error, { once: true });
    signal.addEventListener('abort', error, { once: true });
    if (signal.aborted) error();
  });
}

export async function extractReference(file: File, tracker: SignTracker, signal: AbortSignal, progress: (fraction: number) => void): Promise<SignReference> {
  if (file.type.startsWith('image/')) return extractImage(file, tracker, signal);
  if (!file.type.startsWith('video/') || file.size > C.maxVideoBytes) throw new Error('Choose a video smaller than 100 MB.');
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.preload = 'auto';
  const url = URL.createObjectURL(file);
  try {
    const loaded = waitFor(video, 'loadeddata', signal);
    video.src = url;
    await loaded;
    if (!Number.isFinite(video.duration) || video.duration < C.minVideoSeconds || video.duration > C.maxVideoSeconds) throw new Error('Trim your video to between 0.6 and 15 seconds.');
    const durationMs = video.duration * 1000;
    const frames: SignReference['frames'] = [];
    for (let t = 0; t < durationMs; t += 1000 / C.sampleFps) {
      signal.throwIfAborted();
      if (Math.abs(video.currentTime - t / 1000) > 0.00001) {
        const seeked = waitFor(video, 'seeked', signal);
        video.currentTime = t / 1000;
        await seeked;
      }
      frames.push(tracker.detect(video, t));
      progress(Math.min(1, (t + 1000 / C.sampleFps) / durationMs));
      // Let progress, cancellation and navigation paint between inferences.
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    const usable = frames.filter(f => { const n = normalizeFrame(f); return n && (n.left || n.right); }).length;
    if (usable < C.minFrames || usable / frames.length < C.minCoverage) throw new Error('Not enough clear tracking. Use a front-facing video with face, shoulders and signing hands visible.');
    return { id: crypto.randomUUID(), name: file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' '), videoUrl: url, durationMs, frames };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  } finally {
    video.removeAttribute('src'); video.load();
  }
}

interface StoredReference { reference: Omit<SignReference, 'videoUrl'>; video: Blob }
function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('justsign-references', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('signs', { keyPath: 'reference.id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('signs', mode);
    const request = action(tx.objectStore('signs'));
    tx.oncomplete = () => { db.close(); resolve(request.result); };
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error ?? new Error('Could not save references.')); };
  });
}
export async function saveReference(ref: SignReference, video: Blob): Promise<void> {
  const { videoUrl: _url, ...reference } = ref;
  await transaction('readwrite', store => store.put({ reference, video } satisfies StoredReference));
}
export async function loadReferences(): Promise<SignReference[]> {
  const records = await transaction<StoredReference[]>('readonly', store => store.getAll());
  return records.map(({ reference, video }) => ({ ...reference, videoUrl: URL.createObjectURL(video) }));
}
export async function deleteReference(id: string): Promise<void> {
  await transaction('readwrite', store => store.delete(id));
}


async function extractImage(file: File, tracker: SignTracker, signal: AbortSignal): Promise<SignReference> {
  if (file.size > C.maxVideoBytes) throw new Error('Choose an image smaller than 100 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url;
    await image.decode(); signal.throwIfAborted();
    if (!tracker.detectHands) throw new Error('Image tracking is unavailable.');
    const frame = tracker.detectHands(image, 0);
    if (!frame.leftHand.length || frame.rightHand.length) throw new Error('Use a clear photo showing exactly one complete hand, including the wrist. Crop out other hands or alphabet chart panels.');
    return { id: crypto.randomUUID(), kind: 'image', name: file.name.replace(/\.[^.]+$/, ''), videoUrl: url, durationMs: C.imageRoundMs, frames: [frame] };
  } catch (error) { URL.revokeObjectURL(url); throw error; }
}
