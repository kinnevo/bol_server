const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const OpenAI = require('openai');
const { v4: uuidv4 } = require('uuid');
const { initializeRedis, getRedisClient, closeRedis } = require('./utils/redisClient');
const sessionManager = require('./utils/sessionManager');
const roomManager = require('./utils/roomManager');
const { createDailyRoom, deleteDailyRoom, getDailyTranscripts, startRecording } = require('./utils/dailyManager');
const { createGameSession, endGameSession, saveTranscripts, getSessionByRoomId } = require('./utils/dbClient');
const authController = require('./utils/authController');
const sheetsManager = require('./utils/sheetsManager');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? [
        process.env.CLIENT_URL || "https://your-frontend-app.up.railway.app",
        "https://bolrailway-production.up.railway.app",
        "https://game.bridgesoflife.online",
        /\.up\.railway\.app$/,
        /\.railway\.app$/
      ]
      : ["http://localhost:3000", "http://localhost:3001"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? [
      process.env.CLIENT_URL || "https://your-frontend-app.up.railway.app",
      "https://bolrailway-production.up.railway.app",
      "https://game.bridgesoflife.online",
      /\.up\.railway\.app$/,
      /\.railway\.app$/
    ]
    : ["http://localhost:3000", "http://localhost:3001"],
  credentials: true
}));
app.use(express.json());

// Debug endpoint to check rooms
app.get('/debug/rooms', (req, res) => {
  res.json({
    rooms: Array.from(rooms.entries()).map(([id, room]) => ({
      id,
      ...room
    })),
    players: Array.from(players.entries()).map(([id, player]) => ({
      id,
      ...player
    }))
  });
});

// Admin endpoint to reset server
app.post('/admin/reset', (req, res) => {
  console.log('🔄 Server reset requested');

  // First, notify all clients about the reset
  io.emit('server-reset', { message: 'Server is resetting. You will be redirected to login.' });

  // Give clients a moment to receive the message, then disconnect them
  setTimeout(() => {
    // Disconnect all clients
    io.sockets.sockets.forEach((socket) => {
      console.log('🔌 Disconnecting client:', socket.id);
      socket.disconnect(true);
    });

    // Clear all server data
    rooms.clear();
    players.clear();

    // Clear all socket rooms
    io.sockets.adapter.rooms.clear();

    console.log('✅ Server reset completed - all clients disconnected, all data cleared');
  }, 1000); // 1 second delay to allow message delivery

  res.json({
    success: true,
    message: 'Server reset initiated - all clients will be disconnected',
    timestamp: new Date().toISOString()
  });
});

// Admin endpoint to get server stats
app.get('/admin/stats', (req, res) => {
  const connectedSockets = Array.from(io.sockets.sockets.keys());

  res.json({
    rooms: rooms.size,
    players: players.size,
    connectedClients: io.engine.clientsCount,
    connectedSockets: connectedSockets.length,
    socketIds: connectedSockets,
    uptime: Math.floor(process.uptime()),
    serverSessionId: serverSessionId,
    memoryUsage: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});

// Endpoint to check server configuration
app.get('/api/server-config', (req, res) => {
  res.json({
    botsAvailable: BOTS_AVAILABLE,
    environment: process.env.NODE_ENV || 'development'
  });
});

// Check if a player name is available
app.post('/api/check-name', (req, res) => {
  const { name, userId } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({
      available: false,
      message: 'Name cannot be empty'
    });
  }

  const trimmedName = name.trim();
  if (trimmedName.length < 2) {
    return res.status(400).json({
      available: false,
      message: 'Name must be at least 2 characters long'
    });
  }

  // Check if name is already taken (excluding players with the same userId)
  const nameInUse = Array.from(players.values()).find(p =>
    p.name.toLowerCase() === trimmedName.toLowerCase() &&
    (!userId || p.userId !== userId) // Exclude players with the same userId
  );

  if (nameInUse) {
    return res.json({
      available: false,
      message: `The name "${trimmedName}" is already in use`
    });
  }

  res.json({
    available: true,
    message: `The name "${trimmedName}" is available`
  });
});

// Check if a room name is available
app.post('/api/check-room-name', (req, res) => {
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({
      available: false,
      message: 'Room name cannot be empty'
    });
  }

  const trimmedName = name.trim();
  if (trimmedName.length < 2) {
    return res.status(400).json({
      available: false,
      message: 'Room name must be at least 2 characters long'
    });
  }

  // Check if room name is already taken
  const roomInUse = Array.from(rooms.values()).find(room =>
    room.name.toLowerCase() === trimmedName.toLowerCase()
  );

  if (roomInUse) {
    return res.json({
      available: false,
      message: `The room name "${trimmedName}" is already taken`
    });
  }

  res.json({
    available: true,
    message: `The room name "${trimmedName}" is available`
  });
});

// Check if a display name is available for registration
app.post('/api/check-display-name', async (req, res) => {
  const { displayName } = req.body;

  if (!displayName || !displayName.trim()) {
    return res.status(400).json({
      available: false,
      message: 'Display name cannot be empty'
    });
  }

  const trimmedName = displayName.trim();
  if (trimmedName.length < 2) {
    return res.status(400).json({
      available: false,
      message: 'Display name must be at least 2 characters long'
    });
  }

  try {
    const { getUserByDisplayName } = require('./utils/authController');
    const existingUser = await getUserByDisplayName(trimmedName);

    if (existingUser) {
      return res.json({
        available: false,
        message: `The display name "${trimmedName}" is already taken`
      });
    }

    res.json({
      available: true,
      message: `The display name "${trimmedName}" is available`
    });
  } catch (error) {
    console.error('Error checking display name:', error);
    res.status(500).json({
      available: false,
      message: 'Error checking display name availability'
    });
  }
});

// ============================================
// Authentication Endpoints
// ============================================

// User registration
app.post('/api/auth/register', async (req, res) => {
  const { email, password, displayName } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email and password are required'
    });
  }

  try {
    const user = await authController.registerUser(email, password, displayName);
    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Registration failed'
    });
  }
});

// User login
app.post('/api/auth/login', async (req, res) => {
  const { email, password, windowSessionId } = req.body;

  if (!email || !password || !windowSessionId) {
    return res.status(400).json({
      success: false,
      message: 'Email, password, and windowSessionId are required'
    });
  }

  try {
    const sessionData = await authController.loginUser(email, password, windowSessionId);
    res.json({
      success: true,
      ...sessionData
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(401).json({
      success: false,
      message: error.message || 'Login failed'
    });
  }
});

// Validate session
app.get('/api/auth/session', async (req, res) => {
  const sessionToken = req.headers.authorization?.replace('Bearer ', '');

  if (!sessionToken) {
    return res.status(401).json({
      success: false,
      message: 'No session token provided'
    });
  }

  try {
    const session = await authController.validateSession(sessionToken);

    if (!session) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired session'
      });
    }

    res.json({
      success: true,
      session: {
        userId: session.userId,
        email: session.email,
        displayName: session.displayName
      }
    });
  } catch (error) {
    console.error('Session validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Session validation failed'
    });
  }
});

// User logout
app.post('/api/auth/logout', async (req, res) => {
  const sessionToken = req.headers.authorization?.replace('Bearer ', '');

  if (!sessionToken) {
    return res.status(400).json({
      success: false,
      message: 'No session token provided'
    });
  }

  try {
    await authController.logoutUser(sessionToken);
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
});

// ============================================
// Google Sheets Endpoints
// ============================================

// Get all questions from Google Sheets
app.get('/api/sheets/questions', async (req, res) => {
  try {
    const questions = await sheetsManager.getQuestionsWithCache();
    res.json({
      success: true,
      questions,
      count: questions.length
    });
  } catch (error) {
    console.error('[Sheets API] Error fetching questions:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch questions from Google Sheets'
    });
  }
});

// Get questions for a specific game session (with tracking to avoid repeats)
app.get('/api/sheets/questions/:gameSessionId', async (req, res) => {
  const { gameSessionId } = req.params;
  const { usedIds, count } = req.query;

  try {
    const usedQuestionIds = usedIds ? JSON.parse(usedIds) : [];
    const requestCount = count ? parseInt(count) : null;

    const questions = await sheetsManager.getQuestionsForGame(
      gameSessionId,
      usedQuestionIds,
      requestCount
    );

    res.json({
      success: true,
      questions,
      count: questions.length,
      gameSessionId
    });
  } catch (error) {
    console.error('[Sheets API] Error fetching questions for game:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch questions for game session'
    });
  }
});

// Force refresh the questions cache
app.post('/api/sheets/refresh-cache', async (req, res) => {
  try {
    const questions = await sheetsManager.getQuestionsWithCache('Sheet1', 'A:Z', true);
    res.json({
      success: true,
      message: 'Cache refreshed successfully',
      count: questions.length
    });
  } catch (error) {
    console.error('[Sheets API] Error refreshing cache:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to refresh cache'
    });
  }
});

// Get cache status
app.get('/api/sheets/cache-status', (req, res) => {
  const status = sheetsManager.getCacheStatus();
  res.json({
    success: true,
    ...status
  });
});

// Test endpoint to verify Google Sheets connection
app.get('/api/sheets/test', async (req, res) => {
  try {
    await sheetsManager.initializeSheetsClient();
    res.json({
      success: true,
      message: 'Google Sheets connection successful',
      spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID
    });
  } catch (error) {
    console.error('[Sheets API] Connection test failed:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Google Sheets connection failed',
      error: error.toString()
    });
  }
});

// Store active rooms and players
const rooms = new Map();
const players = new Map();

// Helper function to sync room to Redis
async function syncRoomToRedis(roomId) {
  const room = rooms.get(roomId);
  if (room) {
    // Build playerNames array with current player data before saving
    const roomToSave = {
      ...room,
      playerNames: room.players.map(pid => {
        const p = players.get(pid);
        return {
          id: pid,
          name: p ? p.name : 'Unknown',
          isBot: p ? p.isBot : false
        };
      })
    };
    await roomManager.saveRoom(roomId, roomToSave);
  }
}

// Helper function to sync player to Redis
async function syncPlayerToRedis(playerId) {
  const player = players.get(playerId);
  if (player) {
    await sessionManager.savePlayer(playerId, player);
  }
}

// Helper function to format rooms for broadcasting to clients
// Filters out finished games so they don't show in the lobby
function getRoomsForBroadcast() {
  return Array.from(rooms.values())
    .filter(r => r.status !== 'finished' && r.gamePhase !== 'finished')
    .map(r => ({
      ...r,
      playerNames: r.players.map(pid => {
        const p = players.get(pid);
        return { id: pid, name: p ? p.name : 'Unknown', isBot: p ? p.isBot : false };
      })
    }));
}

