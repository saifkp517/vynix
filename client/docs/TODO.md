# TODO — Arena Socket Layer

Consolidating every in-match socket event into one narrated place, so the arena ↔ server
conversation reads top-to-bottom without opening ten components.

**Target branch:** `refactor` · **Non-goal:** behaviour change. This is a pure extraction.

---

## Two independent tracks

Split by direction, because inbound and outbound have genuinely different constraints
and can be done weeks apart without touching each other.

| Track       | File                                | Owns                                                | Difficulty          |
| ----------- | ----------------------------------- | --------------------------------------------------- | ------------------- |
| **A** | [TODO-outbound.md](TODO-outbound.md) | `lib/arenaEmit.ts` — 7 outbound emits            | Easy — start here  |
| **B** | [TODO-inbound.md](TODO-inbound.md)   | `hooks/useArenaSocket.ts` — 19 inbound listeners | Harder — do second |

```
OUTBOUND  (client → server)          Track A
  lib/arenaEmit.ts — plain module, no React
    emitShoot(), emitPositionAndCamera(), emitUseAbility(), …
    importable from anywhere in the canvas tree, zero prop drilling

INBOUND   (server → client)          Track B
  useArenaSocket() — called ONCE, in app/forest/[id]/page.tsx
    one useEffect, every socket.on, one cleanup
    folds payloads into stores + refs; children read those, never socket.on
```

### Why outbound is a module and not a hook

Emits fire from inside `useFrame` loops and DOM event handlers —
`updatePositionAndCamera` goes out every frame. A hook returning emit functions would
add identity churn, force every call site into a component body, and buy nothing: the
socket is already a singleton. Plain exported functions reach every call site with no
plumbing. **Do not turn Track A into a hook.**

### Why inbound *must* be a hook

Listeners need mount/unmount lifecycle and paired cleanup. That's exactly what
`useEffect` is for, and it's the shape `useMatchmaking` already established for the
lobby. Track B is its arena twin.

---

## Order

Do **A first**. It's mechanical, carries no lifecycle risk, and by the end of it five of
the ten files no longer import `socket` at all — which shrinks the surface Track B has
to reason about.

---

## Ground rules for both tracks

- ⛔ **Never touch `hooks/useMatchmaking.ts`.** It's the lobby twin and already correct;
  it's the template, not the target.
- ● `lib/socket.ts` stays exactly as-is. Neither track owns the connection — they only
  attach listeners and send messages.
- Commit per component, not per track. Every checkbox should leave the game playable.
- Add a one-line *"what I own"* header to every file you touch. That header is the
  actual deliverable — it's what makes the codebase readable later.

---

## Full event inventory

**Outbound — 7** (Track A):
`ping-check` · `useAbility` · `sendMessage` · `updatePositionAndCamera` ·
`playerWalking` · `playerStopped` · `shoot`

**Inbound — 19** (Track B):
`connect` · `youDied` · `playerDead` · `gameOver` · `pong-check` · `hit` · `youHit` ·
`receiveMessage` · `playerRespawned` · `healthRegen` · `abilityActivated` ·
`playerJoined` · `playerMoved` · `playerDisconnected` · `playerShot` ·
`playerHitReaction` · `playerWalking` · `playerStopped` · `updateForest`

> `playerWalking` / `playerStopped` appear in both — you emit your own, and you listen
> for everyone else's. Not a duplicate.

---

## After this — the next two concepts

Not now, but so you know where this is heading:

2. **Match participant state** → merge `useRoomStore` + `useGameInfoStore` +
   `useNotificationStore` + `GameInfo`'s local health/killer/ping into one
   `useMatchState`. Makes "who has how many kills" a single lookup.
3. **In-scene event bus** → replace the three homegrown mechanisms (RemoteOpponents'
   4 `EventEmitter` refs, the radar's global emitter, the kill-feed's manual pub/sub)
   with one typed emitter module.

---

## Future

- Debate whether it's useful to send a `shoot` event multiple times vs `shootStart` /
  `shootStop` events.
- `updateForest` must be handled client side.
