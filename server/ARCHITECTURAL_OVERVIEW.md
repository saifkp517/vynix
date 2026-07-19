# Vynix Server: Architectural Analysis & Technical Roadmap

This document provides a comprehensive overview of the Vynix multiplayer game server architecture, identifying current bottlenecks and outlining a strategic path for refactoring and scaling.

---

## 1. High-Level Overview

**Vynix** is a high-performance multiplayer 3D shooter game server built with Bun, Express, Socket.io, Redis, and Prisma.

*   **Primary Purpose:** Facilitating low-latency multiplayer combat and player state management.
*   **Major Features:**
    *   **Real-time Spatial Sync:** Synchronizes movement and camera direction across clients.
    *   **Server-Side Combat:** Validates hits using ray-sphere intersection to prevent cheating.
    *   **Matchmaking:** Pools players and assigns them to dynamically created game rooms.
    *   **Progression & Economy:** Tracks XP, levels, coins, and ranks (Bronze to Grandmaster).
*   **Core Flow:**
    1.  **Auth:** Player registers/logs in via REST API (Express + Prisma).
    2.  **Connect:** Player opens a WebSocket (Socket.io) and validates their session.
    3.  **Matchmaking:** Player requests a match; the server finds an existing room or creates a new one.
    4.  **Gameplay:** Real-time movement and shooting events are processed via Redis and broadcast to nearby players.
    5.  **Completion:** Match ends after 1 minute; stats are flushed to PostgreSQL.

---

## 2. Architecture Map

The system is structured as a **distributed state-machine** where Redis serves as the hot state and PostgreSQL as the cold storage.

### Hierarchical Tree
```text
/server/
├── prisma/               # Persistence Layer: Schema, migrations, and types.
├── redis/                # The "Game Engine": State management and physics.
│   ├── redisControllers.ts # PRIMARY HUB: Matchmaking, movement, and combat.
│   ├── redisClient.ts     # Redis connection configuration.
│   ├── utils.ts           # Spatial partitioning logic and noise generation.
│   └── types.ts           # Game-specific domain types (Player, Room, etc.).
├── rest-api/             # External Gateway: Auth and metadata.
│   └── routes/           # Express routes for Auth and Game info.
├── socket-server/        # WebSocket Layer: Event orchestration.
│   └── handlers/         # Translates Socket events to Redis controller calls.
└── utils/                # Shared utilities (JWT, etc.).
```

---

## 3. Runtime Flow Analysis

### Hot Path: Gameplay Loop
1.  **Input:** Client sends `updatePositionAndCamera` via Socket.
2.  **Processing:** `handleUpdatePositionAndCameraUpdate` updates the Redis hash for the player.
3.  **Spatial Logic:** Player is moved within the **in-memory grid** map.
4.  **Broadcast:** `broadcastToNearbyPlayers` identifies players in adjacent grid cells and emits `playerMoved`.

### Cold Path: Persistence
1.  **Match End:** A `setTimeout` triggers the game-over logic.
2.  **Aggregation:** Player kills/deaths are retrieved from Redis.
3.  **Sync:** `Prisma` increments lifetime stats in the `User` table.

---

## 4. Technical Debt Assessment (Top Issues)

| Issue | Description | Severity | Fix |
| :--- | :--- | :--- | :--- |
| **Volatile Grid** | Spatial partitioning is stored in local memory (`Map`). | **Critical** | Migrate to Redis GEO commands. |
| **Broken Routes** | `gameRoutes.ts` misses `await` on async calls. | **High** | Add missing `await` statements. |
| **Connection Leaks** | Multiple `PrismaClient` instances created across routes. | **Medium** | Implement a Singleton Prisma client. |
| **O(N) Combat** | Raycasting loops through all players in a room. | **Medium** | Use spatial grid to narrow targets. |
| **Unreliable Timers**| Game lifecycle depends on process-bound `setTimeout`. | **Medium** | Use BullMQ or Redis-backed task scheduling. |

---

## 5. Refactoring Roadmap

### Phase 1: Stabilization (Quick Wins)
*   Fix `await` bugs in API routes.
*   Consolidate Prisma client initialization.
*   Remove dead code (`test.ts`, duplicate generation files).

### Phase 2: Scalability (High ROI)
*   **Externalize Spatial State:** Move the player grid from a local `Map` to Redis. This is the single most important change to allow horizontal scaling.
*   **Optimize Combat Logic:** Integrate spatial partitioning into the `handleShoot` controller.

### Phase 3: Modernization
*   **Service Extraction:** Move Matchmaking into a dedicated microservice.
*   **Observability:** Implement structured logging (e.g., Pino) and room occupancy metrics.

---

## 6. System Understanding Guide

For new engineers, explore the codebase in this order:
1.  `prisma/schema.prisma` (Domain Model)
2.  `socket-server/handlers/connectionHandler.ts` (Event Routing)
3.  `redis/redisControllers.ts` (Core Logic)
4.  `redis/utils.ts` (Spatial Math)

---

## 7. Memory Usage Suspects

1.  **In-memory Grid (`grid`):** The primary RAM consumer, growing with player count.
2.  **Redis Cache:** Accumulates player and room hashes.
3.  **Socket.io Buffers:** High-frequency event streams (movement/shooting).
