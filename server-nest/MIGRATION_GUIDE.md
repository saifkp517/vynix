# Vynix Migration Guide: Bun/Express → NestJS

> **Document Status:** Living knowledge base — updated as understanding evolves.
> **Codebase is authoritative.** This document reflects verified findings, not assumptions.

---

## 1. System Overview (Verified Against Code)

Vynix is a multiplayer 3D shooter. The server handles:

- Session-based authentication (cookie + PostgreSQL sessions, NOT JWT)
- WebSocket-driven real-time gameplay (Socket.io)
- Redis as the hot state store for all in-game data
- PostgreSQL as cold storage for user progression
- Server-side combat validation (raycasting)
- Matchmaking with a waiting pool

### Deployment Topology

The legacy server runs as **two separate processes** managed by PM2:

| Process          | Port | Entry Point                       |
| ---------------- | ---- | --------------------------------- |
| REST API         | 3001 | `server/rest-api/index.ts`      |
| WebSocket Server | 4000 | `server/socket-server/index.ts` |

The NestJS migration combines both into one process on port 4000.

---

## 2. Legacy System: Verified Architecture

### 2.1 Redis Key Schema

```
onlinePlayers               → List  (socket IDs — used as a counter, not accurate lookup)
rooms                       → Set   (room UUIDs)
waitPool                    → Set   (socket IDs awaiting matchmaking)
roomPlayers:{roomId}        → Set   (socket IDs in that room)
player:{roomId}:{socketId}  → Hash  (full player state)
```

Player hash fields: `socketId`, `userId`, `room`, `position`, `velocity`, `cameraDirection`, `username`, `isDead`, `kills`, `deaths`, `health`.

Vectors (`position`, `velocity`, `cameraDirection`) are stored as JSON strings.

### 2.2 PostgreSQL Schema (Verified)

```
User           → Core identity + lifetime stats (totalKills, totalDeaths, totalMatches, winCount, xp, level, coins, rank)
Session        → Server-side session (id, userId, expiresAt)
Match          → Match record (id, winnerId)
MatchPlayer    → Per-player match stats (killCount, deathCount, kd)
Friendship     → Social graph (requester, recipient, status: PENDING/ACCEPTED/REJECTED)
```

**Critical gap:** The game-over handler only updates `User.totalKills/Deaths/Matches`. The `Match` and `MatchPlayer` tables are never written to. `winCount`, `xp`, `level`, `coins`, and `rank` are schema fields that are never updated by any game code.

### 2.3 Complete Socket Event Protocol

**Client → Server:**

| Event                       | Payload                                         | Handler                                                       |
| --------------------------- | ----------------------------------------------- | ------------------------------------------------------------- |
| `requestMatchmaking`      | `username: string`                            | `handleMatchmaking`                                         |
| `cancelMatchmaking`       | —                                              | `cancelMatchmaking` (**BUG: never fires — see §4**) |
| `updatePositionAndCamera` | `position, velocity, cameraDirection, roomId` | `handleUpdatePositionAndCameraUpdate`                       |
| `shoot`                   | `{ userId, shootObject, roomId }`             | `handleShoot`                                               |
| `sendMessage`             | `{ roomId, userId, message }`                 | Inline broadcast                                              |
| `ping-check`              | `clientTime`                                  | Echoes`pong-check`                                          |
| `playerWalking`           | `{ userId }`                                  | Broadcast to all                                              |
| `playerStopped`           | `{ userId }`                                  | Broadcast to all                                              |
| `disconnect`              | —                                              | `leaveRoom`                                                 |

**Server → Client:**

