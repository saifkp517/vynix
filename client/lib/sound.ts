import { Howl } from 'howler';

export const SOUND_PATHS = {
  gunshot: '/sounds/gunshot.mp3',
  reload: '/sounds/reload.mp3',
  walk: '/sounds/walks.mp3',
  hitWood: '/sounds/hitwood.mp3',
  breeze: '/sounds/breeze.mp3',
} as const;

export type SoundName = keyof typeof SOUND_PATHS;

const cache = new Map<SoundName, Howl>();

function getHowl(name: SoundName, loop = false): Howl {
  let howl = cache.get(name);
  if (!howl) {
    howl = new Howl({ src: [SOUND_PATHS[name]], loop });
    cache.set(name, howl);
  }
  return howl;
}

export function playSound(name: SoundName, opts: { volume?: number; rate?: number } = {}) {
  const howl = getHowl(name);
  const id = howl.play();
  if (opts.volume !== undefined) howl.volume(opts.volume, id);
  if (opts.rate !== undefined) howl.rate(opts.rate, id);
  return id;
}

// For sounds that loop and are started/stopped/tuned over time (walk, ambience)
// rather than fired once, callers need the Howl instance itself.
export function getLoopingSound(name: SoundName): Howl {
  return getHowl(name, true);
}

// Stops every cached local sound (one-shots and loops alike) — call this on
// game-over or any other hard-reset so nothing keeps playing into a state
// that no longer owns it (e.g. after routing away from the game).
export function stopAllSounds() {
  cache.forEach((howl) => howl.stop());
}
