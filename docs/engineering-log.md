# Engineering Log

A running record of non-obvious performance/architecture improvements made to this project, with the reasoning behind each. Kept honest about scale — not everything here moves a metrics dashboard, some of it is just removing wasted work that had no reason to exist.

---

## Bot terrain raycast optimization

**Context:** Rooms with AI bots run server-side line-of-sight checks (`isRayOccludedByTerrain` in `physics.service.ts`) for every bot every 500ms, to decide whether a hill blocks a shot. Each check walks the ray in fixed 2-unit steps and samples procedural terrain height (two layered simplex noise calls) at every step — real math, not a lookup table, computed fresh on every call. With multiple bots engaging simultaneously across concurrent matches, this was the most CPU-meaningful part of the bot loop (bandwidth from bot movement/combat broadcasts, by contrast, measured in single-digit kB/s per client and wasn't a concern — verified with back-of-envelope math before touching anything).

### 1. Memoized terrain height cache

**What changed:** `TerrainService.getHeight(x, z)` now checks a `Map` keyed on rounded `(x, z)` coordinates before running the noise functions, and stores the result after computing it.

**Why it works:** the terrain is procedurally generated but static — the same `(x, z)` always produces the same height for the lifetime of the process. Before this change, every raycast sample, and every bot's per-tick ground-snap (`newPosition.y = getHeight(...)`), recomputed noise from scratch even for coordinates that had already been queried seconds earlier (e.g. a bot holding position and repeatedly sampling the same patch of ground, or two different bots' rays crossing the same terrain cell). Rounding coordinates to the nearest unit trades a visually negligible amount of precision (terrain varies slowly — its frequency constant is 0.005) for a much higher cache-hit rate, turning repeat lookups into O(1) hash reads instead of noise evaluations.

**Scope of the cache — bigger than one match:** `TerrainService` is registered in Nest with default (singleton) scope, so there's exactly one instance — and one shared cache — for the entire server process, not one per match. Every concurrent room injects the same instance, and every match uses the same fixed terrain seed. That means the cache isn't "warmed per match" — it's a shared, cumulative cache across every match that's ever run on that process since it last restarted. A cell sampled by match #1 is a cache hit for match #4 running concurrently, or match #1000 running an hour later, as long as the process hasn't restarted.

**Important caveat — it's not "solved forever":** the cache is in-memory only, not Redis-backed or otherwise persisted. Every deploy, crash, or restart wipes it back to empty. It also only caches coordinates that were actually visited (bots/shots), not the whole map — so its effectiveness tracks how concentrated play is (bots cluster via engagement radius, so hot zones warm up fast) rather than literal match count.

**Honest scale:** a single cached lookup saves roughly ~300-400ns (two noise function calls) versus a `Map` read taking tens of nanoseconds. This is not a number that shows up on a CPU utilization graph at current bot/match counts — the fix is best framed as eliminating redundant, deterministic computation that had no reason to be repeated, not as a measured cost-saving win. It matters more as engagement radius, sample density, or bot counts scale up, since the wasted work would otherwise scale with those knobs while the cache cost stays flat.

### 2. Early-exit before walking the ray

**What changed:** before stepping along the ray to sample terrain, `isRayOccludedByTerrain` first checks whether both the ray's start and end points are above the terrain's known maximum possible height (the sum of the two noise layers' fixed amplitudes). If so, it returns "not occluded" immediately without sampling anything.

**Why it works:** because the ray is a straight line, its lowest point is always at one of its two endpoints — there's no dip in the middle to worry about missing. If even the lower endpoint sits above the highest point terrain could ever reach, it's mathematically impossible for any hill to be in the way, so the entire sample walk (up to 15 steps at max engagement range) is provably unnecessary. This turns a fixed per-shot cost into a near-zero cost for the common case of open, elevated, or flat engagements, and only pays the full walk cost when a check could actually matter.

### Why not Redis for the cache

Considered and rejected: Redis would add a network round-trip (sub-millisecond at best, even on localhost) to save ~300ns of local noise computation — strictly worse, since the thing being cached is cheap and deterministic to begin with. Redis earns its cost when data needs to be *shared across separate processes/machines* or *survive a restart* and that durability is worth paying for; terrain height is neither expensive to recompute nor something that benefits from centralizing, since every instance already has everything it needs (fixed seed + pure function) to regenerate any value locally. Kept it as a plain in-process `Map`.

### Result

Together, these changes remove redundant noise computation (repeat coordinate queries, now shared across every concurrent match on the process) and skip unnecessary computation outright (geometrically impossible occlusion), without touching the sampling resolution (`TERRAIN_SAMPLE_STEP`) that determines terrain-detection accuracy — the fix targets *how often* expensive math runs, not the accuracy/cost tradeoff of the raycast itself.
