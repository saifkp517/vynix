import { RefObject, useEffect, useRef, useState } from "react";
import { useFrame, useThree, useLoader } from "@react-three/fiber";
import { PositionalAudio, AudioListener, AudioLoader, Group, Mesh, Vector3, Color } from 'three';
import { EventEmitter } from "events";
import { Html } from "@react-three/drei";

import { PLAYER_RADIUS } from "@/types/types";
import OpponentGun from "./OpGun"


const RED = new Color("red");
const MOVEMENT_THRESHOLD = 0.001; // Minimum speed to consider as moving
// How hard we pull the dead-reckoned position back toward the server's
// authoritative position each second. Motion itself is driven by
// continuously integrating velocity (smooth, self-propelled); this just
// bleeds off drift once a fresh snapshot arrives instead of snapping to it.
// Higher = corrects faster (more visible); lower = smoother (can lag behind
// the true position for longer).
const CORRECTION_RATE = 6;
// if the server hasn't sent anything for this long, stop trusting our own
// extrapolated velocity and just hold position instead of drifting away
const MAX_DEAD_RECKON_MS = 600;

interface Snapshot {
  position: Vector3;
  velocity: Vector3;
  cameraDirection: Vector3;
  time: number;
}

export const Opponent = ({
  position,
  velocity,
  cameraDirection,
  getLatestSnapshot,
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
  smoothnessRef?: RefObject<number>;
  getLatestSnapshot: () => Snapshot | null;
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
  const currentPosition = useRef<Vector3>(new Vector3());
  const currentVelocity = useRef<Vector3>(new Vector3());
  const initializedRef = useRef(false);
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

  /** Dead reckoning: the opponent moves under its own steam every frame by
   * integrating its last known velocity, rather than snapping between
   * server positions. New packets don't teleport it — they just adjust
   * where it's extrapolated to be right now and nudge it there gently,
   * so motion always looks continuous no matter how the 150ms broadcast
   * tick jitters. */
  useFrame((_, delta) => {
    const snap = getLatestSnapshot();
    const localPlayerPos = localPlayerPositionRef.current;

    if (snap && !initializedRef.current) {
      // first data we've seen for this opponent: place it directly, no reckoning yet
      currentPosition.current.copy(snap.position);
      currentVelocity.current.copy(snap.velocity);
      initializedRef.current = true;
    } else if (snap) {
      const elapsedSec = Math.min(performance.now() - snap.time, MAX_DEAD_RECKON_MS) / 1000;
      const extrapolatedTarget = snap.position.clone().addScaledVector(snap.velocity, elapsedSec);

      // move on its own using the last known velocity
      currentPosition.current.addScaledVector(currentVelocity.current, delta);

      // bleed off any drift from our own extrapolation toward the truth
      const correction = Math.min(1, CORRECTION_RATE * delta);
      currentPosition.current.lerp(extrapolatedTarget, correction);
      currentVelocity.current.lerp(snap.velocity, correction);
    }

    if (localPlayerPos) {
      const distance = localPlayerPos.distanceTo(currentPosition.current);
      setVisible(distance <= 40);
    }

    if (group.current) {
      group.current.position.copy(currentPosition.current);

      if (currentVelocity.current.lengthSq() > MOVEMENT_THRESHOLD) {
        const angle = Math.atan2(currentVelocity.current.x, currentVelocity.current.z);
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