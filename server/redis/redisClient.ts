import { createClient } from 'redis';

export const redis = createClient({
        socket: {
                host: process.env.REDIS_HOST || "vynix-redis",
                port: 6379,
        }
});

redis.on('error', (err) => console.error('Redis Client Error', err));

await redis.connect();
