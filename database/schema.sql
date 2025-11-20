-- PostgreSQL Schema for Voice Chat Transcriptions
-- Book of Life Game - Voice Chat Feature

-- Table: game_sessions
-- Stores metadata about each game session
CREATE TABLE IF NOT EXISTS game_sessions (
  id UUID PRIMARY KEY,
  room_id VARCHAR(255) NOT NULL,
  room_name VARCHAR(255),
  daily_room_name VARCHAR(255),
  daily_room_url TEXT,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMP,
  player_count INTEGER,
  status VARCHAR(50) DEFAULT 'active', -- active, completed, abandoned
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Table: voice_transcripts
-- Stores individual transcript segments with speaker information
CREATE TABLE IF NOT EXISTS voice_transcripts (
  id SERIAL PRIMARY KEY,
  session_id UUID REFERENCES game_sessions(id) ON DELETE CASCADE,
  player_id UUID,
  player_name VARCHAR(255),
  transcript_text TEXT NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  start_time FLOAT, -- seconds from recording start
  duration_seconds FLOAT,
  confidence FLOAT, -- transcription confidence score
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Table: transcript_analysis
-- Stores AI-generated analysis of transcripts
CREATE TABLE IF NOT EXISTS transcript_analysis (
  id SERIAL PRIMARY KEY,
  session_id UUID REFERENCES game_sessions(id) ON DELETE CASCADE,
  analysis_type VARCHAR(100) NOT NULL, -- 'sentiment', 'keywords', 'summary', 'conversation_flow'
  analysis_result JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_game_sessions_room_id ON game_sessions(room_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_started_at ON game_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_voice_transcripts_session_id ON voice_transcripts(session_id);
CREATE INDEX IF NOT EXISTS idx_voice_transcripts_player_id ON voice_transcripts(player_id);
CREATE INDEX IF NOT EXISTS idx_voice_transcripts_timestamp ON voice_transcripts(timestamp);
CREATE INDEX IF NOT EXISTS idx_transcript_analysis_session_id ON transcript_analysis(session_id);
CREATE INDEX IF NOT EXISTS idx_transcript_analysis_type ON transcript_analysis(analysis_type);

-- Comments for documentation
COMMENT ON TABLE game_sessions IS 'Stores metadata for each game session with voice chat';
COMMENT ON TABLE voice_transcripts IS 'Individual transcript segments with speaker diarization';
COMMENT ON TABLE transcript_analysis IS 'AI-generated analysis results for transcript data';
