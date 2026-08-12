import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

import { verifySupabaseToken } from './supabase-auth.util';

export interface AuthenticatedRequest extends Request {
    userId: string;
}

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
        const header = request.headers.authorization;
        const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

        if (!token) {
            throw new UnauthorizedException('Missing bearer token');
        }

        try {
            const claims = await verifySupabaseToken(token);
            request.userId = claims.sub;
            return true;
        } catch {
            throw new UnauthorizedException('Invalid or expired token');
        }
    }
}
