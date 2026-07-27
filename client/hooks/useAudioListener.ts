import { useEffect, RefObject} from "react";
import { AudioListener, Camera } from "three";

// Browsers create AudioContext in a 'suspended' state until a user gesture
// resumes it. Howler auto-unlocks its own context on first interaction, but
// three.js's AudioListener/PositionalAudio nodes (opponent walk/shoot sounds)
// use a separate context that nothing else resumes — without this, those
// sounds silently produce no audio even though playback logic runs fine.
function unlockOnFirstInteraction(listener: AudioListener) {
    const resume = () => {
        listener.context.resume();
    };

    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown"];
    events.forEach((event) => window.addEventListener(event, resume, { once: true }));

    return () => {
        events.forEach((event) => window.removeEventListener(event, resume));
    };
}

export function useAudioListener(camera: Camera | null, listenerRef: RefObject<AudioListener | null>) {
    useEffect(() => {
        const listener = new AudioListener();
        camera?.add(listener);
        listenerRef.current = listener;

        const removeUnlockListeners = unlockOnFirstInteraction(listener);

        return () => {
            removeUnlockListeners();
            camera?.remove(listener);
            listenerRef.current = null;
        }

    }, [camera, listenerRef]);
}