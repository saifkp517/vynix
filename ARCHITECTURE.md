# Vynix / Zentra — System Architecture

One doc, whole system: client, server, the data stores, and exactly how they're wired together.
Written from scratch by walking the actual code (2026-08-25), not by trusting prior docs — where
this disagrees with `server/MODULE_MAP.md` or `client/ARCHITECTURE.md`, this one is newer and
more thorough; those may still be useful for grep-friendly, module-scoped detail.

Vynix (marketed as "Zentra") is a browser-based multiplayer arena shooter: third-person, forest
map, real-time PvP with AI bots filling empty slots.

---

## 1. The pieces, at a glance

Full interactive diagram (pan/zoom, full-screen): **https://claude.ai/code/artifact/ebcb7566-bab3-4b7a-acbe-94299e4a261f**

It traces the same causal chain covered in §3–§9b below: auth setup on the client, the socket.io
connection, every `GameGateway` handler's internal call chain, the REST side, and the data stores
each path writes to.

**Everything real-time** (position, shooting, health, chat, room state) goes over one
`socket.io` connection. **Everything durable-identity** (who are you, your lifetime K/D) goes over
REST, guarded by the same Supabase token. Redis is scratch space for *the current match only* and
is wiped when a room ends; Postgres is the only thing that outlives a match.

---

## 2. Repo layout

```
vynix/
├── client/            Next.js + React Three Fiber game client
├── server/             NestJS backend (server-nest)
├── shared/            treeConstants.ts — geometry constants BOTH client and server import,
│                       so tree collision/occlusion math can never drift between them
├── nginx-conf/        reverse proxy config for prod deployment
├── monitor-scripts/   ops/monitoring shell scripts
├── docs/              engineering log
└── ecosystem.config.cjs   PM2 process config for prod
```

`shared/` is the one piece of code both sides literally import — see §6.

---

## 3. Identity & auth, end to end

There is **no guest mode anymore**. Every player is a Supabase Auth user — including "anonymous"
players, who are real Supabase anonymous-auth sessions (`supabase.auth.signInAnonymously()` in
`client/hooks/useAuth.ts`), not a fabricated `guest-{id}` string like older builds used.

**Client side:**

1. `client/lib/supabase.ts` creates one `supabase` client (public anon key — safe to expose, it
   only lets the client ask Supabase to *issue* a session, not bypass verification).
2. `client/hooks/useAuth.ts` wraps `signUp` / `signInWithPassword` / `signInAnonymously` /
   `signOut`, and subscribes to `supabase.auth.onAuthStateChange` to track the live session.
3. `client/lib/socket.ts` constructs the socket.io client with `autoConnect: false` and an `auth`
   callback (not a static value!) that calls `supabase.auth.getSession()` **fresh on every
   (re)connect attempt** — so a token refreshed mid-session, or a login that just completed, is
   always picked up instead of baking in a stale token from module load time.
4. `client/app/page.tsx` calls `socket.connect()` only once a session actually exists.

**Server side (`server/src/game/gateway/game.gateway.ts` → `handleConnection`):**

1. Reads `socket.handshake.auth.token`.
2. Missing token → `socket.disconnect(true)` immediately, no further processing. **Hard reject**,
   not a guest fallback.
3. `verifySupabaseToken(token)` (`server/src/auth/supabase-auth.util.ts`) calls
   `supabase.auth.getUser(token)` — a **live network round-trip to Supabase**, not local JWT
   verification. This project is on Supabase's newer "JWT Signing Keys" model, so a locally-held
   HS256 secret can no longer verify tokens offline; `SUPABASE_JWT_SECRET` in `.env`/
   `docker-compose.yml` is legacy/vestigial. The extra network hop is cheap here because it only
   runs once per socket connect, never per game event.
