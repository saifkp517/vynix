// hooks/useArenaSocket.ts
//
/**
 * Owns the entire in-match socket conversation (flow C2, server → client).
 * - registers every arena listener in one effect, tears them all down on unmount
 * - folds payloads into useRoomStore / usePlayerStore / the scene's refs
 * - components read those; none of them call socket.on any more
 *
 * Outbound emits live in lib/arenaEmit.ts.
 * Lobby traffic lives in useMatchmaking.ts — do not add to it.
 *
 * NOT here: the navigation guards in page.tsx (unmount debounced-disconnect,
 * beforeunload, popstate). Those are browser/navigation concerns, not socket
 * protocol.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import { EventEmitter } from 'events';
import { Vector3, type PositionalAudio } from 'three';
import socket from '@/lib/socket';
import { emitPing } from '@/lib/arenaEmit';
import { usePlayerStore } from '@/hooks/usePlayerStore';
import { useRoomStore, type Player } from '@/hooks/useRoomStore';
import { useGameInfoStore } from '@/hooks/useGameInfoStore';
import { stopAllSounds } from '@/lib/sound';

/** A remote opponent's latest known transform — written by 'playerMoved',
 *  read imperatively by RemoteOpponents/Opponent (landmine 2: never move
 *  this into a store, it's per-frame-hot). */
export interface RemotePlayerData {
  user: any;
  position: Vector3;
  velocity: Vector3;
  cameraDirection: Vector3;
}

/** The authoritative snapshot an Opponent dead-reckons from between packets. */
export interface RemotePlayerSnapshot {
  position: Vector3;
  velocity: Vector3;
  cameraDirection: Vector3;
  time: number;
}

/** Latest `hit` the server reported, plus a bump counter so a frame loop can
 *  tell one hit from the next. HitImpact drains this in its useFrame. */
export interface HitTrigger {
  seq: number;
  rayOrigin: { x: number; y: number; z: number };
}

export interface UseArenaSocketOptions {
  /** Fires when the local player dies (`youDied`). page.tsx uses it to reset
   *  the kill-feed streak — a concern that lives with the kill feed, not here. */
  onLocalDeath?: () => void;
  /** Owned by page.tsx, handed to RemoteOpponents too — 'playerMoved' writes
   *  remote transforms straight into it (landmine 2). */
  playerDataRef: RefObject<Record<string, RemotePlayerData>>;
  /** page.tsx's crosshair ref; 'youHit' ticks it directly, same one-hop
   *  pattern as hitTriggerRef. */
  crosshairRef?: RefObject<{ triggerHit: () => void }>;
  /** Fires when the local player gets credited with a kill ('playerDead'),
   *  so page.tsx can push it onto its kill-feed toast. */
  onKillCredited?: (victimName: string) => void;
}

export interface UseArenaSocket {
  hitTriggerRef: RefObject<HitTrigger>;
  /** Round-trip time in ms, refreshed once a second off `pong-check`. */
  pingRef: RefObject<number>;
  /** Interpolation factor derived from ping; RemoteOpponents reads it. */
  smoothnessRef: RefObject<number>;
  /** True from `youDied` until the local respawn timer clears it. */
  isPlayerDeadRef: RefObject<boolean>;
  /** Killer's socket id, captured from `playerDead` when we're the victim;
   *  feeds KillCam. Cleared on respawn. */
  killerIdRef: RefObject<string | null>;
  /** Latched by `gameOver`; the page's navigation guards key off it. */
  gameOver: boolean;

