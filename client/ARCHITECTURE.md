# client/ Architecture Map

Onboarding doc for the Next.js/React-Three-Fiber game client, rooted at [app/forest/[id]/page.tsx](app/forest/[id]/page.tsx) — the in-match scene. Read this before exploring; it's the token-cheap map.

## Overview

Vynix (marketed as "Zentra") is a browser multiplayer arena shooter. Next.js (App Router) + React Three Fiber render the 3D scene; `socket.io-client` talks to the NestJS backend (`server-nest/`, not covered here) for matchmaking, room state, and real-time player sync. `lib/webrtc.ts` exists as a peer-data-channel alternative but the active path (per `TPP.tsx`, `RemoteOpponents.tsx`) is socket.io broadcast, not WebRTC data channels. Zustand holds cross-component client state (`useRoomStore`, `useGameInfoStore`). Howler.js drives non-positional (local) sound; raw `three.js` `AudioListener`/`PositionalAudio` drives distance-attenuated remote-player sound.

## Diagram

```
app/page.tsx (lobby)
  |-- uses: useSocketHandlersMain -> useRoomStore
  |-- router.push('/forest/[id]') on lobby full
  v
app/forest/[id]/page.tsx (Game)
  |
  |-- Ground
  |     |-- ForestGenerator / Grass / Mountains / Rain / Loot
  |     |-- ComponentLoadingTracker (load-status bus)
  |     `-- socket.on('updateForest')            --> lib/socket.ts
  |
  |-- TPP (local Player)
  |     |-- Gun --> Fireball / Explosion
  |     |-- checkCollision
  |     |-- hooks: useAudioListener, usePlayerInput, useRoomStore
  |     |-- socket.emit('updatePositionAndCamera', 'playerWalking', ...) --> lib/socket.ts
  |     `-- lib/sound.ts (Howler: local walk/breeze/hitWood/gunshot)
  |
  |-- RemoteOpponents
  |     |-- socket.on('playerMoved','playerDead','playerShot', ...) --> lib/socket.ts
  |     `-- Opponent (dead-reckoned, per remote id)
  |           |-- OpGun
  |           `-- lib/positionalSound.ts (three.js PositionalAudio: remote walk/shoot)
  |
  |-- GameInfo (HUD) --> useGameInfoStore
  |-- HitImpact (hit VFX)
  `-- KillFeed (toast list)

lib/socket.ts (single io-client instance)
  <--> server-nest socket.io gateway (out of scope)

lib/webrtc.ts (dormant peer-data-channel path; not called from any
  scene component today -- signals via lib/socket.ts if ever wired in)
