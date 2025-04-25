import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

export const Opponent = ({
  initialPosition = [0, 0, 0],
  isRemote = false,
  getGroundHeight,
  onPositionChange,
}: {
  initialPosition?: [number, number, number];
  isRemote?: boolean;
  getGroundHeight: (x: number, z: number) => number;
  onPositionChange?: (position: THREE.Vector3) => void;
}) => {

  const meshRef = useRef<THREE.Mesh>(null);

  const targetPosition = useRef(new THREE.Vector3(...initialPosition));
  // This is the current visible position
  const currentPosition = useRef(new THREE.Vector3(...initialPosition));

  const { camera } = useThree();

  useEffect(() => {
    if (meshRef.current) {
      const [x, , z] = initialPosition;
      const y = getGroundHeight(x, z);
      meshRef.current.position.set(x, y, z);
      targetPosition.current.set(...initialPosition);
    }
  }, [initialPosition, getGroundHeight]);

  useEffect(() => {
    if (!isRemote && meshRef.current && onPositionChange) {
      const pos = meshRef.current.position;
      onPositionChange(new THREE.Vector3(pos.x, pos.y, pos.z));
    }
  }, [isRemote, onPositionChange]);

  useFrame((state, delta) => {
    // Smoothly interpolate towards target position
    currentPosition.current.lerp(targetPosition.current, 5 * delta);
  
    if (meshRef.current) {
      meshRef.current.position.copy(currentPosition.current);
      meshRef.current.lookAt(camera.position);
    }
  });
  return (
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshStandardMaterial color="green" />
      </mesh>
  );
};