| Event                    | Recipient             | Payload                                                                 |
| ------------------------ | --------------------- | ----------------------------------------------------------------------- |
| `userId`               | socket                | `userId: string`                                                      |
| `searchingForMatch`    | socket                | —                                                                      |
| `roomAssigned`         | socket                | `{ roomId }`                                                          |
| `roomSnapshot`         | socket                | `{ roomPlayers: Record<socketId, Player> }`                           |
| `playerJoined`         | room                  | `{ id, username, position, velocity, health, kills, deaths, isDead }` |
| `spawnPoint`           | socket                | `Vector3`                                                             |
| `playerMoved`          | nearby players (grid) | `{ id, userId, username, position, velocity, cameraDirection }`       |
| `playerShot`           | nearby players (grid) | `{ id, rayOrigin, rayDirection }`                                     |
| `hit`                  | victim socket         | `{ rayOrigin }`                                                       |
| `youDied`              | victim socket         | `{ message }`                                                         |
| `playerDead`           | room                  | `{ killerSocketId, victimSocketId, killerName, victimName }`          |
| `playerRespawned`      | room                  | `{ id, position }`                                                    |
| `gameOver`             | room                  | —                                                                      |
| `playerLeft`           | room                  | `{ id }`                                                              |
| `playerDisconnected`   | **all sockets** | `socketId, username`                                                  |
| `waitingForPlayers`    | socket                | `{ count }`                                                           |
| `playerPoolCount`      | broadcast             | `count: number`                                                       |
| `cancelledMatchmaking` | socket                | —                                                                      |
| `receiveMessage`       | room                  | `{ userId, message }`                                                 |

**Note:** The client also uses `offer`, `answer`, `iceCandidate` for WebRTC signaling, but WebRTC is currently NOT the movement transport. Socket.io is the target for movement. WebRTC code exists in the client but is not wired to server handlers.

### 2.4 Spatial Partitioning (In-Memory Grid)

- World divided into cells using `Math.floor(x / 100)` and `Math.floor(z / 100)` — 100-unit cells.
- Stored in a module-level `Map<string, Set<string>>` (`grid`) in `redisControllers.ts`.
- Movement events broadcast only to players in the 3×3 block of adjacent cells around the sender.
- **Critical weakness:** The grid lives in process memory. It cannot be shared across server instances. Any horizontal scaling breaks spatial partitioning.
- **Constant mismatch:** `CELL_SIZE = 200` is defined but `getCellKey` uses hardcoded `100`. The constant is unused and wrong.

### 2.5 Combat (Raycasting) — Verified Logic

1. `handleShoot` receives `{ userId, shootObject, roomId }` from the client.
2. Fetches all players in the room (N sequential Redis calls).
3. For each player: constructs a `Vector3` from stored position, adjusts `y - 1.5` for hitbox center.
4. Calls `rayIntersectsSphere(rayOrigin, rayDirection, playerCenter, PLAYER_RADIUS=1)`.
5. On hit: `hIncrBy(playerKey, 'health', -10)` atomically.
6. Death check: if `newHealth <= 0`, uses Redis `WATCH/MULTI` optimistic locking to atomically set `isDead = true`, preventing double-kill races.
7. Respawn: `setTimeout(5000)` to reset health/position in Redis and emit `spawnPoint`/`playerRespawned`.

### 2.6 Matchmaking Flow (Verified)

Two code paths based on whether an available room exists:

**Path A — Room Exists:**

1. Call `findAvailableRoom()` (scans all rooms, finds one with `2 ≤ count < MAX_PLAYERS`).
2. Add player to room directly (skip waitPool).
3. Emit `roomAssigned` and `roomSnapshot` to new player.
4. Emit `playerJoined` to existing room members.

**Path B — No Room Available:**

1. Add socket to `waitPool`.
2. If `waitPool.size >= MIN_PLAYERS_TO_START (2)`:
   - Create new room via `createRoom()`.
   - `sPopCount` all players from pool.
   - Add all to room set and call `setPlayerInRoom` for each.
   - Emit `roomAssigned`/`roomSnapshot`/`playerJoined` for each.
3. If not enough players: emit `waitingForPlayers`.

**Game timer:** `createRoom` sets a `setTimeout(60000)` for game-over. On expiry:

- Updates `User` stats in Postgres for non-guest players.
- Emits `gameOver` to room.
- Cleans up Redis keys.

### 2.7 Authentication Flow

1. Client connects with `withCredentials: true` — sends session cookie.
2. Socket server reads `session_id` from `socket.handshake.headers.cookie`.
3. Makes an **internal HTTP GET to `localhost:3001/auth/me`** to validate (self-referential call between processes).
4. On success: sets `socket.userId` and `socket.username`.
5. On failure or no cookie: assigns guest identity (`guest-{uuid}`, `Guest_{uuid}`).

