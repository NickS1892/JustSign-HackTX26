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
      { key: 'thumbInIndexGap', max: 0.45, weight: 1.3, coach: 'Keep your thumb beside the fist, not between the fingers' },
      { key: 'thumbInMiddleGap', max: 0.35, weight: 1.3, coach: 'Keep your thumb outside the fist, not tucked under it' },
      { key: 'thumbInRingGap', max: 0.35, weight: 1.3, coach: 'Keep your thumb outside the fist, not tucked under it' },
      { key: 'thumbIndexPinch', max: 0.62, weight: 1.3, coach: 'Hold your thumb clear of your fingertips' },
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
      { key: 'pointingUp', min: 0.55, weight: 1.3, coach: 'Point your index finger up, not sideways' },
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
      { key: 'pointingUp', min: 0.5, weight: 1.2, coach: 'Point the L up, like a capital letter' },
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
      { key: 'indexExtension', min: 0.36, max: 0.72, weight: 1.5, softness: 0.14, coach: 'Keep the O round and open, not curled tight like an E' },
      { key: 'middleExtension', min: 0.34, max: 0.72, coach: 'Keep your middle finger curved' },
      { key: 'ringExtension', min: 0.34, max: 0.72, coach: 'Keep your ring finger curved' },
      { key: 'pinkyExtension', min: 0.32, max: 0.72, coach: 'Keep your pinky curved' },
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
      { key: 'thumbInIndexGap', max: 0.45, weight: 1.4, coach: 'Keep your thumb off the gap between the fingers' },
      { key: 'pointingUp', min: 0.5, weight: 1.2, coach: 'Point the V up' },
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
      { key: 'pointingUp', min: 0.5, weight: 1.2, coach: 'Point the three fingers up' },
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
  {
    id: 'asl-e',
    letter: 'E',
    label: 'Letter E',
    hint: 'Fingers curled down onto a flat thumb, the fingertips resting on the thumbnail.',
    expects: [
      { key: 'indexExtension', min: 0.1, max: 0.3, weight: 1.5, softness: 0.14, coach: 'Curl your fingers right down onto the thumb: rounder is an O' },
      { key: 'middleExtension', min: 0.1, max: 0.3, coach: 'Curl your middle finger down' },
      { key: 'ringExtension', min: 0.1, max: 0.3, coach: 'Curl your ring finger down' },
      { key: 'pinkyExtension', min: 0.1, max: 0.32, coach: 'Curl your pinky down' },
      { key: 'thumbIndexPinch', min: 0.5, weight: 1.6, coach: 'Rest your fingertips on your thumb' },
      { key: 'thumbSplay', max: 0.5, weight: 1.4, coach: 'Tuck your thumb in flat against the palm' },
      { key: 'thumbInIndexGap', max: 0.5, coach: 'Keep your thumb under the fingertips, not between them' },
    ],
  },
  {
    id: 'asl-f',
    letter: 'F',
    label: 'Letter F',
    hint: 'Thumb and index finger make a circle; middle, ring and pinky stand straight up.',
    expects: [
      { key: 'thumbIndexPinch', min: 0.62, weight: 1.6, coach: 'Touch your thumb and index fingertips into a circle' },
      { key: 'indexExtension', max: 0.62, coach: 'Curl your index finger round onto the thumb' },
      { key: 'middleExtension', min: 0.76, weight: 1.3, coach: 'Stand your middle finger up' },
      { key: 'ringExtension', min: 0.74, coach: 'Stand your ring finger up' },
      { key: 'pinkyExtension', min: 0.72, coach: 'Stand your pinky up' },
    ],
  },
  {
    id: 'asl-g',
    letter: 'G',
    label: 'Letter G',
    hint: 'Hand on its side, index finger and thumb held out flat and parallel, pointing sideways.',
    expects: [
      { key: 'indexExtension', min: 0.74, weight: 1.3, coach: 'Hold your index finger straight out' },
      { key: 'thumbExtension', min: 0.6, coach: 'Hold your thumb straight out too' },
      { key: 'thumbSplay', max: 0.5, weight: 1.3, coach: 'Keep your thumb parallel to your index finger, not open' },
      { key: 'middleExtension', max: 0.35, coach: 'Close your middle finger' },
      { key: 'ringExtension', max: 0.35, coach: 'Close your ring finger' },
      { key: 'pinkyExtension', max: 0.4, coach: 'Close your pinky' },
      { key: 'pointingUp', min: 0.3, max: 0.68, weight: 1.6, softness: 0.14, coach: 'Turn your hand on its side so the finger points sideways' },
    ],
  },
  {
    id: 'asl-h',
    letter: 'H',
    label: 'Letter H',
    hint: 'Hand on its side, index and middle fingers out together, pointing sideways.',
    expects: [
      { key: 'indexExtension', min: 0.76, coach: 'Hold your index finger straight out' },
      { key: 'middleExtension', min: 0.76, coach: 'Hold your middle finger out alongside it' },
      { key: 'indexMiddleSpread', max: 0.3, weight: 1.3, coach: 'Keep the two fingers together, not in a V' },
      { key: 'ringExtension', max: 0.35, coach: 'Close your ring finger' },
      { key: 'pinkyExtension', max: 0.4, coach: 'Close your pinky' },
      { key: 'pointingUp', min: 0.3, max: 0.68, weight: 1.6, softness: 0.14, coach: 'Turn your hand on its side so the fingers point sideways' },
    ],
  },
  {
    id: 'asl-k',
    letter: 'K',
    label: 'Letter K',
    hint: 'Index and middle up in a V, thumb pushed forward into the gap between them.',
    expects: [
      { key: 'indexExtension', min: 0.76, coach: 'Stand your index finger up' },
      { key: 'middleExtension', min: 0.7, coach: 'Stand your middle finger up' },
      { key: 'indexMiddleSpread', min: 0.3, coach: 'Open a gap between index and middle' },
      { key: 'thumbInIndexGap', min: 0.55, weight: 1.8, coach: 'Push your thumb into the gap between index and middle' },
      { key: 'ringExtension', max: 0.4, coach: 'Close your ring finger' },
      { key: 'pinkyExtension', max: 0.45, coach: 'Close your pinky' },
      { key: 'pointingUp', min: 0.62, weight: 1.3, coach: 'Point the fingers up' },
    ],
  },
  {
    id: 'asl-m',
    letter: 'M',
    label: 'Letter M',
    hint: 'Thumb tucked under three fingers: index, middle and ring all fold over it.',
    expects: [
      { key: 'indexExtension', max: 0.3, coach: 'Fold your index finger down over the thumb' },
      { key: 'middleExtension', max: 0.3, coach: 'Fold your middle finger down over the thumb' },
      { key: 'ringExtension', max: 0.32, coach: 'Fold your ring finger down over the thumb' },
      { key: 'thumbInRingGap', min: 0.5, weight: 2.4, coach: 'Tuck your thumb under three fingers, tip between ring and pinky' },
      { key: 'thumbInIndexGap', max: 0.5, weight: 1.4, coach: 'The thumb sits past the middle finger, not under the index' },
      { key: 'thumbSplay', max: 0.6, coach: 'Lay the thumb across under the fingers' },
    ],
  },
  {
    id: 'asl-n',
    letter: 'N',
    label: 'Letter N',
    hint: 'Thumb tucked under two fingers: index and middle fold over it.',
    expects: [
      { key: 'indexExtension', max: 0.3, coach: 'Fold your index finger down over the thumb' },
      { key: 'middleExtension', max: 0.3, coach: 'Fold your middle finger down over the thumb' },
      { key: 'ringExtension', max: 0.32, coach: 'Keep your ring finger down' },
      { key: 'thumbInMiddleGap', min: 0.5, weight: 2.4, coach: 'Tuck your thumb under two fingers, tip between middle and ring' },
      { key: 'thumbInRingGap', max: 0.45, weight: 1.4, coach: 'Two fingers over the thumb, not three' },
      { key: 'thumbInIndexGap', max: 0.45, weight: 1.2, coach: 'The thumb reaches past the index finger' },
    ],
  },
  {
    id: 'asl-p',
    letter: 'P',
    label: 'Letter P',
    hint: 'The K handshape turned over, so the middle finger points down at the floor.',
    expects: [
      { key: 'indexExtension', min: 0.72, coach: 'Hold your index finger out' },
      { key: 'middleExtension', min: 0.66, coach: 'Hold your middle finger out' },
      { key: 'indexMiddleSpread', min: 0.28, coach: 'Open a gap between index and middle' },
      { key: 'thumbInIndexGap', min: 0.5, weight: 1.6, coach: 'Push your thumb into the gap between index and middle' },
      { key: 'ringExtension', max: 0.42, coach: 'Close your ring finger' },
      { key: 'pinkyExtension', max: 0.46, coach: 'Close your pinky' },
      { key: 'pointingUp', max: 0.34, weight: 1.8, softness: 0.14, coach: 'Turn the hand over so the fingers point down' },
    ],
  },
  {
    id: 'asl-q',
    letter: 'Q',
    label: 'Letter Q',
    hint: 'The G handshape turned over: thumb and index finger point down at the floor.',
    expects: [
      { key: 'indexExtension', min: 0.7, coach: 'Hold your index finger out straight' },
      { key: 'thumbExtension', min: 0.55, coach: 'Hold your thumb out alongside it' },
      { key: 'thumbSplay', max: 0.55, coach: 'Keep your thumb parallel to your index finger' },
      { key: 'middleExtension', max: 0.38, coach: 'Close your middle finger' },
      { key: 'ringExtension', max: 0.38, coach: 'Close your ring finger' },
      { key: 'pinkyExtension', max: 0.42, coach: 'Close your pinky' },
      { key: 'pointingUp', max: 0.3, weight: 1.8, softness: 0.14, coach: 'Turn your hand over so it points down' },
    ],
  },
  {
    id: 'asl-r',
    letter: 'R',
    label: 'Letter R',
    hint: 'Index and middle fingers crossed over each other, standing up.',
    expects: [
      { key: 'indexExtension', min: 0.66, coach: 'Stand your index finger up' },
      { key: 'middleExtension', min: 0.66, coach: 'Stand your middle finger up' },
      { key: 'indexMiddleConverge', min: 0.6, weight: 2, coach: 'Cross your middle finger over your index finger' },
      { key: 'ringExtension', max: 0.38, coach: 'Close your ring finger' },
      { key: 'pinkyExtension', max: 0.42, coach: 'Close your pinky' },
      { key: 'pointingUp', min: 0.58, coach: 'Point the crossed fingers up' },
    ],
  },
  {
    id: 'asl-s',
    letter: 'S',
    label: 'Letter S',
    hint: 'A fist with the thumb folded across the front of your fingers.',
    expects: [
      { key: 'indexExtension', max: 0.24, softness: 0.12, coach: 'Close your index finger into the fist' },
      { key: 'middleExtension', max: 0.24, softness: 0.12, coach: 'Close your middle finger into the fist' },
      { key: 'ringExtension', max: 0.24, softness: 0.12, coach: 'Close your ring finger into the fist' },
      { key: 'pinkyExtension', max: 0.26, softness: 0.12, coach: 'Close your pinky into the fist' },
      { key: 'thumbSplay', min: 0.55, weight: 2.2, coach: 'Lay your thumb across the front of your fingers' },
      { key: 'thumbInIndexGap', max: 0.55, weight: 1.2, coach: 'Across the front of the fist, not poked between the fingers' },
    ],
  },
  {
    id: 'asl-t',
    letter: 'T',
    label: 'Letter T',
    hint: 'Fist with the thumb poking up between the index and middle fingers.',
    expects: [
      { key: 'indexExtension', max: 0.32, coach: 'Fold your index finger down over the thumb' },
      { key: 'middleExtension', max: 0.3, coach: 'Keep your middle finger down' },
      { key: 'ringExtension', max: 0.3, coach: 'Keep your ring finger down' },
      { key: 'pinkyExtension', max: 0.32, coach: 'Keep your pinky down' },
      { key: 'thumbInIndexGap', min: 0.5, weight: 2.4, coach: 'Poke your thumb up between index and middle' },
      { key: 'thumbSplay', max: 0.45, weight: 1.6, coach: 'Point the thumb up between the fingers, not across them' },
      { key: 'thumbInRingGap', max: 0.4, coach: 'Keep the thumb at the index side of the fist' },
    ],
  },
  {
    id: 'asl-u',
    letter: 'U',
    label: 'Letter U',
    hint: 'Index and middle fingers straight up and held together, side by side.',
    expects: [
      { key: 'indexExtension', min: 0.8, coach: 'Straighten your index finger' },
      { key: 'middleExtension', min: 0.8, coach: 'Straighten your middle finger' },
      { key: 'indexMiddleSpread', max: 0.22, weight: 1.8, coach: 'Close the gap: U is together, V is apart' },
      { key: 'thumbInIndexGap', max: 0.45, weight: 1.4, coach: 'Keep your thumb off the gap between the fingers' },
      { key: 'indexMiddleConverge', max: 0.45, weight: 1.4, coach: 'Keep the fingers side by side, not crossed' },
      { key: 'ringExtension', max: 0.35, coach: 'Close your ring finger' },
      { key: 'pinkyExtension', max: 0.4, coach: 'Close your pinky' },
      { key: 'pointingUp', min: 0.6, weight: 1.2, coach: 'Point the fingers up' },
    ],
  },
  {
    id: 'asl-x',
    letter: 'X',
    label: 'Letter X',
    hint: 'Index finger up but hooked over like a crook; everything else closed.',
    expects: [
      { key: 'indexExtension', min: 0.34, max: 0.66, weight: 1.8, softness: 0.14, coach: 'Hook your index finger: bent, not straight and not closed' },
      { key: 'middleExtension', max: 0.3, coach: 'Close your middle finger' },
      { key: 'ringExtension', max: 0.3, coach: 'Close your ring finger' },
      { key: 'pinkyExtension', max: 0.34, coach: 'Close your pinky' },
      { key: 'thumbIndexPinch', max: 0.5, weight: 1.3, coach: 'Keep the hooked finger clear of your thumb' },
      { key: 'thumbExtension', max: 0.72, coach: 'Rest your thumb against the fist' },
    ],
  },
  {
    id: 'asl-j',
    letter: 'J',
    label: 'Letter J',
    hint: 'Make an I with your pinky, then draw a J in the air: down, then hook sideways.',
    expects: [
      { key: 'pinkyExtension', min: 0.76, weight: 1.5, coach: 'Point your pinky out' },
      { key: 'indexExtension', max: 0.38, coach: 'Close your index finger' },
      { key: 'middleExtension', max: 0.38, coach: 'Close your middle finger' },
      { key: 'ringExtension', max: 0.38, coach: 'Close your ring finger' },
    ],
    motion: {
      tip: 'pinky',
      legs: [
        { direction: 'down', travel: 0.5 },
        { direction: 'sideways', travel: 0.4 },
      ],
      windowMs: 3500,
    },
  },
  {
    id: 'asl-z',
    letter: 'Z',
    label: 'Letter Z',
    hint: 'Point your index finger and draw a Z in the air: across, down, across again.',
    expects: [
      { key: 'indexExtension', min: 0.78, weight: 1.5, coach: 'Point your index finger' },
      { key: 'middleExtension', max: 0.4, coach: 'Close your middle finger' },
      { key: 'ringExtension', max: 0.4, coach: 'Close your ring finger' },
      { key: 'pinkyExtension', max: 0.44, coach: 'Close your pinky' },
    ],
    motion: {
      tip: 'index',
      legs: [
        { direction: 'sideways', travel: 0.45 },
        { direction: 'down', travel: 0.4 },
        { direction: 'sideways', travel: 0.45 },
      ],
      windowMs: 4500,
    },
  },
  {
    id: 'ut-horns',
    letter: '🤘',
    label: 'Hook ’em Horns',
    hint: 'Index finger and pinky up, middle and ring folded down under your thumb. Hook ’em.',
    expects: [
      { key: 'indexExtension', min: 0.78, weight: 1.4, coach: 'Point your index finger up' },
      { key: 'pinkyExtension', min: 0.76, weight: 1.4, coach: 'Point your pinky up' },
      { key: 'middleExtension', max: 0.32, weight: 1.3, coach: 'Fold your middle finger down' },
      { key: 'ringExtension', max: 0.32, weight: 1.3, coach: 'Fold your ring finger down' },
      { key: 'thumbSplay', max: 0.55, coach: 'Hold the folded fingers down with your thumb' },
      { key: 'pointingUp', min: 0.55, coach: 'Point the horns up' },
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
