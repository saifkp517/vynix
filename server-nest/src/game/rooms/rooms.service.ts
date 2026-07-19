import { Injectable } from '@nestjs/common';

import { v4 as uuidv4 } from 'uuid';

import { RedisService } from '../redis/redis.service';

import {
    MAX_PLAYERS,
    ROOM_KEY,
} from './rooms.constants';

@Injectable()
export class RoomsService {
    constructor(
        private readonly redisService: RedisService,
    ) { }

    getRoomPlayersKey(roomId: string) {
        return `roomPlayers:${roomId}`;
    }

    async createRoom(): Promise<string> {
        const roomId = uuidv4();

        await this.redisService.sAdd(
            ROOM_KEY,
            roomId,
        );

        return roomId;
    }

    async getAllRooms() {
        const roomIds =
            await this.redisService.sMembers(
                ROOM_KEY,
            );

        const rooms: any = [];

        for (const roomId of roomIds) {
            const playerCount =
                await this.redisService.sCard(
                    this.getRoomPlayersKey(roomId),
                );

            rooms.push({
                roomId,
                playerCount,
            });
        }

        return rooms;
    }

    async findAvailableRoom(): Promise<string | null> {
        const roomIds =
            await this.redisService.sMembers(
                ROOM_KEY,
            );

        for (const roomId of roomIds) {
            const playerCount =
                await this.redisService.sCard(
                    this.getRoomPlayersKey(roomId),
                );

            if (
                playerCount < MAX_PLAYERS &&
                playerCount >= 2
            ) {
                return roomId;
            }
        }

        return null;
    }

    async removeRoom(roomId: string): Promise<void> {
        const roomPlayersKey = this.getRoomPlayersKey(roomId);

        const socketIds =
            await this.redisService.sMembers(roomPlayersKey);

        const playerKeys = socketIds.map(
            (id) => `player:${roomId}:${id}`,
        );

        if (playerKeys.length) {
            await this.redisService.del(...playerKeys);
        }

        await this.redisService.del(roomPlayersKey);
        await this.redisService.sRem(ROOM_KEY, roomId);
    }

    /**
     * Starts the game-over countdown for a room.
     * Cleans up Redis on expiry, then calls onExpiry so the Gateway can emit events.
     */
    scheduleGameEnd(
        roomId: string,
        onExpiry: (roomId: string) => Promise<void>,
        durationMs = 10 * 60_000,
    ): void {
        setTimeout(async () => {
            try {
                await this.removeRoom(roomId);
                await onExpiry(roomId);
            } catch (err) {
                console.error(
                    `[RoomsService] Game-over cleanup failed for room ${roomId}:`,
                    err,
                );
            }
        }, durationMs);
    }
}