Guest players are excluded from stats persistence at game-over (`userId.startsWith("guest-")`).

---

## 3. Bugs Discovered in Legacy Server

These are verified bugs in `server/`, not assumptions.

### BUG-01 — Critical: Authenticated Users Have No Event Handlers

**File:** `socket-server/handlers/connectionHandler.ts`, line 51

```typescript
if (sessionId) {
  validateSession(sessionId).then(...).catch(...);
  return;  // ← EARLY RETURN
}

assignGuest(socket);

// Event handlers registered here — NEVER reached for authenticated users
socket.on("requestMatchmaking", ...);
socket.on("shoot", ...);
// etc.
```

When a session cookie is present, the function returns before registering any event handlers. Only guest sockets (`assignGuest`) have handlers registered. **Authenticated players cannot participate in any game events.**

Either the `return` must be removed and handlers registered inside the `.then()` callback, or the handler registration must be moved above the auth block.

---

### BUG-02 — Critical: `cancelMatchmaking` Listener Does Not Fire

**File:** `socket-server/handlers/connectionHandler.ts`, line 82

```typescript
socket.on("cancelMatchmaking", () => cancelMatchmaking)  // ← returns reference, never calls
```

Should be:

```typescript
socket.on("cancelMatchmaking", () => cancelMatchmaking(socket, io))
```

---

### BUG-03 — High: `distance3D` Missing `** 2` on Z Component

**File:** `redis/redisControllers.ts`, line 29–32

```typescript
function distance3D(a: Vector3, b: Vector3) {
  return Math.sqrt(
    (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z)  // ← z not squared
  )
}
```

This makes spawn safety distances computed in `getSafeSpawnLocation` incorrect. Players may spawn closer or farther than intended.

---

### BUG-04 — High: `handleShoot` Broadcasts `playerShot` Inside Player Loop

**File:** `redis/redisControllers.ts`, around line 534

`broadcastToNearbyPlayers` is called **inside** the `for (const [playerId, player] of ...)` loop. If a room has N players, the `playerShot` event is emitted N times to nearby players. It should be called once, before the loop.

---

### BUG-05 — High: `handleShoot` — Shooter Identity Mismatch

**File:** `redis/redisControllers.ts`, line 513

```typescript
if (playerId === userId) continue; // Skip the shooter
```

`playerId` is a **socket ID** (from `roomPlayers` set). `userId` is what the **client** sends in the payload — the client sends `socket.id` here (see TPP.tsx), so this may coincidentally work, but it's architecturally wrong and fragile. If the client ever sends an actual `userId` UUID, shooters will not be excluded and can hit themselves.

---

### BUG-06 — Medium: `gameRoutes.ts` Missing `await`

**File:** `rest-api/routes/gameRoutes.ts`, line 13

```typescript
const rooms = getAllRooms();  // ← missing await, returns Promise, not rooms
res.status(200).json({ rooms: rooms });
```

`getAllRooms` is `async`. The response always contains a Promise object, never actual room data.

---

### BUG-07 — Medium: `getAllRooms` Returns Wrong Structure

**File:** `redis/redisControllers.ts`, line 280–283

```typescript
rooms.push("players", playerCount);  // ← pushes two separate values, not an object
```

Should be `rooms.push({ roomId, playerCount })`.

---

### BUG-08 — Medium: `deleteOnlinePlayer` / `leaveRoom` Ignore Player Identity

**File:** `redis/redisControllers.ts`, line 201–203 and line 657

Both `deleteOnlinePlayer` and `leaveRoom` call `lPop(ONLINE_PLAYERS_KEY)` which pops the **first** element from the list, ignoring which player is leaving. The `onlinePlayers` list is not a reliable count and can become corrupted over time.

---

### BUG-09 — Low: `playerJoined` Broadcasts Wrong Initial Position

**File:** `redis/redisControllers.ts`, line 424–434

