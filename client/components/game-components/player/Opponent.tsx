import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

export const Opponent = ({
  positionRef,
  isRemote = false,
  getGroundHeight,
  addObstacleRef,
  isHit = false
}: {
  positionRef: () => THREE.Vector3 | null;
  isRemote?: boolean;
  getGroundHeight: (x: number, z: number) => number;
  addObstacleRef?: (ref: THREE.Mesh | null) => void;
  isHit?: boolean;
}) => {

  const renderCount = useRef(0);
  const prevProps = useRef({
    positionRef,
    isRemote,
    getGroundHeight,
    addObstacleRef,
    isHit,
  });

  // useEffect(() => {
  //   renderCount.current += 1;

  //   const changes: string[] = [];
  //   if (prevProps.current.initialPosition !== initialPosition) {
  //     changes.push("initialPosition");
  //   }
  //   if (prevProps.current.isRemote !== isRemote) {
  //     changes.push("isRemote");
  //   }
  //   if (prevProps.current.getGroundHeight !== getGroundHeight) {
  //     changes.push("getGroundHeight");
  //   }
  //   if (prevProps.current.addObstacleRef !== addObstacleRef) {
  //     changes.push("addObstacleRef");
  //   }
  //   if (prevProps.current.isHit !== isHit) {
  //     changes.push("isHit");
  //   }

  //   if (changes.length > 0) {
  //     console.log(`Render #${renderCount.current}: Props changed -`, changes);
  //   }

  //   prevProps.current = {
  //     initialPosition,
  //     isRemote,
  //     getGroundHeight,
  //     addObstacleRef,
  //     isHit,
  //   };
  // }, [initialPosition, isRemote, getGroundHeight, addObstacleRef, isHit]);



  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  const targetPosition = useRef<THREE.Vector3>(new THREE.Vector3());
  const currentPosition = useRef<THREE.Vector3>(new THREE.Vector3());


  useEffect(() => {
    // Initialize position from the first value
    const pos = positionRef(); // This returns the latest ref'd position
    if (pos) {
      targetPosition.current.copy(pos);
      currentPosition.current.copy(pos);
    }
  }, []);


  // This is the current visible position

  const { camera } = useThree();

  useFrame(() => {
    const pos = positionRef(); // get fresh position every frame
    if (pos) {
      targetPosition.current.copy(pos);
    }
  
    currentPosition.current.lerp(targetPosition.current, 0.1);
  
    if (meshRef.current) {
      meshRef.current.position.copy(currentPosition.current);
      meshRef.current.lookAt(camera.position);
    }
  });
  

  // useEffect(() => {
  //   if (!isRemote && meshRef.current && onPositionChange) {
  //     const pos = meshRef.current.position;
  //     onPositionChange(new THREE.Vector3(pos.x, pos.y, pos.z));
  //   }
  // }, [isRemote, onPositionChange]);


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
      <meshStandardMaterial ref={materialRef} color="white" />
    </mesh>

  );
};
