import { useEffect, RefObject} from "react";
import { AudioListener, Camera } from "three";

export function useAudioListener(camera: Camera | null, listenerRef: RefObject<AudioListener | null>) {
    useEffect(() => {
        const listener = new AudioListener();
        camera?.add(listener);
        listenerRef.current = listener;

        return () => {
            camera?.remove(listener);
            listenerRef.current = null;
        }

    }, [camera, listenerRef]);
}