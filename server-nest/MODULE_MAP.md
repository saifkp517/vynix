# Module Map — server-nest

Quick lookup for "which file do I open to fix X." Read this instead of grepping the whole
codebase. Keep it updated when you add/move functions — it goes stale fast otherwise.

---

## Request flow (who calls who)

```
Client (socket.io)
  → GameGateway                     [src/game/gateway/game.gateway.ts]
      → SocketStateService          [connect/disconnect tracking]
      → MatchmakingService          [requestMatchmaking / cancelMatchmaking]
          → RoomsService            [room existence / creation]
          → PhysicsService          [spawn point]
          → PlayersService          [persist player to Redis]
      → MovementService             [updatePositionAndCamera]
          → PlayersService          [persist position]
          → PhysicsService          [grid cell update, nearby lookup]
      → CombatService               [shoot]
          → PhysicsService          [raycasting, nearby lookup]
          → PlayersService          [read room players]
          → RedisService            [atomic health/kill/death writes]

Client (REST, axios)
  → GameController                  [src/game/game.controller.ts]
      → SocketStateService          [GET /game/onlinePlayers]
```

Everything ultimately bottoms out in `RedisService`, which is a thin typed wrapper around
`ioredis` — no game logic lives there.

---

## Module-by-module

### `GameGateway` — `src/game/gateway/game.gateway.ts`
**What it is:** The only place that talks socket.io directly. Every `@SubscribeMessage` here
is one client→server event from the legacy protocol table in `MIGRATION_GUIDE.md` §2.3.
**Do NOT put game logic here** — it should only: read the payload, call one service, emit the
result. If you're debugging "event X doesn't do the right thing," the *logic* bug is almost
always in the service it calls, not in this file.

| Function | Socket event in | Events out | Calls |
|---|---|---|---|
| `handleConnection` | connect | — | `SocketStateService.add`. Assigns `guest-{id}` identity — **no real auth yet**. |
| `handleDisconnect` | disconnect | `playerLeft`, `playerDisconnected` | `SocketStateService.remove`, `PhysicsService.removeFromGrid`, `MatchmakingService.removeFromWaitPool`, `PlayersService.deletePlayer` |
| `handleRequestMatchmaking` | `requestMatchmaking` | `searchingForMatch`, `spawnPoint`, `roomAssigned`, `roomSnapshot`, `playerJoined`, `waitingForPlayers`, `playerPoolCount` | `RoomsService.findAvailableRoom/createRoom/scheduleGameEnd`, `MatchmakingService.addToWaitPool/drainPool/enrollPlayer`, `PlayersService.getAllPlayersFromRoom` |
| `handleCancelMatchmaking` | `cancelMatchmaking` | `cancelledMatchmaking` | `MatchmakingService.removeFromWaitPool` |
| `handleUpdatePositionAndCamera` | `updatePositionAndCamera` | `playerMoved` (to nearby only) | `MovementService.process` |
| `handleShoot` | `shoot` | (delegated) | `CombatService.handleShoot` |
| `handlePlayerWalking` / `handlePlayerStopped` | `playerWalking` / `playerStopped` | same event, broadcast | none — pure relay |
| `handleSendMessage` | `sendMessage` | `receiveMessage` | none — pure relay |
| `joinSocketToRoom` (private helper) | — | `spawnPoint`, `roomAssigned`, `roomSnapshot`, `playerJoined` | `MatchmakingService.enrollPlayer`, `PlayersService.getAllPlayersFromRoom` |

**Client payload gotcha:** `updatePositionAndCamera` expects ONE object
`{ position, velocity, cameraDirection, roomId }`, not multiple args like the legacy server used.

---

### `MatchmakingService` — `src/game/matchmaking/matchmaking.service.ts`
**What it is:** Owns the Redis wait-pool (`waitPool` SET) and turns a socket into a persisted
`Player`. Does **not** touch socket.io directly (no `io.emit` here) — the Gateway does emits.

