# Track B — Inbound: `hooks/useArenaSocket.ts`

> Every message the server *sends* the client during a match, in one hook.
> 19 listeners, 7 files. This is where the real scatter lives — and where the
> article's before/after comes from.

**Prerequisite:** Track A done (recommended, not required). It removes three files from
the surface and makes `TPP`/`Gun` socket-free before you start.

---

## The shape

The arena twin of `useMatchmaking`. Same conventions: imports the `socket` singleton
directly, one `useEffect` registering every listener with a paired cleanup, folds
payloads into stores/refs. Called **once**, from `app/forest/[id]/page.tsx`.

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
  */

**How children receive data:** they don't call the hook. The hook writes into zustand
stores (coarse state) or into refs the page already owns (hot per-frame data), and
children read from those. No context provider, no prop drilling.

---

## Read before you start — three landmines

### 1. `playerDead` has FOUR listeners today

Each doing something different. This is the single most likely place to silently break
something. Enumerate all four before deleting any of them:

| Listener in             | Does                                                                       |
| ----------------------- | -------------------------------------------------------------------------- |
| `page.tsx`            | captures`killerSocketId` → feeds KillCam (only when *I'm* the victim) |
| `GameInfo.tsx`        | sets the killer's display name                                             |
| `Scoreboard.tsx`      | increments kills/deaths                                                    |
| `RemoteOpponents.tsx` | fires the death emitter, then removes the player after a delay             |

One listener must now drive all four effects.

### 2. Do not move hot data into zustand

`RemoteOpponents` keeps per-frame positions in **refs**, not state — deliberately, for
performance. The hook must write `playerMoved` into those same refs. Only coarse data
(kills, health, player list, usernames) belongs in a store. Getting this wrong tanks the
framerate and it won't be obvious why.

### 3. StrictMode double-mounts the effect

`next dev` mounts → cleans up → mounts again. Anything with a timer or a
connection side-effect must survive that. `page.tsx` already documents this pattern
(the 100ms debounced disconnect) — read that comment before adding anything timing
sensitive.

---

## What stays OUT of this hook

The navigation guards in `page.tsx` — unmount debounced-disconnect, `beforeunload`,
`popstate`. Those are browser/navigation concerns, not socket protocol, and the
debounce logic is subtle enough to deserve its own home. `useMatchmaking` doesn't own
its page's navigation either; don't break that line.

Optionally extract them to `useLeaveMatchGuard` **later**, as a separate task.

---

## Steps

### B0 — Scaffold

- [X] Create `hooks/useArenaSocket.ts` with the docstring above
- [X] Paste the 19-event inbound inventory in as a comment block
- [X] Call `useArenaSocket()` from `app/forest/[id]/page.tsx`. It does nothing yet.

### B1 — Single-event listeners (warm-up)

Small, isolated, one component each.

- [X] `HitImpact.tsx` — `hit`. Route the trigger through a ref; keep the VFX identical.
- [X] `Ground.tsx` — `updateForest`
- [X] **Test:** take damage (hit flash + particles fire), forest updates still lande

### B2 — Page lifecycle events

The five already living in `page.tsx`. Moving these is what makes the page readable.

- [X] `connect` → `usePlayerStore.setSocketId`
- [X] `pong-check` → `pingRef` + `smoothnessRef` (hook returns both)
- [X] `youDied` → death flag + respawn timer
- [X] `playerDead` → killer capture for KillCam *(landmine 1, effect 1 of 4)*
- [X] `gameOver` → stop sounds, disconnect, route home
- [X] Keep the three navigation guards in `page.tsx` — see "What stays OUT" above
- [X] **Test hard:** die → killcam → respawn. Game over → routes home. Back button
  prompts. Refresh prompts. Dev-mode double-mount doesn't drop you from the match.

### B3 — `Scoreboard.tsx`

- [X] `playerJoined` → room store
- [X] `playerDead` → kills/deaths *(landmine 1, effect 2 of 4)* — reconcile with B2's
  handler; one listener, two effects now
- [ ] **Test:** kills and deaths increment correctly for you *and* for opponents
- [ ] Commit

### B4 — `GameInfo.tsx` (the 670-line one)

Six listeners. One at a time, test between each.

- [X] `hit` → health. Keep trusting the server's post-hit value; never decrement locally
  (there's a comment in the file explaining why — preserve it)
- [X] `healthRegen`
- [X] `playerRespawned`
- [X] `abilityActivated` → local half only; the remote half is B5
- [X] `playerDead` → killer name *(landmine 1, effect 3 of 4)*
- [X] `receiveMessage` → chat log
- [X] Drop the `socket` import once all six are gone (Track A removed its emits already)
- [ ] **Test:** health bar, regen, respawn, invincibility cooldown, chat, killer name
- [ ] Commit

> Chat is its own concept and deserves its own extraction later. For now **just move the
> socket call** — resist pulling the whole chat feature out. Scope discipline.

### B5 — `RemoteOpponents.tsx` (hardest — do last)

Eight listeners plus the four `EventEmitter` refs they drive.

- [X] `playerMoved` → **into the existing ref**, not a store (landmine 2)
- [X] `playerDisconnected`
- [X] `playerShot` → shoot emitter
- [X] `playerHitReaction` → hit emitter
- [X] `playerWalking` / `playerStopped` → positional audio start/stop
- [X] `abilityActivated` → ability emitter
- [X] `playerDead` → death emitter + delayed removal *(landmine 1, effect 4 of 4)*.
  The removal delay must stay above `DeathExplosion`'s LIFETIME or debris pops out
  early — there's a comment marking this; keep it.
- [X] `youHit` (currently in `Gun.tsx`) → folded into useArenaSocket, ticking
  page.tsx's crosshairRef directly (one-hop, same pattern as hitTriggerRef)
- [ ] **Test with 2+ real clients:** movement smoothness, directional gunshot audio,
  death explosions, disconnect cleanup. Watch the FPS counter throughout.
- [ ] Commit

> Note: RemoteOpponents' render-list bookkeeping (playerIds, the 4 EventEmitters,
> audio-ref maps) was *lifted into useArenaSocket* rather than left in the
> component with just the listeners removed — the emitters/audio refs had to
> move together since the hook's handlers write into them directly.
> RemoteOpponents.tsx is now a pure prop consumer with no socket import.

> ⚠️ **B5 is the hard one — do it last, not never.** `RemoteOpponents` owning these
> listeners is more defensible than the other files, but "mostly through the hook" is
> not a rule a grep can enforce, and this is where the 4th `playerDead` handler lives.
> If it gets hairy, split it across more commits — don't skip it.

### B6 — Close out

- [X] `grep -rn "socket\." client/components/` → comments only (verified)
- [X] Only `useArenaSocket.ts`, `lib/arenaEmit.ts`, `useMatchmaking.ts`, and
  `lib/socket.ts` import the socket — **except** `app/forest/[id]/page.tsx`,
  which keeps `socket.connected`/`socket.disconnect()` for the nav guards;
  that's the documented "What stays OUT" exception, not a miss.
- [X] `hooks/useSocketHandlersArena.ts` — already gone, nothing to delete
- [X] Redrew `client/ARCHITECTURE.md`'s diagram block with `useArenaSocket()` as
  the one inbound edge. Did **not** do a full pass of the rest of that file
  (directory-map/import-graph tables still describe the pre-refactor per-file
  listeners) — skipped to save tokens; worth a follow-up pass.
- [X] Add the one-line "what I own" header to the touched files that lacked one
  (useRoomStore.ts, useGameInfoStore.ts, Scoreboard.tsx, Ground.tsx)
- [ ] Commit

---

## Done when

One file answers "what does the server tell the client during a match?" — and
`app/forest/[id]/page.tsx` reads as wiring and render, nothing else.