// Bot player names pool
const BOT_NAMES = [
  'BotAlex', 'BotSamantha', 'BotJorge', 'BotEmily', 'BotFede'
];

// Track bot IDs
const bots = new Set();

// Bot availability configuration from environment
const BOTS_AVAILABLE = process.env.BOTS_AVAILABLE === 'true';

// Voting game configuration from environment
const POINT_THRESHOLD = parseInt(process.env.POINT_THRESHOLD) || 7;
const VOTING_TIMEOUT_MS = parseInt(process.env.VOTING_TIMEOUT_MS) || 60000;

console.log(`🤖 Bot players are ${BOTS_AVAILABLE ? 'ENABLED' : 'DISABLED'}`);
console.log(`🎯 Point threshold to win: ${POINT_THRESHOLD}`);
console.log(`⏱️ Voting timeout: ${VOTING_TIMEOUT_MS}ms`);

// Placeholder questions for cards (will be replaced by Google Sheets integration)
const PLACEHOLDER_QUESTIONS = [
  "What's a moment that changed your perspective on life?",
  "Share a challenge you've overcome recently.",
  "What do you value most in your relationships?",
  "Describe a time when you had to be brave.",
  "What's something you're grateful for today?",
  "What new experience or skill would make you feel truly alive?",
  "What's a risk you're glad you took?",
  "Who has had the biggest impact on your life and why?",
  "What's a belief you held strongly that has changed over time?",
  "If you could give advice to your younger self, what would it be?",
  "What's something you've always wanted to do but haven't yet?",
  "Describe a moment when you felt truly connected to someone.",
  "What's a lesson you learned the hard way?",
  "What does success mean to you?",
  "What's a fear you've overcome or are working to overcome?",
  "What brings you the most joy in life?",
  "Describe a time you stepped outside your comfort zone.",
  "What's something about yourself you're proud of?",
  "What's a dream you haven't given up on?",
  "How do you handle failure or setbacks?"
];

// Card types for the deck
const CARD_TYPES = ['Inflection Point', 'Insight', 'Reflection'];

// Game configuration for card distribution
// You can adjust these numbers to control how often each card appears in the deck
const CARD_CONFIG = {
  'Inflection Point': 10,  // Number of Inflection Point cards in deck
  'Insight': 10,           // Number of Insight cards in deck
  'Reflection': 10         // Number of Reflection cards in deck
};

// Fisher-Yates shuffle helper
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Function to create and shuffle a card deck with questions
async function createDeck(customConfig = null) {
  const config = customConfig || CARD_CONFIG;

  // Fetch inflection questions from Google Sheets
  let inflectionQuestions = [];
  try {
    inflectionQuestions = await sheetsManager.fetchInflectionQuestions();
    console.log(`📋 Loaded ${inflectionQuestions.length} inflection questions from Google Sheets`);
  } catch (error) {
    console.error('⚠️ Failed to load Google Sheets questions, using placeholders:', error.message);
    inflectionQuestions = PLACEHOLDER_QUESTIONS.map((q, i) => ({ id: i, land: 'General', question: q }));
  }

  // Shuffle inflection questions
  shuffleArray(inflectionQuestions);

  const deck = [];
  let inflectionIndex = 0;

  // Create Inflection Point cards with Google Sheets questions
  const inflectionCount = config['Inflection Point'] || 10;
  for (let i = 0; i < inflectionCount; i++) {
    const q = inflectionQuestions[inflectionIndex % inflectionQuestions.length];
    inflectionIndex++;

    deck.push({
      id: `inflection-point-${i}`,
      type: 'Inflection Point',
      land: q.land,
      question: q.question,
      content: {
        front: q.question,
        land: q.land,
        imageBack: null
      }
    });
  }

  // Create Insight cards - focused on LAST Inflection Point
  const insightCount = config['Insight'] || 10;
  for (let i = 0; i < insightCount; i++) {
    deck.push({
      id: `insight-${i}`,
      type: 'Insight',
      question: null,
      content: {
        front: "What insight did you gain from the last player's response to their Inflection Point?",
        imageBack: null
      }
    });
  }

  // Create Reflection cards - focused on LAST Inflection Point
  const reflectionCount = config['Reflection'] || 10;
  for (let i = 0; i < reflectionCount; i++) {
    deck.push({
      id: `reflection-${i}`,
      type: 'Reflection',
      question: null,
      content: {
        front: 'Share a connection between the last Inflection Point discussion and your own experience.',
        imageBack: null
      }
    });
  }

  // Shuffle the deck
  shuffleArray(deck);

  // Ensure first card is an Inflection Point (move one to the top/last position since we pop)
  const firstInflectionIndex = deck.findIndex(card => card.type === 'Inflection Point');
  if (firstInflectionIndex !== -1 && firstInflectionIndex !== deck.length - 1) {
    const lastIndex = deck.length - 1;
    [deck[firstInflectionIndex], deck[lastIndex]] = [deck[lastIndex], deck[firstInflectionIndex]];
    console.log('🎯 Ensured first card is an Inflection Point');
  }

  console.log(`🃏 Created deck with ${deck.length} cards:`,
    CARD_TYPES.map(type => `${type}: ${config[type] || 10}`).join(', '));

  return deck;
}

