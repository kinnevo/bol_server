/**
 * Daily.co Room Manager
 * Handles creation and management of Daily.co video/audio rooms for voice chat
 */

require('dotenv').config();

const DAILY_API_KEY = process.env.DAILY_API_KEY;
const DAILY_DOMAIN = process.env.DAILY_DOMAIN;
const DAILY_API_BASE_URL = 'https://api.daily.co/v1';

/**
 * Creates a Daily.co room for voice chat
 * @param {string} roomId - The game room ID
 * @param {Array} players - Array of player objects
 * @returns {Promise<Object>} Room creation response with URL and name
 */
async function createDailyRoom(roomId, players) {
  if (!DAILY_API_KEY) {
    throw new Error('DAILY_API_KEY is not configured in environment variables');
  }

  if (!DAILY_DOMAIN) {
    throw new Error('DAILY_DOMAIN is not configured in environment variables');
  }

  // Debug logging
  console.log('[Daily] API Key present:', DAILY_API_KEY ? 'Yes' : 'No');
  console.log('[Daily] API Key length:', DAILY_API_KEY ? DAILY_API_KEY.length : 0);
  console.log('[Daily] Domain:', DAILY_DOMAIN);

  try {
    const roomName = `bol-game-${roomId}-${Date.now()}`;

    const response = await fetch(`${DAILY_API_BASE_URL}/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DAILY_API_KEY}`,
      },
      body: JSON.stringify({
        name: roomName,
        properties: {
          // Room expires after 2 hours
          exp: Math.floor(Date.now() / 1000) + (2 * 60 * 60),

          // Max participants based on player count
          max_participants: players.length,

          // Enable recording and transcription
          enable_recording: 'cloud',
          enable_transcription: true,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[Daily] API Error Response:', JSON.stringify(errorData, null, 2));
      console.error('[Daily] Response Status:', response.status);
      throw new Error(`Failed to create Daily room: ${errorData.error || response.statusText}`);
    }

    const roomData = await response.json();

    console.log(`[Daily] Created room: ${roomName} for game room: ${roomId}`);

    return {
      name: roomData.name,
      url: roomData.url,
      config: roomData.config,
      api_created: true,
    };
  } catch (error) {
    console.error('[Daily] Error creating room:', error);
    throw error;
  }
}

/**
 * Deletes a Daily.co room
 * @param {string} roomName - The Daily room name to delete
 * @returns {Promise<boolean>} Success status
 */
async function deleteDailyRoom(roomName) {
  if (!DAILY_API_KEY) {
    console.error('[Daily] DAILY_API_KEY not configured');
    return false;
  }

  try {
    const response = await fetch(`${DAILY_API_BASE_URL}/rooms/${roomName}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${DAILY_API_KEY}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error(`[Daily] Failed to delete room ${roomName}:`, errorData);
      return false;
    }

    console.log(`[Daily] Deleted room: ${roomName}`);
    return true;
  } catch (error) {
    console.error(`[Daily] Error deleting room ${roomName}:`, error);
    return false;
  }
}

/**
 * Gets transcription data from a Daily.co room
 * @param {string} roomName - The Daily room name
 * @returns {Promise<Array>} Array of transcript objects
 */
async function getDailyTranscripts(roomName) {
  if (!DAILY_API_KEY) {
    throw new Error('DAILY_API_KEY is not configured');
  }

  try {
    // First, get the room's recordings
    const recordingsResponse = await fetch(
      `${DAILY_API_BASE_URL}/recordings?room_name=${roomName}`,
      {
        headers: {
          'Authorization': `Bearer ${DAILY_API_KEY}`,
        },
      }
    );

    if (!recordingsResponse.ok) {
      throw new Error('Failed to fetch recordings');
    }

    const recordingsData = await recordingsResponse.json();

    if (!recordingsData.data || recordingsData.data.length === 0) {
      console.log(`[Daily] No recordings found for room: ${roomName}`);
      return [];
    }

    // Get the most recent recording
    const recording = recordingsData.data[0];

    // Check if transcription is available
    if (!recording.transcription || !recording.transcription.status === 'finished') {
      console.log(`[Daily] Transcription not ready for room: ${roomName}`);
      return [];
    }

    // Fetch the transcription data
    const transcriptUrl = recording.transcription.url;
    const transcriptResponse = await fetch(transcriptUrl);

    if (!transcriptResponse.ok) {
      throw new Error('Failed to fetch transcript data');
    }

    const transcriptData = await transcriptResponse.json();

    console.log(`[Daily] Retrieved transcripts for room: ${roomName}`);

    return transcriptData;
  } catch (error) {
    console.error(`[Daily] Error getting transcripts for ${roomName}:`, error);
    throw error;
  }
}

/**
 * Creates a meeting token for a specific participant
 * @param {string} roomName - The Daily room name
 * @param {string} playerName - The player's name
 * @param {string} playerId - The player's UUID
 * @returns {Promise<string>} Meeting token
 */
async function createMeetingToken(roomName, playerName, playerId) {
  if (!DAILY_API_KEY) {
    throw new Error('DAILY_API_KEY is not configured');
  }

  try {
    const response = await fetch(`${DAILY_API_BASE_URL}/meeting-tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DAILY_API_KEY}`,
      },
      body: JSON.stringify({
        properties: {
          room_name: roomName,
          user_name: playerName,
          user_id: playerId,
          enable_recording: 'cloud',
          start_audio_off: false,
          start_video_off: true,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to create meeting token: ${errorData.error}`);
    }

    const tokenData = await response.json();
    return tokenData.token;
  } catch (error) {
    console.error('[Daily] Error creating meeting token:', error);
    throw error;
  }
}

/**
 * Starts recording for a Daily room
 * @param {string} roomName - The Daily room name
 * @returns {Promise<boolean>} Success status
 */
async function startRecording(roomName) {
  if (!DAILY_API_KEY) {
    throw new Error('DAILY_API_KEY is not configured');
  }

  try {
    const response = await fetch(`${DAILY_API_BASE_URL}/recordings/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DAILY_API_KEY}`,
      },
      body: JSON.stringify({
        room_name: roomName,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to start recording: ${errorData.error}`);
    }

    console.log(`[Daily] Started recording for room: ${roomName}`);
    return true;
  } catch (error) {
    console.error('[Daily] Error starting recording:', error);
    throw error;
  }
}

module.exports = {
  createDailyRoom,
  deleteDailyRoom,
  getDailyTranscripts,
  createMeetingToken,
  startRecording,
};