4. Invalid/expired token → same hard disconnect, with a logged reason.
5. Valid token → `claims.sub` (Supabase's durable user id) becomes `socket.userId`;
   `usernameFromClaims` derives a display name (`user_metadata.username` → email prefix →
   `player-{id prefix}` fallback) as `socket.username`.
6. `ProfilesService.findOrCreate(claims.sub, username)` — lazily inserts a `profiles` row on this
   user's **very first connection ever**; every later connection just reads/uses the existing row.
7. `SocketStateService.add(socket)` — now counted as "online."

**REST side:** `ProfilesController` (`GET /profiles/me`, `GET /profiles/:userId`,
`PATCH /profiles/me`) is guarded by `SupabaseAuthGuard`, which does the exact same
`verifySupabaseToken` call against the `Authorization: Bearer <token>` header and stamps
`request.userId`. Socket and REST auth are two separate code paths that both terminate in the same
`verifySupabaseToken` function — if you fix a bug in one, check the other still matches.

Why this matters for debugging: **"connection immediately drops"** almost always means the client
isn't sending a live token (session expired, not logged in, `getSession()` returned null) — check
`handshake.auth.token` on the wire before assuming server-side auth logic is broken.

---

## 4. The socket event contract (this *is* the connection)

Every real-time interaction between client and server is one of these events. This table is the
actual coupling between the two codebases — a mismatch here (wrong event name, wrong payload
shape) is the single most common way client and server silently stop talking to each other.

### Client → Server (emits)

| Event                       | Payload                                                                                          | Client emit site                              | Server handler                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------- | --------------------------------------------------------------------------- |
| `requestMatchmaking`      | `username: string`                                                                             | `app/page.tsx`                              | `GameGateway.handleRequestMatchmaking`                                    |
| `cancelMatchmaking`       | —                                                                                               | `app/page.tsx`                              | `GameGateway.handleCancelMatchmaking`                                     |
| `updatePositionAndCamera` | `{ position, velocity, cameraDirection, roomId }` — **one object**, not positional args | `components/game-components/player/TPP.tsx` | `GameGateway.handleUpdatePositionAndCamera`                               |
| `playerWalking`           | `{ userId }`                                                                                   | `player/TPP.tsx`                            | `GameGateway.handlePlayerWalking` (pure relay)                            |
| `playerStopped`           | `{ userId }`                                                                                   | `player/TPP.tsx`                            | `GameGateway.handlePlayerStopped` (pure relay)                            |
| `shoot`                   | `{ userId, shootObject: { rayOrigin, rayDirection, muzzleOrigin }, roomId }`                   | `player/Gun.tsx`                            | `GameGateway.handleShoot` → `CombatService.handleShoot`                |
| `useAbility`              | `{ roomId }`                                                                                   | `gameInfo/GameInfo.tsx` (key `Q`)         | `GameGateway.handleUseAbility` → `CombatService.activateInvincibility` |
| `sendMessage`             | `{ roomId, userId, message }`                                                                  | `gameInfo/GameInfo.tsx` (chat box)          | `GameGateway.handleSendMessage`                                           |
| `ping-check`              | `clientTime: number`                                                                           | `app/forest/[id]/page.tsx`                  | `GameGateway.handlePing` → echoes `pong-check`                         |
| `debug:connections`       | —                                                                                               | (dev tooling)                                 | `GameGateway.handleDebugConnections`                                      |

### Server → Client (emits, broadcast scope noted)

| Event                                 | Payload                                                                 | Scope                           | Client listener(s)                                                                           |
| ------------------------------------- | ----------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------- |
| `searchingForMatch`                 | —                                                                      | caller only                     | `hooks/useSocketHandlersMain.ts`                                                           |
| `waitingForPlayers`                 | `{ count }`                                                           | caller only                     | (lobby UI,`app/page.tsx`)                                                                  |
| `playerPoolCount`                   | `poolCount: number`                                                   | broadcast (all)                 | (lobby UI)                                                                                   |
| `gameStarted`                       | `{ startTime, duration }`                                             | room (on create + late joiners) | `hooks/useSocketHandlersMain.ts`, `app/forest/[id]/page.tsx` (countdown)                 |
| `spawnPoint`                        | `Vector3`                                                             | caller only                     | `hooks/useSocketHandlersMain.ts`, `CombatService` respawn                                |
| `roomAssigned`                      | `{ roomId }`                                                          | caller only                     | `hooks/useSocketHandlersMain.ts` — triggers `router.push('/forest/[id]')`               |
| `roomSnapshot`                      | `{ roomPlayers: Record<socketId, Player> }`                           | caller only                     | `hooks/useSocketHandlersMain.ts`                                                           |
| `playerJoined`                      | `{ id, username, position, velocity, health, kills, deaths, isDead }` | room (others)                   | `hooks/useSocketHandlersMain.ts`, `gameInfo/Scoreboard.tsx`                              |
| `cancelledMatchmaking`              | —                                                                      | caller only                     | `hooks/useSocketHandlersMain.ts`                                                           |
| `playerLeft`                        | `{ id }`                                                              | room                            | (roster cleanup)                                                                             |
| `playerDisconnected`                | `socketId, username` (positional!)                                    | broadcast (all)                 | `opponents/RemoteOpponents.tsx`                                                            |
| `playerMoved`                       | `{ id, userId, username, position, velocity, cameraDirection }`       | nearby (grid-filtered)          | `opponents/RemoteOpponents.tsx`                                                            |
| `playerShot`                        | `{ id, rayOrigin, rayDirection }`                                     | nearby (grid-filtered)          | `opponents/RemoteOpponents.tsx` — tracer VFX only, never the hit itself                   |
| `hit`                               | `{ rayOrigin, health }`                                               | victim only                     | `gameInfo/GameInfo.tsx`, `player/HitImpact.tsx` — **authoritative health**        |
| `hitBlocked`                        | `{ rayOrigin }`                                                       | victim only                     | (blocked-shot spark VFX, victim was invincible)                                              |
| `youHit`                            | `{ targetId }`                                                        | shooter only                    | `player/Gun.tsx` — drives the crosshair hit-marker                                        |
| `playerHitReaction`                 | `{ targetId }`                                                        | room                            | `opponents/RemoteOpponents.tsx` — visible hit-react on the target's avatar                |
| `youDied`                           | `{ message }`                                                         | victim only                     | `app/forest/[id]/page.tsx`                                                                 |
| `playerDead`                        | `{ killerSocketId, victimSocketId, killerName, victimName }`          | room                            | `app/forest/[id]/page.tsx`, `opponents/RemoteOpponents.tsx`, `gameInfo/Scoreboard.tsx` |
| `playerRespawned`                   | `{ id, position }`                                                    | room                            | `gameInfo/GameInfo.tsx`                                                                    |
| `healthRegen`                       | `{ id, health }`                                                      | healing player only             | `gameInfo/GameInfo.tsx`                                                                    |
| `abilityActivated`                  | `{ id, invincibleUntil, abilityCooldownUntil }`                       | room                            | `gameInfo/GameInfo.tsx`, `opponents/RemoteOpponents.tsx` (shield VFX)                    |
| `abilityOnCooldown`                 | `{ remainingMs }`                                                     | caller only                     | (ability UI feedback)                                                                        |
| `gameOver`                          | —                                                                      | room                            | `app/forest/[id]/page.tsx`                                                                 |
| `playerWalking` / `playerStopped` | `{ userId }`                                                          | broadcast (relay)               | `opponents/RemoteOpponents.tsx` (footstep audio/anim)                                      |
| `receiveMessage`                    | `{ userId, message }`                                                 | room                            | `gameInfo/GameInfo.tsx` (chat)                                                             |
| `updateForest`                      | `{ id, position }`                                                    | (server-pushed world event)     | `ground/Ground.tsx`                                                                        |
| `pong-check`                        | `clientTime: number`                                                  | caller only                     | `app/forest/[id]/page.tsx` (ping display)                                                  |

**Known asymmetry:** `playerDisconnected` is emitted with **positional args**
(`socket.id, socket.username`), while every other event in this table is a single object payload —
if you add a listener for it, don't destructure it like the others.

### REST endpoints

| Method & path               | Auth                  | Handler                               | Purpose                                                                                                                  |
| --------------------------- | --------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `GET /game/onlinePlayers` | none                  | `GameController.getOnlinePlayers`   | `{ players: number }` — backs a lobby counter                                                                         |
| `GET /profiles/me`        | `SupabaseAuthGuard` | `ProfilesController.getOwnProfile`  | Caller's own profile, id from verified token                                                                             |
| `GET /profiles/:userId`   | `SupabaseAuthGuard` | `ProfilesController.getProfile`     | Any player's public profile (rank/K-D viewing)                                                                           |
| `PATCH /profiles/me`      | `SupabaseAuthGuard` | `ProfilesController.updateUsername` | Update own username                                                                                                      |
| `GET /api/data`           | none (client-local)   | `client/app/api/data/route.ts`      | Next.js route handler serving vegetation placement data to the client's own forest scene — never touches`server-nest` |

CORS for both REST (`main.ts` → `app.enableCors`) and socket.io (`game.gateway.ts` →
`@WebSocketGateway({ cors: ... })`) independently allow-list the same three origins
(`http://localhost:3000`, `https://vynix-kohl.vercel.app`, `https://zentra-io.vercel.app`) with
`credentials: true` — **both configs must be kept in sync**; a `'*'` origin can never be combined
with `credentials: true`, so a new deploy domain needs updating in two places.

---

## 5. Full request lifecycles

### 5a. Matchmaking → a live match

```
Client                                          Server
──────                                          ──────
app/page.tsx: signInAnonymously() or login
socket.connect() (auth token now available)
                                          ──────► GameGateway.handleConnection
                                                    verify token, findOrCreate profile,
                                                    SocketStateService.add
socket.emit('requestMatchmaking', username)
                                          ──────► GameGateway.handleRequestMatchmaking
                                                    emit 'searchingForMatch'
                                                    RoomsService.findAvailableRoom()
                                                      ├─ room exists → joinSocketToRoom (below)
                                                      └─ none → addToWaitPool
                                                           poolCount < 1 (MIN_PLAYERS_TO_START)?
                                                             → 'waitingForPlayers' (never actually
                                                               true since min is 1 — a solo
                                                               player always proceeds)
                                                           else:
                                                             RoomsService.createRoom()
                                                             drainPool() → joinSocketToRoom() per
                                                               socket
                                                             BotsService.fillRoom(roomId, 5, ...)
                                                               → trickles bots in over several
                                                                 seconds, each running the FSM
                                                             CombatService.startRegen(roomId, ...)
                                                             RoomsService.setRoomStart(...)
                                                             emit 'gameStarted' to room
                                                             RoomsService.scheduleGameEnd(
                                                               roomId, onExpiry, 10 * 60_000)

joinSocketToRoom (per player):
                                          ◄────── MatchmakingService.enrollPlayer
                                                    → PhysicsService.getSpawnPosition (safe, ≥70
                                                      units from other players)
                                                    → PlayersService.setPlayerInRoom (Redis)
                                                    → PhysicsService.updatePlayerCell (grid)
                                                  socket.join(roomId)
'spawnPoint', 'roomAssigned',
'gameStarted' (if room already
running), 'roomSnapshot'          ◄──────
router.push('/forest/[roomId]')

Every other player in room       ◄────── 'playerJoined' (spawn position, not (0,0,0))
```

### 5b. Movement tick (every frame the position changes meaningfully)

```
TPP.tsx (client player controller)
  computes new position/velocity/cameraDirection from input + physics
  socket.emit('updatePositionAndCamera', { position, velocity, cameraDirection, roomId })
                                          ──────► GameGateway.handleUpdatePositionAndCamera
                                                    MovementService.process(...)
                                                      PlayersService.updatePlayerInRoom (Redis)
                                                      PhysicsService.updatePlayerCell (grid)
                                                      PhysicsService.recordPosition (lag-comp
                                                        history buffer, 400ms window)
                                                    → nearbySocketIds (3×3 grid cells)
'playerMoved' to each nearby id  ◄──────
RemoteOpponents.tsx interpolates
Opponent.tsx dead-reckons/corrects
```

Bots run through the **identical** `MovementService.process` call from `BotsService.tickBot` —
there is no separate bot movement path, which is why bots are subject to the same grid/broadcast
rules (and the same server authority) as real players.

### 5c. A shot, start to finish

```
Gun.tsx: raycast from camera, build { rayOrigin, rayDirection, muzzleOrigin }
  socket.emit('shoot', { userId, shootObject, roomId })
                                          ──────► CombatService.handleShoot(shooter, roomId, shot, server)
                                                    emit 'playerShot' to nearby (tracer VFX only)
                                                    for real shooters: rewind target position via
                                                      PhysicsService.getPositionAt(targetId,
                                                        now - 500ms)  ← lag compensation
                                                    for each other player in room:
                                                      rayIntersectsVerticalCapsule(...)
                                                        → miss? skip
                                                      isPathOccluded(...) — terrain, tree canopy,
                                                        top-canopy crown, trunk cylinder
                                                        → occluded? skip (hill/tree blocked it)
                                                      target invincible? emit 'hitBlocked', skip
                                                      else: -10 health (Redis hIncrBy), stamp
                                                        lastHitAt (resets regen clock)
'hit' { rayOrigin, health }      ◄────── (victim only — authoritative health, not client-guessed)
'playerHitReaction'              ◄────── (room — visible hit-react)
'youHit'                          ◄────── (shooter only — crosshair marker)
                                                    health <= 0?
                                                      tryKill: Redis WATCH/MULTI, 3 retries
                                                        (prevents double-kill on simultaneous hits)
'youDied'                         ◄────── (victim)
'playerDead'                      ◄────── (room — kill feed)
                                                    scheduleRespawn (5s) → new spawn point,
                                                      full health, isDead=false
'spawnPoint', 'playerRespawned'  ◄────── (after 5s)
```

### 5d. Game over → durable stats

```
RoomsService.scheduleGameEnd's setTimeout fires (10 min after room creation)
  onExpiry callback (set up in GameGateway.handleRequestMatchmaking):
    read all room players from Redis (BEFORE Redis state is wiped)
    filter out bots → results: [{ userId, kills, deaths }]
    BotsService.stopRoom, CombatService.stopRegen
    emit 'gameOver' to room
    if results.length > 0:
      ProfilesService.recordMatchResults(results)
        → for each real player: increment totalKills/totalDeaths/matchesPlayed
          on their `profiles` Postgres row (TypeORM)
  RoomsService.removeRoom(roomId) — wipes ALL Redis state for this room
```

This is the only point where per-match Redis state and durable Postgres state touch. If a server
process crashes before this timer fires, **the match's stats are lost** — `scheduleGameEnd` is an
in-process `setTimeout`, not a persisted job; a restart forgets it entirely (see §8, known gaps).

---

## 6. Shared code: `shared/treeConstants.ts`

The only file both `client/` and `server/` literally import (not duplicate — actually the same
module on disk, imported by relative path from each). It defines the geometry constants for tree
canopy/trunk colliders (`CANOPY_PLATE_RADIUS`, `TRUNK_COLLIDER_RADIUS`, etc.) so that:

- **Client** (`Tree.tsx`, `TreeColliders` in `TPP.tsx`) uses them to render trees and resolve real
  player movement collision against trunks/canopies.
- **Server** (`PhysicsService.loadCanopies`) uses the exact same constants to build world-space
  canopy ellipsoids and trunk cylinders from `client/public/POS.json` (yes — the server reads a
  file that lives under `client/`, see below) for shot occlusion and bot line-of-sight/pathing.

If a shot passes through what looks like solid tree cover, or a hill occludes shots inconsistently
with how it renders, check that `shared/treeConstants.ts` and the terrain height formula in
`server/src/game/terrain/terrain.service.ts` are still byte-for-byte in sync with their client
counterparts (`Ground.tsx`'s height function) — these are the two places where client rendering
and server authority are required to independently compute the *same* answer, with zero wire sync
between them.

**`server/src/game/physics/physics.service.ts` reads `client/public/POS.json` directly off disk**
at startup (tries three candidate relative paths to survive both `ts-node` dev runs and a built
`dist/` deploy). This is a real cross-package filesystem dependency, not just a shared-types
import — if `client/public/POS.json` doesn't exist or moves, server-side tree occlusion silently
stops working (a startup warning logs why, nothing else breaks).

---

## 7. Data stores

| Store                                                                     | What lives there                                                                                                                                                                                                                                     | Lifetime                                                                                                    | Written/read by                                                          |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Redis**                                                           | `rooms` SET, `roomPlayers:{roomId}` SET, `roomMeta:{roomId}` HASH (start time/duration), `player:{roomId}:{socketId}` HASH (position/velocity/health/kills/deaths/etc, bots included), `waitPool` SET                                      | Per-match — wiped by`RoomsService.removeRoom` at game-over                                               | `RedisService` wrapper, used by every game/* service                   |
| **Postgres** (`profiles` table, Supabase-hosted)                  | One row per Supabase Auth user:`id` (= Supabase `sub`), `username`, `totalKills`, `totalDeaths`, `matchesPlayed`, `rank`, `createdAt`                                                                                                | Durable — survives every match/restart                                                                     | `ProfilesService` via TypeORM (`DatabaseModule`)                     |
| **In-process memory (server)**                                      | Spatial proximity grid (`PhysicsService.grid`), per-socket position history for lag comp (`positionHistory`), tree canopy/trunk obstacle lists, bot FSM state (`BotsService.botStates`/`botTargets`), regen/bot tick `setInterval` handles | Until process restart —**none of this survives a restart or works across multiple server instances** | `PhysicsService`, `BotsService`, `CombatService`                   |
| **Supabase Auth** (hosted, separate from the app's Postgres tables) | User accounts/sessions (including anonymous), JWTs                                                                                                                                                                                                   | Managed by Supabase                                                                                         | `client/lib/supabase.ts`, `server/src/auth/*`                        |
| **`client/public/POS.json`**                                      | Baked vegetation placement (tree positions/rotations/scale) generated at build/content time                                                                                                                                                          | Static asset                                                                                                | Client renders from it; server reads it directly for occlusion (see §6) |

**The in-memory grid is the load-bearing scaling limit of this whole architecture**: `PhysicsService`'s
spatial grid and lag-compensation history are plain JS `Map`s inside one Node process.
Running more than one `server-nest` instance (for horizontal scaling) would silently break
proximity broadcasts and hit detection for players split across instances — there's no
cross-instance sync for this state. Redis holds the durable player data, but not the grid.

---

## 8. Bots — how they fit into the real-time loop

Bots are not a separate simulation bolted on the side — they are ordinary `Player{ isBot: true }`
Redis records with **no socket and no `SocketStateService` entry**, driven by a per-room
`setInterval` (`BotsService`, 250ms tick) that calls the *exact same*
`MovementService.process` / `CombatService.handleShoot` functions a real client's socket events
would trigger. This is why bots are bound by identical physics, hit detection, and broadcast rules
as real players — a bot's shot goes through the same lag-comp/occlusion/capsule-hitbox pipeline
described in §5c (minus the lag-compensation rewind, since a bot's ray is built same-tick).

Each bot runs an independent 5-state FSM (`ROAMING` → `HUNTING` → `ENGAGED` → `FLEEING` →
`HEALING`), with per-bot randomized traits (move speed, engagement radius, reaction delay, fire
cooldown, aim error) seeded at spawn so a room of bots doesn't move/fire/retarget in lockstep.
Full behavioral detail is in `server/MODULE_MAP.md`'s `BotsService` section — the point for this
doc is: **from the client's perspective, a bot is indistinguishable from a real player** (same
events, same payload shapes, `BOT_ID_PREFIX` even renders as `Guest_` in production) — there is no
bot-specific code anywhere in `client/`.

---

## 9. Known architectural gaps (worth knowing before you build on top of these)

- **No horizontal scaling.** §7 — the spatial grid, position history, and bot state are all
  single-process memory. Scaling past one server instance needs this moved to Redis or a shared
  store first.
- **Match timers don't survive a restart.** `RoomsService.scheduleGameEnd` is a plain
  `setTimeout` — a crash mid-match loses the game-over timer, the eventual `gameOver` emit, and
  the stats flush to Postgres for that match.
- **Real player Y is client-authoritative.** `TerrainService`/terrain occlusion is only used for
  bots and shot-occlusion math — a modified client could in principle report an off-terrain
  position; there's no server-side rejection of impossible positions today.
- **No matchmaking skill/region logic.** `RoomsService.findAvailableRoom` just returns the first
  room under the player cap; `MIN_PLAYERS_TO_START = 1` means a solo player always gets a room
  immediately (filled with bots), so there's effectively no "waiting for players" state in
  practice despite the event existing.
- **`rank` on `Profile` is unused.** Column exists, nothing computes or writes it yet.
- **Shot-diagnostics tooling exists but is disabled by default** (`CombatService`,
  `PhysicsService.describeOcclusion`) — a per-shot JSONL tracer, commented out because it costs a
  synchronous disk write per shot. It's the fastest path to re-diagnosing a hit-detection
  regression; see the inline comments in `combat.service.ts` for how to re-enable it.
- **`GameService`'s startup self-test prints a stale "not yet implemented" list** — it still
  claims no auth, no stats persistence, no REST controllers exist. All three are now built. Trust
  the code (and this doc), not that printout.
- **`GameLoggerService` is dead code** — defined, never injected anywhere.

---

## 9b. Client-only systems (never touch the server — no event, no packet)

These are real gameplay systems that live entirely in `client/`, verified by reading
`TPP.tsx`/`Gun.tsx`/`Opponent.tsx` directly — they don't appear in §4's event table because they
generate no network traffic at all. Listed so nothing is missing from this map.

- **Local movement collision & rebound** (`TPP.tsx`) — a depth-based, multi-pass (5 passes)
  contact resolver against the scene's `obstacles` array (trees, rocks, terrain), fully
  client-side. A domed canopy top is walkable (upward-facing normal → grounded, no braking); a
  wall-like contact slides along the tangential component; a genuine head-on hit into a tree trunk
  (`object.name === 'tree'`, closing speed > `TRUNK_REBOUND_MIN_SPEED`) triggers a hard rebound +
  `INPUT_BLOCK_DURATION` (0.4s) input lock + `hitWood` sound. None of this is validated or
  mirrored server-side beyond the equivalent trunk/canopy math `PhysicsService` uses for
  *occlusion* (§5c) — a determined client could walk through walls without the server ever
  knowing, since the server only cares whether a reported position is a valid shot origin, not
  whether it was reachable by legal movement.
- **Grenades** (`Fireball.tsx`/`Explosion.tsx`, spawned from `TPP.tsx`'s `handleFireballShoot`,
  bound to the grenade key) — purely a client-local visual/physics prop with a 5s cooldown
  (`grenadeCoolDownRef`). **No socket event exists for it at all** — it is not visible to other
  players, does not damage anyone, and the server has no concept of it. Don't assume grenade
  damage/visibility works multiplayer-wide; it currently doesn't.
- **Sniper scope / FOV zoom** (`TPP.tsx`) — right-mouse-held ADS narrows the camera's FOV through
  discrete stops (`lib/scope.ts`'s `ZOOM_LEVELS`), scroll-adjustable while scoped. This also thins
  scene fog density and scales mouse sensitivity down with magnification. Entirely a camera/HUD
  effect — the aim ray Gun.tsx fires is always `camera.getWorldDirection()`, so FOV change doesn't
  affect where a shot actually goes, and none of it is sent to or known by the server.
- **Camera pivot / aim-ray coupling** (`TPP.tsx`) — third-person "boom" camera orbits a pivot at
  `smoothedHead + cameraHeight`, with `forward` built directly from mouse angles (not
  `lookAt(player)`), specifically so the camera's forward axis, the on-screen crosshair, and the
  ray `Gun.tsx` sends to the server as `shootObject.rayOrigin`/`rayDirection` are always the exact
  same vector. The in-code comments flag this was previously broken (camera aimed *at* the player,
  which put ~26.6° of unintended downward pitch into every "level" shot) — if shots ever start
  visibly diverging from the crosshair again, this coupling is the first thing to check.
- **Opponent dead reckoning** (`Opponent.tsx`) — a remote player is never snapped directly to
  server positions. It continuously self-integrates its last known velocity every frame, and each
  new `playerMoved` snapshot only nudges (`CORRECTION_RATE = 6`/sec lerp) the extrapolated position
  toward the fresh server truth, so motion reads as continuous regardless of the ~jittery
  broadcast tick. Past `MAX_DEAD_RECKON_MS` (600ms) since the last packet, extrapolation is capped
  so a lagging opponent holds position instead of drifting away indefinitely. Real players are
  culled from rendering entirely past 40 units from the local player (`setVisible` distance check)
  — a client-side draw-distance optimization, unrelated to the server's proximity grid, which
  governs *network* fan-out (§7) rather than what gets drawn.
- **Local vs. shared player radius** — `TPP.tsx` uses its own `PLAYER_COLLISION_RADIUS = 1.2` for
  local movement collision, deliberately distinct from the shared `PLAYER_RADIUS = 1`
  (`types/types.ts`, mirrored server-side in `players.types.ts`) that shot detection and opponent
  rendering use — a slightly fatter local capsule avoids visual clipping into geometry. If you're
  chasing a "shots feel like they should hit but don't near obstacles" bug, don't conflate these
  two constants.
- **Players never block each other** (`Opponent.tsx`, explicit comment in source) — opponents are
  deliberately *not* registered in the shared `obstacles` array `Gun.tsx`/`TPP.tsx` raycast/collide
  against, so players walk through each other freely and shooting a player produces no local
  impact-particle VFX (those only fire on a raycast hit against `obstacles`). This has zero effect
  on actual hit registration, which is entirely server-side sphere/capsule intersection
  (`CombatService.handleShoot`) — a client never raycasts against other players for damage
  purposes, only for the cosmetic impact-spark decision.
