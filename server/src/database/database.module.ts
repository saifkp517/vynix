import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Supabase's Postgres connection string goes in DATABASE_URL (Project Settings ->
// Database -> Connection string -> "URI", use the pooled "Transaction" one for a
// server that opens many short-lived connections). SSL is required by Supabase and
// not on by default in `pg`, so it's forced on here rather than left to env config.
@Module({
    imports: [
        TypeOrmModule.forRoot({
            type: 'postgres',
            url: process.env.DATABASE_URL,
            autoLoadEntities: true,
            synchronize: process.env.NODE_ENV !== 'production',
            ssl: { rejectUnauthorized: false },
        }),
    ],
})
export class DatabaseModule {}