  // --- RemoteOpponents' render list + delivery channels (B5). RemoteOpponents
  // is a pure consumer of these now — no socket import, no local bookkeeping.
  /** Ids of currently-rendered remote opponents (server broadcasts are the
   *  source of truth; membership starts on their first 'playerMoved'). */
  remotePlayerIds: string[];
  remotePlayerUsernamesRef: RefObject<Record<string, string>>;
  remoteSnapshotRef: RefObject<Record<string, RemotePlayerSnapshot>>;
  /** One-shot event fan-out per opponent — EventEmitter, not a store, because
   *  Opponent needs "this exact shot/death/hit/ability happened," not "did a
   *  value change" (same reasoning as hitTriggerRef, different mechanism). */
  remoteShootEvent: EventEmitter;
  remoteDeathEvent: EventEmitter;
  remoteHitEvent: EventEmitter;
  remoteAbilityEvent: EventEmitter;
  setRemoteWalkAudioRef: (userId: string, audio: PositionalAudio) => void;
  setRemoteShootAudioRef: (userId: string, audio: PositionalAudio) => void;
}

const PING_CHECK_INTERVAL = 1000;
const RESPAWN_TIMEOUT = 5000;
const GAME_OVER_EXIT_DELAY = 5000;

export function useArenaSocket(options: UseArenaSocketOptions): UseArenaSocket {
  const { onLocalDeath, playerDataRef, crosshairRef, onKillCredited } = options;
  const router = useRouter();

  // Trigger refs: server events the page's scene consumes imperatively, not as
  // state. The hook writes; a component's frame loop reads. See landmine 2.
  const hitTriggerRef = useRef<HitTrigger>({ seq: 0, rayOrigin: { x: 0, y: 0, z: 0 } });

  // Page-lifecycle refs (B2). Owned here, handed back to page.tsx, which is the
  // one component that both calls this hook and renders the scene — a single
  // prop hop, not drilling.
  const pingRef = useRef(0);
  const smoothnessRef = useRef(0);
  const isPlayerDeadRef = useRef(false);
  const killerIdRef = useRef<string | null>(null);

  const [gameOver, setGameOver] = useState(false);

  // Keep the callback current without re-running the socket effect.
  const onLocalDeathRef = useRef(onLocalDeath);
  onLocalDeathRef.current = onLocalDeath;
  const onKillCreditedRef = useRef(onKillCredited);
  onKillCreditedRef.current = onKillCredited;

  // RemoteOpponents' bookkeeping (B5) — lifted out of that component so it
  // can be a pure prop consumer. playerIds needs to be state (it drives
  // RemoteOpponents' render list); everything else is a ref RemoteOpponents
  // reads imperatively.
  const [remotePlayerIds, setRemotePlayerIds] = useState<string[]>([]);
  const remotePlayerIdsRef = useRef<string[]>([]);
  const remotePlayerUsernamesRef = useRef<Record<string, string>>({});
  const remoteSnapshotRef = useRef<Record<string, RemotePlayerSnapshot>>({});
  const deadPlayersRef = useRef<Set<string>>(new Set());
  const remoteShootEvent = useRef(new EventEmitter()).current;
  const remoteDeathEvent = useRef(new EventEmitter()).current;
  const remoteHitEvent = useRef(new EventEmitter()).current;
  const remoteAbilityEvent = useRef(new EventEmitter()).current;
  const walkAudioRefs = useRef<Record<string, PositionalAudio>>({});
  const shootAudioRefs = useRef<Record<string, PositionalAudio>>({});

  const addRemotePlayer = useCallback((id: string, username?: string) => {
    if (!remotePlayerIdsRef.current.includes(id)) {
      remotePlayerIdsRef.current.push(id);
      if (username) remotePlayerUsernamesRef.current[id] = username;
      setRemotePlayerIds([...remotePlayerIdsRef.current]);
    } else if (username) {
      remotePlayerUsernamesRef.current[id] = username;
    }
  }, []);

  const removeRemotePlayer = useCallback((id: string) => {
    if (!remotePlayerIdsRef.current.includes(id)) return;
    remotePlayerIdsRef.current = remotePlayerIdsRef.current.filter((pid) => pid !== id);
    delete remotePlayerUsernamesRef.current[id];

    const walkAudio = walkAudioRefs.current[id];
    if (walkAudio) {
      try { if (walkAudio.isPlaying) walkAudio.stop(); } catch { /* already stopped */ }
      delete walkAudioRefs.current[id];
    }
    const shootAudio = shootAudioRefs.current[id];
    if (shootAudio) {
      try { if (shootAudio.isPlaying) shootAudio.stop(); } catch { /* already stopped */ }
      delete shootAudioRefs.current[id];
    }

    delete playerDataRef.current[id];
    delete remoteSnapshotRef.current[id];
    deadPlayersRef.current.delete(id);

    setRemotePlayerIds([...remotePlayerIdsRef.current]);
  }, [playerDataRef]);

  const setRemoteWalkAudioRef = useCallback((userId: string, audio: PositionalAudio) => {
    walkAudioRefs.current[userId] = audio;
  }, []);

  const setRemoteShootAudioRef = useCallback((userId: string, audio: PositionalAudio) => {
    shootAudioRefs.current[userId] = audio;
  }, []);

  useEffect(() => {
    // --- connect: keep the local player's socket id in the store, current
    // across reconnects (socket.id is reassigned on every connect). Consumers
    // read it from the store instead of having it prop-drilled through the scene.
    const syncSocketId = () => usePlayerStore.getState().setSocketId(socket.id ?? '');
    syncSocketId();

    // --- pong-check: RTT + a ping-derived smoothing factor. Registered once;
    // the interval below only emits.
    const handlePong = (clientTime: number) => {
      const pingValue = Date.now() - clientTime;
      pingRef.current = pingValue;
      const maxPing = 500;
      const minFactor = 0.5;
      const maxFactor = 10;
      const clampedPing = Math.min(Math.max(pingValue, 0), maxPing);
      smoothnessRef.current = maxFactor - (clampedPing / maxPing) * (maxFactor - minFactor);
    };
    const pingInterval = setInterval(() => emitPing(Date.now()), PING_CHECK_INTERVAL);

    // --- youDied: local death flag + respawn timer.
    const handleYouDied = () => {
      isPlayerDeadRef.current = true;
      onLocalDeathRef.current?.();
      setTimeout(() => {
        isPlayerDeadRef.current = false;
        killerIdRef.current = null;
      }, RESPAWN_TIMEOUT);
    };

    // --- playerDead: broadcast to the whole room. One listener, all four
    // effects from landmine 1 now live here: killcam capture (B2),
    // Scoreboard's kills/deaths + kill feed (B3), GameInfo's killer name
    // (B4), and RemoteOpponents' death animation + delayed removal (B5).
    const handlePlayerDead = ({
      killerSocketId,
      victimSocketId,
      killerName,
      victimName,
    }: {
      killerSocketId: string;
      victimSocketId: string;
      killerName: string;
      victimName: string;
    }) => {
      // effect 1 of 4 — killcam capture, only when we're the victim
      // effect 3 of 4 — GameInfo's "Eliminated by <name>" toast, same guard
      if (victimSocketId === socket.id) {
        killerIdRef.current = killerSocketId;
        useGameInfoStore.getState().setKillerName(killerName);
      }

      // effect 2 of 4 — Scoreboard: kills/deaths tally + kill feed entry
      const room = useRoomStore.getState();
      room.updatePlayer(killerSocketId, { kills: (room.getPlayer(killerSocketId)?.kills || 0) + 1 });
      room.updatePlayer(victimSocketId, { deaths: (room.getPlayer(victimSocketId)?.deaths || 0) + 1 });
      room.addKillFeedItem({
        id: `${killerName}-${victimName}-${Date.now()}`,
        killerId: killerSocketId,
        victimId: victimSocketId,
        killerName,
        victimName,
        timestamp: Date.now(),
      });

      // effect 4 of 4 — RemoteOpponents: kill toast (only when we're the
      // killer), death animation, then delayed removal. The delay must stay
      // above DeathExplosion's LIFETIME or debris pops out early.
      if (killerSocketId === socket.id) {
        onKillCreditedRef.current?.(victimName);
      }
      remoteDeathEvent.emit('playDeathAnimation', { id: victimSocketId });
      deadPlayersRef.current.add(victimSocketId);
      setTimeout(() => {
        removeRemotePlayer(victimSocketId);
      }, 2500);
    };

    // --- playerJoined: append the new player to the room store; Scoreboard
    // reads from there.
    const handlePlayerJoined = (player: Player) => {
      useRoomStore.getState().addPlayers([player]);
    };

    // --- gameOver: stop sounds, then disconnect and route home. The nav guards
    // in page.tsx stand down once `gameOver` is set.
    const handleGameOver = () => {
      setGameOver(true);
      stopAllSounds();
      setTimeout(() => {
        socket.disconnect();
        router.push('/');
      }, GAME_OVER_EXIT_DELAY);
    };

    // hit — one event, two effects: HitImpact's particle burst (via the trigger
    // ref, B1) and GameInfo's health + screen-flash (via the store, B4). Trust
    // the server's post-hit health instead of guessing locally — a
    // locally-decremented value never resyncs with Redis truth if a 'hit'
    // event is ever dropped or reordered.
    const handleShotAnimation = ({ rayOrigin, health }: { rayOrigin: { x: number; y: number; z: number }; health: number }) => {
      if (!rayOrigin) return;
      const t = hitTriggerRef.current;
      t.seq += 1;
      t.rayOrigin = rayOrigin;

      useGameInfoStore.getState().setHealth(health);
      useGameInfoStore.getState().triggerHit(rayOrigin);
    };

    // updateForest — server nudges the drifting forest mesh; Ground lerps to it.
    const handleUpdateForest = ({ position }: { id?: string; position: { x: number; y: number; z: number } }) => {
      useRoomStore.getState().setForestTarget([position.x, position.y, position.z]);
    };

    // healthRegen / playerRespawned / abilityActivated — local-player-only
    // HUD state (GameInfo). Filtered against our own socket id since the
    // server broadcasts these room-wide.
    const handleHealthRegen = ({ id, health }: { id: string; health: number }) => {
      if (id === socket.id) {
        useGameInfoStore.getState().setHealth(health);
      }
    };

    const handlePlayerRespawned = ({ id }: { id: string }) => {
      if (id === socket.id) {
        useGameInfoStore.getState().setHealth(100);
        useGameInfoStore.getState().setKillerName(null);
      }
    };

    const handleAbilityActivated = ({
      id,
      invincibleUntil,
      abilityCooldownUntil,
    }: {
      id: string;
      invincibleUntil: number;
      abilityCooldownUntil: number;
    }) => {
      // local half — GameInfo's own cooldown/invincibility HUD (B4)
      if (id === socket.id) {
        useGameInfoStore.getState().setAbilityState({ invincibleUntil, cooldownUntil: abilityCooldownUntil });
      }
      // remote half — fan out to whichever Opponent this id belongs to (B5)
      remoteAbilityEvent.emit('abilityActivated', { id, invincibleUntil });
    };

    // receiveMessage — chat log; GameInfo renders the store's array directly.
    const handleReceiveMessage = ({ userId, message }: { userId: string; message: string }) => {
      useGameInfoStore.getState().addChatMessage({
        id: `${userId}-${Date.now()}`,
        playerName: userId,
        message,
        timestamp: new Date(),
      });
    };

    // youHit — server-authoritative hit-marker tick. crosshairRef is
    // page.tsx's, handed straight to Gun today; the hook can tick it
    // directly instead, same one-hop pattern as hitTriggerRef.
    const handleYouHit = () => {
      crosshairRef?.current?.triggerHit();
    };

    // playerMoved — high-frequency remote transforms. Written straight into
    // playerDataRef/remoteSnapshotRef (landmine 2: never a store for this).
    const handlePlayerMoved = (payload: {
      id: string;
      userId?: string;
      username?: string;
      position: { x: number; y: number; z: number };
      velocity: { x: number; y: number; z: number };
      cameraDirection: { x: number; y: number; z: number };
    }) => {
      const { id, username, position, velocity, cameraDirection } = payload;

      if (deadPlayersRef.current.has(id)) {
        // marked dead but moving again => respawned
        deadPlayersRef.current.delete(id);
      }

      playerDataRef.current[id] = {
        user: payload.userId ?? id,
        position: new Vector3(position.x, position.y, position.z),
        velocity: new Vector3(velocity.x, velocity.y, velocity.z),
        cameraDirection: new Vector3(cameraDirection.x, cameraDirection.y, cameraDirection.z),
      };

      // latest authoritative snapshot; the opponent dead-reckons on its own
      // velocity between packets and softly corrects toward this
      remoteSnapshotRef.current[id] = {
        position: playerDataRef.current[id].position.clone(),
        velocity: playerDataRef.current[id].velocity.clone(),
        cameraDirection: playerDataRef.current[id].cameraDirection.clone(),
        time: performance.now(),
      };

      addRemotePlayer(id, username);
    };

    const handlePlayerDisconnected = (id: string) => {
      removeRemotePlayer(id);
      useRoomStore.getState().removePlayer(id);
    };

    const handlePlayerShot = (payload: { id: string; rayOrigin: { x: number; y: number; z: number }; rayDirection: { x: number; y: number; z: number } }) => {
      const { id, rayOrigin, rayDirection } = payload;
      if (deadPlayersRef.current.has(id)) return;
      remoteShootEvent.emit('playerShot', {
        id,
        rayOrigin: new Vector3(rayOrigin.x, rayOrigin.y, rayOrigin.z),
        rayDirection: new Vector3(rayDirection.x, rayDirection.y, rayDirection.z),
      });
    };

    const handlePlayerHitReaction = (payload: { targetId: string }) => {
      remoteHitEvent.emit('playerHitReaction', { id: payload.targetId });
    };

    const handlePlayerWalking = (payload: { userId: string }) => {
      const audio = walkAudioRefs.current[payload.userId];
      if (audio && !audio.isPlaying) {
        audio.setMaxDistance(25);
        audio.setLoop(true);
        audio.setVolume(1);
        audio.play();
      }
    };

    const handlePlayerStopped = (payload: { userId: string }) => {
      const audio = walkAudioRefs.current[payload.userId];
      if (audio && audio.isPlaying) {
        audio.stop();
      }
    };

    socket.on('connect', syncSocketId);
    socket.on('pong-check', handlePong);
    socket.on('youDied', handleYouDied);
    socket.on('playerDead', handlePlayerDead);
    socket.on('playerJoined', handlePlayerJoined);
    socket.on('gameOver', handleGameOver);
    socket.on('hit', handleShotAnimation);
    socket.on('updateForest', handleUpdateForest);
    socket.on('healthRegen', handleHealthRegen);
    socket.on('playerRespawned', handlePlayerRespawned);
    socket.on('abilityActivated', handleAbilityActivated);
    socket.on('receiveMessage', handleReceiveMessage);
    socket.on('youHit', handleYouHit);
    socket.on('playerMoved', handlePlayerMoved);
    socket.on('playerDisconnected', handlePlayerDisconnected);
    socket.on('playerShot', handlePlayerShot);
    socket.on('playerHitReaction', handlePlayerHitReaction);
    socket.on('playerWalking', handlePlayerWalking);
    socket.on('playerStopped', handlePlayerStopped);

    return () => {
      clearInterval(pingInterval);
      socket.off('connect', syncSocketId);
      socket.off('pong-check', handlePong);
      socket.off('youDied', handleYouDied);
      socket.off('playerDead', handlePlayerDead);
      socket.off('playerJoined', handlePlayerJoined);
      socket.off('gameOver', handleGameOver);
      socket.off('hit', handleShotAnimation);
      socket.off('updateForest', handleUpdateForest);
      socket.off('healthRegen', handleHealthRegen);
      socket.off('playerRespawned', handlePlayerRespawned);
      socket.off('abilityActivated', handleAbilityActivated);
      socket.off('receiveMessage', handleReceiveMessage);
      socket.off('youHit', handleYouHit);
      socket.off('playerMoved', handlePlayerMoved);
      socket.off('playerDisconnected', handlePlayerDisconnected);
      socket.off('playerShot', handlePlayerShot);
      socket.off('playerHitReaction', handlePlayerHitReaction);
      socket.off('playerWalking', handlePlayerWalking);
      socket.off('playerStopped', handlePlayerStopped);
      usePlayerStore.getState().setSocketId('');
    };
  }, [router, playerDataRef, crosshairRef, addRemotePlayer, removeRemotePlayer, remoteDeathEvent, remoteShootEvent, remoteHitEvent, remoteAbilityEvent]);

  return {
    hitTriggerRef,
    pingRef,
    smoothnessRef,
    isPlayerDeadRef,
    killerIdRef,
    gameOver,
    remotePlayerIds,
    remotePlayerUsernamesRef,
    remoteSnapshotRef,
    remoteShootEvent,
    remoteDeathEvent,
    remoteHitEvent,
    remoteAbilityEvent,
    setRemoteWalkAudioRef,
    setRemoteShootAudioRef,
  };
}

