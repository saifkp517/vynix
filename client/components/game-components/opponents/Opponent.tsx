import { RefObject, useEffect, useRef } from "react";
import { useFrame, useThree, useLoader } from "@react-three/fiber";
import { PositionalAudio, AudioListener, AudioLoader, Group, Mesh, Vector3, Color } from 'three';
import { EventEmitter } from "events";
import OpponentGun from "./OpGun"

const RED = new Color("red");
const MOVEMENT_THRESHOLD = 0.001; // Minimum speed to consider as moving

export const Opponent = ({
  positionRef,
  velocityRef,
  cameraDirectionRef,
  smoothnessRef,
  shootEvent,
  userId,
  isRemote = false,
  getGroundHeight,
  addObstacleRef,
  listener,
  setAudioRef
}: {
  positionRef: () => Vector3 | null;
  velocityRef: () => Vector3 | null;
  cameraDirectionRef: () => Vector3 | null;
  smoothnessRef: RefObject<number>;
  shootEvent: EventEmitter;
  userId: string;
  isRemote?: boolean;
  getGroundHeight: (x: number, z: number) => number;
  addObstacleRef?: (ref: Mesh | null) => void;
  listener: AudioListener | undefined;
  setAudioRef?: (userId: string, audio: PositionalAudio) => void;
}) => {
  const group = useRef<Group>(null);
  const sphereRef = useRef<Mesh>(null);
  const buffer = useLoader(AudioLoader, "/sounds/walk.mp3");
  const targetPosition = useRef<Vector3>(new Vector3());
  const currentPosition = useRef<Vector3>(new Vector3());
  const soundRef = useRef<PositionalAudio | null>(null);

  useEffect(() => {
    if (!listener || !sphereRef.current) return;

    const sound = new PositionalAudio(listener);
    const loader = new AudioLoader();

    loader.load('/sounds/walk.mp3', (buffer) => {
      sound.setBuffer(buffer);
      sound.setPlaybackRate(2)
      sound.setVolume(1);
      sound.setRefDistance(5);
      sphereRef.current!.add(sound);
      soundRef.current = sound;

      if (setAudioRef) {
        setAudioRef(userId, sound);
      }
    });
  }, [listener]);

  /** Obstacle detection code, to prevent lerping from making the opponent clip through trees */
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


  /** Code used to update the opponent's position and rotation by lerping */
  useFrame((_, delta) => {
    const pos = positionRef();
    const vel = velocityRef();

    if (pos) {
      targetPosition.current.copy(pos);
    }

    currentPosition.current.lerp(targetPosition.current, delta * (smoothnessRef.current ?? 10));

    if (group.current) {
      group.current.position.copy(currentPosition.current);

      if (vel && vel.lengthSq() > MOVEMENT_THRESHOLD) {
        const angle = Math.atan2(vel.x, vel.z);
        group.current.rotation.y = angle;
      }
    }
  });

  return (
    <group ref={group} position={[0, 0, 0]}>
      <mesh ref={sphereRef} position={[0, -1.5, 0]}>
        <sphereGeometry args={[1.0]} />
        <meshStandardMaterial color={RED.getStyle()} />
      </mesh>
      <OpponentGun
        cameraDirection={cameraDirectionRef() || new Vector3(0, 0, -1)}
        shootEvent={shootEvent}
        userId={userId}
      />
    </group>
  );
};