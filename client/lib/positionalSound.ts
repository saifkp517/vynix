import { AudioListener, AudioLoader, PositionalAudio, Vector3 } from 'three';

// 3D (distance-attenuated) sounds — opponent walk/shoot audio heard by the
// local player, loudness falling off with distance to the source.
export const POSITIONAL_SOUND_PATHS = {
  walk: '/sounds/walk.mp3',
  shoot: '/sounds/gunshot.mp3',
} as const;

export type PositionalSoundName = keyof typeof POSITIONAL_SOUND_PATHS;

// Distance (world units) within which a sound plays at full volume.
const REF_DISTANCE = 20;
// Distance beyond which a sound is completely silent. Only the 'linear'
// distance model actually reaches zero at this point — the three.js default
// ('inverse') asymptotically fades but never truly cuts off.
const MAX_DISTANCE: Record<PositionalSoundName, number> = {
  walk: 30,
  shoot: 80,
};

const loader = new AudioLoader();
const bufferCache = new Map<PositionalSoundName, Promise<AudioBuffer>>();

function loadBuffer(name: PositionalSoundName): Promise<AudioBuffer> {
  let promise = bufferCache.get(name);
  if (!promise) {
    promise = new Promise((resolve, reject) => {
      loader.load(
        POSITIONAL_SOUND_PATHS[name],
        (buffer) => {
          console.log(`[audio] loaded buffer for "${name}"`, buffer.duration.toFixed(2) + 's');
          resolve(buffer);
        },
        undefined,
        (err) => {
          console.error(`[audio] FAILED to load "${name}" from ${POSITIONAL_SOUND_PATHS[name]}`, err);
          reject(err);
        },
      );
    });
    bufferCache.set(name, promise);
  }
  return promise;
}

// Creates a PositionalAudio node with the shared falloff config for `name`,
// pre-wired to decay linearly to silence at MAX_DISTANCE. The caller attaches
// it to the emitting Object3D (e.g. an opponent's mesh) and is responsible
// for calling .stop() on cleanup — this module only owns buffer caching.
export function createPositionalSound(
  name: PositionalSoundName,
  listener: AudioListener,
  opts: { loop?: boolean; volume?: number } = {},
): PositionalAudio {
  const sound = new PositionalAudio(listener);
  sound.setDistanceModel('linear');
  sound.setRefDistance(REF_DISTANCE);
  sound.setMaxDistance(MAX_DISTANCE[name]);
  sound.setRolloffFactor(1);
  sound.setLoop(opts.loop ?? false);
  sound.setVolume(opts.volume ?? 1);

  console.log(`[audio] context state for "${name}":`, listener.context.state);

  loadBuffer(name)
    .then((buffer) => {
      sound.setBuffer(buffer);
    })
    .catch(() => {
      // logged in loadBuffer already
    });

  return sound;
}

// Re-plays a one-shot positional sound (e.g. a gunshot), restarting cleanly
// even if it's still finishing from a previous trigger.
const _soundPos = new Vector3();
const _listenerPos = new Vector3();

export function retriggerPositionalSound(sound: PositionalAudio) {
  sound.getWorldPosition(_soundPos);
  sound.listener.getWorldPosition(_listenerPos);
  const distance = _soundPos.distanceTo(_listenerPos);

  console.log(
    '[audio] retrigger — buffer:', !!sound.buffer,
    'contextState:', sound.context.state,
    'isPlaying:', sound.isPlaying,
    'gain:', sound.gain.gain.value,
    'listenerGain:', sound.listener.gain.gain.value,
    'soundPos:', _soundPos.toArray().map((n) => n.toFixed(1)),
    'listenerPos:', _listenerPos.toArray().map((n) => n.toFixed(1)),
    'distance:', distance.toFixed(1),
  );

  if (sound.isPlaying) sound.stop();
  if (sound.buffer) sound.play();
}
