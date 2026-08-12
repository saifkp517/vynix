import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

// One row per Supabase Auth user. `id` is the Supabase user id (the `sub` claim
// on the JWT) rather than a generated key, so this table never needs its own
// signup flow — a row is created the first time an authenticated socket needing
// one is seen (see ProfilesService.findOrCreate).
//
// K/D is intentionally NOT a stored column — it's derived from totalKills/
// totalDeaths on read (ProfilesService.toPublicProfile) so it can never drift
// out of sync with the raw counters.
@Entity('profiles')
export class Profile {
    @PrimaryColumn('uuid')
    id: string;

    @Column({ nullable: true })
    username: string;

    @Column({ default: 0 })
    totalKills: number;

    @Column({ default: 0 })
    totalDeaths: number;

    @Column({ default: 0 })
    matchesPlayed: number;

    @Column({ default: 0 })
    rank: number;

    @CreateDateColumn()
    createdAt: Date;
}
