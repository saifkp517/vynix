import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { FBXLoader } from 'three-stdlib';
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

  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  const targetPosition = useRef<THREE.Vector3>(new THREE.Vector3());
  const currentPosition = useRef<THREE.Vector3>(new THREE.Vector3());

  const [model, setModel] = useState<THREE.Group | undefined>();

  const url = '/assets/robot.fbx'; // Replace with your model URL

  useEffect(() => {
    const loader = new FBXLoader();
    loader.load(url, (fbx) => {
      fbx.scale.set(0.01, 0.01, 0.01); // Adjust scale as needed
      setModel(fbx);
    });
  }, [url]);

  useEffect(() => {
    if (addObstacleRef) {
      addObstacleRef(meshRef.current);
    }
  
    // Cleanup function to remove the reference when the component unmounts
    return () => {
      if (addObstacleRef) {
        addObstacleRef(null);
      }
    };
  }, [addObstacleRef, meshRef]);
  


  useEffect(() => {
    // Initialize position from the first value
    const pos = positionRef(); // This returns the latest ref'd position
    
    if (pos) {
      targetPosition.current.copy(pos);
      currentPosition.current.copy(pos);
    }
  }, []);


  // This is the current visible position


  useFrame((_, delta) => {
    const pos = positionRef(); // get fresh position every frame
    if (pos) {
      targetPosition.current.copy(pos);
      targetPosition.current.y = targetPosition.current.y - 0.8; // Adjust height based on ground
    }

    currentPosition.current.lerp(targetPosition.current, delta * 0.5);

    if (meshRef.current) {
      meshRef.current.position.copy(currentPosition.current);
    }
  });
  
  return (
    <mesh ref={meshRef} position={[0, -10, 0]}>
      {model && <primitive object={model} />}

    </mesh>

  );
};