// Function to randomly assign turn order
function assignTurnOrder(playerIds) {
  const shuffled = [...playerIds];
  // Fisher-Yates shuffle
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Function to generate a unique bot ID
function generateBotId() {
  return `bot_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

// Function to get an available bot name
function getAvailableBotName() {
  const usedNames = new Set(Array.from(players.values()).map(p => p.name));
  const availableName = BOT_NAMES.find(name => !usedNames.has(name));

  if (availableName) {
    return availableName;
  }

  // If all preset names are taken, generate a numbered one
  let counter = 1;
  while (usedNames.has(`Bot${counter}`)) {
    counter++;
  }
  return `Bot${counter}`;
}

// Function to add a bot to a room
function addBotToRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) {
    return { success: false, error: 'Room not found' };
  }

  if (room.players.length >= room.maxPlayers) {
    return { success: false, error: 'Room is full' };
  }

  const botId = generateBotId();
  const botName = getAvailableBotName();

  // Add bot to players map
  players.set(botId, {
    id: botId,
    name: botName,
    room: roomId,
    isBot: true,
    windowSessionId: `bot_session_${botId}`
  });

  // Add bot to bots set
  bots.add(botId);

  // Add bot to room
  room.players.push(botId);

  console.log(`🤖 Bot ${botName} (${botId}) added to room ${room.name}`);

  return {
    success: true,
    bot: { id: botId, name: botName },
    room: room
  };
}

// Function to remove a bot from a room
function removeBotFromRoom(roomId, botId) {
  const room = rooms.get(roomId);
  if (!room) {
    return { success: false, error: 'Room not found' };
  }

  const bot = players.get(botId);
  if (!bot || !bot.isBot) {
    return { success: false, error: 'Bot not found' };
  }

  // Remove bot from room
  room.players = room.players.filter(id => id !== botId);

  // Remove bot from players map
  players.delete(botId);

  // Remove from bots set
  bots.delete(botId);

  console.log(`🤖 Bot ${bot.name} removed from room ${room.name}`);

  // If room is empty, delete it
  if (room.players.length === 0) {
    console.log(`🗑️ Deleting empty room: ${roomId} "${room.name}"`);
    rooms.delete(roomId);
  }

  return { success: true, bot: bot, room: room };
}

// Function to process voting results and award points
function processVotingResults(roomId, io, rooms, players) {
  const room = rooms.get(roomId);
  if (!room || !room.votingState) {
    console.log('⚠️ processVotingResults called but no voting state found');
    return;
  }

  const { speakerId, speakerName, votes } = room.votingState;

  // Count votes
  let connectionPoints = 0;
  let wisdomPoints = 0;

  Object.values(votes).forEach(vote => {
    if (vote.type === 'connection') connectionPoints++;
    if (vote.type === 'wisdom') wisdomPoints++;
  });

  // Award points to speaker
  if (room.playerPoints[speakerId]) {
    room.playerPoints[speakerId].connection += connectionPoints;
    room.playerPoints[speakerId].wisdom += wisdomPoints;
  }

  const totalPoints = (room.playerPoints[speakerId]?.connection || 0) + (room.playerPoints[speakerId]?.wisdom || 0);

  console.log(`🏆 ${speakerName} received ${connectionPoints} connection and ${wisdomPoints} wisdom points (Total: ${totalPoints}/${room.pointThreshold})`);

  // Update game phase to results
  room.gamePhase = 'results';

  // Check for winner
  const hasWinner = totalPoints >= room.pointThreshold;

  // Broadcast voting results
  io.to(roomId).emit('voting-results', {
    speakerId: speakerId,
    speakerName: speakerName,
    connectionAwarded: connectionPoints,
    wisdomAwarded: wisdomPoints,
    newTotals: room.playerPoints[speakerId],
    playerPoints: room.playerPoints,
    hasWinner: hasWinner,
    gamePhase: room.gamePhase
  });

  // Clear voting state
  room.votingState = null;

  if (hasWinner) {
    // End the game
    endGame(roomId, speakerId, io, rooms, players);
  } else {
    // Wait a moment then advance to next turn
    setTimeout(() => {
      advanceToNextTurn(roomId, io, rooms, players);
    }, 3000); // 3 second delay to show results
  }
}

// Function to advance to next turn
function advanceToNextTurn(roomId, io, rooms, players) {
  const room = rooms.get(roomId);
  if (!room) return;

  // Advance turn index
  room.currentTurnIndex = (room.currentTurnIndex + 1) % room.turnOrder.length;
  room.gamePhase = 'drawing';
  room.currentCard = null;

  const nextPlayerId = room.turnOrder[room.currentTurnIndex];
  const nextPlayer = players.get(nextPlayerId);

  console.log(`➡️ Turn advanced to ${nextPlayer ? nextPlayer.name : 'Unknown'}`);

  // Broadcast turn change
  io.to(roomId).emit('turn-changed', {
    currentPlayerId: nextPlayerId,
    currentPlayerName: nextPlayer ? nextPlayer.name : 'Unknown',
    isBot: nextPlayer ? nextPlayer.isBot : false,
    turnIndex: room.currentTurnIndex,
    gamePhase: room.gamePhase,
    playerPoints: room.playerPoints
  });
}

// Function to end the game
async function endGame(roomId, winnerId, io, rooms, players) {
  const room = rooms.get(roomId);
  if (!room) return;

  room.gamePhase = 'finished';
  room.status = 'finished';

  const winner = players.get(winnerId);
  const winnerName = winner ? winner.name : 'Unknown';

  // Calculate final standings (sorted by total points)
  const standings = room.players.map(pid => {
    const player = players.get(pid);
    const points = room.playerPoints[pid] || { connection: 0, wisdom: 0 };
    return {
      playerId: pid,
      playerName: player ? player.name : 'Unknown',
      isBot: player ? player.isBot : false,
      connection: points.connection,
      wisdom: points.wisdom,
      total: points.connection + points.wisdom
    };
  }).sort((a, b) => b.total - a.total);

  console.log(`🎉 Game ended! Winner: ${winnerName} with ${standings[0].total} points`);

  // Save game results to database
  try {
    if (room.sessionId) {
      await endGameSession(room.sessionId, 'completed');
      console.log(`📊 Game session saved to database: ${room.sessionId}`);
    }
  } catch (dbError) {
    console.warn('[DB] Could not save game session:', dbError.message);
  }

  // Broadcast game ended
  io.to(roomId).emit('game-ended', {
    winnerId: winnerId,
    winnerName: winnerName,
    standings: standings,
    gamePhase: room.gamePhase
  });

  // Update room list to hide finished game from lobby
  io.emit('room-list-updated', getRoomsForBroadcast());

  // Clean up room after delay to allow players to see results
  setTimeout(async () => {
    console.log(`🗑️ Cleaning up finished room: ${room.name} (${roomId})`);

    // Remove players from the room reference
    for (const playerId of room.players) {
      const player = players.get(playerId);
      if (player) {
        player.room = null;
        player.currentRoom = null;
        await syncPlayerToRedis(playerId);
      }
    }

    // Delete Daily.co room if exists
    if (room.dailyRoomName) {
      try {
        await deleteDailyRoom(room.dailyRoomName);
        console.log(`🎙️ Deleted Daily.co room: ${room.dailyRoomName}`);
      } catch (dailyError) {
        console.warn('Could not delete Daily.co room:', dailyError.message);
      }
    }

    // Delete room from memory and Redis
    rooms.delete(roomId);
    await roomManager.deleteRoom(roomId);

    // Update room and player lists
    io.emit('room-list-updated', getRoomsForBroadcast());
    io.emit('player-list-updated', Array.from(players.values()));

    console.log(`✅ Room cleanup complete: ${room.name}`);
  }, 30000); // 30 seconds delay to let players see results and leave
}

// Function to simulate bot conversation
async function simulateBotConversation(roomId, botId, botName) {
  const room = rooms.get(roomId);
  if (!room || !room.conversations) return;

  console.log(`🤖 Starting bot conversation for ${botName}`);

  // Initialize conversation for bot
  if (!room.conversations.has(botName)) {
    room.conversations.set(botName, []);
  }

  const conversationHistory = room.conversations.get(botName);

  // Bot sends initial message after a delay
  setTimeout(async () => {
    const botMessages = [
      "I think learning a new language would make me feel alive. It opens up new cultures and perspectives.",
      "I've always wanted to try rock climbing. The physical challenge and mental focus sound exhilarating.",
      "Teaching others what I've learned would be fulfilling. Sharing knowledge creates meaningful connections.",
      "Traveling to places I've never been excites me. New experiences help us grow.",
      "I'd love to learn an instrument. Music has a way of expressing what words cannot."
    ];

    const initialMessage = botMessages[Math.floor(Math.random() * botMessages.length)];

    const userMessage = {
      id: Date.now() + Math.random(),
      text: initialMessage,
      timestamp: new Date().toLocaleTimeString(),
      playerName: botName,
      roomId: roomId,
      role: 'user',
      isBot: true
    };

    conversationHistory.push(userMessage);

    // Simulate a few exchanges
    try {
      // Get AI response
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: 'system', content: CONVERSATION_SYSTEM_PROMPT },
          { role: 'user', content: initialMessage }
        ],
        max_tokens: 150,
        temperature: 0.7,
      });

      const aiResponse = completion.choices[0].message.content;

      const aiMessage = {
        id: Date.now() + Math.random(),
        text: aiResponse,
        timestamp: new Date().toLocaleTimeString(),
        playerName: 'Life Coach',
        roomId: roomId,
        role: 'assistant',
        isAI: true
      };

      conversationHistory.push(aiMessage);

      // Bot responds one more time after a delay
      setTimeout(async () => {
        const followUpMessages = [
          "It's about pushing boundaries and discovering what I'm truly capable of.",
          "I want to feel that sense of accomplishment that comes from mastering something new.",
          "Connection with others is what makes life meaningful to me.",
          "I think it's time to stop planning and start doing.",
          "I've been in my comfort zone too long. I need a challenge."
        ];

        const followUp = followUpMessages[Math.floor(Math.random() * followUpMessages.length)];

        const followUpMessage = {
          id: Date.now() + Math.random(),
          text: followUp,
          timestamp: new Date().toLocaleTimeString(),
          playerName: botName,
          roomId: roomId,
          role: 'user',
          isBot: true
        };

        conversationHistory.push(followUpMessage);

        // Get final AI response
        const messages = [
          { role: 'system', content: CONVERSATION_SYSTEM_PROMPT },
          { role: 'user', content: initialMessage },
          { role: 'assistant', content: aiResponse },
          { role: 'user', content: followUp }
        ];

        const finalCompletion = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: messages,
          max_tokens: 150,
          temperature: 0.7,
        });

        const finalAiResponse = finalCompletion.choices[0].message.content;

        const finalAiMessage = {
          id: Date.now() + Math.random(),
          text: finalAiResponse,
          timestamp: new Date().toLocaleTimeString(),
          playerName: 'Life Coach',
          roomId: roomId,
          role: 'assistant',
          isAI: true
        };

        conversationHistory.push(finalAiMessage);

        // Mark bot as finished after conversation
        setTimeout(() => {
          if (!room.finishedPlayers) {
            room.finishedPlayers = [];
          }

          if (!room.finishedPlayers.includes(botName)) {
            room.finishedPlayers.push(botName);

            io.to(roomId).emit('player-finished-conversation', {
              playerName: botName,
              finishedCount: room.finishedPlayers.length,
              totalPlayers: room.players.length
            });

            console.log(`🤖 Bot ${botName} finished conversation. ${room.finishedPlayers.length}/${room.players.length} done`);

            // If all players finished, generate summaries
            if (room.finishedPlayers.length === room.players.length) {
              console.log(`All players (including bots) finished. Generating summaries...`);
              generateSummariesForAllPlayers(roomId);
            }
          }
        }, 2000);

      }, 5000 + Math.random() * 3000); // Random delay 5-8 seconds

    } catch (error) {
      console.error(`Error in bot ${botName} conversation:`, error);
      // Bot still finishes even if there's an error
      if (!room.finishedPlayers) {
        room.finishedPlayers = [];
      }
      if (!room.finishedPlayers.includes(botName)) {
        room.finishedPlayers.push(botName);
        io.to(roomId).emit('player-finished-conversation', {
          playerName: botName,
          finishedCount: room.finishedPlayers.length,
          totalPlayers: room.players.length
        });
      }
    }

  }, 3000 + Math.random() * 2000); // Random delay 3-5 seconds to start
}

// Server session ID to detect restarts
const serverSessionId = Date.now().toString();

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ChatGPT conversation system prompt
const CONVERSATION_SYSTEM_PROMPT = `You are a wise, empathetic life coach specializing in personal reinvention and transformation. You help people explore deep questions about their lives with thoughtful, probing questions and gentle guidance.

Your role is to:
- Ask thoughtful follow-up questions that help the person explore their feelings and motivations
- Provide gentle insights and reflections
- Help them discover their own answers rather than giving direct advice
- Be supportive and non-judgmental
- Keep responses concise but meaningful (2-3 sentences max)
- Focus on the person's inner wisdom and potential

The current question being explored is: "What new experience or skill would make you feel truly alive again?"

Start the conversation by warmly greeting the person and gently introducing this question for exploration.`;

// Summary generation system prompt
const SUMMARY_SYSTEM_PROMPT = `Summarize the conversation, show the topics mentioned and create a story in 200 words, about the story described by the participant.

Your task is to:
- Identify the main topics and themes discussed in the conversation
- Extract the key experiences, skills, or aspirations the person mentioned
- Create a compelling narrative story (exactly 200 words) that captures their journey and desires
- Write in an engaging, storytelling style that brings their vision to life
- Focus on their potential transformation and what "feeling truly alive" means to them

Format your response as:
**Topics Discussed:** [List main topics]

**Your Story:**
[Write exactly 200 words telling their story in an engaging narrative format]`;

// Group summary system prompt
const GROUP_SUMMARY_SYSTEM_PROMPT = `Create a summary of the history analyzing the following elements:

- How many words wrote each participant
- What is the final result that you identify for each participant
- Compare what are the interests of each participant
- Integrate a common goal that include the interests of each participant

Format your response as:
# Group Analysis Summary

## Word Count Analysis
[Analyze how many words each participant contributed]

## Individual Results
[For each participant, identify their final result/outcome]

## Interest Comparison
[Compare and contrast the interests of all participants]

## Common Goal Integration
[Identify and articulate a unified goal that encompasses everyone's interests]

## Conclusion
[Provide insights about the group's collective journey]`;

// Function to generate summaries for all players in a room
async function generateSummariesForAllPlayers(roomId) {
  const room = rooms.get(roomId);
  if (!room || !room.conversations) {
    console.log('Room or conversations not found for summary generation');
    return;
  }

  console.log(`Generating summaries for ${room.conversations.size} players in room ${roomId}`);

  // Generate summary for each player
  for (const [playerName, conversationHistory] of room.conversations.entries()) {
    try {
      await generatePlayerSummary(roomId, playerName, conversationHistory);
    } catch (error) {
      console.error(`Error generating summary for ${playerName}:`, error);
    }
  }
}

// Function to generate summary for a specific player
async function generatePlayerSummary(roomId, playerName, conversationHistory) {
  if (conversationHistory.length === 0) {
    console.log(`No conversation history for ${playerName}, skipping summary`);
    return;
  }

  console.log(`Generating summary for ${playerName}...`);

  try {
    // Prepare conversation text for summary
    const conversationText = conversationHistory
      .filter(msg => msg.role === 'user' || msg.role === 'assistant')
      .map(msg => `${msg.role === 'user' ? 'Participant' : 'Life Coach'}: ${msg.text}`)
      .join('\n\n');

    // Generate summary using ChatGPT
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
        { role: 'user', content: `Please summarize this conversation:\n\n${conversationText}` }
      ],
      max_tokens: 400,
      temperature: 0.7,
    });

    const summaryText = completion.choices[0].message.content;
    console.log(`Summary generated for ${playerName}`);

    // Create summary message
    const summaryMessage = {
      id: Date.now() + Math.random(),
      text: summaryText,
      timestamp: new Date().toLocaleTimeString(),
      playerName: 'Summary',
      roomId: roomId,
      role: 'summary',
      isSummary: true
    };

    // Add summary to conversation history
    conversationHistory.push(summaryMessage);

    // Send summary to the specific player
    const room = rooms.get(roomId);
    if (room) {
      const playerSocket = Array.from(io.sockets.sockets.values())
        .find(s => {
          const player = players.get(s.id);
          return player && player.name === playerName && player.room === roomId;
        });

      if (playerSocket) {
        console.log(`✅ Sending summary to ${playerName} via socket ${playerSocket.id}`);
        playerSocket.emit('conversation-summary', summaryMessage);
      } else {
        console.error(`❌ Could not find socket for player ${playerName} in room ${roomId}`);
        console.log('Available players:', Array.from(players.values()).map(p => `${p.name}(${p.id.slice(-4)}) room:${p.room}`));

        // Fallback: send to all players in the room (they'll filter on client side)
        console.log('📡 Broadcasting summary to all players in room as fallback');
        io.to(roomId).emit('conversation-summary', summaryMessage);
      }
    }

  } catch (error) {
    console.error(`ChatGPT summary error for ${playerName}:`, error);

    // Send fallback summary
    const fallbackSummary = {
      id: Date.now() + Math.random(),
      text: "**Topics Discussed:** Personal growth, life experiences, aspirations\n\n**Your Story:**\nYour conversation revealed a thoughtful exploration of what makes life meaningful. Through our dialogue, themes of personal reinvention and the search for experiences that bring vitality emerged. Your reflections touched on the importance of stepping outside comfort zones and embracing new challenges. The discussion highlighted your desire for growth and transformation, suggesting that feeling truly alive comes from pursuing authentic experiences that align with your values. Your journey represents the universal human quest for purpose and the courage to evolve. Whether through learning new skills, exploring different perspectives, or connecting more deeply with others, your path forward is illuminated by the insights shared. This conversation marks a moment of self-discovery, where possibilities become clearer and the vision of a more vibrant life takes shape. Your story is one of potential waiting to unfold, of dreams ready to be pursued, and of a spirit eager to embrace what lies ahead.",
      timestamp: new Date().toLocaleTimeString(),
      playerName: 'Summary',
      roomId: roomId,
      role: 'summary',
      isSummary: true
    };

    conversationHistory.push(fallbackSummary);

    const room = rooms.get(roomId);
    if (room) {
      const playerSocket = Array.from(io.sockets.sockets.values())
        .find(s => {
          const player = players.get(s.id);
          return player && player.name === playerName && player.room === roomId;
        });

      if (playerSocket) {
        console.log(`✅ Sending fallback summary to ${playerName} via socket ${playerSocket.id}`);
        playerSocket.emit('conversation-summary', fallbackSummary);
      } else {
        console.error(`❌ Could not find socket for player ${playerName} in room ${roomId} (fallback)`);
        console.log('Available players:', Array.from(players.values()).map(p => `${p.name}(${p.id.slice(-4)}) room:${p.room}`));

        // Fallback: send to all players in the room (they'll filter on client side)
        console.log('📡 Broadcasting fallback summary to all players in room');
        io.to(roomId).emit('conversation-summary', fallbackSummary);
      }
    }
  }
}

// Function to generate group summary from all participants' summaries
async function generateGroupSummary(roomId) {
  const room = rooms.get(roomId);
  if (!room || !room.conversations) {
    console.log('Room or conversations not found for group summary generation');
    return null;
  }

  console.log(`Generating group summary for room ${roomId} with ${room.conversations.size} participants`);

  try {
    // Collect all individual summaries and conversation data
    const participantData = [];

    for (const [playerName, conversationHistory] of room.conversations.entries()) {
      // Find the summary message for this participant
      const summaryMessage = conversationHistory.find(msg => msg.isSummary);

      // Count words from user messages only
      const userMessages = conversationHistory.filter(msg => msg.role === 'user');
      const wordCount = userMessages.reduce((count, msg) => {
        return count + (msg.text ? msg.text.trim().split(/\s+/).length : 0);
      }, 0);

      participantData.push({
        name: playerName,
        wordCount: wordCount,
        summary: summaryMessage ? summaryMessage.text : 'No summary available',
        userMessages: userMessages.map(msg => msg.text).join(' ')
      });
    }

    // Prepare the prompt with all participant data
    const participantSummaries = participantData.map(participant =>
      `**${participant.name}** (${participant.wordCount} words):\n${participant.summary}`
    ).join('\n\n');

    const promptText = `Here are the individual summaries from ${participantData.length} participants:\n\n${participantSummaries}`;

    // Generate group summary using ChatGPT
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: 'system', content: GROUP_SUMMARY_SYSTEM_PROMPT },
        { role: 'user', content: promptText }
      ],
      max_tokens: 800,
      temperature: 0.7,
    });

    const groupSummaryText = completion.choices[0].message.content;
    console.log(`Group summary generated for room ${roomId}`);

    return {
      roomId: roomId,
      participantCount: participantData.length,
      text: groupSummaryText,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error(`Error generating group summary for room ${roomId}:`, error);

    // Return fallback group summary
    const participantNames = Array.from(room.conversations.keys());
    return {
      roomId: roomId,
      participantCount: participantNames.length,
      text: `# Group Analysis Summary

## Word Count Analysis
This session included ${participantNames.length} participants: ${participantNames.join(', ')}. Each participant contributed thoughtfully to exploring what would make them feel truly alive again.

## Individual Results
Each participant engaged in meaningful self-reflection about personal growth and transformation. Through guided conversation, they explored their desires for new experiences and skills that could bring vitality to their lives.

## Interest Comparison
Common themes emerged around personal growth, stepping outside comfort zones, and pursuing authentic experiences. While each participant's specific interests were unique, all shared a desire for meaningful change and personal development.

## Common Goal Integration
The unified goal for this group centers on **embracing transformative experiences that align with personal values and bring genuine fulfillment**. This encompasses everyone's interest in growth, authenticity, and living more vibrantly.

## Conclusion
This group represents a collective journey toward personal reinvention, with each member supporting the others' quest for a more alive and meaningful existence.`,
      timestamp: new Date().toISOString()
    };
  }
}

