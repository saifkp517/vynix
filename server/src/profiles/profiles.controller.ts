import {
    Body,
    Controller,
    Get,
    Param,
    Patch,
    Req,
    UseGuards,
} from '@nestjs/common';

import { type AuthenticatedRequest, SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { ProfilesService } from './profiles.service';

@Controller('profiles')
@UseGuards(SupabaseAuthGuard)
export class ProfilesController {
    constructor(private readonly profilesService: ProfilesService) {}

    // Caller's own profile — id comes from the verified token, not the URL, so
    // one user can never fetch another's profile through this route.
    @Get('me')
    getOwnProfile(@Req() req: AuthenticatedRequest) {
        return this.profilesService.getProfile(req.userId);
    }

    // Any player's public profile — for viewing other players' rank/stats.
    @Get(':userId')
    getProfile(@Param('userId') userId: string) {
        return this.profilesService.getProfile(userId);
    }

    @Patch('me')
    updateUsername(
        @Req() req: AuthenticatedRequest,
        @Body('username') username: string,
    ) {
        return this.profilesService.updateUsername(req.userId, username);
    }
}