When a new player joins an existing room, `playerJoined` broadcasts `position: player.position` which is `new Vector3(0, 0, 0)` — the pre-spawn default. The actual spawn position is set by `setPlayerInRoom` (which emits it directly to the player). Other room members see the new player at origin, not their real spawn.

---

### BUG-10 — Low: `CELL_SIZE` Constant Is Unused and Wrong

**File:** `redis/redisControllers.ts`, line 16

`CELL_SIZE = 200` but `getCellKey` divides by `100`. The constant is never referenced.

---

### BUG-11 — Low: Duplicate Imports / Unused Imports

**File:** `redis/redisControllers.ts`, line 13 — `import { idText } from "typescript"` (unused)
**File:** `socket-server/handlers/connectionHandler.ts`, line 11 — `import { assign } from "three/tsl"` (unused)

---

### BUG-12 — Low: Matchmaking Race Condition

Between `sCard(waitPool)` and `sPopCount(waitPool, count)`, the pool can grow. Additionally, concurrent `handleMatchmaking` calls (two players hitting the button simultaneously) can both observe `poolCount >= MIN_PLAYERS_TO_START` and both create rooms, splitting the pool. Severity depends on traffic; low risk at small scale.

---

## 4. NestJS Migration: Current State

### 4.1 What Is Implemented

| Module                             | Status      | Notes                                                                                    |
| ---------------------------------- | ----------- | ---------------------------------------------------------------------------------------- |
| `RedisModule` / `RedisService` | ✅ Complete | ioredis wrapper with all needed operations                                               |
| `PlayersService`                 | ✅ Complete | serialize/deserialize, CRUD,**pipeline for batch reads** (improvement over legacy) |
| `RoomsService`                   | ✅ Partial  | createRoom, getAllRooms, findAvailableRoom — no game timer                              |
| `SocketStateService`             | ✅ Complete | In-memory socket map                                                                     |
| `GameGateway`                    | ✅ Skeleton | Connection/disconnect, ping/pong, debug:connections,`room:join` stub                   |
| `GameLoggerService`              | ✅ Complete | NestJS Logger wrapper                                                                    |

### 4.2 What Is NOT Implemented

| Feature                                                    | Status                                           |
| ---------------------------------------------------------- | ------------------------------------------------ |
| Auth/session validation on WebSocket connect               | ❌ Missing                                       |
| Guest identity assignment                                  | ❌ Missing                                       |
| Matchmaking logic                                          | ❌ Missing (`matchmaking.service.ts` is empty) |
| Movement handling (`updatePositionAndCamera`)            | ❌ Missing                                       |
| Spatial partitioning (grid or Redis GEO)                   | ❌ Missing                                       |
| Combat (`shoot` / `hit` / `youDied` / death/respawn) | ❌ Missing                                       |
| Game lifecycle timer (gameOver)                            | ❌ Missing                                       |
| Prisma integration                                         | ❌ Empty file (`prisma.service.ts` is blank)   |
| Stats flush to DB at game-over                             | ❌ Missing                                       |
| REST API (auth, game endpoints)                            | ❌ Missing entirely                              |
| Chat (`sendMessage`)                                     | ❌ Missing                                       |
| WebRTC signaling stubs                                     | ❌ Missing (planned but not current goal)        |

### 4.3 Differences from Legacy (Intentional)

| Concern                   | Legacy                                     | NestJS           | Note                                           |
| ------------------------- | ------------------------------------------ | ---------------- | ---------------------------------------------- |
| Redis client              | `redis` (node-redis)                     | `ioredis`      | Different library, different connection config |
| `getAllPlayersFromRoom` | Sequential per-player`hGetAll`           | Pipeline batch   | **NestJS is better**                     |
| `MAX_PLAYERS`           | 50                                         | 20               | Intentional reduction or oversight?            |
| CORS origin               | Allowlist (`localhost:3000`, Vercel URL) | `*` (wildcard) | **Security regression in NestJS**        |
| Two processes             | REST on 3001, Socket on 4000               | Single process   | Architectural consolidation                    |

---

## 5. Module Ownership Map

This resolves ambiguities found when comparing legacy handler responsibilities against proposed module boundaries.

### 5.1 Service Responsibility Table

