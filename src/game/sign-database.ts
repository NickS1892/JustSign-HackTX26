/**
 * The sign database.
 *
 * Every sign the game can ask for lives in the private `TABLE` below and is
 * reachable only through the query functions at the bottom of this file. The
 * interface deliberately has no way to list, add, edit or remove a row, so the
 * player never sees or curates a playlist: they are handed one sign at a time
 * and the vocabulary stays an implementation detail.
 *
 * A row describes a handshape as bands over the measurements in
 * `recognizer.ts`. Scope is static ASL fingerspelling (J and Z need motion and
 * are therefore absent). The starting set is the ten letters that are easiest
 * to tell apart; widen it only alongside accuracy testing with real signers.
 */
import type { SignDefinition } from './types';

const TABLE: readonly SignDefinition[] = Object.freeze([
  {
    id: 'asl-a',
    letter: 'A',
    label: 'Letter A',
    hint: 'Closed fist, thumb straight up along the side of your index finger.',
    expects: [
      // A is a tight fist, so the fingers have to be properly closed: a loose
      // half-curl reads as C or O and should not be accepted here.
      { key: 'indexExtension', max: 0.24, softness: 0.12, coach: 'Curl your index finger into the fist' },
      { key: 'middleExtension', max: 0.24, softness: 0.12, coach: 'Curl your middle finger into the fist' },
      { key: 'ringExtension', max: 0.24, softness: 0.12, coach: 'Curl your ring finger into the fist' },
      { key: 'pinkyExtension', max: 0.26, softness: 0.12, coach: 'Curl your pinky into the fist' },
      { key: 'thumbExtension', min: 0.45, weight: 1.4, coach: 'Straighten your thumb' },
      { key: 'thumbSplay', max: 0.5, weight: 1.3, coach: 'Keep your thumb up along the side, not out to the side' },
    ],
  },
  {
    id: 'asl-b',
    letter: 'B',
    label: 'Letter B',
    hint: 'Four fingers straight up and touching, thumb folded flat across the palm.',
    expects: [
      { key: 'indexExtension', min: 0.78, coach: 'Straighten your index finger' },
      { key: 'middleExtension', min: 0.78, coach: 'Straighten your middle finger' },
      { key: 'ringExtension', min: 0.78, coach: 'Straighten your ring finger' },
      { key: 'pinkyExtension', min: 0.78, coach: 'Straighten your pinky' },
      { key: 'indexMiddleSpread', max: 0.3, coach: 'Close the gap between index and middle' },
      { key: 'middleRingSpread', max: 0.3, coach: 'Close the gap between middle and ring' },
      { key: 'ringPinkySpread', max: 0.35, coach: 'Close the gap between ring and pinky' },
      // The tucked thumb is what separates B from an open, spread hand.
      { key: 'thumbAcrossPalm', min: 0.4, weight: 1.4, softness: 0.14, coach: 'Fold your thumb in flat across your palm' },
    ],
  },
  {
    id: 'asl-c',
    letter: 'C',
    label: 'Letter C',
    hint: 'Curve your whole hand into a C, with a clear gap between thumb and fingertips.',
    expects: [
      { key: 'indexExtension', min: 0.34, max: 0.74, coach: 'Curve your index finger, do not straighten or close it' },
      { key: 'middleExtension', min: 0.34, max: 0.74, coach: 'Curve your middle finger' },
      { key: 'ringExtension', min: 0.3, max: 0.74, coach: 'Curve your ring finger' },
      { key: 'pinkyExtension', min: 0.26, max: 0.74, coach: 'Curve your pinky' },
      { key: 'thumbExtension', min: 0.4, coach: 'Keep your thumb curved, not folded in' },
      { key: 'thumbIndexPinch', min: 0.18, max: 0.55, weight: 1.5, coach: 'Leave an open gap between thumb and fingertips' },
      { key: 'thumbAcrossPalm', max: 0.5, weight: 0.8, coach: 'Hold your thumb out in front, not across the palm' },
      { key: 'indexMiddleSpread', max: 0.4, coach: 'Keep your fingers together in the curve' },
    ],
  },
  {
    id: 'asl-d',
    letter: 'D',
    label: 'Letter D',
    hint: 'Index finger straight up; middle, ring and pinky curl down to meet your thumb.',
    expects: [
      { key: 'indexExtension', min: 0.8, weight: 1.4, coach: 'Point your index finger straight up' },
      { key: 'middleExtension', max: 0.45, coach: 'Curl your middle finger down to your thumb' },
      { key: 'ringExtension', max: 0.45, coach: 'Curl your ring finger down' },
      { key: 'pinkyExtension', max: 0.5, coach: 'Curl your pinky down' },
      { key: 'thumbMiddlePinch', min: 0.5, weight: 1.4, coach: 'Touch your thumb to your middle fingertip' },
      { key: 'thumbExtension', min: 0.35, coach: 'Keep your thumb forward, not tucked away' },
    ],
  },
  {
    id: 'asl-i',
    letter: 'I',
    label: 'Letter I',
    hint: 'Pinky straight up, everything else closed into a fist.',
    expects: [
      { key: 'pinkyExtension', min: 0.8, weight: 1.5, coach: 'Point your pinky straight up' },
      { key: 'indexExtension', max: 0.35, coach: 'Close your index finger' },
      { key: 'middleExtension', max: 0.35, coach: 'Close your middle finger' },
      { key: 'ringExtension', max: 0.35, coach: 'Close your ring finger' },
      { key: 'thumbAcrossPalm', min: 0.3, weight: 0.6, coach: 'Rest your thumb across your closed fingers' },
    ],
  },
  {
    id: 'asl-l',
    letter: 'L',
    label: 'Letter L',
    hint: 'Index finger up, thumb out sideways: a right angle, like a capital L.',
    expects: [
      { key: 'indexExtension', min: 0.8, weight: 1.3, coach: 'Point your index finger straight up' },
      { key: 'thumbExtension', min: 0.68, weight: 1.3, coach: 'Straighten your thumb' },
      { key: 'thumbSplay', min: 0.6, weight: 1.5, coach: 'Open your thumb out to a right angle' },
      { key: 'middleExtension', max: 0.35, coach: 'Close your middle finger' },
      { key: 'ringExtension', max: 0.35, coach: 'Close your ring finger' },
      { key: 'pinkyExtension', max: 0.4, coach: 'Close your pinky' },
    ],
  },
  {
    id: 'asl-o',
    letter: 'O',
    label: 'Letter O',
    hint: 'Bring every fingertip onto your thumb to make a round O.',
    expects: [
      { key: 'thumbIndexPinch', min: 0.62, weight: 1.6, coach: 'Touch your index fingertip to your thumb' },
      { key: 'fingertipGather', min: 0.45, weight: 1.6, coach: 'Bring all four fingertips together onto the thumb' },
      { key: 'indexExtension', min: 0.32, max: 0.72, weight: 1.2, coach: 'Keep the O round, not clenched into a fist' },
      { key: 'middleExtension', min: 0.3, max: 0.72, coach: 'Keep your middle finger curved' },
      { key: 'ringExtension', min: 0.3, max: 0.72, coach: 'Keep your ring finger curved' },
      { key: 'pinkyExtension', min: 0.28, max: 0.72, coach: 'Keep your pinky curved' },
    ],
  },
  {
    id: 'asl-v',
    letter: 'V',
    label: 'Letter V',
    hint: 'Index and middle fingers up in a wide V; ring and pinky held down by the thumb.',
    expects: [
      { key: 'indexExtension', min: 0.8, coach: 'Straighten your index finger' },
      { key: 'middleExtension', min: 0.8, coach: 'Straighten your middle finger' },
      { key: 'indexMiddleSpread', min: 0.42, weight: 1.6, coach: 'Open the V wider between index and middle' },
      { key: 'ringExtension', max: 0.35, coach: 'Close your ring finger' },
      { key: 'pinkyExtension', max: 0.4, coach: 'Close your pinky' },
      { key: 'thumbAcrossPalm', min: 0.3, weight: 0.6, coach: 'Hold the closed fingers down with your thumb' },
    ],
  },
  {
    id: 'asl-w',
    letter: 'W',
    label: 'Letter W',
    hint: 'Index, middle and ring fingers up and spread; thumb holds the pinky down.',
    expects: [
      { key: 'indexExtension', min: 0.76, coach: 'Straighten your index finger' },
      { key: 'middleExtension', min: 0.76, coach: 'Straighten your middle finger' },
      { key: 'ringExtension', min: 0.76, weight: 1.3, coach: 'Straighten your ring finger too' },
      { key: 'pinkyExtension', max: 0.42, weight: 1.3, coach: 'Hold your pinky down with your thumb' },
      { key: 'indexMiddleSpread', min: 0.28, coach: 'Spread index and middle apart' },
      { key: 'middleRingSpread', min: 0.28, coach: 'Spread middle and ring apart' },
    ],
  },
  {
    id: 'asl-y',
    letter: 'Y',
    label: 'Letter Y',
    hint: 'Thumb and pinky out, the three middle fingers folded down.',
    expects: [
      { key: 'thumbExtension', min: 0.65, weight: 1.3, coach: 'Stretch your thumb out' },
      { key: 'pinkyExtension', min: 0.76, weight: 1.3, coach: 'Stretch your pinky out' },
      { key: 'thumbSplay', min: 0.52, weight: 1.3, coach: 'Open your thumb away from your palm' },
      { key: 'indexExtension', max: 0.35, coach: 'Fold your index finger down' },
      { key: 'middleExtension', max: 0.35, coach: 'Fold your middle finger down' },
      { key: 'ringExtension', max: 0.35, coach: 'Fold your ring finger down' },
    ],
  },
]);

const BY_ID = new Map(TABLE.map(sign => [sign.id, sign]));

/** Every row, for the recogniser to score a hand against. Not for display. */
export function allSigns(): readonly SignDefinition[] {
  return TABLE;
}

export function findSign(id: string): SignDefinition | undefined {
  return BY_ID.get(id);
}

/**
 * The only way the game gets signs to play: a shuffled draw of `count` rows.
 * Rows repeat only once the whole table has been used, so a short session never
 * asks for the same letter twice.
 */
export function drawSigns(count: number, random: () => number = Math.random): SignDefinition[] {
  const drawn: SignDefinition[] = [];
  while (drawn.length < count) {
    const pool = [...TABLE];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    drawn.push(...pool.slice(0, count - drawn.length));
  }
  return drawn;
}
