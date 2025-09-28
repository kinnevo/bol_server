# BOL Game Server

Backend server for the BOL multiplayer game with WebSocket support and OpenAI integration.

## Features

- Real-time multiplayer game rooms using Socket.IO
- OpenAI integration for AI life coach conversations
- Player and room management
- Conversation summaries and group analysis
- RESTful API endpoints

## Environment Setup

1. Copy the example environment file:
```bash
cp env.example .env
```

2. Add your OpenAI API key to the `.env` file:
```
OPENAI_API_KEY=your_actual_openai_api_key_here
NODE_ENV=development
CLIENT_URL=http://localhost:3000
PORT=3001
```

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

## Production

```bash
npm start
```

## API Endpoints

- `GET /debug/rooms` - Debug endpoint to check active rooms and players
- `POST /api/check-room-name` - Check if room name is available
- `POST /api/check-player-name` - Check if player name is available in room

## WebSocket Events

The server handles various Socket.IO events for real-time game functionality:
- Room creation and joining
- Player management
- Game state synchronization
- Chat and conversation handling
- Summary generation

## Deployment

This server is configured for Railway deployment. The `railway.toml` file contains the deployment configuration.