| Responsibility                                       | Owner                                           | Rationale                                                                              |
| ---------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| Player state CRUD (position, health, kills, deaths)  | `PlayersService`                              | Core domain data — already implemented                                                |
| Serialize/deserialize Redis ↔ Player objects        | `PlayersService`                              | Encapsulated within service                                                            |
| `getSafeSpawnLocation`                             | `PhysicsService`                              | Spatial reasoning, not player data management; consumed by both matchmaking and combat |
| `rayIntersectsSphere`                              | `PhysicsService`                              | Pure math, consumed by combat                                                          |
| `getCellKey`                                       | `PhysicsService`                              | Spatial math                                                                           |
| In-memory grid (cell tracking)                       | `PhysicsService`                              | Owns all spatial state                                                                 |
| Movement orchestration (update → grid → broadcast) | `MovementService` (in `GameModule`)         | Thin coordinator; calls`PlayersService` + `PhysicsService`                         |
| `playerMoved` broadcast                            | `GameGateway`                                 | Only service with access to`io.to().emit()`                                          |
| Room lifecycle (create, timer, cleanup)              | `RoomsService`                                | Already implemented (timer missing — see §4.2)                                       |
| Matchmaking (pool management, room assignment)       | `MatchmakingService`                          | Currently empty — see §6 Phase 2                                                     |
| Online presence (connected socket count)             | `SocketStateService`                          | **Do not use Redis list** — see §5.2                                           |
| Socket identity (userId, username per socket)        | `GameGateway` or `AuthenticatedSocket` type | Set on`handleConnection`; needed by all handlers                                     |
| Session validation on connect                        | `PrismaService` via `handleConnection`      | Direct DB lookup; no internal HTTP needed                                              |
| Stats flush to DB at game-over                       | `RoomsService`                                | Triggered by game timer; uses`PrismaService`                                         |

### 5.2 Online Presence: Do Not Port the Redis List

The legacy `onlinePlayers` Redis list (`setOnlinePlayer`, `deleteOnlinePlayer`, `removeOnlinePlayers`, `getAllOnlinePlayers`) is broken and should not be ported.

Evidence:

- `deleteOnlinePlayer(id)` ignores the `id` argument and pops an arbitrary list entry (BUG-08)
- `getAllOnlinePlayers()` returns a count (`lLen`), not actual player data
- The list accumulates stale entries across disconnects

`SocketStateService` already tracks every connected socket accurately. The REST `/onlinePlayers` endpoint should read from `socketState.count()` instead. If cross-instance presence ever becomes necessary, replace this with a Redis SET (SADD on connect, SREM on disconnect) inside a new `PresenceService` — never a list.

### 5.3 Movement Handler: Why Three Owners

The legacy `handleUpdatePositionAndCameraUpdate` mixes three concerns:

```
1. Persist position/velocity/cameraDirection → Redis
2. Update the in-memory grid (old cell → new cell)
3. Broadcast playerMoved to nearby sockets
```

These cannot all live in one service without creating circular dependencies or a fat service:

- If `PlayersService` handles #1 and #2, it needs Socket.io server access for #3. PlayersService should not depend on the Gateway.
- If `GameGateway` handles all three, it becomes a god object. The Gateway should only translate socket events to service calls and emit results.

The solution is `MovementService` as a coordinator:

```
GameGateway receives "updatePositionAndCamera"
  → MovementService.process(socketId, roomId, position, velocity, cameraDirection)
      → PlayersService.updateTransform(roomId, socketId, { position, velocity, cameraDirection })
      → PhysicsService.updatePlayerCell(socketId, oldCellKey, newCellKey) → returns nearbySocketIds
      → returns { nearbySocketIds, updatedPlayer }
  → GameGateway emits "playerMoved" to each nearbySocketId
```

`MovementService` is not a standalone module — it lives in `GameModule` alongside `GameService`.

### 5.4 `getSafeSpawnLocation`: Why PhysicsService, Not PlayersService

The function reads player positions, but that doesn't make it a player concern. Its job is spatial reasoning: given occupied positions, find an unoccupied candidate. This is the same category of work as raycasting — it consumes player data as input but its logic is geometric.

It is called from two places with no domain in common:

