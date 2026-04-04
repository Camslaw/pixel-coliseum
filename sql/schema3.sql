-- schema3.sql
CREATE TABLE IF NOT EXISTS player_stats (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

  highest_score INTEGER NOT NULL DEFAULT 0,
  highest_round_survived INTEGER NOT NULL DEFAULT 0,

  total_score BIGINT NOT NULL DEFAULT 0,
  total_kills INTEGER NOT NULL DEFAULT 0,
  total_powerups_collected INTEGER NOT NULL DEFAULT 0,
  total_time_played_seconds INTEGER NOT NULL DEFAULT 0,
  games_played INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
