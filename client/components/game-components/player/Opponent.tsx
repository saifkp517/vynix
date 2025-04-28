import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

export const Opponent = ({
  initialPosition = new THREE.Vector3(0, 0, 0),
  isRemote = false,
  getGroundHeight,
  onPositionChange,
  addObstacleRef,
  isHit = false
}: {
  initialPosition?: THREE.Vector3;
  isRemote?: boolean;
  getGroundHeight: (x: number, z: number) => number;
  onPositionChange?: (position: THREE.Vector3) => void;
  addObstacleRef?: (ref: THREE.Mesh | null) => void;
  isHit?: boolean;
}) => {

  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  const targetPosition = useRef(new THREE.Vector3(initialPosition.x, initialPosition.y, initialPosition.z));
  // This is the current visible position
  const currentPosition = useRef(new THREE.Vector3(initialPosition.x, initialPosition.y, initialPosition.z));

  const { camera } = useThree();

  useEffect(() => {
    if (meshRef.current) {
      const x = initialPosition.x;
      const z = initialPosition.z;
      const y = getGroundHeight(x, z);
      meshRef.current.position.set(x, y, z);
      targetPosition.current.set(initialPosition.x, initialPosition.y, initialPosition.z);

      if (addObstacleRef) {
        addObstacleRef(meshRef.current);
      }
    }
  }, [initialPosition, getGroundHeight, addObstacleRef]);

  useEffect(() => {
    if (!isRemote && meshRef.current && onPositionChange) {
      const pos = meshRef.current.position;
      onPositionChange(new THREE.Vector3(pos.x, pos.y, pos.z));
    }
  }, [isRemote, onPositionChange]);

  useEffect(() => {
    if (materialRef.current) {
      if (isHit) {
        materialRef.current.color.set('red'); // when hit
        // Optional: reset back after 0.5 seconds
        setTimeout(() => {
          materialRef.current?.color.set('green');
        }, 500);
      }
    }
  }, [isHit]);

  useFrame((state, delta) => {
    // Smoothly interpolate towards target position
    currentPosition.current.lerp(targetPosition.current, 0.1);

    if (meshRef.current) {
      meshRef.current.position.copy(currentPosition.current);
      meshRef.current.lookAt(camera.position);
    }
  });
  return (
    <mesh ref={meshRef} position={[0, 1, 0]}>
      <sphereGeometry args={[0.5, 26, 26]} />
      <meshStandardMaterial ref={materialRef} color="green" />
    </mesh>

  );
};
