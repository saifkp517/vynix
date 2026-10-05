// Every outbound in-match message (client -> server). Inbound: hooks/useArenaSocket.ts.
// Lobby traffic: hooks/useMatchmaking.ts. roomId is read from useRoomStore, never passed.
//
//   updatePositionAndCamera  TPP       { position, velocity, cameraDirection, roomId }  -- per frame, keep allocation-free
//   playerWalking            TPP       { userId }
//   playerStopped            TPP       { userId }
//   shoot                    Gun       { userId, shootObject, roomId }
//   useAbility               GameInfo  { roomId }
//   sendMessage              GameInfo  { roomId, userId, message }
//   ping-check               page.tsx  startTime

import type { Vector3 } from 'three';
import socket from '@/lib/socket';
import { useRoomStore } from '@/hooks/useRoomStore';

// The arena page publishes roomId on mount. If it's missing, the match isn't
// really running -- drop the emit rather than send it to an empty room.
function currentRoomId(event: string): string | null {
  const roomId = useRoomStore.getState().roomId;
  if (!roomId) {
    console.error(`[arenaEmit] "${event}" dropped: roomId not set`);
    return null;
  }
  return roomId;
}

export function emitPositionAndCamera(position: Vector3, velocity: Vector3, cameraDirection: Vector3) {
  const roomId = currentRoomId('updatePositionAndCamera');
  if (!roomId) return;
  socket.emit('updatePositionAndCamera', { position, velocity, cameraDirection, roomId });
}

export function emitPlayerWalking(userId: string) {
  socket.emit('playerWalking', { userId });
}

export function emitPlayerStopped(userId: string) {
  socket.emit('playerStopped', { userId });
}

export function emitShoot(userId: string, shootObject: unknown) {
  const roomId = currentRoomId('shoot');
  if (!roomId) return;
  socket.emit('shoot', { userId, shootObject, roomId });
}

export function emitUseAbility() {
  const roomId = currentRoomId('useAbility');
  if (!roomId) return;
  socket.emit('useAbility', { roomId });
}

export function emitSendMessage(userId: string, message: string) {
  const roomId = currentRoomId('sendMessage');
  if (!roomId) return;
  socket.emit('sendMessage', { roomId, userId, message });
}

export function emitPing(startTime: number) {
  socket.emit('ping-check', startTime);
}
