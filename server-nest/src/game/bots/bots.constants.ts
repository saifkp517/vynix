export const BOT_ID_PREFIX = 'bot-';

export const BOT_FILL_TARGET = 10;

// Server-side room loop. Movement/state transitions run on every tick now
// (see BotsService.tickBot) — only fresh target *acquisition* while idle is
// gated by the slower per-bot think cadence below, so bots read as always
// moving instead of stepping between long pauses.
export const BOT_TICK_MS = 250;

// Per-bot cadence for noticing a *new* target while idle (ROAMING). Once a
// bot has locked a target it stays locked (see tickBot's sticky-lock logic)
// regardless of this timer — this only randomizes when an idle bot's head
// "turns" to scan for someone to hunt, so bots don't all snap onto a
// newly-arrived player on the same beat.
export const BOT_THINK_INTERVAL_MIN_MS = 700;
export const BOT_THINK_INTERVAL_MAX_MS = 1300;

// Units moved per tick while closing on a target or the player cluster.
// Randomized per bot at spawn within this range so bots don't all move at
// identical speed.
export const BOT_MOVE_SPEED_MIN = 3;
export const BOT_MOVE_SPEED_MAX = 5;

// A bot only starts hunting once a player or bot enters this radius.
// Randomized per bot so awareness range varies like a real player's.
// Deliberately NOT scaled by BOT_VENGEANCE_RATE — detection range is what
// keeps fights reading as 1-on-1 duels instead of a swarm (only whoever's
// already close notices you; the rest keep roaming, unaware). Vengeance is
// reserved for how hard a bot fights once engaged (fire rate, aim, flee
// threshold) — scaling radius by it too used to mean high vengeance also
// meant every bot in the room noticing you at once and dogpiling.
export const BOT_ENGAGEMENT_RADIUS_MIN = 18;
export const BOT_ENGAGEMENT_RADIUS_MAX = 26;

// While locked on a target, a bot holds position once within this distance
// instead of closing to melee range — but keeps chasing if the target
// moves back out past it, so a fleeing target is never let go.
export const BOT_HOLD_DISTANCE_MIN = 12;
export const BOT_HOLD_DISTANCE_MAX = 18;

// Delay between acquiring a target and firing the first shot at it, so bots
// don't snap to a perfect headshot the instant someone enters range. Only
// applies to the first shot of an engagement — once ENGAGED, only
// BOT_ENGAGED_FIRE_COOLDOWN_* gates subsequent shots.
export const BOT_REACTION_DELAY_MIN_MS = 200;
export const BOT_REACTION_DELAY_MAX_MS = 600;

// Minimum time between shots once a bot is actively engaged with a locked
// target — deliberately tight (a human's fastest sustained click rate, not
// literal frame-perfect fire) so a bot reads as "out to kill" rather than
// pausing between shots like something idly taking potshots. Scaled by
// BOT_VENGEANCE_RATE (higher = faster).
export const BOT_ENGAGED_FIRE_COOLDOWN_MIN_MS = 120;
export const BOT_ENGAGED_FIRE_COOLDOWN_MAX_MS = 180;

// Baseline max random cone (radians) applied to a bot's aim direction so
// shots aren't pixel-perfect every time. Scaled per-bot by BOT_VENGEANCE_RATE
// at spawn (see BotState.aimErrorMaxRad) — higher vengeance narrows the cone
// (more accurate), lower widens it (more deviation).
export const BOT_AIM_ERROR_MAX_RAD = 0.05;

// Idle (no target) bots steer toward the player cluster centroid plus this
// per-bot random offset, so they don't all converge on one exact point.
export const BOT_ROAM_OFFSET_RADIUS = 8;

// Side length of the density buckets used to find the player cluster.
export const BOT_CLUSTER_CELL_SIZE = 20;

// Hard cap on how many bots can be locked onto the same target at once —
// keeps every fight a 1-on-1 duel (bot-on-player or bot-on-bot) instead of a
// pile-on, regardless of how many bots are nearby or how high vengeance is.
export const BOT_MAX_ENGAGERS_PER_TARGET = 1;

// Bots trickle into a room one at a time, waiting a random delay in this
// range between joins, so it reads as real players joining rather than a
// room instantly filling up.
export const BOT_JOIN_DELAY_MIN_MS = 500;
export const BOT_JOIN_DELAY_MAX_MS = 2000;

// Bots get the same invincibility ability real players do, gated by the same
// server-side cooldown state — but unlike a coin-flip mid-fight, it's now
// popped deterministically the instant a bot breaks off to flee (see
// BOT_LOW_HEALTH_THRESHOLD_* below), so it always covers the escape window
// when it isn't on cooldown.

// Health (out of 100) at or below which a bot abandons its fight, pops
// invincibility, and flees — randomized per bot so a group doesn't all break
// off at the exact same HP, then scaled by BOT_VENGEANCE_RATE (more vengeful
// bots fight down to a lower health before running).
export const BOT_LOW_HEALTH_THRESHOLD_MIN = 20;
export const BOT_LOW_HEALTH_THRESHOLD_MAX = 35;

// Hard ceiling on the scaled low-health threshold. Without this, a low
// BOT_VENGEANCE_RATE (e.g. 0.1) divides the threshold up past 100 — a bot
// spawns at full health already "below" its flee threshold and enters
// FLEEING forever, never fighting at all. Keeping this comfortably under 100
// guarantees a bot always fights for at least a stretch before running.
export const BOT_LOW_HEALTH_THRESHOLD_ABS_MAX = 70;

// Minimum distance from the player cluster centroid a fleeing bot must reach
// before it's considered "safe" and switches from FLEEING to HEALING.
export const BOT_FLEE_SAFE_DISTANCE = 45;

// Health regenerated per room tick while HEALING (bots have no idle-timer
// regen like real players — once safely clear of the fight they heal
// immediately and continuously back to full before returning).
export const BOT_HEAL_AMOUNT_PER_TICK = 2;

// Single tunable "aggression" dial for the whole bot roster — scales fire
// cadence, aim accuracy, and how low a bot's health drops before it flees.
// Deliberately does NOT scale engagement radius (see BOT_ENGAGEMENT_RADIUS_*)
// — that stays constant so raising vengeance makes fights harder, not more
// crowded. Hardcoded for now; the intent is to eventually set this per-room
// from the average XP of the real players in it (harder bots vs. strong
// players) once player XP/profiles exist. >1 = more aggressive/vengeful,
// <1 = more cautious.
export const BOT_VENGEANCE_RATE = 1;
