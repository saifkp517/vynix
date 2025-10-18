import { RefObject, useEffect, useRef, useState } from "react";
import { useFrame, useThree, useLoader } from "@react-three/fiber";
import { PositionalAudio, AudioListener, AudioLoader, Group, Mesh, Vector3, Color } from 'three';
import { EventEmitter } from "events";
import { Html } from "@react-three/drei";

import { PLAYER_RADIUS } from "@/types/types";
import OpponentGun from "./OpGun"


const RED = new Color("red");
const MOVEMENT_THRESHOLD = 0.001; // Minimum speed to consider as moving

export const Opponent = ({
  position,
  velocity,
  cameraDirection,
  smoothnessRef,
  shootEvent,
  userId,
  username,
  addObstacleRef,
  listener,
  setAudioRef,
  localPlayerPositionRef
}: {
  position: () => Vector3 | null;
  velocity: () => Vector3 | null;
  cameraDirection: () => Vector3 | null;
  smoothnessRef: RefObject<number>;
  shootEvent: EventEmitter;
  userId: string;
  username: string;
  addObstacleRef?: (ref: Mesh | null) => void;
  listener: AudioListener | undefined;
  setAudioRef?: (userId: string, audio: PositionalAudio) => void;
  localPlayerPositionRef: RefObject<Vector3>;
}) => {
  const group = useRef<Group>(null);
  const sphereRef = useRef<Mesh>(null);
  const buffer = useLoader(AudioLoader, "/sounds/walk.mp3");
  const targetPosition = useRef<Vector3>(new Vector3());
  const currentPosition = useRef<Vector3>(new Vector3());
  const soundRef = useRef<PositionalAudio | null>(null);

  const [visible, setVisible] = useState(true);

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
    const pos = position();
    if (pos) {
      targetPosition.current.copy(pos);
      currentPosition.current.copy(pos);
    }
  }, [position]);


  /** Code used to update the opponent's position and rotation by lerping */
  useFrame((_, delta) => {
    const pos = position();
    const vel = velocity();
    const localPlayerPos = localPlayerPositionRef.current;

    if (pos) {
      targetPosition.current.copy(pos);
    }

    if(pos && localPlayerPos) {
      const distance = localPlayerPos.distanceTo(pos);
      setVisible(distance <= 30);
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
        <sphereGeometry args={[PLAYER_RADIUS]} />
        <meshStandardMaterial color={RED.getStyle()} />
      </mesh>
      <OpponentGun
        cameraDirection={cameraDirection || new Vector3(0, 0, 1)}
        shootEvent={shootEvent}
        userId={userId}
      />
      {visible && (
        <Html
          center
          distanceFactor={50}
          style={{
            background: "rgba(0,0,0,0.5)",
            padding: "2px 6px",
            borderRadius: "4px",
            color: "white",
            fontSize: "12px",
          }}
        >
          {username}
        </Html>
      )}
    </group>
  );
};