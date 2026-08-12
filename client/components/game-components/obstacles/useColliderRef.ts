import { useRef } from 'react';
import type { Mesh } from 'three';

/**
 * Returns a stable ref-callback for a given key (e.g. a vegetation instance's
 * id), for use as a `<mesh ref={...}>` prop inside a `.map()`.
 *
 * Why this exists: `addObstacleRef` only ever pushes onto `obstacles.current`
 * — it has no way to remove a mesh, because a plain `ref={(ref) =>
 * addObstacleRef(ref)}` callback is a new function every render, so React
 * detaches the *previous* render's callback (which only knew how to add, not
 * remove) instead of calling this one with `null`. The net effect: every
 * tree/rock that ever scrolled into view stayed in `obstacles.current`
 * forever, so collision (which scans the whole array every frame) kept
 * paying for meshes that were unmounted and gone. This is what actually
 * makes obstacle-dense areas like rocks cost more over time.
 *
 * By caching one callback per key and reusing it across renders, React only
 * ever calls it with the mesh's *own* mount (non-null) and unmount (null),
 * so removal actually fires.
 */
export function useColliderRefs(
    addObstacleRef: (ref: Mesh | null) => void,
    removeObstacleRef: (ref: Mesh) => void,
) {
    const callbacks = useRef<Map<string, (ref: Mesh | null) => void>>(new Map());

    return (key: string): ((ref: Mesh | null) => void) => {
        let callback = callbacks.current.get(key);
        if (callback) return callback;

        let mounted: Mesh | null = null;
        callback = (ref: Mesh | null) => {
            if (mounted) removeObstacleRef(mounted);
            mounted = ref;
            if (ref) addObstacleRef(ref);
        };
        callbacks.current.set(key, callback);
        return callback;
    };
}
