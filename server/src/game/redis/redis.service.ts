import { Injectable } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

@Injectable()
export class RedisService {
  constructor(
    @InjectRedis()
    private readonly redis: Redis,
  ) {}

  async hSet(
    key: string,
    value: Record<string, string>,
  ) {
    return this.redis.hset(key, value);
  }

  async hGetAll(key: string) {
    return this.redis.hgetall(key);
  }

  async hGet(key: string, field: string) {
    return this.redis.hget(key, field);
  }

  async hIncrBy(
    key: string,
    field: string,
    amount: number,
  ) {
    return this.redis.hincrby(key, field, amount);
  }

  async sAdd(
    key: string,
    ...members: string[]
  ) {
    return this.redis.sadd(key, ...members);
  }

  async sMembers(key: string) {
    return this.redis.smembers(key);
  }

  async sCard(key: string) {
    return this.redis.scard(key);
  }

  async sRem(
    key: string,
    ...members: string[]
  ) {
    return this.redis.srem(key, ...members);
  }

  async sPopCount(key: string, count: number): Promise<string[]> {
    return this.redis.spop(key, count);
  }

  async del(...keys: string[]) {
    return this.redis.del(...keys);
  }

  async watch(...keys: string[]) {
    return this.redis.watch(...keys);
  }

  async unwatch() {
    return this.redis.unwatch();
  }

  multi() {
    return this.redis.multi();
  }

  pipeline() {
    return this.redis.pipeline();
  }

  raw() {
    return this.redis;
  }
}