```

## Directory Map

| Path                                                                                                 | Purpose                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `app/page.tsx`                                                                                     | Lobby/menu screen: username entry, matchmaking button, lobby player-slot UI. Emits`requestMatchmaking`/`cancelMatchmaking`, redirects to `/forest/[roomId]` when room fills.                                                   |
| `app/forest/[id]/page.tsx`                                                                         | Main game scene (`Game` component). Owns the R3F `<Canvas>`, wires Ground/Player/Opponents/UI together, handles ping, death/respawn/game-over socket events.                                                                     |
| `app/layout.tsx`                                                                                   | Root Next.js layout.                                                                                                                                                                                                                 |
| `app/api/data/route.ts`                                                                            | Next.js route handler — serves vegetation position data fetched by the forest page (`fetch('/api/data')`).                                                                                                                        |
| `app/types/types.tsx`                                                                              | `Vegetation` type and related scene-data shapes (separate from `types/types.ts`).                                                                                                                                                |
| `components/class/ComponentLoadingTracker.ts`                                                      | Singleton event-emitter logger used by`Ground.tsx` to track per-subsystem load status (Sky, Mountains, Forest, etc.) and fire `onAllComponentsLoaded`.                                                                           |
| `components/game-components/ground/Ground.tsx`                                                     | Terrain mesh, noise-based height function (`useGroundHeight` context), fog/sky/lighting, mounts Forest/Grass/Mountains/Rain/Loot, listens for `updateForest` socket event.                                                       |
| `components/game-components/forest/ForestGenerator.tsx`                                            | Procedural tree placement using vegetation data + ground height.                                                                                                                                                                     |
| `components/game-components/elements/{Grass,Mountains,Rain}.tsx`                                   | Decorative/environmental scene elements.                                                                                                                                                                                             |
| `components/game-components/player/TPP.tsx`                                                        | **Local player controller** (default export `Player`). Movement/physics/collision/camera (FPS+TPS toggle), emits `updatePositionAndCamera`, `playerWalking`/`playerStopped`. Renders `Gun`.                          |
| `components/game-components/player/Gun.tsx`                                                        | Local weapon: shooting raycast, ammo (via`useGameInfoStore`), tracers, recoil, muzzle flash; emits shoot events over socket.                                                                                                       |
| `components/game-components/player/checkCollision.tsx`                                             | Pure collision-detection helper (`checkCollisions`) used by `TPP.tsx`.                                                                                                                                                           |
| `components/game-components/player/cameraController.tsx`                                           | Camera positioning helpers.                                                                                                                                                                                                          |
| `components/game-components/player/Fireball.tsx`, `explosion/Explosion.tsx`                      | Grenade projectile + explosion VFX, spawned from`TPP.tsx`.                                                                                                                                                                         |
| `components/game-components/player/Loot.tsx`                                                       | Pickup item (ammo crate) rendered by`Ground.tsx`.                                                                                                                                                                                  |
| `components/game-components/player/HitImpact.tsx`                                                  | Particle burst effect when local player is hit; driven by a`hit` event, keyed off `PLAYER_RADIUS`/`PLAYER_HITBOX_Y_OFFSET` from `types/types.ts`.                                                                            |
| `components/game-components/opponents/RemoteOpponents.tsx`                                         | Owns the set of remote players: listens to`playerMoved`, `playerDisconnected`, `playerDead`, `playerShot`, `playerHitReaction`, `playerWalking/Stopped`; renders one `<Opponent>` per remote id.                       |
| `components/game-components/opponents/Opponent.tsx`                                                | Single remote-player avatar: dead-reckoned movement (extrapolate + correct toward snapshots), death/hit visual feedback, positional walk/shoot audio via`lib/positionalSound.ts`, username `<Html>` label. Renders `OpGun`.    |
| `components/game-components/opponents/OpGun.tsx`                                                   | Remote player's visible weapon/muzzle effects, triggered by shoot events.                                                                                                                                                            |
| `components/game-components/gameInfo/GameInfo.tsx`                                                 | HUD: health, ammo, crosshair, radar, scoreboard, chat, hit-flash overlay.                                                                                                                                                            |
| `components/game-components/gameInfo/RadarUI.tsx`, `Scoreboard.tsx`, `PlayerJoinLeaveFeed.tsx` | HUD subcomponents.                                                                                                                                                                                                                   |
| `components/game-components/crosshair/CrossHair.tsx`                                               | Crosshair with hit-trigger animation (`crosshairRef.triggerHit()`), driven from `Gun.tsx`.                                                                                                                                       |
| `components/game-components/toast/KillFeed.tsx`                                                    | Kill toast list, subscribed from`page.tsx`'s `showKillToast`.                                                                                                                                                                    |
| `components/game-components/loading-page/loading-page.tsx`                                         | Full-screen loader shown until`Ground` reports `loaded`.                                                                                                                                                                         |
| `hooks/useAudioListener.ts`                                                                        | Attaches a three.js`AudioListener` to the camera; unlocks `AudioContext` on first user gesture (browser autoplay policy).                                                                                                        |
| `hooks/usePlayerInput.ts`                                                                          | Keyboard/mouse listeners →`MoveState` + jump/sprint/grenade/mouse callbacks. Used by `TPP.tsx`.                                                                                                                                 |
| `hooks/useRoomStore.ts`                                                                            | Zustand store: room's player list, spawn point. Populated by`useSocketHandlersMain`, read by lobby + `TPP.tsx` (spawn point) + `RemoteOpponents.tsx` (removePlayer).                                                           |
| `hooks/useGameInfoStore.ts`                                                                        | Zustand store: ammo/HUD combat state, used by`Gun.tsx` and `GameInfo.tsx`.                                                                                                                                                       |
| `hooks/useSocketHandlersMain.ts`                                                                   | Lobby socket handlers:`roomSnapshot`, `searchingForMatch`, `roomAssigned`, `playerJoined`, `cancelledMatchmaking`, `spawnPoint`. Used only by `app/page.tsx`.                                                          |
| `hooks/useSocketHandlersArena.ts`                                                                  | (Arena-mode variant of socket handlers — check before assuming`useSocketHandlersMain` is the only lobby path.)                                                                                                                    |
| `hooks/useNotificationStore.ts`, `useRadarHook.ts`                                               | Supporting Zustand store / radar math hook.                                                                                                                                                                                          |
| `lib/socket.ts`                                                                                    | Singleton`socket.io-client` instance, URL from `NEXT_PUBLIC_SOCKET_URL`. **The** client↔server transport; import this everywhere sockets are needed.                                                                      |
| `lib/webrtc.ts`                                                                                    | `WebRTCManager` class for peer data channels (offer/answer/ICE via `lib/socket.ts` signaling). Defined but not wired into `TPP.tsx`/`RemoteOpponents.tsx` — treat as dormant/experimental unless you find a live call site. |
| `lib/sound.ts`                                                                                     | Howler-based non-positional sound (breeze ambience, local walk, hitWood, gunshot, reload).`stopAllSounds()` called on unmount/game-over.                                                                                           |
| `lib/positionalSound.ts`                                                                           | Raw three.js`PositionalAudio` for distance-attenuated remote sounds (opponent walk/shoot), separate cache/loader from `sound.ts`.                                                                                                |
| `lib/utils.ts`                                                                                     | Misc utilities incl.`useWhyDidYouUpdate` debug hook (used in `page.tsx`).                                                                                                                                                        |
| `types/types.ts`                                                                                   | Shared constants/types:`PLAYER_RADIUS`, `PLAYER_HITBOX_Y_OFFSET`, etc.                                                                                                                                                           |
| `types/network.ts`                                                                                 | `NetworkPacket` type used by `lib/webrtc.ts`.                                                                                                                                                                                    |

## Dependency & Link Graph

| File                               | Imports / calls                                                                                                                                                                                                               | Called by / imported from                                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `app/page.tsx`                   | `hooks/useSocketHandlersMain`, `hooks/useRoomStore`, `lib/socket`                                                                                                                                                       | Next.js router (`/`)                                                                                            |
| `app/forest/[id]/page.tsx`       | `lib/socket`, `lib/sound`, `lib/utils`, `components/.../player/TPP`, `ground/Ground`, `gameInfo/GameInfo`, `opponents/RemoteOpponents`, `player/HitImpact`, `toast/KillFeed`, `loading-page/loading-page` | Next.js router (`/forest/[id]`)                                                                                 |
| `player/TPP.tsx`                 | `lib/socket`, `lib/sound`, `hooks/useAudioListener`, `hooks/usePlayerInput`, `hooks/useRoomStore`, `player/checkCollision`, `player/Gun`, `explosion/Explosion`, `types/types`                              | `app/forest/[id]/page.tsx` (as `PlayerWithGroundHeight`)                                                      |
| `player/Gun.tsx`                 | `lib/socket`, `lib/sound`, `hooks/useGameInfoStore`, `hooks/usePlayerInput`, `types/types`                                                                                                                          | `player/TPP.tsx`                                                                                                |
| `opponents/RemoteOpponents.tsx`  | `lib/socket`, `hooks/useRoomStore`, `opponents/Opponent`                                                                                                                                                                | `app/forest/[id]/page.tsx`                                                                                      |
| `opponents/Opponent.tsx`         | `lib/positionalSound`, `opponents/OpGun`, `types/types`                                                                                                                                                                 | `opponents/RemoteOpponents.tsx`                                                                                 |
| `ground/Ground.tsx`              | `lib/socket`, `forest/ForestGenerator`, `elements/{Mountains,Rain,Grass}`, `player/Loot`, `components/class/ComponentLoadingTracker`, `app/types/types`                                                           | `app/forest/[id]/page.tsx`; exposes `useGroundHeight()` context consumed by `TPP.tsx`, `Gun.tsx`          |
| `gameInfo/GameInfo.tsx`          | `lib/socket`, `hooks/useGameInfoStore`, `gameInfo/RadarUI`, `gameInfo/Scoreboard`, `crosshair/CrossHair`                                                                                                            | `app/forest/[id]/page.tsx`                                                                                      |
| `player/HitImpact.tsx`           | `lib/socket` (implied via hit event), `types/types`                                                                                                                                                                       | `app/forest/[id]/page.tsx`                                                                                      |
| `hooks/useSocketHandlersMain.ts` | `hooks/useRoomStore`                                                                                                                                                                                                        | `app/page.tsx`                                                                                                  |
| `hooks/useRoomStore.ts`          | `zustand`, `three`                                                                                                                                                                                                        | `app/page.tsx`, `player/TPP.tsx`, `opponents/RemoteOpponents.tsx`, `useSocketHandlersMain.ts`             |
| `hooks/useGameInfoStore.ts`      | `zustand`                                                                                                                                                                                                                   | `player/Gun.tsx`, `gameInfo/GameInfo.tsx`                                                                     |
| `lib/socket.ts`                  | `socket.io-client`, `NEXT_PUBLIC_SOCKET_URL` env                                                                                                                                                                          | Nearly every game/lobby component (direct`import socket from '@/lib/socket'`)                                   |
| `lib/webrtc.ts`                  | `lib/socket`, `types/network`                                                                                                                                                                                             | Not currently imported by any live scene file (verify with a repo-wide grep for`webrtc` before relying on this) |
| `lib/sound.ts`                   | `howler`                                                                                                                                                                                                                    | `app/forest/[id]/page.tsx`, `player/TPP.tsx`, `player/Gun.tsx`                                              |
| `lib/positionalSound.ts`         | `three` (`AudioLoader`, `PositionalAudio`)                                                                                                                                                                              | `opponents/Opponent.tsx`                                                                                        |

## Entry Points

- **Route entry**: `app/page.tsx` (`/`) → `app/forest/[id]/page.tsx` (`/forest/[id]`) via `router.push` after matchmaking fills.
- **Layout**: `app/layout.tsx` wraps every route.
- **Local API route**: `app/api/data/route.ts` — serves vegetation positions consumed by the forest page's `fetch('/api/data')`.
- **Socket connection**: established at module load in `lib/socket.ts`; `socket.connect()` called explicitly in `app/page.tsx`'s `handleMatchmaking`.
- **Config files**: `next.config.ts`, `tailwind.config.ts`, `tsconfig` (not read in detail), `next-env.d.ts`.
- **Env vars**: `NEXT_PUBLIC_SOCKET_URL` (socket.io server URL, `lib/socket.ts`), `NEXT_PUBLIC_REST_API_URL` (used for `GET /game/onlinePlayers` in `app/page.tsx`).

## Change Guide

| If you need to...                                                    | Edit these files                                                                                                                                                |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change local player movement/physics/collision                       | `components/game-components/player/TPP.tsx`, `player/checkCollision.tsx`                                                                                    |
| Change local weapon behavior (fire rate, ammo, tracers)              | `components/game-components/player/Gun.tsx`, `hooks/useGameInfoStore.ts`                                                                                    |
| Change remote player interpolation / dead-reckoning                  | `components/game-components/opponents/Opponent.tsx`                                                                                                           |
| Add/change a socket event in the match                               | Emit/listen site in the relevant component (`TPP.tsx`, `RemoteOpponents.tsx`, `Ground.tsx`, `GameInfo.tsx`) + corresponding server-nest gateway handler |
| Change matchmaking/lobby flow                                        | `app/page.tsx`, `hooks/useSocketHandlersMain.ts`, `hooks/useRoomStore.ts`                                                                                 |
| Change terrain/world generation                                      | `components/game-components/ground/Ground.tsx` (height fn, fog, sky), `forest/ForestGenerator.tsx`, `elements/*`                                          |
| Change HUD (health, radar, scoreboard, crosshair)                    | `components/game-components/gameInfo/*`, `crosshair/CrossHair.tsx`                                                                                          |
| Change local (non-positional) sound                                  | `lib/sound.ts`                                                                                                                                                |
| Change remote/positional sound (opponent walk/shoot)                 | `lib/positionalSound.ts`, wiring in `opponents/Opponent.tsx`                                                                                                |
| Add a new remote-player visual/audio effect keyed off a server event | Add handler in`opponents/RemoteOpponents.tsx` (owns the socket listeners), pass down via `EventEmitter` prop to `opponents/Opponent.tsx`                  |
| Change component load-order/loading screen                           | `components/class/ComponentLoadingTracker.ts`, `ground/Ground.tsx` (`componentsToTrack`), `loading-page/loading-page.tsx`                               |
| Investigate/enable WebRTC path                                       | `lib/webrtc.ts` — currently not called from any scene component; confirm intent before building on it                                                        |

## Conventions

- **State**: Zustand for cross-component client state (`useRoomStore`, `useGameInfoStore`); local component state/refs for anything scene-local. Hot-path per-frame data (positions/velocities) lives in refs, not React state, to avoid re-renders (see `playerDataRef` in `page.tsx`, `latestSnapshotRef` in `RemoteOpponents.tsx`).
- **Networking**: all socket access goes through the single `lib/socket.ts` singleton — never instantiate a second `io()` client. Emits/listens are colocated in the component that owns the relevant visual/state effect (movement in `TPP.tsx`, remote roster in `RemoteOpponents.tsx`), not centralized in one dispatcher.
- **Per-frame logic**: use `useFrame` from `@react-three/fiber`; avoid `setInterval`/`requestAnimationFrame` for scene updates except for non-visual polling (e.g., ping check in `page.tsx`).
- **Component loading tracking**: subsystems under `Ground.tsx` report status through `ComponentLoadingTracker` (`logger.logStatus`) rather than local flags, so the parent scene can gate the loading screen centrally.
- **Sound**: two separate systems by design — Howler (`lib/sound.ts`) for local/ambient sound, three.js `PositionalAudio` (`lib/positionalSound.ts`) for distance-attenuated remote sound. Don't mix them.
- **Naming**: hooks prefixed `use*` in `hooks/`; one component per file matching the default export name; socket event names are camelCase strings matched exactly between client and server-nest gateway — grep server-nest before renaming any event.