io.on('connection', async (socket) => {
  const windowSessionId = socket.handshake.query.browserSessionId; // Keep same parameter name for compatibility
  console.log('New client connected:', socket.id, 'Window Session:', windowSessionId);

  let playerId;
  let reconnected = false;

  try {
    // Get or create persistent player ID
    playerId = await sessionManager.getOrCreatePlayerId(windowSessionId);
    console.log(`Player ID for this session: ${playerId}`);

    // Map socket to player
    await sessionManager.mapSocketToPlayer(socket.id, playerId);

    // Check if this player has existing session data in Redis
    const existingPlayerData = await sessionManager.getPlayer(playerId);

    if (existingPlayerData && existingPlayerData.currentRoom) {
      console.log(`🔄 Reconnecting player ${playerId} (${existingPlayerData.name}) to room ${existingPlayerData.currentRoom}`);
      reconnected = true;

      // Restore player to memory
      players.set(playerId, {
        id: playerId,
        name: existingPlayerData.name,
        room: existingPlayerData.currentRoom,
        windowSessionId: windowSessionId,
        socketId: socket.id,
        isBot: existingPlayerData.isBot || false
      });

      // Try to restore room from Redis
      let room = rooms.get(existingPlayerData.currentRoom);
      if (!room) {
        // Room not in memory, try loading from Redis
        room = await roomManager.getRoom(existingPlayerData.currentRoom);
        if (room) {
          rooms.set(existingPlayerData.currentRoom, room);
          console.log(`📥 Loaded room ${existingPlayerData.currentRoom} from Redis`);
        }
      }

      if (room) {
        // Update room with new socket connection
        if (!room.players.includes(playerId)) {
          room.players.push(playerId);
        }

        // Join socket.io room
        socket.join(existingPlayerData.currentRoom);

        // Send reconnection confirmation to client
        // Build enriched room data with player names and turn order
        const playerNames = room.players.map(pid => {
          const p = players.get(pid);
          return {
            id: pid,
            name: p ? p.name : 'Unknown',
            isBot: p ? p.isBot : false
          };
        });

        // Build enriched turn order if game is playing
        let turnOrderWithNames = room.turnOrder;
        if (room.status === 'playing' && room.turnOrder) {
          turnOrderWithNames = room.turnOrder.map(pid => {
            const p = players.get(pid);
            return {
              id: pid,
              name: p ? p.name : 'Unknown',
              isBot: p ? p.isBot : false
            };
          });
        }

        socket.emit('reconnected', {
          playerId: playerId,
          playerName: existingPlayerData.name,
          room: {
            ...room,
            playerNames: playerNames,
            turnOrder: turnOrderWithNames,
            currentPlayerId: room.turnOrder ? room.turnOrder[room.currentTurnIndex || 0] : null
          }
        });

        // Notify other players in room about reconnection
        socket.to(existingPlayerData.currentRoom).emit('player-reconnected', {
          playerId: playerId,
          playerName: existingPlayerData.name
        });

        // Sync updated room to Redis
        await syncRoomToRedis(existingPlayerData.currentRoom);

        console.log(`✅ Player ${existingPlayerData.name} successfully reconnected to room ${existingPlayerData.currentRoom}`);
      } else {
        console.log(`⚠️ Room ${existingPlayerData.currentRoom} not found, clearing player's room association`);
        const player = players.get(playerId);
        if (player) {
          player.room = null;
          await syncPlayerToRedis(playerId);
        }
      }
    }

    // Check if this window session already has a different socket connection
    const existingPlayer = Array.from(players.values()).find(p =>
      p.windowSessionId === windowSessionId && p.id !== playerId
    );
    if (existingPlayer) {
      console.log('🔄 Removing old connection for window session:', windowSessionId, 'Old player:', existingPlayer.id);
      players.delete(existingPlayer.id);
      if (existingPlayer.room) {
        const room = rooms.get(existingPlayer.room);
        if (room) {
          room.players = room.players.filter(id => id !== existingPlayer.id);
          if (room.players.length === 0) {
            console.log('🗑️ Deleting empty room:', existingPlayer.room, `"${room.name}" is now available again`);
            rooms.delete(existingPlayer.room);
            await roomManager.deleteRoom(existingPlayer.room);
          } else {
            await syncRoomToRedis(existingPlayer.room);
          }
        }
      }
    }

  } catch (error) {
    console.error('Error during connection setup:', error);
    playerId = socket.id; // Fallback to socket ID
  }

  // Send server session ID and configuration to client for restart detection
  socket.emit('server-session', {
    sessionId: serverSessionId,
    botsAvailable: BOTS_AVAILABLE,
    reconnected: reconnected
  });

  // Handle player joining
  socket.on('join-lobby', async (playerData) => {
    console.log(`🔵 Player joining lobby: ${playerData.name} (Socket: ${socket.id}, Player: ${playerId}, UserId: ${playerData.userId || 'none'})`);

    const userId = playerData.userId || null;

    // If userId is provided, clean up any old player entries for this user (from previous sessions)
    // Also clean up legacy entries (no userId) with the same name
    if (userId) {
      const oldPlayerEntries = Array.from(players.entries()).filter(([id, p]) =>
        id !== playerId && (
          p.userId === userId || // Same user, different session
          (p.name.toLowerCase() === playerData.name.toLowerCase() && !p.userId) // Legacy entry with same name
        )
      );
      for (const [oldPlayerId, oldPlayer] of oldPlayerEntries) {
        console.log(`🧹 Cleaning up old player entry: ${oldPlayer.name} (${oldPlayerId}, userId: ${oldPlayer.userId || 'none'})`);
        players.delete(oldPlayerId);
        // Also clean up from Redis
        const redis = getRedisClient();
        if (redis) {
          await redis.del(`player:${oldPlayerId}`);
        }
      }
    }

    // Check if name is already taken by another player (excluding same userId)
    const nameInUse = Array.from(players.values()).find(p =>
      p.name.toLowerCase() === playerData.name.toLowerCase() &&
      p.id !== playerId &&
      (!userId || p.userId !== userId) // Exclude players with the same userId
    );

    if (nameInUse) {
      console.log(`❌ Name '${playerData.name}' is already in use by player ${nameInUse.id}`);
      socket.emit('name-taken', {
        message: `The name "${playerData.name}" is already in use. Please choose a different name.`,
        takenBy: nameInUse.id
      });
      return;
    }

    const existingPlayer = players.get(playerId);
    if (existingPlayer) {
      console.log(`🔄 Player already in lobby, updating info: ${playerData.name}`);
      // Update existing player info
      existingPlayer.name = playerData.name;
      existingPlayer.socketId = socket.id;
      existingPlayer.userId = userId; // Update userId in case it wasn't set before
    } else {
      // Add new player with persistent ID
      players.set(playerId, {
        id: playerId,
        name: playerData.name,
        room: null,
        currentRoom: null,
        windowSessionId: windowSessionId,
        socketId: socket.id,
        isBot: false,
        userId: userId // Store userId for future reference
      });
      console.log(`✅ New player added to lobby: ${playerData.name} (Player ID: ${playerId}, User ID: ${userId})`);
    }

    // Sync player to Redis
    await syncPlayerToRedis(playerId);

    console.log(`📊 Total players in lobby: ${players.size}`);
    console.log(`👥 Current players:`, Array.from(players.values()).map(p => `${p.name}(${p.id.slice(0, 8)}...)`));

    socket.emit('lobby-joined', {
      playerId: playerId,
      rooms: Array.from(rooms.values())
    });

    // Broadcast updated player list to ALL clients (including sender)
    io.emit('player-list-updated', Array.from(players.values()));
  });

  // Handle room creation
  socket.on('create-room', async (roomData) => {
    console.log('Creating room:', roomData);

    // Validate room data
    if (!roomData.name || roomData.name.trim().length === 0) {
      socket.emit('create-room-error', 'Room name is required');
      return;
    }

    // Check if room name already exists (case-insensitive)
    const trimmedName = roomData.name.trim();
    const existingRoom = Array.from(rooms.values()).find(room =>
      room.name.toLowerCase() === trimmedName.toLowerCase()
    );

    if (existingRoom) {
      console.log(`❌ Room name '${trimmedName}' already exists`);
      socket.emit('create-room-error', `Room name "${trimmedName}" is already taken. Please choose a different name.`);
      return;
    }

    if (roomData.maxPlayers < 2 || roomData.maxPlayers > 8) {
      socket.emit('create-room-error', 'Max players must be between 2 and 8');
      return;
    }

    const roomId = Date.now().toString();
    const player = players.get(playerId);

    const room = {
      id: roomId,
      name: roomData.name.trim(),
      players: [playerId],
      maxPlayers: roomData.maxPlayers || 4,
      status: 'waiting',
      hostId: playerId,
      createdAt: new Date().toISOString()
    };

    rooms.set(roomId, room);
    socket.join(roomId);

    // Update player's room
    if (player) {
      player.room = roomId;
      player.currentRoom = roomId;
      await syncPlayerToRedis(playerId);
    }

    // Sync room to Redis
    await syncRoomToRedis(roomId);

    console.log('Room created successfully:', room.id, 'by player:', playerId);
    console.log('Current rooms:', Array.from(rooms.keys()));

    // Send room created confirmation to the creator
    socket.emit('room-created', room);

    // Broadcast updated room list to ALL clients
    io.emit('room-list-updated', getRoomsForBroadcast());

    // Update player list since player is now in a room
    io.emit('player-list-updated', Array.from(players.values()));
  });

  // Handle joining a room
  socket.on('join-room', async (roomId) => {
    console.log(`🎯 Player attempting to join room: ${roomId} (Player: ${playerId})`);
    console.log(`🏠 Available rooms: [${Array.from(rooms.keys()).join(', ')}]`);
    console.log(`👥 Players in lobby: ${players.size}`);

    // Check if player exists in players map, if not, they need to join lobby first
    if (!players.has(playerId)) {
      console.log(`❌ Player ${playerId} not in lobby, cannot join room`);
      console.log(`📋 Current lobby players:`, Array.from(players.keys()).map(id => id.slice(0, 8)));
      socket.emit('join-room-error', 'You must join the lobby first. Please refresh the page.');
      return;
    }

    const player = players.get(playerId);
    console.log(`✅ Player found in lobby: ${player.name} (${playerId.slice(0, 8)})`);

    // If player is already in a room, remove them from the old room first
    if (player.room && player.room !== roomId) {
      const oldRoom = rooms.get(player.room);
      if (oldRoom) {
        oldRoom.players = oldRoom.players.filter(id => id !== playerId);
        console.log(`🚪 Removed player from old room: ${oldRoom.name}`);
        await syncRoomToRedis(player.room);
      }
    }

    const room = rooms.get(roomId);
    if (!room) {
      console.log('Room not found:', roomId);
      console.log('All rooms:', Array.from(rooms.entries()));
      socket.emit('join-room-error', 'Room does not exist');
      return;
    }

    console.log('Room found:', room.name, 'Current players:', room.players.length, 'Max players:', room.maxPlayers);

    // Check if player is already in this room
    if (room.players.includes(playerId)) {
      console.log('Player already in room:', playerId);

      // Join socket.io room
      socket.join(roomId);

      // Create room data with player names and finished players
      const playerNames = room.players.map(pid => {
        const p = players.get(pid);
        return { id: pid, name: p ? p.name : 'Unknown', isBot: p ? p.isBot : false };
      });

      // Build enriched turn order if game is playing
      let turnOrderWithNames = room.turnOrder;
      if (room.status === 'playing' && room.turnOrder) {
        turnOrderWithNames = room.turnOrder.map(pid => {
          const p = players.get(pid);
          return {
            id: pid,
            name: p ? p.name : 'Unknown',
            isBot: p ? p.isBot : false
          };
        });
      }

      const roomWithPlayerNames = {
        ...room,
        playerNames: playerNames,
        turnOrder: turnOrderWithNames,
        finishedPlayers: room.finishedPlayers || [],
        currentPlayerId: room.turnOrder ? room.turnOrder[room.currentTurnIndex || 0] : null,
        deckSize: room.deck ? room.deck.length : 0,
        // Include voice chat info for reconnection
        voiceChat: room.dailyRoomUrl ? {
          url: room.dailyRoomUrl,
          roomName: room.dailyRoomName
        } : null
      };

      socket.emit('room-joined', {
        ...roomWithPlayerNames,
        playerId: playerId  // Add persistent player ID
      });
      return;
    }

    // Check if room is full
    if (room.players.length >= room.maxPlayers) {
      console.log('Room is full:', roomId, 'Current players:', room.players.length, 'Max:', room.maxPlayers);
      socket.emit('join-room-error', 'Room is full');
      return;
    }

    // Check if room is already playing
    if (room.status === 'playing') {
      // Check if this player was originally part of the game (in turnOrder)
      const wasInGame = room.turnOrder && room.turnOrder.some(p => p.id === playerId || p === playerId);

      if (wasInGame) {
        // Allow rejoining - add player back to room
        console.log(`✅ Player ${playerId} rejoining game in progress`);
        room.players.push(playerId);
        socket.join(roomId);

        // Update player's room
        if (player) {
          player.room = roomId;
          player.currentRoom = roomId;
          await syncPlayerToRedis(playerId);
        }

        // Sync room to Redis
        await syncRoomToRedis(roomId);

        // Build player names
        const playerNames = room.players.map(pid => {
          const p = players.get(pid);
          return { id: pid, name: p ? p.name : 'Unknown', isBot: p ? p.isBot : false };
        });

        // Build enriched turn order
        const turnOrderWithNames = room.turnOrder.map(pid => {
          const id = typeof pid === 'object' ? pid.id : pid;
          const p = players.get(id);
          return {
            id: id,
            name: p ? p.name : (typeof pid === 'object' ? pid.name : 'Unknown'),
            isBot: p ? p.isBot : (typeof pid === 'object' ? pid.isBot : false)
          };
        });

        const roomWithPlayerNames = {
          ...room,
          playerNames: playerNames,
          turnOrder: turnOrderWithNames,
          finishedPlayers: room.finishedPlayers || [],
          currentPlayerId: room.turnOrder ? (typeof room.turnOrder[room.currentTurnIndex || 0] === 'object' ? room.turnOrder[room.currentTurnIndex || 0].id : room.turnOrder[room.currentTurnIndex || 0]) : null,
          deckSize: room.deck ? room.deck.length : 0,
          voiceChat: room.dailyRoomUrl ? {
            url: room.dailyRoomUrl,
            roomName: room.dailyRoomName
          } : null
        };

        socket.emit('room-joined', {
          ...roomWithPlayerNames,
          playerId: playerId
        });

        // Notify other players about the rejoin
        socket.to(roomId).emit('player-rejoined', {
          playerId: playerId,
          playerName: player.name,
          room: roomWithPlayerNames
        });

        // Update room list for lobby
        io.emit('room-list-updated', getRoomsForBroadcast());

        return;
      }

      console.log('Room is already playing:', roomId);
      socket.emit('join-room-error', 'Game is already in progress');
      return;
    }

    // Add player to room
    room.players.push(playerId);
    socket.join(roomId);

    // Update player's room
    if (player) {
      player.room = roomId;
      player.currentRoom = roomId;
      await syncPlayerToRedis(playerId);
    }

    // Sync room to Redis
    await syncRoomToRedis(roomId);

    console.log('Player joined room successfully:', playerId, 'Room:', roomId, 'New player count:', room.players.length);

    // Create room data with player names and finished players
    const playerNames = room.players.map(pid => {
      const p = players.get(pid);
      return { id: pid, name: p ? p.name : 'Unknown', isBot: p ? p.isBot : false };
    });

    // Build enriched turn order if game is playing
    let turnOrderWithNames = room.turnOrder;
    if (room.status === 'playing' && room.turnOrder) {
      turnOrderWithNames = room.turnOrder.map(pid => {
        const p = players.get(pid);
        return {
          id: pid,
          name: p ? p.name : 'Unknown',
          isBot: p ? p.isBot : false
        };
      });
    }

    const roomWithPlayerNames = {
      ...room,
      playerNames: playerNames,
      turnOrder: turnOrderWithNames,
      finishedPlayers: room.finishedPlayers || [],
      currentPlayerId: room.turnOrder ? room.turnOrder[room.currentTurnIndex || 0] : null,
      deckSize: room.deck ? room.deck.length : 0,
      // Include voice chat info for reconnection
      voiceChat: room.dailyRoomUrl ? {
        url: room.dailyRoomUrl,
        roomName: room.dailyRoomName
      } : null
    };

    // Notify the player they joined successfully
    socket.emit('room-joined', {
      ...roomWithPlayerNames,
      playerId: playerId  // Add persistent player ID
    });

    // Notify all players in the room about the new player
    io.to(roomId).emit('player-joined-room', {
      playerId: playerId,
      room: roomWithPlayerNames
    });

    // Broadcast updated room list to ALL clients
    io.emit('room-list-updated', getRoomsForBroadcast());

    // Update player list since player is now in a room
    io.emit('player-list-updated', Array.from(players.values()));
  });

  // Handle game start
  socket.on('start-game', async (roomId) => {
    const room = rooms.get(roomId);
    if (room && room.players.includes(playerId)) {
      room.status = 'playing';
      room.conversations = new Map(); // Track individual conversations
      room.finishedPlayers = []; // Track who has finished their conversation

      // Initialize turn system
      room.turnOrder = assignTurnOrder(room.players);
      room.currentTurnIndex = 0;
      room.deck = await createDeck();
      room.drawnCards = []; // Track cards that have been drawn

      // Initialize voting system state
      room.gamePhase = 'drawing'; // 'drawing' | 'talking' | 'voting' | 'results' | 'finished'
      room.playerPoints = {};
      room.players.forEach(pid => {
        room.playerPoints[pid] = { connection: 0, wisdom: 0 };
      });
      room.votingState = null;
      room.pointThreshold = POINT_THRESHOLD;
      room.currentCard = null;
      room.consecutiveNonInflection = 0; // Track consecutive non-Inflection Point turns

      console.log(`🎮 Game started with voting system. Threshold: ${POINT_THRESHOLD} points`);

      // Get player names for turn order display
      const turnOrderWithNames = room.turnOrder.map(pid => {
        const player = players.get(pid);
        return {
          id: pid,
          name: player ? player.name : 'Unknown',
          isBot: player ? player.isBot : false
        };
      });

      // Create Daily.co voice chat room
      let dailyRoomData = null;
      let sessionId = uuidv4();

      try {
        const playersList = room.players.map(pid => {
          const player = players.get(pid);
          return {
            id: pid,
            name: player ? player.name : 'Unknown',
            isBot: player ? player.isBot : false
          };
        });

        // Only create Daily room for non-bot players
        const humanPlayers = playersList.filter(p => !p.isBot);

        console.log(`[Voice Chat] Creating Daily room for ${humanPlayers.length} human players out of ${playersList.length} total players`);

        if (humanPlayers.length > 0) {
          console.log(`[Voice Chat] Calling createDailyRoom for room ${roomId}`);
          dailyRoomData = await createDailyRoom(roomId, playersList);
          console.log(`[Voice Chat] Daily room created successfully:`, dailyRoomData);

          room.dailyRoomUrl = dailyRoomData.url;
          room.dailyRoomName = dailyRoomData.name;
          room.sessionId = sessionId;

          console.log(`[Voice Chat] Created Daily room for game: ${roomId}`);
          console.log(`[Voice Chat] Room URL: ${dailyRoomData.url}`);

          // Create game session in database
          try {
            await createGameSession({
              id: sessionId,
              roomId: roomId,
              roomName: room.name,
              dailyRoomName: dailyRoomData.name,
              dailyRoomUrl: dailyRoomData.url,
              playerCount: room.players.length,
            });

            console.log(`[DB] Created game session: ${sessionId}`);
          } catch (dbError) {
            console.warn('[DB] Could not save session (run setup-database.sh to enable):', dbError.message);
            // Voice chat will still work without database
          }
        } else {
          console.log(`[Voice Chat] No human players, skipping Daily room creation`);
        }
      } catch (error) {
        console.error('[Voice Chat] Error creating Daily room:', error);
        console.error('[Voice Chat] Error stack:', error.stack);
        // Continue without voice chat if creation fails
      }

      io.to(roomId).emit('game-started', {
        ...room,
        turnOrder: turnOrderWithNames,
        currentPlayerId: room.turnOrder[0],
        deckSize: room.deck.length,
        gamePhase: room.gamePhase,
        playerPoints: room.playerPoints,
        pointThreshold: room.pointThreshold,
        voiceChat: dailyRoomData ? {
          url: dailyRoomData.url,
          roomName: dailyRoomData.name,
        } : null,
      });

      // Sync room to Redis
      await syncRoomToRedis(roomId);

      // Start bot conversations automatically
      room.players.forEach(pid => {
        const player = players.get(pid);
        if (player && player.isBot) {
          simulateBotConversation(roomId, pid, player.name);
        }
      });
    }
  });

  // Handle drawing a card
  socket.on('draw-card', (data) => {
    const { roomId, playerId } = data;
    const room = rooms.get(roomId);

    if (!room) {
      socket.emit('draw-card-error', 'Room not found');
      return;
    }

    // Verify it's the player's turn
    const currentPlayer = room.turnOrder[room.currentTurnIndex];
    if (currentPlayer !== playerId) {
      socket.emit('draw-card-error', 'Not your turn');
      return;
    }

    // Verify game phase is 'drawing'
    if (room.gamePhase !== 'drawing') {
      socket.emit('draw-card-error', 'Cannot draw card in current phase');
      return;
    }

    // Check if deck is empty
    if (room.deck.length === 0) {
      socket.emit('draw-card-error', 'Deck is empty');
      return;
    }

    // Force Inflection Point if 2 consecutive non-Inflection turns have passed
    let drawnCard;
    if (room.consecutiveNonInflection >= 2) {
      // Find an Inflection Point card in the deck
      const inflectionIndex = room.deck.findIndex(card => card.type === 'Inflection Point');
      if (inflectionIndex !== -1) {
        // Remove the Inflection Point card from its position
        drawnCard = room.deck.splice(inflectionIndex, 1)[0];
        console.log(`🎯 Forced Inflection Point card after ${room.consecutiveNonInflection} non-Inflection turns`);
      } else {
        // No Inflection Point cards left, draw normally
        drawnCard = room.deck.pop();
      }
    } else {
      // Draw the top card normally
      drawnCard = room.deck.pop();
    }

    // Update consecutive non-Inflection counter
    if (drawnCard.type === 'Inflection Point') {
      room.consecutiveNonInflection = 0;
    } else {
      room.consecutiveNonInflection++;
    }

    room.drawnCards.push({
      ...drawnCard,
      drawnBy: playerId,
      timestamp: new Date().toISOString()
    });

    // Update game phase to 'talking'
    room.gamePhase = 'talking';
    room.currentCard = drawnCard;

    const player = players.get(playerId);
    console.log(`🃏 ${player ? player.name : 'Unknown'} drew a ${drawnCard.type} card: "${drawnCard.question}"`);

    // Broadcast the drawn card to all players in the room
    io.to(roomId).emit('card-drawn', {
      card: drawnCard,
      playerId: playerId,
      playerName: player ? player.name : 'Unknown',
      deckSize: room.deck.length,
      isBot: player ? player.isBot : false,
      gamePhase: room.gamePhase
    });
  });

  // Handle finish-turn (starts voting phase)
  socket.on('finish-turn', (data) => {
    const { roomId, playerId } = data;
    const room = rooms.get(roomId);

    if (!room) {
      socket.emit('finish-turn-error', 'Room not found');
      return;
    }

    // Verify it's the current player's turn
    const currentPlayer = room.turnOrder[room.currentTurnIndex];
    if (currentPlayer !== playerId) {
      socket.emit('finish-turn-error', 'Not your turn');
      return;
    }

    // Verify game phase is 'talking'
    if (room.gamePhase !== 'talking') {
      socket.emit('finish-turn-error', 'Cannot finish turn in current phase');
      return;
    }

    const speaker = players.get(playerId);
    const speakerName = speaker ? speaker.name : 'Unknown';

    // Get expected voters (all players except the speaker)
    const expectedVoters = room.players.filter(pid => pid !== playerId);

    // If only one player (or no other players), skip voting phase
    if (expectedVoters.length === 0) {
      console.log(`⏭️ No other players to vote, skipping voting phase`);
      advanceToNextTurn(roomId, io, rooms, players);
      return;
    }

    // Initialize voting state
    room.gamePhase = 'voting';
    room.votingState = {
      speakerId: playerId,
      speakerName: speakerName,
      votes: {},
      expectedVoters: expectedVoters,
      votingStartTime: Date.now()
    };

    console.log(`🗳️ Voting phase started for ${speakerName}. Expected voters: ${expectedVoters.length}`);

    // Start voting timeout
    room.votingTimeoutId = setTimeout(() => {
      processVotingResults(roomId, io, rooms, players);
    }, VOTING_TIMEOUT_MS);

    // Handle bot voting automatically
    expectedVoters.forEach(voterId => {
      const voter = players.get(voterId);
      if (voter && voter.isBot) {
        // Bots vote randomly after a short delay
        setTimeout(() => {
          const voteOptions = ['connection', 'wisdom', 'skip'];
          const randomVote = voteOptions[Math.floor(Math.random() * voteOptions.length)];

          if (room.votingState && !room.votingState.votes[voterId]) {
            room.votingState.votes[voterId] = {
              type: randomVote,
              timestamp: Date.now()
            };

            console.log(`🤖 Bot ${voter.name} voted: ${randomVote}`);

            // Broadcast vote count update
            io.to(roomId).emit('vote-count-updated', {
              voteCount: Object.keys(room.votingState.votes).length,
              expectedVotes: room.votingState.expectedVoters.length
            });

            // Check if all votes are in
            if (Object.keys(room.votingState.votes).length >= room.votingState.expectedVoters.length) {
              clearTimeout(room.votingTimeoutId);
              processVotingResults(roomId, io, rooms, players);
            }
          }
        }, 1000 + Math.random() * 2000); // Random delay 1-3 seconds
      }
    });

    // Broadcast voting phase started
    io.to(roomId).emit('voting-phase-started', {
      speakerId: playerId,
      speakerName: speakerName,
      expectedVoters: expectedVoters.map(vid => {
        const v = players.get(vid);
        return { id: vid, name: v ? v.name : 'Unknown', isBot: v ? v.isBot : false };
      }),
      timeout: VOTING_TIMEOUT_MS,
      gamePhase: room.gamePhase
    });
  });

  // Handle vote submission
  socket.on('submit-vote', (data) => {
    const { roomId, voterId, voteType } = data;
    const room = rooms.get(roomId);

    if (!room) {
      socket.emit('submit-vote-error', 'Room not found');
      return;
    }

    if (room.gamePhase !== 'voting' || !room.votingState) {
      socket.emit('submit-vote-error', 'Not in voting phase');
      return;
    }

    // Validate voter is expected
    if (!room.votingState.expectedVoters.includes(voterId)) {
      socket.emit('submit-vote-error', 'You cannot vote');
      return;
    }

    // Validate vote type
    if (!['connection', 'wisdom', 'skip'].includes(voteType)) {
      socket.emit('submit-vote-error', 'Invalid vote type');
      return;
    }

    // Check if already voted
    if (room.votingState.votes[voterId]) {
      socket.emit('submit-vote-error', 'Already voted');
      return;
    }

    // Record vote
    room.votingState.votes[voterId] = {
      type: voteType,
      timestamp: Date.now()
    };

    const voter = players.get(voterId);
    console.log(`🗳️ ${voter ? voter.name : 'Unknown'} voted: ${voteType}`);

    // Broadcast vote count update (anonymous)
    io.to(roomId).emit('vote-count-updated', {
      voteCount: Object.keys(room.votingState.votes).length,
      expectedVotes: room.votingState.expectedVoters.length
    });

    // Check if all votes are in
    if (Object.keys(room.votingState.votes).length >= room.votingState.expectedVoters.length) {
      clearTimeout(room.votingTimeoutId);
      processVotingResults(roomId, io, rooms, players);
    }
  });

  // Legacy next-turn handler (for backwards compatibility)
  socket.on('next-turn', (data) => {
    const { roomId } = data;
    const room = rooms.get(roomId);

    if (!room) {
      socket.emit('next-turn-error', 'Room not found');
      return;
    }

    // If in talking phase, treat as finish-turn
    if (room.gamePhase === 'talking') {
      const currentPlayer = room.turnOrder[room.currentTurnIndex];
      socket.emit('finish-turn', { roomId, playerId: currentPlayer });
      return;
    }

    // Otherwise just advance turn (legacy behavior)
    advanceToNextTurn(roomId, io, rooms, players);
  });

  // Handle adding a bot to a room
  socket.on('add-bot', async (roomId) => {
    console.log(`🤖 Request to add bot to room ${roomId}`);

    // Check if bots are enabled
    if (!BOTS_AVAILABLE) {
      console.log('❌ Bot addition blocked - bots are disabled in server configuration');
      socket.emit('bot-add-error', 'Bot players are currently disabled on this server');
      return;
    }

    const result = addBotToRoom(roomId);

    if (result.success) {
      const room = result.room;

      // Sync bot player to Redis
      await syncPlayerToRedis(result.bot.id);

      // Sync room to Redis
      await syncRoomToRedis(roomId);

      // Create room data with player names
      const roomWithPlayerNames = {
        ...room,
        playerNames: room.players.map(pid => {
          const p = players.get(pid);
          return { id: pid, name: p ? p.name : 'Unknown', isBot: p ? p.isBot : false };
        }),
        finishedPlayers: room.finishedPlayers || []
      };

      // Notify all players in the room about the bot
      io.to(roomId).emit('player-joined-room', {
        playerId: result.bot.id,
        room: roomWithPlayerNames
      });

      // Broadcast updated room list to ALL clients
      io.emit('room-list-updated', getRoomsForBroadcast());

      // Update player list
      io.emit('player-list-updated', Array.from(players.values()));

      socket.emit('bot-added', { success: true, bot: result.bot });
    } else {
      socket.emit('bot-add-error', result.error);
    }
  });

  // Handle removing a bot from a room
  socket.on('remove-bot', (data) => {
    console.log(`🤖 Request to remove bot ${data.botId} from room ${data.roomId}`);

    // Check if bots are enabled
    if (!BOTS_AVAILABLE) {
      console.log('❌ Bot removal blocked - bots are disabled in server configuration');
      socket.emit('bot-remove-error', 'Bot players are currently disabled on this server');
      return;
    }

    const result = removeBotFromRoom(data.roomId, data.botId);

    if (result.success) {
      const room = result.room;

      if (room) {
        // Create room data with player names
        const roomWithPlayerNames = {
          ...room,
          playerNames: room.players.map(playerId => {
            const p = players.get(playerId);
            return { id: playerId, name: p ? p.name : 'Unknown', isBot: p ? p.isBot : false };
          }),
          finishedPlayers: room.finishedPlayers || []
        };

        // Notify all players in the room about the bot removal
        io.to(data.roomId).emit('player-left-room', {
          playerId: data.botId,
          playerName: result.bot.name,
          room: roomWithPlayerNames
        });
      }

      // Broadcast updated room list to ALL clients
      io.emit('room-list-updated', getRoomsForBroadcast());

      // Update player list
      io.emit('player-list-updated', Array.from(players.values()));

      socket.emit('bot-removed', { success: true });
    } else {
      socket.emit('bot-remove-error', result.error);
    }
  });

  // Handle conversation messages (private to each player)
  socket.on('conversation-message', async (data) => {
    console.log('Conversation message from:', data.playerName, ':', data.text);

    const room = rooms.get(data.roomId);
    if (!room) return;

    // Initialize conversation history if needed
    if (!room.conversations) {
      room.conversations = new Map();
    }
    if (!room.conversations.has(data.playerName)) {
      room.conversations.set(data.playerName, []);
    }

    const conversationHistory = room.conversations.get(data.playerName);

    // Add user message to history
    const userMessage = {
      ...data,
      role: 'user',
      timestamp: new Date().toISOString()
    };
    conversationHistory.push(userMessage);

    // Send user message back to client immediately
    socket.emit('conversation-message', userMessage);

    try {
      // Prepare messages for ChatGPT
      const messages = [
        { role: 'system', content: CONVERSATION_SYSTEM_PROMPT }
      ];

      // Add conversation history
      conversationHistory.forEach(msg => {
        if (msg.role === 'user') {
          messages.push({ role: 'user', content: msg.text });
        } else if (msg.role === 'assistant') {
          messages.push({ role: 'assistant', content: msg.text });
        }
      });

      console.log(`Sending to ChatGPT for ${data.playerName}:`, messages.length, 'messages');

      // Get ChatGPT response
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: messages,
        max_tokens: 150,
        temperature: 0.7,
      });

      const aiResponse = completion.choices[0].message.content;
      console.log(`ChatGPT response for ${data.playerName}:`, aiResponse);

      // Create AI message
      const aiMessage = {
        id: Date.now() + 1,
        text: aiResponse,
        timestamp: new Date().toLocaleTimeString(),
        playerName: 'Life Coach',
        roomId: data.roomId,
        role: 'assistant',
        isAI: true
      };

      // Add AI response to history
      conversationHistory.push(aiMessage);

      // Send AI response to client
      setTimeout(() => {
        socket.emit('conversation-message', aiMessage);
      }, 1000); // Small delay to make it feel more natural

    } catch (error) {
      console.error('ChatGPT API error:', error);

      // Send fallback message
      const fallbackMessage = {
        id: Date.now() + 1,
        text: "I'm here to listen and explore this question with you. What thoughts or feelings come up when you think about what might make you feel truly alive?",
        timestamp: new Date().toLocaleTimeString(),
        playerName: 'Life Coach',
        roomId: data.roomId,
        role: 'assistant',
        isAI: true
      };

      conversationHistory.push(fallbackMessage);
      socket.emit('conversation-message', fallbackMessage);
    }
  });

  // Handle starting a conversation (auto-triggered)
  socket.on('start-conversation', async (data) => {
    console.log('Starting conversation for:', data.playerName);

    const room = rooms.get(data.roomId);
    if (!room) return;

    // Initialize conversation if needed
    if (!room.conversations) {
      room.conversations = new Map();
    }
    if (!room.conversations.has(data.playerName)) {
      room.conversations.set(data.playerName, []);
    }

    const conversationHistory = room.conversations.get(data.playerName);

    // If conversation already started, don't restart
    if (conversationHistory.length > 0) {
      // Send existing conversation history
      conversationHistory.forEach(msg => {
        socket.emit('conversation-message', msg);
      });
      return;
    }

    try {
      // Get initial ChatGPT greeting
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: 'system', content: CONVERSATION_SYSTEM_PROMPT }
        ],
        max_tokens: 150,
        temperature: 0.7,
      });

      const aiResponse = completion.choices[0].message.content;
      console.log(`Initial ChatGPT greeting for ${data.playerName}:`, aiResponse);

      // Create AI greeting message
      const aiMessage = {
        id: Date.now(),
        text: aiResponse,
        timestamp: new Date().toLocaleTimeString(),
        playerName: 'Life Coach',
        roomId: data.roomId,
        role: 'assistant',
        isAI: true
      };

      // Add to history and send to client
      conversationHistory.push(aiMessage);

      setTimeout(() => {
        socket.emit('conversation-message', aiMessage);
      }, 1500); // Delay for natural feel

    } catch (error) {
      console.error('ChatGPT initial greeting error:', error);

      // Send fallback greeting
      const fallbackMessage = {
        id: Date.now(),
        text: "Welcome! I'm here to explore a meaningful question with you: What new experience or skill would make you feel truly alive again? Take your time to reflect, and share whatever comes to mind.",
        timestamp: new Date().toLocaleTimeString(),
        playerName: 'Life Coach',
        roomId: data.roomId,
        role: 'assistant',
        isAI: true
      };

      conversationHistory.push(fallbackMessage);
      socket.emit('conversation-message', fallbackMessage);
    }
  });

  // Handle room state requests
  socket.on('get-room-state', (roomId) => {
    const room = rooms.get(roomId);
    if (room) {
      socket.emit('room-state-update', {
        finishedPlayers: room.finishedPlayers || []
      });
    }
  });

  // Handle player finishing their conversation
  socket.on('finish-conversation', (data) => {
    console.log('Player finished conversation:', data.playerName);

    const room = rooms.get(data.roomId);
    if (room) {
      if (!room.finishedPlayers) {
        room.finishedPlayers = [];
      }

      if (!room.finishedPlayers.includes(data.playerName)) {
        room.finishedPlayers.push(data.playerName);

        // Broadcast to all players in the room that this player finished
        io.to(data.roomId).emit('player-finished-conversation', {
          playerName: data.playerName,
          finishedCount: room.finishedPlayers.length,
          totalPlayers: room.players.length
        });

        console.log(`Room ${data.roomId}: ${room.finishedPlayers.length}/${room.players.length} players finished`);

        // Check if all players have finished
        if (room.finishedPlayers.length === room.players.length) {
          console.log(`All players finished in room ${data.roomId}. Starting summary generation...`);
          generateSummariesForAllPlayers(data.roomId);
        }
      }
    }
  });

  // Handle group summary generation
  socket.on('generate-group-summary', async (data) => {
    console.log('Group summary requested for room:', data.roomId);

    const room = rooms.get(data.roomId);
    if (!room) {
      socket.emit('group-summary-error', 'Room not found');
      return;
    }

    // Check if all players have finished their conversations
    if (!room.finishedPlayers || room.finishedPlayers.length !== room.players.length) {
      socket.emit('group-summary-error', 'Not all players have finished their conversations');
      return;
    }

    try {
      const groupSummary = await generateGroupSummary(data.roomId);

      if (groupSummary) {
        // Send group summary to all players in the room
        io.to(data.roomId).emit('group-summary-generated', groupSummary);
        console.log(`✅ Group summary sent to all players in room ${data.roomId}`);

        // Mark game session as completed in database
        if (room.sessionId) {
          try {
            await endGameSession(room.sessionId, 'completed');
            console.log(`[DB] Game session ended: ${room.sessionId}`);
          } catch (error) {
            console.error('[DB] Error ending game session:', error);
          }
        }

        // Schedule transcript retrieval (Daily needs time to process)
        if (room.dailyRoomName) {
          console.log(`[Voice Chat] Scheduling transcript retrieval for room: ${room.dailyRoomName}`);

          setTimeout(async () => {
            try {
              const transcripts = await getDailyTranscripts(room.dailyRoomName);

              if (transcripts && transcripts.length > 0 && room.sessionId) {
                await saveTranscripts(room.sessionId, transcripts);
                console.log(`[Voice Chat] Saved ${transcripts.length} transcripts for session: ${room.sessionId}`);

                // Notify players that transcripts are ready
                io.to(data.roomId).emit('transcripts-ready', {
                  sessionId: room.sessionId,
                  count: transcripts.length,
                });
              }

              // Clean up Daily room
              await deleteDailyRoom(room.dailyRoomName);
              console.log(`[Voice Chat] Deleted Daily room: ${room.dailyRoomName}`);
            } catch (error) {
              console.error('[Voice Chat] Error retrieving transcripts:', error);
            }
          }, 120000); // Wait 2 minutes for Daily to process transcripts
        }
      } else {
        socket.emit('group-summary-error', 'Failed to generate group summary');
      }
    } catch (error) {
      console.error('Error in group summary generation:', error);
      socket.emit('group-summary-error', 'An error occurred while generating the group summary');
    }
  });

  // Handle explicit room leaving
  socket.on('leave-room', async (roomId) => {
    console.log(`🚪 Player ${playerId} explicitly leaving room: ${roomId}`);

    const player = players.get(playerId);
    if (!player) {
      console.log(`❌ Player ${playerId} not found in players map`);
      return;
    }

    const room = rooms.get(roomId || player.room);
    if (!room) {
      console.log(`❌ Room ${roomId || player.room} not found`);
      return;
    }

    // Remove player from room
    room.players = room.players.filter(id => id !== playerId);
    socket.leave(room.id);

    // Update player's room status (return to lobby)
    player.room = null;
    player.currentRoom = null;
    await syncPlayerToRedis(playerId);

    console.log(`✅ Player ${player.name} left room ${room.name}. Remaining players: ${room.players.length}`);

    // Notify other players in the room about the departure
    if (room.players.length > 0) {
      io.to(room.id).emit('player-left-room', {
        playerId: playerId,
        playerName: player.name,
        room: {
          ...room,
          playerNames: room.players.map(pid => {
            const p = players.get(pid);
            return { id: pid, name: p ? p.name : 'Unknown', isBot: p ? p.isBot : false };
          })
        }
      });
    }

    // If room is now empty, delete it
    if (room.players.length === 0) {
      console.log(`🗑️ Deleting empty room: ${room.id} "${room.name}" is now available again`);
      rooms.delete(room.id);
      await roomManager.deleteRoom(room.id);
    } else {
      await syncRoomToRedis(room.id);
    }

    // Broadcast updated room and player lists with proper player names
    io.emit('room-list-updated', getRoomsForBroadcast());
    io.emit('player-list-updated', Array.from(players.values()));

    // Confirm to the leaving player
    socket.emit('room-left', {
      success: true,
      message: `Successfully left room "${room.name}"`,
      roomId: room.id
    });
  });

  // Handle disconnect
  socket.on('disconnect', async () => {
    console.log('Client disconnected:', socket.id);

    try {
      // Get player ID from socket mapping
      const disconnectedPlayerId = await sessionManager.getPlayerIdBySocket(socket.id);

      if (!disconnectedPlayerId) {
        console.log(`⚠️ Disconnected socket ${socket.id} has no player mapping`);
        return;
      }

      const player = players.get(disconnectedPlayerId);

      // If player not in memory, they may have connected but never joined lobby
      if (!player) {
        console.log(`ℹ️ Socket ${socket.id.slice(0, 8)}... disconnected (player ${disconnectedPlayerId.slice(0, 8)}... was not in lobby)`);
        // Still delete the socket mapping and mark as disconnected in Redis
        await sessionManager.deleteSocketMapping(socket.id);
        await sessionManager.markPlayerDisconnected(disconnectedPlayerId);
        return;
      }

      // Player was in lobby/room
      console.log(`🔌 Player ${player.name} (${disconnectedPlayerId.slice(0, 8)}...) disconnected`);

      // Mark player as disconnected in Redis with TTL
      await sessionManager.markPlayerDisconnected(disconnectedPlayerId);

      if (player.room) {
        const room = rooms.get(player.room);
        if (room) {
          // Don't remove player from room immediately - they might reconnect
          console.log(`⏳ Player ${player.name} temporarily disconnected from room "${room.name}". Waiting for reconnection...`);

          // Notify other players in the room about the disconnection
          if (room.players.length > 0) {
            socket.to(player.room).emit('player-disconnected', {
              playerId: disconnectedPlayerId,
              playerName: player.name,
              temporary: true,
              room: {
                ...room,
                playerNames: room.players.map(pid => {
                  const p = players.get(pid);
                  return { id: pid, name: p ? p.name : 'Unknown', isBot: p ? p.isBot : false };
                })
              }
            });
          }

          // Sync room state to Redis
          await syncRoomToRedis(player.room);
        }
      }

      // Keep player in memory for now (Redis TTL will handle cleanup)
      console.log(`👥 Total players in lobby: ${players.size} (player kept for potential reconnection)`);

      // Delete socket mapping
      await sessionManager.deleteSocketMapping(socket.id);

    } catch (error) {
      console.error('Error handling disconnect:', error);
    }
  });
});

