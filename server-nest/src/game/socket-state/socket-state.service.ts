import { Injectable } from '@nestjs/common';
import { Socket } from 'socket.io';

@Injectable()
export class SocketStateService {
  private readonly sockets = new Map<
    string,
    Socket
  >();

  add(socket: Socket): void {
    this.sockets.set(
      socket.id,
      socket,
    );
  }

  remove(socketId: string): void {
    this.sockets.delete(socketId);
  }

  get(socketId: string): Socket | undefined {
    return this.sockets.get(socketId);
  }

  exists(socketId: string): boolean {
    return this.sockets.has(socketId);
  }

  count(): number {
    return this.sockets.size;
  }

  getAllSocketIds(): string[] {
    return Array.from(
      this.sockets.keys(),
    );
  }
}