/**
 * Inbound inventory — every event the server sends the client during a match.
 * 19 events, currently scattered across 7 files. Migrated here one step at a
 * time (see docs/TODO-inbound.md). Column 3 is the current owner; it becomes
 * "useArenaSocket" as each row moves.
 *
 * event               | payload (rough)                                  | current owner
 * --------------------|-------------------------------------------------|------------------------
 * connect             | —                                               | useArenaSocket → usePlayerStore.socketId
 * pong-check          | clientTime: number                              | useArenaSocket → pingRef / smoothnessRef
 * youDied             | —                                               | useArenaSocket → isPlayerDeadRef (+ respawn timer)
 * playerDead          | { killerSocketId, victimSocketId, killerName,   | useArenaSocket — killcam, Scoreboard
 *                     |   victimName }                                  |   tally/feed, GameInfo killer name,
 *                     |                                                 |   RemoteOpponents death anim + removal
 * gameOver            | —                                               | useArenaSocket → gameOver (+ exit)
 * hit                 | { health, rayOrigin, ... }                      | useArenaSocket → gameInfoStore.health
 *                     |                                                 |   + hitTriggerRef (particles)
 * receiveMessage      | chat message                                    | useArenaSocket → gameInfoStore.chatMessages
 * playerRespawned     | { id, position, ... }                           | useArenaSocket → gameInfoStore (local half)
 * healthRegen         | { health }                                      | useArenaSocket → gameInfoStore.health
 * abilityActivated    | { socketId, ability, ... }                      | useArenaSocket — local half → gameInfoStore,
 *                     |                                                 |   remote half → remoteAbilityEvent
 * playerJoined        | player                                          | useArenaSocket → useRoomStore.players
 * playerMoved         | { id, position, velocity, cameraDirection }     | useArenaSocket → playerDataRef / remoteSnapshotRef
 * playerDisconnected  | { id }                                         | useArenaSocket → removeRemotePlayer
 * playerShot          | { id, ... }                                     | useArenaSocket → remoteShootEvent
 * playerHitReaction   | { id, ... }                                     | useArenaSocket → remoteHitEvent
 * playerWalking       | { id }                                          | useArenaSocket → walkAudioRefs
 * playerStopped       | { id }                                          | useArenaSocket → walkAudioRefs
 * updateForest        | { id, position }                               | useArenaSocket → useRoomStore.forestTarget
 * youHit              | { ... }                                         | useArenaSocket → crosshairRef.triggerHit()
 */