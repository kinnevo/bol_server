const { getRedisClient } = require('./redisClient');
const { v4: uuidv4 } = require('uuid');

const SESSION_TTL = parseInt(process.env.REDIS_SESSION_TTL) || 300; // 5 minutes default

/**
 * Get or create a persistent player ID from windowSessionId
 * @param {string} windowSessionId - Browser window session ID
 * @returns {Promise<string>} - Persistent player ID (UUID)
 */
async function getOrCreatePlayerId(windowSessionId) {
  const redis = getRedisClient();
  const key = `windowSession:${windowSessionId}`;

  let playerId = await redis.get(key);

  if (!playerId) {
    playerId = uuidv4();
    await redis.set(key, playerId);
    // Keep window session mapping indefinitely (cleared on logout)
    console.log(`Created new player ID: ${playerId} for window session: ${windowSessionId}`);
  }

  return playerId;
}

/**
 * Save player data to Redis
 * @param {string} playerId - Persistent player ID
 * @param {object} playerData - Player data object
 * @param {number} ttl - Time to live in seconds (optional)
 */
async function savePlayer(playerId, playerData, ttl = null) {
  const redis = getRedisClient();
  const key = `player:${playerId}`;

  await redis.set(key, JSON.stringify(playerData));

  if (ttl) {
    await redis.expire(key, ttl);
  }

  console.log(`Saved player: ${playerId} (${playerData.name})`);
}

/**
 * Get player data from Redis
 * @param {string} playerId - Persistent player ID
 * @returns {Promise<object|null>} - Player data or null if not found
 */
async function getPlayer(playerId) {
  const redis = getRedisClient();
  const key = `player:${playerId}`;

  const data = await redis.get(key);

  if (!data) {
    return null;
  }

  return JSON.parse(data);
}

/**
 * Delete player data from Redis
 * @param {string} playerId - Persistent player ID
 */
async function deletePlayer(playerId) {
  const redis = getRedisClient();
  const key = `player:${playerId}`;

  await redis.del(key);
  console.log(`Deleted player: ${playerId}`);
}

/**
 * Map socket ID to player ID
 * @param {string} socketId - Socket.io socket ID
 * @param {string} playerId - Persistent player ID
 */
async function mapSocketToPlayer(socketId, playerId) {
  const redis = getRedisClient();
  const key = `socket:${socketId}`;

  await redis.set(key, playerId);
  // Socket mapping expires with session
  await redis.expire(key, SESSION_TTL);
}

/**
 * Get player ID from socket ID
 * @param {string} socketId - Socket.io socket ID
 * @returns {Promise<string|null>} - Player ID or null
 */
async function getPlayerIdBySocket(socketId) {
  const redis = getRedisClient();
  const key = `socket:${socketId}`;

  return await redis.get(key);
}

/**
 * Delete socket mapping
 * @param {string} socketId - Socket.io socket ID
 */
async function deleteSocketMapping(socketId) {
  const redis = getRedisClient();
  const key = `socket:${socketId}`;

  await redis.del(key);
}

/**
 * Mark player as disconnected and set expiration
 * @param {string} playerId - Persistent player ID
 */
async function markPlayerDisconnected(playerId) {
  const player = await getPlayer(playerId);

  if (player) {
    player.disconnectedAt = Date.now();
    player.socketId = null;
    await savePlayer(playerId, player, SESSION_TTL);
    console.log(`Player ${playerId} (${player.name}) marked as disconnected, will expire in ${SESSION_TTL}s`);
  }
}

/**
 * Clear player session (on logout)
 * @param {string} playerId - Persistent player ID
 * @param {string} windowSessionId - Browser window session ID
 */
async function clearPlayerSession(playerId, windowSessionId) {
  const redis = getRedisClient();

  await deletePlayer(playerId);
  await redis.del(`windowSession:${windowSessionId}`);

  console.log(`Cleared session for player: ${playerId}`);
}

module.exports = {
  getOrCreatePlayerId,
  savePlayer,
  getPlayer,
  deletePlayer,
  mapSocketToPlayer,
  getPlayerIdBySocket,
  deleteSocketMapping,
  markPlayerDisconnected,
  clearPlayerSession,
  SESSION_TTL
};