- Matchmaking (player joins a room for the first time)
- Combat (player respawns after death)

A `PhysicsService` dependency is appropriate in both `MatchmakingService` and `CombatService`. A `PlayersService` dependency in `MatchmakingService` would be acceptable, but putting spawn logic there would leak spatial reasoning into the wrong abstraction.

---

## 6. Architectural Decisions Required Before Continuing

### Decision A: Spatial Partitioning Strategy

**Current state:** The legacy in-memory grid works for single-process. It cannot scale horizontally.

**Options:**

1. **Keep in-memory grid** — Simple. Port as-is to NestJS. Works for single instance. Fails if you ever run two server instances.
2. **Redis GEO commands** — `GEOADD` / `GEORADIUS`. Works across instances. Requires coordinate transformation (3D game uses x/z plane). `y` coordinate has no GEO analog — requires a workaround.
3. **Redis sorted sets (manual grid)** — Recreate the grid logic in Redis using sorted sets per cell. More complex than the GEO approach but explicit.

**Recommendation:** Unless horizontal scaling is needed in the near term, port the in-memory grid first to unblock other work. Document it as a known scaling constraint. Migrate to Redis GEO as a follow-up when the rest of the system is stable.

---

### Decision B: Auth on Socket Connect

**Current approach (legacy):** HTTP call from socket server to REST API (`localhost:3001/auth/me`). This adds latency to every WebSocket connection and creates a process dependency.

**Options:**

1. **Keep internal HTTP call** — Easy to port. Cross-process dependency. Fails if REST API is down.
2. **Direct Prisma session lookup** — Socket server validates session against DB directly. Removes process dependency. Requires Prisma in socket server.
3. **Shared session middleware** — Both REST and WebSocket use the same NestJS app. Single Prisma instance handles both. This is the NestJS idiomatic approach and makes sense since the migration is combining them.

**Recommendation:** Since NestJS is combining REST + WebSocket into one process, use a single PrismaService and validate sessions directly in a `WsAuthGuard` or in the `handleConnection` lifecycle hook. No internal HTTP needed.

---

### Decision C: REST API Port

The current NestJS `main.ts` starts on port 4000 (same as legacy socket server). The REST API is not yet present in NestJS.

Decide: should REST and WebSocket coexist on port 4000, or should REST remain on 3001 (or move to a different port)?

**Likely answer:** Coexist on 4000 in NestJS (using HTTP for REST and WebSocket on the same Nest application instance, which is the standard NestJS pattern). This simplifies deployment and nginx config.

---

### Decision D: `waitingForPlayers` Behavior vs. WebRTC Plans

When WebRTC is eventually introduced for movement, the signaling events (`offer`, `answer`, `iceCandidate`) need to be routed through Socket.io. The server needs to forward these between sockets. Plan for this — even though it is not the current focus, the handler stubs should be wired into the gateway when movement events are implemented, to avoid a second round of gateway changes.

---

## 6. Recommended Migration Sequence

This sequence prioritizes unblocking actual gameplay as fast as possible.

```
Phase 1: Foundation
  ├── Implement PrismaService (singleton, injected where needed)
  ├── Implement WsAuthGuard / handleConnection auth (session lookup via Prisma)
  └── Implement REST auth routes in NestJS (register, login, logout, /me, oauth)

Phase 2: Matchmaking
  ├── Implement MatchmakingService (port logic from legacy, fix BUG-01 through BUG-03)
  ├── Wire requestMatchmaking / cancelMatchmaking in GameGateway
  └── Implement game timer in RoomsService (and move stats flush here)

Phase 3: Movement
  ├── Port in-memory grid to NestJS (as a GridService or inside PlayersService)
  ├── Implement updatePositionAndCamera handler in GameGateway
  └── Wire broadcastToNearbyPlayers

Phase 4: Combat
  ├── Extract PhysicsService (rayIntersectsSphere, getCellKey, getSafeSpawnLocation)
  ├── Fix distance3D bug (BUG-03) in PhysicsService
  ├── Fix shoot broadcast loop (BUG-04) in CombatService
  └── Implement handleShoot in CombatService + wire to GameGateway

Phase 5: Cleanup
  ├── Fix MAX_PLAYERS inconsistency (50 vs 20)
  ├── Fix CORS (wildcard → allowlist)
  ├── Fix REST /rooms endpoint (BUG-06, BUG-07)
  └── Wire playerWalking / playerStopped / sendMessage
```

