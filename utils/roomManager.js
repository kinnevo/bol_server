const { getRedisClient } = require('./redisClient');

const ROOM_TTL = parseInt(process.env.REDIS_ROOM_TTL) || 3600; // 1 hour default

/**
 * Save room data to Redis
 * @param {string} roomId - Room ID
 * @param {object} roomData - Room data object
 */
async function saveRoom(roomId, roomData) {
  const redis = getRedisClient();
  const key = `room:${roomId}`;

  // Convert Map to object for JSON serialization if conversations exist
  const dataToSave = { ...roomData };
  if (roomData.conversations && roomData.conversations instanceof Map) {
    dataToSave.conversations = Object.fromEntries(roomData.conversations);
  }

  await redis.set(key, JSON.stringify(dataToSave));
  await redis.expire(key, ROOM_TTL);

  // Add to active rooms set
  await redis.sAdd('rooms:active', roomId);

  console.log(`Saved room: ${roomId} (${roomData.name})`);
}

/**
 * Get room data from Redis
 * @param {string} roomId - Room ID
 * @returns {Promise<object|null>} - Room data or null if not found
 */
async function getRoom(roomId) {
  const redis = getRedisClient();
  const key = `room:${roomId}`;

  const data = await redis.get(key);

  if (!data) {
    return null;
  }

  const roomData = JSON.parse(data);

  // Convert conversations object back to Map if it exists
  if (roomData.conversations && typeof roomData.conversations === 'object') {
    roomData.conversations = new Map(Object.entries(roomData.conversations));
  }

  return roomData;
}

/**
 * Delete room data from Redis
 * @param {string} roomId - Room ID
 */
async function deleteRoom(roomId) {
  const redis = getRedisClient();
  const key = `room:${roomId}`;

  await redis.del(key);
  await redis.sRem('rooms:active', roomId);

  console.log(`Deleted room: ${roomId}`);
}

/**
 * Get all active room IDs
 * @returns {Promise<string[]>} - Array of room IDs
 */
async function getActiveRooms() {
  const redis = getRedisClient();
  return await redis.sMembers('rooms:active');
}

/**
 * Update room's last activity timestamp
 * @param {string} roomId - Room ID
 */
async function touchRoom(roomId) {
  const redis = getRedisClient();
  const key = `room:${roomId}`;

  // Refresh TTL
  await redis.expire(key, ROOM_TTL);
}

/**
 * Load all rooms from Redis into memory Map
 * @returns {Promise<Map>} - Map of room ID to room data
 */
async function loadAllRooms() {
  const roomIds = await getActiveRooms();
  const roomsMap = new Map();

  for (const roomId of roomIds) {
    const roomData = await getRoom(roomId);
    if (roomData) {
      roomsMap.set(roomId, roomData);
    }
  }

  console.log(`Loaded ${roomsMap.size} rooms from Redis`);
  return roomsMap;
}

/**
 * Check if room exists in Redis
 * @param {string} roomId - Room ID
 * @returns {Promise<boolean>} - True if room exists
 */
async function roomExists(roomId) {
  const redis = getRedisClient();
  const key = `room:${roomId}`;

  const exists = await redis.exists(key);
  return exists === 1;
}

module.exports = {
  saveRoom,
  getRoom,
  deleteRoom,
  getActiveRooms,
  touchRoom,
  loadAllRooms,
  roomExists
};
