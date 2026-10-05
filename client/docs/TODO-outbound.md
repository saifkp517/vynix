# Track A — Outbound: `lib/arenaEmit.ts`

> Every message the client *sends* to the server during a match, in one module.
> 7 emits, 5 files. No lifecycle, no cleanup, no ordering concerns — this track is
> mechanical. Start here.

**Prerequisite:** none. Fully independent of Track B.

---

## The shape

A plain TypeScript module. **Not a hook** — emits fire from `useFrame` loops and DOM
event handlers, which aren't component bodies. See TODO.md for the full reasoning.

```ts
// lib/arenaEmit.ts
//
// Owns every outbound in-match message (flow C2, client → server).
// Inbound listeners live in hooks/useArenaSocket.ts.
// Lobby traffic lives in hooks/useMatchmaking.ts — do not add to it.

import socket from '@/lib/socket';

export function emitShoot(...) { socket.emit('shoot', ...) }
...
```

---

## Files affected

| File                                     | Emits to move                                                     |
| ---------------------------------------- | ----------------------------------------------------------------- |
| `components/.../player/TPP.tsx`        | `updatePositionAndCamera`, `playerWalking`, `playerStopped` |
| `components/.../player/Gun.tsx`        | `shoot`                                                         |
| `components/.../gameInfo/GameInfo.tsx` | `useAbility`, `sendMessage`                                   |
| `app/forest/[id]/page.tsx`             | `ping-check`                                                    |
| `components/.../obstacles/Tree.tsx`    | none — dead`import socket`, just delete                        |

---

## ⚠️ The one landmine

**`updatePositionAndCamera` fires every single frame.** Its helper must stay
allocation-free — no object spreading, no `new Vector3()`, no default-param object
literals inside the function body. Take the same primitives the current call site
already has and pass them straight through. If you allocate here you'll add GC pressure
to the hot path and it will show up as frame stutter, not as a bug.

The other six emits are all user-triggered and low-frequency. Don't over-think them.

---

## Steps

### A0 — Scaffold

- [X] Create `lib/arenaEmit.ts` with the header comment above
- [X] Paste the 7-event outbound inventory in as a comment block — this is the map, it
  stays after the code fills in
- [X] Commit. Nothing has changed behaviourally.

### A1 — Room id: decide once, up front

Most emits need `roomId`, which today is prop-drilled or read from params per component.

- [X] Decide: does each helper take `roomId` as an argument, or does the module read it
  from `useRoomStore.getState()`?
- [X] **Recommendation:** read it from the store. It makes every call site shorter and
  removes the reason `roomId` is drilled into `TPP`/`Gun`/`GameInfo` at all — which
  is a second cleanup you get for free.
- [X] **Chosen:** helpers read `useRoomStore.getState().roomId` internally. Added
  `roomId` + `setRoomId` to `useRoomStore`; `app/forest/[id]/page.tsx` publishes it
  from `params.id` on mount (refresh-safe — matchmaking state is transient). Helpers
  that need it (`emitPositionAndCamera`, `emitShoot`, `emitUseAbility`,
  `emitSendMessage`) drop the emit + `console.error` if `roomId` is empty.
- [X] `roomId` prop removed from `TPP`, `Gun`, and `GameInfo` (GameInfo now reads it
  from the store for `<Scoreboard>` / debug readout).

### A2 — `Tree.tsx` (30 seconds, free win)

- [X] Delete the unused `import socket from '@/lib/socket'` line

### A3 — `TPP.tsx` — the hot one

- [X] Add `emitPositionAndCamera` — allocation rule honoured (primitives passed
  straight through, one payload object, `roomId` folded in via `getState()`)
- [X] Add `emitPlayerWalking`, `emitPlayerStopped`
- [X] Replace the 3 call sites; drop the `socket` import
- [X] **Test:** move around. Open another client — do you move smoothly on their screen?
  Does the walk audio start/stop for them?
- [X] **Watch the FPS counter** (`<Stats>` renders in dev). No regression allowed.
- [X] Commit

### A4 — `Gun.tsx`

- [X] Add `emitShoot`; replace call site
- [ ] ~~drop the import~~ — **can't.** `Gun.tsx` has an inbound `youHit` listener
  (`socket.on('youHit', ...)`), so the `socket` import stays until Track B. A7's
  "Gun no longer imports socket" needs revisiting.
- [X] **Test:** shoot. Confirm hits register and the other client sees your muzzle flash.
- [X] Commit

### A5 — `GameInfo.tsx`

- [X] Add `emitUseAbility`, `emitSendMessage`; replace both call sites
- [X] Kept the `socket` import — 6 inbound listeners remain until Track B
- [X] **Test:** trigger invincibility (check the cooldown still gates it), send a chat
  message
- [X] Commit

### A6 — `page.tsx`

- [X] Add `emitPing`; replace the `ping-check` emit
- [X] Left the `pong-check` **listener** alone — that's Track B (`socket` import stays)
- [X] Also removed the now-unused `roomId` prop from `<Player>` and `<GameInfo>`; added
  a `setRoomId(params.id)` effect that publishes it to the store
- [X] **Test:** ping indicator still updates in the HUD
- [X] Commit

### A7 — Close out Track A

- [X] `grep -rn "socket.emit" client/` → only `lib/arenaEmit.ts`, `useMatchmaking.ts`,
  and `lib/webrtc.ts` should appear
- [X] Confirm `TPP.tsx`, and `Tree.tsx` no longer import `socket` at all
- [X] Add the one-line "what I own" header to each file touched
- [X] Commit

---

## Done when

Three files have stopped importing `socket` entirely, every outbound message is
declared in one 60-line module, and the game plays identically. Track B can now proceed
against a smaller surface.
