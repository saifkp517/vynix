export const BOT_ID_PREFIX = 'bot-';

export const BOT_FILL_TARGET = 10;

// How often each room's bots re-evaluate movement/targeting.
export const BOT_TICK_MS = 200;

// Units moved per tick while closing on the player cluster.
export const BOT_MOVE_SPEED = 4;

// A bot only starts firing once a player or bot enters this radius.
export const BOT_ENGAGEMENT_RADIUS = 30;

// Side length of the density buckets used to find the player cluster.
export const BOT_CLUSTER_CELL_SIZE = 20;
