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
  deathEvent,
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
  deathEvent: EventEmitter;
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
  const [dead, setDead] = useState(false);

  //reset player to normal after death
  useEffect(() => {
    if (sphereRef.current && visible && !dead) {
      const material = sphereRef.current.material as any;
      material.color.set(new Color("red"));
      material.opacity = 1;
      material.transparent = false;
    }
  }, [visible, dead]);

  //handle death animation
  useEffect(() => {
    const handleDeath = () => {
      if (!sphereRef.current) return;

      setDead(true);
      const material = sphereRef.current.material as any;
      material.color.set(new Color("gray"));
      material.opacity = 1;
      material.transparent = true;

      // Fade-out effect
      let opacity = 1;
      const fadeOut = setInterval(() => {
        opacity -= 0.05;
        if (opacity <= 0) {
          opacity = 0;
          clearInterval(fadeOut);
        }
        material.opacity = opacity;
      }, 50);

      // Respawn after 5 seconds
      const respawnTimeout = setTimeout(() => {
        if (!sphereRef.current) return;

        setDead(false);
        const respawnMaterial = sphereRef.current.material as any;
        respawnMaterial.color.set(new Color("red"));
        respawnMaterial.transparent = true;

        let respawnOpacity = 0;
        const fadeIn = setInterval(() => {
          respawnOpacity += 0.05;
          if (respawnOpacity >= 1) {
            respawnOpacity = 1;
            respawnMaterial.transparent = false;
            clearInterval(fadeIn);
          }
          respawnMaterial.opacity = respawnOpacity;
        }, 50);
      }, 5000);

      return () => {
        clearInterval(fadeOut);
        clearTimeout(respawnTimeout);
      };
    };

    deathEvent.on("playDeathAnimation", handleDeath);
    return () => {
      deathEvent.off("playDeathAnimation", handleDeath);
    };
  }, [deathEvent]);
  
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

    if (pos && localPlayerPos) {
      const distance = localPlayerPos.distanceTo(pos);
      setVisible(distance <= 40);
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
            background: "",
            padding: "2px 6px",
            borderRadius: "4px",
            color: "white",
            fontSize: "12px",
          }}
        >
          {username.startsWith("Guest") ? username.slice(0, 10) : username}
        </Html>
      )}
    </group>
  );
};