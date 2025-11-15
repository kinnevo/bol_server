const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const OpenAI = require('openai');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? [
        process.env.CLIENT_URL || "https://your-frontend-app.up.railway.app",
        "https://bolrailway-production.up.railway.app",
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
  const { name } = req.body;

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

  // Check if name is already taken
  const nameInUse = Array.from(players.values()).find(p =>
    p.name.toLowerCase() === trimmedName.toLowerCase()
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

// Store active rooms and players
const rooms = new Map();
const players = new Map();

// Bot player names pool
const BOT_NAMES = [
  'BotAlex', 'BotSamantha', 'BotJorge', 'BotEmily', 'BotFede',
  'BotTaylor', 'BotCasey', 'BotMorgan', 'BotAvery', 'BotRiley'
];

// Track bot IDs
const bots = new Set();

// Bot availability configuration from environment
const BOTS_AVAILABLE = process.env.BOTS_AVAILABLE === 'false';

console.log(`🤖 Bot players are ${BOTS_AVAILABLE ? 'ENABLED' : 'DISABLED'}`);

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

io.on('connection', (socket) => {
  const windowSessionId = socket.handshake.query.browserSessionId; // Keep same parameter name for compatibility
  console.log('New client connected:', socket.id, 'Window Session:', windowSessionId);

  // Check if this window session already has a player
  const existingPlayer = Array.from(players.values()).find(p => p.windowSessionId === windowSessionId);
  if (existingPlayer && existingPlayer.id !== socket.id) {
    console.log('🔄 Removing old connection for window session:', windowSessionId, 'Old socket:', existingPlayer.id);
    // Remove the old player entry
    players.delete(existingPlayer.id);
    // Remove from any rooms
    if (existingPlayer.room) {
      const room = rooms.get(existingPlayer.room);
      if (room) {
        room.players = room.players.filter(id => id !== existingPlayer.id);
        if (room.players.length === 0) {
          console.log('🗑️ Deleting empty room:', existingPlayer.room, `"${room.name}" is now available again`);
          rooms.delete(existingPlayer.room);
        }
      }
    }
  }

  // Send server session ID and configuration to client for restart detection
  socket.emit('server-session', {
    sessionId: serverSessionId,
    botsAvailable: BOTS_AVAILABLE
  });

  // Handle player joining
  socket.on('join-lobby', (playerData) => {
    console.log(`🔵 Player joining lobby: ${playerData.name} (Socket: ${socket.id})`);

    // Check if name is already taken by another player
    const nameInUse = Array.from(players.values()).find(p =>
      p.name.toLowerCase() === playerData.name.toLowerCase() && p.id !== socket.id
    );

    if (nameInUse) {
      console.log(`❌ Name '${playerData.name}' is already in use by player ${nameInUse.id}`);
      socket.emit('name-taken', {
        message: `The name "${playerData.name}" is already in use. Please choose a different name.`,
        takenBy: nameInUse.id
      });
      return;
    }

    const existingPlayer = players.get(socket.id);
    if (existingPlayer) {
      console.log(`🔄 Player already in lobby, updating info: ${playerData.name}`);
      // Update existing player info
      existingPlayer.name = playerData.name;
    } else {
      // Add new player with window session ID
      players.set(socket.id, {
        id: socket.id,
        name: playerData.name,
        room: null,
        windowSessionId: windowSessionId
      });
      console.log(`✅ New player added to lobby: ${playerData.name} (Window: ${windowSessionId})`);
    }

    console.log(`📊 Total players in lobby: ${players.size}`);
    console.log(`👥 Current players:`, Array.from(players.values()).map(p => `${p.name}(${p.id.slice(-4)})`));

    socket.emit('lobby-joined', {
      playerId: socket.id,
      rooms: Array.from(rooms.values())
    });

    // Broadcast updated player list to ALL clients (including sender)
    io.emit('player-list-updated', Array.from(players.values()));
  });

  // Handle room creation
  socket.on('create-room', (roomData) => {
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
    const player = players.get(socket.id);

    const room = {
      id: roomId,
      name: roomData.name.trim(),
      players: [socket.id],
      maxPlayers: roomData.maxPlayers || 4,
      status: 'waiting',
      hostId: socket.id,
      createdAt: new Date().toISOString()
    };

    rooms.set(roomId, room);
    socket.join(roomId);

    // Update player's room
    if (player) {
      player.room = roomId;
    }

    console.log('Room created successfully:', room.id, 'by player:', socket.id);
    console.log('Current rooms:', Array.from(rooms.keys()));

    // Send room created confirmation to the creator
    socket.emit('room-created', room);

    // Broadcast updated room list to ALL clients
    io.emit('room-list-updated', Array.from(rooms.values()));

    // Update player list since player is now in a room
    io.emit('player-list-updated', Array.from(players.values()));
  });

  // Handle joining a room
  socket.on('join-room', (roomId) => {
    console.log(`🎯 Player attempting to join room: ${roomId} (Socket: ${socket.id})`);
    console.log(`🏠 Available rooms: [${Array.from(rooms.keys()).join(', ')}]`);
    console.log(`👥 Players in lobby: ${players.size}`);

    // Check if player exists in players map, if not, they need to join lobby first
    if (!players.has(socket.id)) {
      console.log(`❌ Player ${socket.id} not in lobby, cannot join room`);
      console.log(`📋 Current lobby players:`, Array.from(players.keys()).map(id => id.slice(-4)));
      socket.emit('join-room-error', 'You must join the lobby first. Please refresh the page.');
      return;
    }

    const player = players.get(socket.id);
    console.log(`✅ Player found in lobby: ${player.name} (${socket.id.slice(-4)})`);

    // If player is already in a room, remove them from the old room first
    if (player.room) {
      const oldRoom = rooms.get(player.room);
      if (oldRoom) {
        oldRoom.players = oldRoom.players.filter(id => id !== socket.id);
        console.log(`🚪 Removed player from old room: ${oldRoom.name}`);
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
    if (room.players.includes(socket.id)) {
      console.log('Player already in room:', socket.id);

      // Create room data with player names and finished players
      const roomWithPlayerNames = {
        ...room,
        playerNames: room.players.map(playerId => {
          const p = players.get(playerId);
          return { id: playerId, name: p ? p.name : 'Unknown' };
        }),
        finishedPlayers: room.finishedPlayers || []
      };

      socket.emit('room-joined', roomWithPlayerNames);
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
      console.log('Room is already playing:', roomId);
      socket.emit('join-room-error', 'Game is already in progress');
      return;
    }

    // Add player to room
    room.players.push(socket.id);
    socket.join(roomId);

    // Update player's room
    if (player) {
      player.room = roomId;
    }

    console.log('Player joined room successfully:', socket.id, 'Room:', roomId, 'New player count:', room.players.length);

    // Create room data with player names and finished players
    const roomWithPlayerNames = {
      ...room,
      playerNames: room.players.map(playerId => {
        const p = players.get(playerId);
        return { id: playerId, name: p ? p.name : 'Unknown' };
      }),
      finishedPlayers: room.finishedPlayers || []
    };

    // Notify the player they joined successfully
    socket.emit('room-joined', roomWithPlayerNames);

    // Notify all players in the room about the new player
    io.to(roomId).emit('player-joined-room', {
      playerId: socket.id,
      room: roomWithPlayerNames
    });

    // Broadcast updated room list to ALL clients
    io.emit('room-list-updated', Array.from(rooms.values()));

    // Update player list since player is now in a room
    io.emit('player-list-updated', Array.from(players.values()));
  });

  // Handle game start
  socket.on('start-game', (roomId) => {
    const room = rooms.get(roomId);
    if (room && room.players.includes(socket.id)) {
      room.status = 'playing';
      room.conversations = new Map(); // Track individual conversations
      room.finishedPlayers = []; // Track who has finished their conversation
      io.to(roomId).emit('game-started', room);

      // Start bot conversations automatically
      room.players.forEach(playerId => {
        const player = players.get(playerId);
        if (player && player.isBot) {
          simulateBotConversation(roomId, playerId, player.name);
        }
      });
    }
  });

  // Handle adding a bot to a room
  socket.on('add-bot', (roomId) => {
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

      // Create room data with player names
      const roomWithPlayerNames = {
        ...room,
        playerNames: room.players.map(playerId => {
          const p = players.get(playerId);
          return { id: playerId, name: p ? p.name : 'Unknown', isBot: p ? p.isBot : false };
        }),
        finishedPlayers: room.finishedPlayers || []
      };

      // Notify all players in the room about the bot
      io.to(roomId).emit('player-joined-room', {
        playerId: result.bot.id,
        room: roomWithPlayerNames
      });

      // Broadcast updated room list to ALL clients
      io.emit('room-list-updated', Array.from(rooms.values()));

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
      io.emit('room-list-updated', Array.from(rooms.values()));

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
      } else {
        socket.emit('group-summary-error', 'Failed to generate group summary');
      }
    } catch (error) {
      console.error('Error in group summary generation:', error);
      socket.emit('group-summary-error', 'An error occurred while generating the group summary');
    }
  });

  // Handle explicit room leaving
  socket.on('leave-room', (roomId) => {
    console.log(`🚪 Player ${socket.id} explicitly leaving room: ${roomId}`);

    const player = players.get(socket.id);
    if (!player) {
      console.log(`❌ Player ${socket.id} not found in players map`);
      return;
    }

    const room = rooms.get(roomId || player.room);
    if (!room) {
      console.log(`❌ Room ${roomId || player.room} not found`);
      return;
    }

    // Remove player from room
    room.players = room.players.filter(id => id !== socket.id);
    socket.leave(room.id);

    // Update player's room status (return to lobby)
    player.room = null;

    console.log(`✅ Player ${player.name} left room ${room.name}. Remaining players: ${room.players.length}`);

    // Notify other players in the room about the departure
    if (room.players.length > 0) {
      io.to(room.id).emit('player-left-room', {
        playerId: socket.id,
        playerName: player.name,
        room: {
          ...room,
          playerNames: room.players.map(playerId => {
            const p = players.get(playerId);
            return { id: playerId, name: p ? p.name : 'Unknown' };
          })
        }
      });
    }

    // If room is now empty, delete it
    if (room.players.length === 0) {
      console.log(`🗑️ Deleting empty room: ${room.id} "${room.name}" is now available again`);
      rooms.delete(room.id);
    }

    // Broadcast updated room and player lists
    io.emit('room-list-updated', Array.from(rooms.values()));
    io.emit('player-list-updated', Array.from(players.values()));

    // Confirm to the leaving player
    socket.emit('room-left', {
      success: true,
      message: `Successfully left room "${room.name}"`,
      roomId: room.id
    });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);

    const player = players.get(socket.id);
    if (player) {
      console.log(`🔌 Player ${player.name} (${socket.id.slice(-4)}) disconnected`);

      if (player.room) {
        const room = rooms.get(player.room);
        if (room) {
          // Remove player from room
          room.players = room.players.filter(id => id !== socket.id);
          console.log(`📤 Removed ${player.name} from room "${room.name}". Remaining players: ${room.players.length}`);

          // Notify other players in the room about the disconnection
          if (room.players.length > 0) {
            io.to(player.room).emit('player-left-room', {
              playerId: socket.id,
              playerName: player.name,
              room: {
                ...room,
                playerNames: room.players.map(playerId => {
                  const p = players.get(playerId);
                  return { id: playerId, name: p ? p.name : 'Unknown' };
                })
              },
              reason: 'disconnected'
            });
          }

          // If room is now empty, delete it
          if (room.players.length === 0) {
            console.log(`🗑️ Deleting empty room: ${player.room} "${room.name}" is now available again`);
            rooms.delete(player.room);
          }

          // Broadcast updated room list
          io.emit('room-list-updated', Array.from(rooms.values()));
        }
      }

      // Remove player from players map
      players.delete(socket.id);
      console.log(`👥 Total players remaining: ${players.size}`);

      // Broadcast updated player list
      io.emit('player-list-updated', Array.from(players.values()));
    } else {
      console.log(`⚠️ Disconnected client ${socket.id} was not found in players map`);
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
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  if (process.env.NODE_ENV === 'production') {
    console.log(`Serving React app from: ${path.join(__dirname, '../build')}`);
  }
});