declare module 'three/examples/jsm/utils/BufferGeometryUtils' {
    import * as THREE from 'three';
    export function mergeBufferGeometries(
      geometries: THREE.BufferGeometry[],
      useGroups?: boolean
    ): THREE.BufferGeometry;
  }
  