/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  // Create game_sessions table
  pgm.createTable('game_sessions', {
    id: {
      type: 'uuid',
      primaryKey: true,
    },
    room_id: {
      type: 'varchar(255)',
      notNull: true,
    },
    room_name: {
      type: 'varchar(255)',
    },
    daily_room_name: {
      type: 'varchar(255)',
    },
    daily_room_url: {
      type: 'text',
    },
    started_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    ended_at: {
      type: 'timestamp',
    },
    player_count: {
      type: 'integer',
    },
    status: {
      type: 'varchar(50)',
      default: 'active',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  // Create voice_transcripts table
  pgm.createTable('voice_transcripts', {
    id: {
      type: 'serial',
      primaryKey: true,
    },
    session_id: {
      type: 'uuid',
      notNull: true,
      references: 'game_sessions(id)',
      onDelete: 'CASCADE',
    },
    player_id: {
      type: 'uuid',
    },
    player_name: {
      type: 'varchar(255)',
    },
    transcript_text: {
      type: 'text',
      notNull: true,
    },
    timestamp: {
      type: 'timestamp',
      notNull: true,
    },
    start_time: {
      type: 'float',
    },
    duration_seconds: {
      type: 'float',
    },
    confidence: {
      type: 'float',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  // Create transcript_analysis table
  pgm.createTable('transcript_analysis', {
    id: {
      type: 'serial',
      primaryKey: true,
    },
    session_id: {
      type: 'uuid',
      notNull: true,
      references: 'game_sessions(id)',
      onDelete: 'CASCADE',
    },
    analysis_type: {
      type: 'varchar(100)',
      notNull: true,
    },
    analysis_result: {
      type: 'jsonb',
      notNull: true,
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  // Create indexes
  pgm.createIndex('game_sessions', 'room_id');
  pgm.createIndex('game_sessions', 'started_at');
  pgm.createIndex('voice_transcripts', 'session_id');
  pgm.createIndex('voice_transcripts', 'player_id');
  pgm.createIndex('voice_transcripts', 'timestamp');
  pgm.createIndex('transcript_analysis', 'session_id');
  pgm.createIndex('transcript_analysis', 'analysis_type');

  // Add comments
  pgm.sql(`
    COMMENT ON TABLE game_sessions IS 'Stores metadata for each game session with voice chat';
    COMMENT ON TABLE voice_transcripts IS 'Individual transcript segments with speaker diarization';
    COMMENT ON TABLE transcript_analysis IS 'AI-generated analysis results for transcript data';
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  // Drop tables in reverse order (respecting foreign keys)
  pgm.dropTable('transcript_analysis');
  pgm.dropTable('voice_transcripts');
  pgm.dropTable('game_sessions');
};