---

## 7. Migration Risks

| Risk                                                                                  | Severity           | Mitigation                                                                |
| ------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------- |
| BUG-01 (no handlers for auth users) must be fixed or it blocks all authenticated play | **Critical** | Fix before any other socket work                                          |
| Redis key schema must remain identical during transition (same key names)             | **High**     | NestJS already uses same keys — verify before connecting to shared Redis |
| `node-redis` vs `ioredis` API difference                                          | **Medium**   | NestJS wraps ioredis with camelCase methods — maintain this wrapper      |
| `CELL_SIZE` / grid constant discrepancy will cause confusion                        | **Low**      | Fix the constant when porting GridService                                 |
| Game timer`setTimeout` — process crash loses all active games                      | **Medium**   | Known tech debt. Accept for now; BullMQ migration is a later optimization |
| Stats persistence only updates User table — Match/MatchPlayer tables unused          | **Low**      | Decide if match history is needed before wiring stats flush               |

---

## 8. Known Unknowns

### KU-01: Which users actually play successfully today?

BUG-01 means authenticated users cannot use socket events. Is the game currently playable only as guest? Has this been noticed in production? This needs verification.

**How to verify:** Log into the game with a real account and check server logs for "requestMatchmaking" handler invocation.

---

### KU-02: Is the `updatePositionAndCamera` socket event actively used?

The client (`TPP.tsx`) currently calls `webrtc.send()` for movement, not `socket.emit("updatePositionAndCamera", ...)`. The developer has confirmed WebRTC is not the current goal and Socket.io should be the transport. However, the socket event may not be wired in the client at present.

**How to verify:** Check if TPP.tsx or any other client component emits `updatePositionAndCamera`. If not, client-side movement emission needs to be added as part of Phase 3.

---

### KU-03: Is the game timer (1 minute) the intended duration?

`GAME_DURATION = 1 * 60 * 1000` (60 seconds). This is very short. It may be a development/testing value.

**How to verify:** Ask the developer what the intended match duration is.

---

### KU-04: What is the intended `MAX_PLAYERS` per room?

Legacy uses 50. NestJS `rooms.constants.ts` uses 20. These differ without explanation.

**How to verify:** Ask the developer; update `rooms.constants.ts` accordingly.

---

### KU-05: `findAvailableRoom` requires `playerCount >= 2`

A room is only considered "available" for new players if it already has at least 2 players. A room with 1 player is not joinable. Is this intentional? It means if the pool never reaches 2, a solo player is permanently stuck in the wait pool.

**How to verify:** Review intended matchmaking UX. If a room should be joinable as soon as it exists, change to `playerCount < MAX_PLAYERS`.

---

### KU-06: What happens to players waiting in `waitPool` when the server restarts?

`waitPool` lives in Redis and persists across server restarts. Socket IDs in `waitPool` will be stale after a restart. The matchmaking logic tries to look up those socket IDs in Socket.io's socket map, but they will no longer exist.

**How to verify:** Look for `waitPool` cleanup on startup. Currently none exists in either codebase.

---

### KU-07: Terrain height sync between client and server

`getGroundHeight` (in `server/redis/utils.ts`) uses simplex noise with `SEED = 12345`. The client generates terrain with the same seed. A comment in `generateTreePos.ts` confirms this. Spawn location calculations on the server depend on this being consistent. If the noise library version or parameters ever diverge, players will spawn inside terrain.

**Risk:** This is a hidden dependency between client and server — the terrain generation algorithm is not formally shared.

---

### KU-08: XP, level, coins, and rank are never updated

The schema has a full progression system. The game-over handler doesn't touch any of it. Is this intentionally deferred or forgotten?

---

### KU-09: Friendship and social features

The `Friendship` model and REST routes are scaffolded but no endpoints are implemented. Unclear if this is in scope for the current development phase.
