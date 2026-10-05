# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are casual browser gamers: people who want a quick, free first-person/third-person
shooter in a browser tab with no install, playing short sessions between other things. They arrive
from a link or a search, expect to be in a match within seconds, and judge the product in the
first minute on how it *feels* to move and shoot. A secondary audience of competitive .io-shooter
players (Krunker, Shell Shockers) is served by the retention layer — persistent K/D, abilities,
ranks — but the design target is casual-first.

## Product Purpose

Zentra is a browser-based multiplayer third-person arena shooter set on a forest map: real-time
PvP with AI bots filling empty slots so a match always starts immediately. It exists to deliver a
console-grade shooter feel on the open web with zero friction. Success is a player going from
landing to an in-match kill without ever noticing the client is "just a website," then coming
back.

## Positioning

Console-grade 3D feel delivered entirely in-browser: a genuine third-person camera/aim-ray
controller, physics-based movement with multi-pass collision and rebound, ADS scope with FOV
zoom, and server-authoritative hit registration with lag compensation and terrain/canopy shot
occlusion. Competing .io shooters trade fidelity for reach; Zentra's claim is that it does not —
the movement, aiming, and hit-reg feel like a native game while still being a URL. Instant
bot-filled matchmaking (solo player always gets a full room, bots running the same physics and
FSM as real players) is a supporting differentiator.

## Operating Context

- Played in a desktop browser with keyboard + mouse; pointer-lock is engaged during a match.
- Two surfaces today: the lobby/loadout menu (`client/app/page.tsx`) and the in-match arena
  (`client/app/forest/[id]/page.tsx`), which renders a React Three Fiber scene with an HUD
  overlay (health, ability cooldown, kill feed, chat, ping, scoreboard).
- Match lifecycle: authenticate → "Find Match" → lobby fills (real players + trickled-in bots) →
  10-minute match → game over → durable K/D flushed to the player's profile.
- Every player is a real Supabase Auth account, including "Guest" players (anonymous auth
  sessions). There is no fabricated guest mode.
- In-match key affordances players are taught via lobby tips: Q for invincibility ability,
  C to chat, right-click for the red-dot / ADS scope, canopy-jumping for ambushes, health
  regen when out of combat.

## Capabilities and Constraints

- Existing stack: Next.js 15 (canary) App Router, React 19, React Three Fiber / drei / rapier,
  Tailwind v4, Radix primitives, framer-motion, GSAP, Zustand, socket.io-client, Supabase JS.
  Design work extends this stack rather than choosing one.
- Real-time transport is a single socket.io connection multiplexing ~11 event flows; durable
  identity/stats go over a separate REST API; auth is Supabase. Redis holds per-match state only
  and is wiped at game over — nothing about a finished match is queryable afterward except the
  profile K/D totals.
- No horizontal scaling: the server's spatial grid and lag-comp history are single-process
  memory. This caps concurrent load and is a known architectural limit, not a design concern
  directly, but it bounds how many "live players online" style numbers can ever be real.
- `rank` exists on the profile record but nothing computes or writes it yet — do not surface a
  rank value as if it were real.
- Grenades and the sniper-scope FOV zoom are client-only: grenades are not visible to or
  damaging for other players today. Do not imply grenade multiplayer.
- Client username model has two distinct fields: a per-match **callsign** (not persisted,
  re-derived each session) and a persisted account **profile username**. Any UI touching names
  must respect that these are separate.

## Brand Commitments

- Player-facing name is **Zentra**, styled **Zentra.io** (the `.io` set in the accent gradient).
  "Vynix" is the internal repo name / codename only and must not appear in player-facing UI.
- `client/public/images/background.png` — the forest key art — is a fixed reference point for the
  lobby/auth visual world and should be preserved as the anchor of that surface.
- The forest map itself (baked vegetation in `client/public/POS.json`, canopy/terrain geometry
  in `shared/treeConstants.ts`) is the established in-game visual world.
- Voice in existing copy is terse and game-native ("Enter the arena", "Choose a callsign...",
  "Find Match"). Not confirmed as binding, but it is the current register.

## Evidence on Hand

- Working game client and server; two live deploy origins referenced in code
  (`vynix-kohl.vercel.app`, `zentra-io.vercel.app`).
- Real player stats exist per account (`totalKills`, `totalDeaths`, `matchesPlayed`, derived
  `kdRatio`) and are shown in the lobby.
- No testimonials, player-count claims, press, reviews, or benchmark numbers exist — future
  work must not fabricate "N players online", "trusted by", ratings, or similar social proof.
- Leaderboard and Friends are deliberately unbuilt and shown as "Coming Soon" / post-beta.
- `docs/engineering-log.md` and `ARCHITECTURE.md` are the authoritative system references.

## Product Principles

1. **First minute is everything.** The casual player judges Zentra on movement and shooting
   feel before reading a word. Design must get them into a match fast and never make the client
   feel like a web page.
2. **Instant match, always.** No dead "waiting for players" state in practice — bots fill the
   gap. UI should promise and reflect immediacy.
3. **Feel over spectacle.** The differentiator is fidelity of control and hit-reg, not flashy
   menus. In-match HUD serves readability and reaction time first.
4. **Honest beta.** Unbuilt features are shown as unbuilt; no fake stats, ranks, or social proof.
5. **Two identities, kept straight.** Per-match callsign and persistent profile name are
   distinct concepts and the UI must not blur them.

## Accessibility & Inclusion

No product-specific standard has been established. General baseline applies (keyboard operability
of menus, sufficient contrast on the HUD over a busy 3D scene, motion restraint on menu
transitions).
