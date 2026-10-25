import type { GameMode, HighScore } from './types';

/**
 * Best scores, kept in this browser.
 *
 * Storage can be unavailable or throw — a private window, blocked site data —
 * so every read and write is guarded and the game simply plays without a
 * saved best rather than failing.
 */
const KEY = 'justsign-high-scores-v1';

type Table = Partial<Record<GameMode, HighScore>>;

function read(): Table {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const table: Table = {};
    for (const mode of ['practice', 'sprint'] as const) {
      const entry = (parsed as Table)[mode];
      // Anything hand-edited or left by an older version is ignored.
      if (entry && Number.isFinite(entry.score) && entry.score >= 0) {
        table[mode] = { score: Math.round(entry.score), setOn: String(entry.setOn ?? '') };
      }
    }
    return table;
  } catch {
    return {};
  }
}

export function highScore(mode: GameMode): HighScore | undefined {
  return read()[mode];
}

/** Stores `score` if it beats the stored best, and says whether it did. */
export function recordScore(mode: GameMode, score: number): { best: number; isNew: boolean } {
  const table = read();
  const previous = table[mode]?.score ?? 0;
  if (score <= previous) return { best: previous, isNew: false };
  table[mode] = { score, setOn: new Date().toISOString().slice(0, 10) };
  try {
    localStorage.setItem(KEY, JSON.stringify(table));
  } catch {
    // An unsaved best still counts for this session.
  }
  return { best: score, isNew: true };
}

export function clearScores(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to do: there was nothing readable to clear.
  }
}