// Serve static files from React build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../build')));

  // Handle React routing, return all requests to React app
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../build/index.html'));
  });
}

const PORT = process.env.PORT || process.env.SERVER_PORT || 3001;

// Initialize Redis and start server
async function startServer() {
  try {
    // Start HTTP server FIRST so health checks can pass
    server.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      if (process.env.NODE_ENV === 'production') {
        console.log(`Serving React app from: ${path.join(__dirname, '../build')}`);
      }
    });

    // THEN initialize Redis connection (won't block server startup)
    try {
      await initializeRedis();
      console.log('✅ Redis initialized successfully');

      // Try to load any existing rooms from Redis
      try {
        const savedRooms = await roomManager.loadAllRooms();
        if (savedRooms.size > 0) {
          // Merge saved rooms into memory and restore bot players
          for (const [roomId, roomData] of savedRooms.entries()) {
            // Restore bot players to the players Map first
            if (roomData.playerNames && Array.isArray(roomData.playerNames)) {
              for (const playerInfo of roomData.playerNames) {
                // Check if this is a bot
                if (playerInfo.isBot || playerInfo.id.startsWith('bot_')) {
                  players.set(playerInfo.id, {
                    id: playerInfo.id,
                    name: playerInfo.name,
                    room: roomId,
                    isBot: true,
                    windowSessionId: `bot_session_${playerInfo.id}`
                  });
                  bots.add(playerInfo.id);
                  console.log(`🤖 Restored bot ${playerInfo.name} (${playerInfo.id}) to room ${roomData.name}`);
                }
              }
            }

            // Now set the room with updated playerNames
            rooms.set(roomId, roomData);
          }
          console.log(`📥 Restored ${savedRooms.size} rooms from Redis`);
        }
      } catch (error) {
        console.log('ℹ️ No existing rooms to restore:', error.message);
      }
    } catch (redisError) {
      console.error('⚠️ Redis initialization failed (server will continue without Redis):', redisError.message);
      console.error('Some features may be limited without Redis');
    }

    console.log('✅ Server startup complete');
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await closeRedis();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('\nSIGINT received, shutting down gracefully...');
  await closeRedis();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Start the server
startServer();