| Function | Purpose |
|---|---|
| `addToWaitPool` / `removeFromWaitPool` / `getPoolCount` | Basic pool membership (Redis SET `waitPool`) |
| `drainPool` | Atomically empties the pool via `SPOP` (reduces but doesn't eliminate BUG-12 race) |
| `enrollPlayer` | Gets a spawn point from `PhysicsService`, builds a `Player`, persists via `PlayersService.setPlayerInRoom`, **and registers the socket in the spatial grid** via `PhysicsService.updatePlayerCell` (fixed 2026-07-19 — previously missing, meant new players were invisible to movement/combat broadcasts until they personally moved) |

---

### `RoomsService` — `src/game/rooms/rooms.service.ts`
**What it is:** Room lifecycle only — create, list, find-available, remove, and the game timer.
Does not touch individual player data beyond counting them.

| Function | Purpose |
|---|---|
| `createRoom` | New UUID, added to `rooms` SET |
| `getAllRooms` | Lists all rooms with player counts |
| `findAvailableRoom` | Returns a room with `2 <= playerCount < MAX_PLAYERS`. **Note:** a room with exactly 1 player is never "available" — solo occupants can get stuck (see `MIGRATION_GUIDE.md` KU-05) |
| `removeRoom` | Deletes all `player:{roomId}:*` keys + `roomPlayers:{roomId}` + removes from `rooms` SET |
| `scheduleGameEnd` | `setTimeout` (default 60s) → cleans up room, then calls the `onExpiry` callback the Gateway passed in (which emits `gameOver`). **If the process crashes, this timer and the game state are lost** — known tech debt. |

Constants live in `rooms.constants.ts`: `MAX_PLAYERS = 20`, `MIN_PLAYERS_TO_START = 2`.

---

### `PlayersService` — `src/game/players/players.service.ts`
**What it is:** The only place that reads/writes individual player state in Redis. Pure data
layer — no matchmaking/combat/movement logic, just CRUD + (de)serialization.

| Function | Purpose |
|---|---|
| `setPlayerInRoom` | Adds socketId to `roomPlayers:{roomId}` SET, writes full `Player` hash to `player:{roomId}:{socketId}` |
| `getPlayerFromRoom` | Single player read + deserialize (returns `null` if missing) |
| `updatePlayerInRoom` | Partial hash update (used by movement) |
| `deletePlayer` | Removes from room SET + deletes hash |
| `getAllPlayersFromRoom` | Batch read via Redis **pipeline** (all players in one round trip — this is better than the legacy server's sequential reads) |

`position`/`velocity`/`cameraDirection` are stored as JSON strings inside the hash; everything
else is a plain string field. If a player looks "corrupted" in Redis, check
`serializePlayer`/`deserializePlayer` first.

---

### `PhysicsService` — `src/game/physics/physics.service.ts`
**What it is:** Pure spatial math + the in-memory proximity grid. No Redis calls except reading
player positions (via `PlayersService`) to pick spawn points. **The grid lives in process
memory — it will NOT work if you ever run more than one server instance** (see
`MIGRATION_GUIDE.md` Decision A).

| Function | Purpose |
|---|---|
| `getCellKey` | `floor(x/100)_floor(z/100)` — 100-unit cells |
| `updatePlayerCell` | Moves a socket to its new cell, returns nearby socket IDs. **This is the function that determines who receives `playerMoved`/`playerShot` broadcasts** — if broadcasts aren't reaching someone, check whether they're actually in the grid (see `MatchmakingService.enrollPlayer` note above) |
| `getNearbySocketIds` | 3×3 cell lookup around a given cell key, excludes self |
| `removeFromGrid` | Called on disconnect and on death |
| `getSpawnPosition` | Random point, retried up to 30x to stay ≥50 units from existing room players |
| `rayIntersectsSphere` | Core hit-detection math used by `CombatService` |

---

### `MovementService` — `src/game/movement/movement.service.ts`
**What it is:** Thin coordinator, intentionally tiny. Exists so `PlayersService` doesn't need
socket.io access and `GameGateway` doesn't become a god object (see `MIGRATION_GUIDE.md` §5.3).

| Function | Purpose |
|---|---|
| `process` | Persists new transform (`PlayersService.updatePlayerInRoom`) → updates grid cell (`PhysicsService.updatePlayerCell`) → returns nearby socket IDs for the Gateway to emit to |

If movement isn't broadcasting, the bug is in `PhysicsService`'s grid, not here.

---

### `CombatService` — `src/game/combat/combat.service.ts`
**What it is:** Shoot → hit-detection → damage → death → respawn, all in one place.

| Function | Purpose |
|---|---|
| `handleShoot` | Emits `playerShot` once to nearby players (fixed: legacy bug emitted per-player-in-loop), then raycasts against every player in the room, applies `-10` health via `hIncrBy`, calls `tryKill` if health ≤ 0 |
| `tryKill` (private) | Redis `WATCH`/`MULTI` optimistic-lock loop (3 retries) so two simultaneous killing blows can't double-count a kill. Winner emits `youDied` + `playerDead`, removes victim from grid, schedules respawn |
| `scheduleRespawn` (private) | `setTimeout(5000)` → new spawn point, resets health/isDead, emits `spawnPoint` + `playerRespawned` |

Shooter is excluded from self-damage by comparing **socket IDs** (fixed vs. legacy's
socketId-vs-userId mismatch bug).

---

### `RedisService` — `src/game/redis/redis.service.ts`
Thin camelCase wrapper around `ioredis`. No business logic — if you need a new Redis command,
add a one-line passthrough method here rather than injecting raw `ioredis` elsewhere.

### `SocketStateService` — `src/game/socket-state/socket-state.service.ts`
In-memory `Map<socketId, Socket>` for "who's currently connected." This is intentionally
**not** in Redis (see `MIGRATION_GUIDE.md` §5.2 — the legacy Redis list for this was broken and
was not ported). Backs `GET /game/onlinePlayers`.

### `GameController` — `src/game/game.controller.ts`
REST endpoint(s). Currently just `GET /game/onlinePlayers` → `{ players: number }`. This is the
first REST controller in the NestJS server — everything else the client needs (auth, room list,
etc.) still doesn't exist yet.

### `GameService` — `src/game/game.service.ts`
**Not gameplay logic.** This is a startup self-test that runs once via `OnModuleInit` and
prints PASS/FAIL diagnostics to the console for Rooms/Players/Matchmaking services. Its
hardcoded "Not yet implemented" list at the bottom is **stale** — Physics/Movement/Combat are
all implemented; nobody updated this list after building them. Don't trust that list; trust this
document (and the code) instead. Safe to delete before shipping to prod.

### `GameLoggerService` — `src/common/logger/game-logger.service.ts`
Thin wrapper around Nest's built-in `Logger`. Currently **not injected anywhere** — dead code,
or intended for future use. Most services just use `console.log`/`console.error` directly right now.

### `PrismaModule` / `PrismaService` — `src/prisma/`
Empty stub. Nothing in the gameplay path uses this yet (intentionally deferred — accounts/stats
persistence is a later phase).

---

## Redis keys, at a glance

| Key | Type | Written by | Read by |
|---|---|---|---|
| `rooms` | SET of roomId | `RoomsService.createRoom` | `RoomsService.getAllRooms/findAvailableRoom`, `RoomsService.removeRoom` |
| `roomPlayers:{roomId}` | SET of socketId | `PlayersService.setPlayerInRoom/deletePlayer` | `RoomsService` (for counts), `PlayersService.getAllPlayersFromRoom` |
| `player:{roomId}:{socketId}` | HASH | `PlayersService.setPlayerInRoom/updatePlayerInRoom`, `CombatService` (health/kills/deaths/isDead/position on respawn) | `PlayersService.getPlayerFromRoom/getAllPlayersFromRoom`, `CombatService` |
| `waitPool` | SET of socketId | `MatchmakingService.addToWaitPool/removeFromWaitPool/drainPool` | `MatchmakingService.getPoolCount` |

Same key names as the legacy server (`MIGRATION_GUIDE.md` §7 flags this as required for a safe
transition) — do not rename without checking both codebases if they ever share a Redis instance.

---

## Fast debugging checklist

- **"Players can't find a match"** → `MatchmakingService` + `RoomsService.findAvailableRoom`
  (remember: rooms need ≥2 players to be "available," a lone player can't be joined).
- **"I don't see other players move"** → `PhysicsService` grid. Check the player was actually
  inserted into a cell (`updatePlayerCell`) — enrollment does this now, but if you add another
  entry point for spawning a player, it needs to call this too or they'll be invisible to nearby
  lookups.
- **"Shots don't register"** → `CombatService.handleShoot`, specifically `rayIntersectsSphere`
  inputs — log `rayOrigin`/`rayDirection`/`playerCenter` before assuming the math is wrong.
- **"CORS error in browser console"** → two separate CORS configs exist: `main.ts`
  (`app.enableCors`, for REST) and `game.gateway.ts` (`@WebSocketGateway({ cors: ... })`, for
  socket.io). They must both include `credentials: true` and an explicit origin — never `'*'`
  together with credentials.
- **"404 on some /game/... route"** → check `GameController`; most REST endpoints the client
  expects (see `client/app/page.tsx` and friends) don't exist yet.
- **"Everyone is a guest"** → expected right now. Auth (`BUG-01` in `MIGRATION_GUIDE.md`) and
  Prisma are deliberately deferred until gameplay works end-to-end.
