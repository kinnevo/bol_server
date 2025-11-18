/**
 * PostgreSQL Database Client
 * Handles database connections and queries for voice chat transcripts
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Create a connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Test connection on startup
pool.on('connect', () => {
  console.log('[DB] PostgreSQL connected successfully');
});

pool.on('error', (err) => {
  console.error('[DB] PostgreSQL error:', err);
});

/**
 * Creates a new game session in the database
 * @param {Object} sessionData - Session data
 * @returns {Promise<Object>} Created session
 */
export async function createGameSession(sessionData) {
  const {
    id,
    roomId,
    roomName,
    dailyRoomName,
    dailyRoomUrl,
    playerCount,
  } = sessionData;

  const query = `
    INSERT INTO game_sessions (
      id, room_id, room_name, daily_room_name, daily_room_url,
      started_at, player_count, status
    )
    VALUES ($1, $2, $3, $4, $5, NOW(), $6, 'active')
    RETURNING *
  `;

  try {
    const result = await pool.query(query, [
      id,
      roomId,
      roomName,
      dailyRoomName,
      dailyRoomUrl,
      playerCount,
    ]);

    console.log(`[DB] Created game session: ${id}`);
    return result.rows[0];
  } catch (error) {
    console.error('[DB] Error creating game session:', error);
    throw error;
  }
}

/**
 * Updates a game session when it ends
 * @param {string} sessionId - The session UUID
 * @param {string} status - The final status (completed, abandoned)
 * @returns {Promise<Object>} Updated session
 */
export async function endGameSession(sessionId, status = 'completed') {
  const query = `
    UPDATE game_sessions
    SET ended_at = NOW(), status = $1
    WHERE id = $2
    RETURNING *
  `;

  try {
    const result = await pool.query(query, [status, sessionId]);
    console.log(`[DB] Ended game session: ${sessionId} with status: ${status}`);
    return result.rows[0];
  } catch (error) {
    console.error('[DB] Error ending game session:', error);
    throw error;
  }
}

/**
 * Saves voice transcripts to the database
 * @param {string} sessionId - The session UUID
 * @param {Array} transcripts - Array of transcript objects from Daily.co
 * @returns {Promise<Array>} Saved transcript records
 */
export async function saveTranscripts(sessionId, transcripts) {
  if (!transcripts || transcripts.length === 0) {
    console.log('[DB] No transcripts to save');
    return [];
  }

  const query = `
    INSERT INTO voice_transcripts (
      session_id, player_id, player_name, transcript_text,
      timestamp, start_time, duration_seconds, confidence
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `;

  try {
    const savedTranscripts = [];

    for (const transcript of transcripts) {
      const result = await pool.query(query, [
        sessionId,
        transcript.userId || null,
        transcript.userName || 'Unknown',
        transcript.text,
        new Date(transcript.timestamp * 1000), // Convert Unix timestamp to Date
        transcript.startTime || null,
        transcript.duration || null,
        transcript.confidence || null,
      ]);

      savedTranscripts.push(result.rows[0]);
    }

    console.log(`[DB] Saved ${savedTranscripts.length} transcripts for session: ${sessionId}`);
    return savedTranscripts;
  } catch (error) {
    console.error('[DB] Error saving transcripts:', error);
    throw error;
  }
}

/**
 * Retrieves all transcripts for a game session
 * @param {string} sessionId - The session UUID
 * @returns {Promise<Array>} Array of transcript records
 */
export async function getTranscripts(sessionId) {
  const query = `
    SELECT * FROM voice_transcripts
    WHERE session_id = $1
    ORDER BY timestamp ASC
  `;

  try {
    const result = await pool.query(query, [sessionId]);
    return result.rows;
  } catch (error) {
    console.error('[DB] Error getting transcripts:', error);
    throw error;
  }
}

/**
 * Saves transcript analysis results
 * @param {string} sessionId - The session UUID
 * @param {string} analysisType - Type of analysis (sentiment, keywords, summary)
 * @param {Object} analysisResult - The analysis data (will be stored as JSONB)
 * @returns {Promise<Object>} Saved analysis record
 */
export async function saveAnalysis(sessionId, analysisType, analysisResult) {
  const query = `
    INSERT INTO transcript_analysis (session_id, analysis_type, analysis_result)
    VALUES ($1, $2, $3)
    RETURNING *
  `;

  try {
    const result = await pool.query(query, [
      sessionId,
      analysisType,
      JSON.stringify(analysisResult),
    ]);

    console.log(`[DB] Saved ${analysisType} analysis for session: ${sessionId}`);
    return result.rows[0];
  } catch (error) {
    console.error('[DB] Error saving analysis:', error);
    throw error;
  }
}

/**
 * Retrieves analysis results for a game session
 * @param {string} sessionId - The session UUID
 * @param {string} analysisType - Optional: filter by analysis type
 * @returns {Promise<Array>} Array of analysis records
 */
export async function getAnalysis(sessionId, analysisType = null) {
  let query = `
    SELECT * FROM transcript_analysis
    WHERE session_id = $1
  `;

  const params = [sessionId];

  if (analysisType) {
    query += ' AND analysis_type = $2';
    params.push(analysisType);
  }

  query += ' ORDER BY created_at DESC';

  try {
    const result = await pool.query(query, params);
    return result.rows;
  } catch (error) {
    console.error('[DB] Error getting analysis:', error);
    throw error;
  }
}

/**
 * Gets a game session by room ID
 * @param {string} roomId - The game room ID
 * @returns {Promise<Object>} Session record
 */
export async function getSessionByRoomId(roomId) {
  const query = `
    SELECT * FROM game_sessions
    WHERE room_id = $1
    ORDER BY started_at DESC
    LIMIT 1
  `;

  try {
    const result = await pool.query(query, [roomId]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('[DB] Error getting session by room ID:', error);
    throw error;
  }
}

/**
 * Closes the database connection pool
 */
export async function closePool() {
  await pool.end();
  console.log('[DB] PostgreSQL pool closed');
}

export default pool;
