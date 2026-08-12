import {
    ConnectedSocket,
    MessageBody,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnGatewayInit,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets';
import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';
import { Vector3 } from 'three';

import { SocketStateService } from '../socket-state/socket-state.service';
import { MatchmakingService } from '../matchmaking/matchmaking.service';
import { RoomsService } from '../rooms/rooms.service';
import { PlayersService } from '../players/players.service';
import { MovementService } from '../movement/movement.service';
import { CombatService } from '../combat/combat.service';
import { PhysicsService } from '../physics/physics.service';
import { BotsService } from '../bots/bots.service';
import { type AuthenticatedSocket, type ShootObject } from '../players/players.types';
import { MIN_PLAYERS_TO_START } from '../rooms/rooms.constants';
import { BOT_FILL_TARGET } from '../bots/bots.constants';
import { ProfilesService } from '../../profiles/profiles.service';
import {
    InvalidTokenError,
    usernameFromClaims,
    verifySupabaseToken,
} from '../../auth/supabase-auth.util';

interface MovementPayload {
    position: { x: number; y: number; z: number };
    velocity: { x: number; y: number; z: number };
    cameraDirection: { x: number; y: number; z: number };
    roomId: string;
}

interface ShootPayload {
    userId: string;
    shootObject: ShootObject;
    roomId: string;
}

@Injectable()
@WebSocketGateway({
    cors: {
        origin: [
            'http://localhost:3000',
            'https://vynix-kohl.vercel.app',
	    'https://zentra-io.vercel.app',
        ],
        credentials: true,
    },
})
export class GameGateway
    implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
    @WebSocketServer()
    server: Server;

    constructor(
        private readonly socketState: SocketStateService,
        private readonly matchmakingService: MatchmakingService,
        private readonly roomsService: RoomsService,
        private readonly playersService: PlayersService,
        private readonly movementService: MovementService,
        private readonly combatService: CombatService,
        private readonly physicsService: PhysicsService,
        private readonly botsService: BotsService,
        private readonly profilesService: ProfilesService,
    ) {}

    afterInit() {
        // Redis room/player state outlives the process (no TTL), but Socket.IO
        // connections don't survive a server restart. Anything left over from
        // before boot is a ghost — sweep it before accepting new connections.
        void this.reconcileGhostPlayers();
    }

    private async reconcileGhostPlayers(): Promise<void> {
        try {
            const rooms = await this.roomsService.getAllRooms();

            for (const { roomId } of rooms) {
                const players = await this.playersService.getAllPlayersFromRoom(roomId);
                const socketIds = Object.keys(players);
                let remaining = socketIds.length;

                for (const socketId of socketIds) {
                    if (!this.server.sockets.sockets.has(socketId)) {
                        await this.playersService.deletePlayer(roomId, socketId);
                        this.physicsService.removeFromGrid(socketId);
                        remaining--;
                        console.log(
                            `[Gateway] Reaped ghost player ${socketId} from room ${roomId}`,
                        );
                    }
                }

                if (remaining === 0) {
                    await this.roomsService.removeRoom(roomId);
                    console.log(`[Gateway] Removed empty room ${roomId} during ghost sweep`);
                }
            }
        } catch (err) {
            console.error('[Gateway] Ghost player reconciliation failed:', err);
        }
    }

    async handleConnection(socket: AuthenticatedSocket) {
        // Client must connect with `io(url, { auth: { token: supabaseAccessToken } })`.
        // No more guest fallback — a missing/invalid/expired token is a hard reject.
        const token = socket.handshake.auth?.token as string | undefined;

        if (!token) {
            console.log(`[Gateway] Rejected ${socket.id}: no auth token`);
            socket.disconnect(true);
            return;
        }

        let claims;
        try {
            claims = await verifySupabaseToken(token);
        } catch (err) {
            const reason = err instanceof InvalidTokenError ? err.message : 'auth error';
            console.log(`[Gateway] Rejected ${socket.id}: ${reason}`);
            socket.disconnect(true);
            return;
        }

        const username = usernameFromClaims(claims);
        socket.userId = claims.sub;
        socket.username = username;

        // Ensures a profile row exists on this user's very first connection ever.
        await this.profilesService.findOrCreate(claims.sub, username);

        this.socketState.add(socket);

        console.log(
            `[Gateway] Connected: ${socket.id} as ${socket.userId} (${this.socketState.count()} total)`,
        );
    }

    handleDisconnect(socket: AuthenticatedSocket) {
        this.socketState.remove(socket.id);
        this.physicsService.removeFromGrid(socket.id);
        void this.matchmakingService.removeFromWaitPool(socket.id);

        const roomId = socket.data?.roomId as string | undefined;
        if (roomId) {
            void this.playersService
                .deletePlayer(roomId, socket.id)
                .then(async () => {
                    this.server
                        .to(roomId)
                        .emit('playerLeft', { id: socket.id });

                    await this.reapIfNoRealPlayersLeft(roomId);
                })
                .catch((err) => {
                    console.error(
                        `[Gateway] Failed to clean up player ${socket.id} from room ${roomId}:`,
                        err,
                    );
                });
        }

        this.server.emit('playerDisconnected', socket.id, socket.username);

        console.log(
            `[Gateway] Disconnected: ${socket.id} (${this.socketState.count()} total)`,
        );
    }

    // A room left with only bots in it burns CPU (bot tick loop) and network
    // (broadcasting bot movement/combat to nobody) for no reason — tear it
    // down, bots included, the moment the last real player leaves.
    private async reapIfNoRealPlayersLeft(roomId: string): Promise<void> {
        const remaining = await this.playersService.getAllPlayersFromRoom(roomId);
        const entries = Object.values(remaining);
        if (entries.length === 0) return; // already-empty rooms are handled by tickRoom/ghost sweep

        const hasRealPlayer = entries.some((p) => !p.isBot);
        if (hasRealPlayer) return;

        await this.botsService.destroyRoom(roomId);
        await this.roomsService.removeRoom(roomId);
        console.log(`[Gateway] Room ${roomId} had no real players left — reaped room and its bots`);
    }

    // ─────────────────────── DEBUG ───────────────────────

    @SubscribeMessage('debug:connections')
    handleDebugConnections(
        @ConnectedSocket() socket: AuthenticatedSocket,
    ) {
        socket.emit('debug:connections', {
            count: this.socketState.count(),
        });
    }

    @SubscribeMessage('ping-check')
    handlePing(
        @ConnectedSocket() socket: AuthenticatedSocket,
        @MessageBody() clientTime: number,
    ) {
        socket.emit('pong-check', clientTime);
    }

    // ─────────────────────── MATCHMAKING ───────────────────────

    @SubscribeMessage('requestMatchmaking')
    async handleRequestMatchmaking(
        @ConnectedSocket() socket: AuthenticatedSocket,
        @MessageBody() username: string,
    ) {
        if (username?.trim()) socket.username = username.trim();

        socket.emit('searchingForMatch');

        // Path A: an active room with space exists — join it directly
        const existingRoomId = await this.roomsService.findAvailableRoom();

        if (existingRoomId) {
            await this.joinSocketToRoom(socket, existingRoomId);
            return;
        }

        // Path B: no room available — enter the wait pool
        const poolCount = await this.matchmakingService.addToWaitPool(socket.id);
        this.server.emit('playerPoolCount', poolCount);

        if (poolCount < MIN_PLAYERS_TO_START) {
            socket.emit('waitingForPlayers', { count: poolCount });
            return;
        }

        // Enough players — create a new room and drain the pool into it
        const roomId = await this.roomsService.createRoom();
        const socketIds = await this.matchmakingService.drainPool();

        for (const socketId of socketIds) {
            const playerSocket = this.server.sockets.sockets.get(
                socketId,
            ) as AuthenticatedSocket | undefined;

            // Skip stale socket IDs left in Redis across server restarts (KU-06)
            if (!playerSocket) continue;

            await this.joinSocketToRoom(playerSocket, roomId);
        }

        await this.botsService.fillRoom(roomId, BOT_FILL_TARGET, this.server);
        this.combatService.startRegen(roomId, this.server);

        const gameDurationMs = 10 * 60_000;
        const startTime = Date.now();
        await this.roomsService.setRoomStart(roomId, startTime, gameDurationMs);
        this.server.to(roomId).emit('gameStarted', { startTime, duration: gameDurationMs });

        this.roomsService.scheduleGameEnd(roomId, async (expiredRoomId) => {
            // Runs before RoomsService wipes the room's Redis state (see
            // RoomsService.scheduleGameEnd), so player data is still readable here.
            const roomPlayers = await this.playersService.getAllPlayersFromRoom(expiredRoomId);
            const results = Object.values(roomPlayers)
                .filter((p) => !p.isBot)
                .map((p) => ({ userId: p.userId, kills: p.kills, deaths: p.deaths }));

            this.botsService.stopRoom(expiredRoomId);
            this.combatService.stopRegen(expiredRoomId);
            this.server.to(expiredRoomId).emit('gameOver');

            if (results.length > 0) {
                await this.profilesService.recordMatchResults(results);
            }
        }, gameDurationMs);
    }

    @SubscribeMessage('cancelMatchmaking')
    async handleCancelMatchmaking(
        @ConnectedSocket() socket: AuthenticatedSocket,
    ) {
        await this.matchmakingService.removeFromWaitPool(socket.id);
        socket.emit('cancelledMatchmaking');
    }

    // ─────────────────────── MOVEMENT ───────────────────────

    // NOTE: the client must emit a single object payload:
    //   socket.emit('updatePositionAndCamera', { position, velocity, cameraDirection, roomId })
    // The legacy server used multiple positional args which NestJS @MessageBody cannot receive.
    @SubscribeMessage('updatePositionAndCamera')
    async handleUpdatePositionAndCamera(
        @ConnectedSocket() socket: AuthenticatedSocket,
        @MessageBody() payload: MovementPayload,
    ) {
        const { position, velocity, cameraDirection, roomId } = payload;

        if (!position || !velocity || !cameraDirection || !roomId) {
            console.log(
                `[Movement] Dropped malformed payload from ${socket.id}:`,
                payload,
            );
            return;
        }

        const pos = new Vector3(position.x, position.y, position.z);
        const vel = new Vector3(velocity.x, velocity.y, velocity.z);
        const cam = new Vector3(cameraDirection.x, cameraDirection.y, cameraDirection.z);

        const { nearbySocketIds } = await this.movementService.process(
            socket.id,
            roomId,
            pos,
            vel,
            cam,
        );

        for (const id of nearbySocketIds) {
            this.server.to(id).emit('playerMoved', {
                id: socket.id,
                userId: socket.userId,
                username: socket.username,
                position: pos,
                velocity: vel,
                cameraDirection: cam,
            });
        }
    }

    // ─────────────────────── COMBAT ───────────────────────

    @SubscribeMessage('shoot')
    async handleShoot(
        @ConnectedSocket() socket: AuthenticatedSocket,
        @MessageBody() payload: ShootPayload,
    ) {
        await this.combatService.handleShoot(
            { id: socket.id, username: socket.username },
            payload.roomId,
            payload.shootObject,
            this.server,
        );
    }

    @SubscribeMessage('useAbility')
    async handleUseAbility(
        @ConnectedSocket() socket: AuthenticatedSocket,
        @MessageBody() payload: { roomId: string },
    ) {
        await this.combatService.activateInvincibility(
            payload.roomId,
            socket.id,
            this.server,
        );
    }

    // ─────────────────────── MISC ───────────────────────

    @SubscribeMessage('playerWalking')
    handlePlayerWalking(
        @ConnectedSocket() socket: AuthenticatedSocket,
        @MessageBody() payload: { userId: string },
    ) {
        socket.broadcast.emit('playerWalking', { userId: payload.userId });
    }

    @SubscribeMessage('playerStopped')
    handlePlayerStopped(
        @ConnectedSocket() socket: AuthenticatedSocket,
        @MessageBody() payload: { userId: string },
    ) {
        socket.broadcast.emit('playerStopped', { userId: payload.userId });
    }

    @SubscribeMessage('sendMessage')
    handleSendMessage(
        @ConnectedSocket() socket: AuthenticatedSocket,
        @MessageBody() payload: { roomId: string; userId: string; message: string },
    ) {
        this.server
            .to(payload.roomId)
            .emit('receiveMessage', {
                userId: payload.userId,
                message: payload.message,
            });
    }

    // ─────────────────────── HELPERS ───────────────────────

    /**
     * Enrolls a socket into a room: persists Redis state, joins socket.io room, emits all
     * required events to the joining player and existing room members.
     */
    private async joinSocketToRoom(
        socket: AuthenticatedSocket,
        roomId: string,
    ): Promise<void> {
        const { spawnPoint } = await this.matchmakingService.enrollPlayer(
            socket.id,
            socket.userId,
            socket.username,
            roomId,
        );

        socket.join(roomId);
        socket.data.roomId = roomId; // used by handleDisconnect for targeted cleanup

        socket.emit('spawnPoint', spawnPoint);
        socket.emit('roomAssigned', { roomId });

        const roomStart = await this.roomsService.getRoomStart(roomId);
        if (roomStart) socket.emit('gameStarted', roomStart);

        const roomPlayers =
            await this.playersService.getAllPlayersFromRoom(roomId);
        socket.emit('roomSnapshot', { roomPlayers });

        // BUG-09 fix: broadcast actual spawn position, not Vector3(0,0,0)
        socket.to(roomId).emit('playerJoined', {
            id: socket.id,
            username: socket.username,
            position: spawnPoint,
            velocity: new Vector3(0, 0, 0),
            health: 100,
            kills: 0,
            deaths: 0,
            isDead: false,
        });
    }
}
