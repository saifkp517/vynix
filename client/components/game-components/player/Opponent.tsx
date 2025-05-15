import { RefObject, useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { FBXLoader } from 'three-stdlib';
import * as THREE from "three";

export const Opponent = ({
  positionRef,
  velocityRef,
  smoothnessRef,
  isRemote = false,
  getGroundHeight,
  addObstacleRef,
  isHit = false
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
  
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  const targetPosition = useRef<THREE.Vector3>(new THREE.Vector3());
  const currentPosition = useRef<THREE.Vector3>(new THREE.Vector3());
  const [animationState, setAnimationState] = useState<'idle' | 'walking'>('idle');

  // References for animating body parts
  const headRef = useRef<THREE.Mesh>(null);
  const torsoRef = useRef<THREE.Mesh>(null);
  const legLeftRef = useRef<THREE.Group>(null);
  const legRightRef = useRef<THREE.Group>(null);
  const armLeftRef = useRef<THREE.Group>(null);
  const armRightRef = useRef<THREE.Group>(null);
  const gunRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (addObstacleRef) {
      addObstacleRef(torsoRef.current);
      addObstacleRef(headRef.current)
      
    }

    // Cleanup function to remove the reference when the component unmounts
    return () => {
      if (addObstacleRef) {
        addObstacleRef(null);
      }
    };
  }, [addObstacleRef, torsoRef]);

  useEffect(() => {
    // Initialize position from the first value
    const pos = positionRef(); // This returns the latest ref'd position

    if (pos) {
      targetPosition.current.copy(pos);
      currentPosition.current.copy(pos);
    }
  }, [positionRef]);

  // This is the current visible position
  useFrame((_, delta) => {
    const pos = positionRef(); // get fresh position every frame
    const vel = velocityRef(); // get velocity vector every frame

    if (pos) {
      targetPosition.current.copy(pos);
    }
      console.log(smoothnessRef.current)
    // Smooth interpolation of position
    currentPosition.current.lerp(targetPosition.current, delta * smoothnessRef.current);

    if (group.current) {
      // Update position
      group.current.position.copy(currentPosition.current);

      // Update rotation based on velocity direction
      if (vel && vel.lengthSq() > 0.001) {
        const angle = Math.atan2(vel.x, vel.z); // Y-axis rotation
        group.current.rotation.y = angle;

        // Set animation state to walking when moving
        if (animationState !== 'walking') {
          setAnimationState('walking');
        }

        // Animate walking by moving the legs
        if (legLeftRef.current && legRightRef.current && armLeftRef.current && armRightRef.current) {
          const walkSpeed = 2;
          const walkAmplitude = 0.3;

          legLeftRef.current.rotation.x = Math.sin(Date.now() * 0.005 * walkSpeed) * walkAmplitude;
          legRightRef.current.rotation.x = Math.sin(Date.now() * 0.005 * walkSpeed + Math.PI) * walkAmplitude;

          armLeftRef.current.rotation.x = Math.sin(Date.now() * 0.005 * walkSpeed + Math.PI) * walkAmplitude * 0.5;
          armRightRef.current.rotation.x = Math.sin(Date.now() * 0.005 * walkSpeed) * walkAmplitude * 0.1; // Reduced arm movement for gun arm
        }
      } else {
        // Reset to idle animation
        if (animationState !== 'idle') {
          setAnimationState('idle');
        }

        if (legLeftRef.current && legRightRef.current && armLeftRef.current && armRightRef.current) {
          legLeftRef.current.rotation.x = 0;
          legRightRef.current.rotation.x = 0;
          armLeftRef.current.rotation.x = 0;
          armRightRef.current.rotation.x = 0;
        }
      }
    }
  });

  return (
    <group ref={group} name="Player" position={[0, 0, 0]} dispose={null}>
      {/* Torso */}
      <mesh ref={torsoRef} position={[0, 0.9, 0]}>
        <boxGeometry args={[0.8, 1, 0.5]} />
        <meshStandardMaterial color={isHit ? "red" : "lightblue"} />
      </mesh>

      {/* Head */}
      <mesh ref={headRef} position={[0, 1.7, 0]}>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshStandardMaterial color={isHit ? "red" : "tan"} />
      </mesh>

      {/* Left Leg */}
      <group ref={legLeftRef} position={[-0.25, 0.2, 0]}>
        <mesh position={[0, -0.5, 0]}>
          <cylinderGeometry args={[0.15, 0.15, 1]} />
          <meshStandardMaterial color={isHit ? "red" : "navy"} />
        </mesh>
      </group>

      {/* Right Leg */}
      <group ref={legRightRef} position={[0.25, 0.2, 0]}>
        <mesh position={[0, -0.5, 0]}>
          <cylinderGeometry args={[0.15, 0.15, 1]} />
          <meshStandardMaterial color={isHit ? "red" : "navy"} />
        </mesh>
      </group>

      {/* Left Arm */}
      <group ref={armLeftRef} position={[-0.5, 1.2, 0]} rotation={[0, 0, -0.3]}>
        <mesh position={[0, -0.3, 0]}>
          <cylinderGeometry args={[0.1, 0.1, 0.8]} />
          <meshStandardMaterial color={isHit ? "red" : "lightblue"} />
        </mesh>
      </group>

      {/* Right Arm (with gun) */}
      <group ref={armRightRef} position={[0.5, 1.2, 0]} rotation={[0, 0, 0.3]}>
        <mesh position={[0, -0.3, 0]}>
          <cylinderGeometry args={[0.1, 0.1, 0.8]} />
          <meshStandardMaterial color={isHit ? "red" : "lightblue"} />
        </mesh>

        {/* Gun */}
        <group ref={gunRef} position={[0.2, -0.6, 0]} rotation={[0, 0, Math.PI / 2]}>
          {/* Gun Handle */}
          <mesh position={[0, -0.1, 0]}>
            <boxGeometry args={[0.1, 0.25, 0.05]} />
            <meshStandardMaterial color="black" />
          </mesh>

          {/* Gun Barrel */}
          <mesh position={[0, 0.1, 0]}>
            <boxGeometry args={[0.05, 0.3, 0.05]} />
            <meshStandardMaterial color="darkgray" />
          </mesh>
        </group>
      </group>
    </group>
  );
};