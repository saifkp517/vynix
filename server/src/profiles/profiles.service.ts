import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Profile } from './profile.entity';

export interface MatchResult {
    userId: string;
    kills: number;
    deaths: number;
}

export interface PublicProfile {
    id: string;
    username: string;
    totalKills: number;
    totalDeaths: number;
    matchesPlayed: number;
    rank: number;
    kdRatio: number;
}

@Injectable()
export class ProfilesService {
    constructor(
        @InjectRepository(Profile)
        private readonly profiles: Repository<Profile>,
    ) {}

    // Called the first time an authenticated socket is seen for a given Supabase
    // user id — a profile row wouldn't exist yet on someone's very first connection.
    async findOrCreate(userId: string, username: string): Promise<Profile> {
        const existing = await this.profiles.findOne({ where: { id: userId } });
        if (existing) return existing;

        const created = this.profiles.create({ id: userId, username });
        return this.profiles.save(created);
    }

    async getProfile(userId: string): Promise<PublicProfile> {
        const profile = await this.profiles.findOne({ where: { id: userId } });
        if (!profile) throw new NotFoundException('Profile not found');
        return this.toPublicProfile(profile);
    }

    async updateUsername(userId: string, username: string): Promise<PublicProfile> {
        const profile = await this.profiles.findOne({ where: { id: userId } });
        if (!profile) throw new NotFoundException('Profile not found');

        profile.username = username;
        const saved = await this.profiles.save(profile);
        return this.toPublicProfile(saved);
    }

    // Bumps durable stats for every real (non-bot, non-guest) player who was in a
    // room when it ended. Only raw counters are stored — K/D is always computed
    // fresh from them, never persisted, so it can't drift.
    async recordMatchResults(results: MatchResult[]): Promise<void> {
        for (const { userId, kills, deaths } of results) {
            await this.profiles.increment({ id: userId }, 'totalKills', kills);
            await this.profiles.increment({ id: userId }, 'totalDeaths', deaths);
            await this.profiles.increment({ id: userId }, 'matchesPlayed', 1);
        }
    }

    private toPublicProfile(profile: Profile): PublicProfile {
        const { id, username, totalKills, totalDeaths, matchesPlayed, rank } = profile;
        return {
            id,
            username,
            totalKills,
            totalDeaths,
            matchesPlayed,
            rank,
            kdRatio: totalDeaths === 0 ? totalKills : totalKills / totalDeaths,
        };
    }
}
