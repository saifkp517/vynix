import { RefObject, useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const GREEN = new THREE.Color("green");
const RED = new THREE.Color("red");
const MAX_SPEED = 18;

export const Opponent = ({
  positionRef,
  velocityRef,
  smoothnessRef,
  isRemote = false,
  getGroundHeight,
  addObstacleRef,
  isHit = false,
}: {
  positionRef: () => THREE.Vector3 | null;
  velocityRef: () => THREE.Vector3 | null;
  smoothnessRef: RefObject<number>;
  isRemote?: boolean;
  getGroundHeight: (x: number, z: number) => number;
  addObstacleRef?: (ref: THREE.Mesh | null) => void;
  isHit?: boolean;
}) => {
  const group = useRef<THREE.Group>(null);
  const sphereRef = useRef<THREE.Mesh>(null);
  const targetPosition = useRef<THREE.Vector3>(new THREE.Vector3());
  const currentPosition = useRef<THREE.Vector3>(new THREE.Vector3());
  const [color, setColor] = useState(GREEN.clone());

  useEffect(() => {
    if (addObstacleRef) {
      addObstacleRef(sphereRef.current);
    }
    return () => {
      if (addObstacleRef) {
        addObstacleRef(null);
      }
    };
  }, [addObstacleRef]);

  useEffect(() => {
    const pos = positionRef();
    if (pos) {
      targetPosition.current.copy(pos);
      currentPosition.current.copy(pos);
    }
  }, [positionRef]);

  useFrame((_, delta) => {
    const pos = positionRef();
    const vel = velocityRef();

    if (pos) {
      targetPosition.current.copy(pos);
    }

    currentPosition.current.lerp(targetPosition.current, delta * (smoothnessRef.current ?? 10));

    if (group.current) {
      group.current.position.copy(currentPosition.current);

      if (vel && vel.lengthSq() > 0.001) {
        const angle = Math.atan2(vel.x, vel.z);
        group.current.rotation.y = angle;
      }
    }

    // Color interpolation based on speed
    let speed = vel ? vel.length() : 0;
    speed = Math.min(speed, MAX_SPEED);
    const t = speed / MAX_SPEED;
    const lerpedColor = GREEN.clone().lerp(RED, t);
    setColor(lerpedColor);
  });

  return (
    <group ref={group} position={[0, 0, 0]} dispose={null}>
      <mesh ref={sphereRef} position={[0, -1.5, 0]}>
        <sphereGeometry args={[0.5]} />
        <meshStandardMaterial color={color.getStyle()} />
      </mesh>
    </group>
  );
};
