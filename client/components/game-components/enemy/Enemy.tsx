import React from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export default function Enemy({ position }: { position: THREE.Vector3 }) {
  const ref = React.useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (ref.current) {
      ref.current.position.copy(position);
    }
  });

  return (
    <mesh ref={ref}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="red" />
    </mesh>
  );
}
