# Voice Chat Setup Guide

## Overview

This guide will help you set up voice chat with transcription for the Book of Life (BOL) game. The implementation uses Daily.co for real-time voice communication and PostgreSQL for storing transcripts.

## Prerequisites

1. **Daily.co Account**: Sign up at [https://daily.co](https://daily.co)
2. **PostgreSQL Database**: Required for storing transcripts
3. **Railway Account** (recommended): For easy database deployment

---

## Step 1: Create Daily.co Account

1. Go to [https://daily.co](https://daily.co) and sign up
2. Navigate to the **Dashboard**
3. Go to **Settings** → **API Keys**
4. Copy your **API key**
5. Your domain will be in the format: `yourname.daily.co`

---

## Step 2: Set Up PostgreSQL Database

### Option A: Using Railway (Recommended)

1. Go to [Railway.app](https://railway.app)
2. Create a new project
3. Click **+ New** → **Database** → **Add PostgreSQL**
4. Once created, click on the database
5. Go to the **Connect** tab
6. Copy the **Connection String** (starts with `postgresql://`)

### Option B: Local PostgreSQL

```bash
# Install PostgreSQL (Ubuntu/Debian)
sudo apt-get install postgresql postgresql-contrib

# Create database
sudo -u postgres createdb bol_game

# Your connection string will be:
# postgresql://postgres:password@localhost:5432/bol_game
```

---

## Step 3: Configure Environment Variables

### Server (.env file)

Update `/home/rico/Desktop/Dev/1_RbR/bol-server/.env`:

```env
# Daily.co Configuration
DAILY_API_KEY=your_daily_api_key_here
DAILY_DOMAIN=yourname.daily.co

# PostgreSQL Configuration
DATABASE_URL=postgresql://user:password@host:5432/bol_game
```

### Client (.env file)

Update `/home/rico/Desktop/Dev/1_RbR/bol-client/.env`:

```env
REACT_APP_DAILY_DOMAIN=yourname.daily.co
```

---

## Step 4: Run Database Migrations

```bash
cd /home/rico/Desktop/Dev/1_RbR/bol-server

# Run migration to create tables
npm run migrate:up
```

This will create three tables:
- `game_sessions` - Stores game session metadata
- `voice_transcripts` - Stores individual transcript segments
- `transcript_analysis` - Stores AI-generated analysis

---

## Step 5: Start the Application

### Terminal 1 - Server
```bash
cd /home/rico/Desktop/Dev/1_RbR/bol-server
npm run dev
```

### Terminal 2 - Client
```bash
cd /home/rico/Desktop/Dev/1_RbR/bol-client
npm start
```

---

## How It Works

### 1. Game Start
- When a game starts, the server creates a Daily.co room
- The room URL is sent to all players
- Players automatically join the voice chat

### 2. During Game
- All players' microphones are enabled by default
- Players can mute/unmute using the voice chat controls
- Real-time participant list shows who's speaking

### 3. Game End
- When the game ends (group summary generated), the server:
  - Marks the session as completed in the database
  - Waits 2 minutes for Daily.co to process transcripts
  - Retrieves and saves transcripts to PostgreSQL
  - Notifies players that transcripts are ready
  - Deletes the Daily.co room

### 4. Transcript Storage
Each transcript entry includes:
- Player ID and name
- Transcript text
- Timestamp
- Duration
- Confidence score

---

## Database Schema

### game_sessions
```sql
- id (UUID) - Primary key, links to transcripts
- room_id (VARCHAR) - Game room identifier
- room_name (VARCHAR) - Human-readable room name
- daily_room_name (VARCHAR) - Daily.co room identifier
- daily_room_url (TEXT) - Daily.co room URL
- started_at (TIMESTAMP) - When game started
- ended_at (TIMESTAMP) - When game ended
- player_count (INTEGER) - Number of players
- status (VARCHAR) - 'active', 'completed', 'abandoned'
```

### voice_transcripts
```sql
- id (SERIAL) - Auto-increment primary key
- session_id (UUID) - Foreign key to game_sessions
- player_id (UUID) - Player identifier
- player_name (VARCHAR) - Player name
- transcript_text (TEXT) - The transcribed speech
- timestamp (TIMESTAMP) - When spoken
- start_time (FLOAT) - Seconds from recording start
- duration_seconds (FLOAT) - Length of speech segment
- confidence (FLOAT) - Transcription confidence (0-1)
```

### transcript_analysis
```sql
- id (SERIAL) - Auto-increment primary key
- session_id (UUID) - Foreign key to game_sessions
- analysis_type (VARCHAR) - 'sentiment', 'keywords', 'summary'
- analysis_result (JSONB) - Analysis data in JSON format
```

---

## Accessing Transcripts

### Via Database Query

```sql
-- Get all transcripts for a session
SELECT * FROM voice_transcripts
WHERE session_id = 'your-session-uuid'
ORDER BY timestamp ASC;

-- Get session with transcripts
SELECT
  gs.room_name,
  gs.started_at,
  gs.ended_at,
  vt.player_name,
  vt.transcript_text,
  vt.timestamp
FROM game_sessions gs
LEFT JOIN voice_transcripts vt ON gs.id = vt.session_id
WHERE gs.id = 'your-session-uuid'
ORDER BY vt.timestamp ASC;
```

### Via API (Future Enhancement)

You can add API endpoints like:
- `GET /api/sessions/:sessionId/transcripts`
- `GET /api/sessions/:sessionId/analysis`

---

## Troubleshooting

### Voice chat doesn't start

1. Check Daily.co credentials in `.env`
2. Verify `DAILY_API_KEY` and `DAILY_DOMAIN` are correct
3. Check server console for errors: `[Voice Chat]` or `[Daily]`

### Transcripts not saving

1. Check database connection: `[DB]` logs in server console
2. Verify `DATABASE_URL` is correct
3. Check migrations ran: `npm run migrate:up`
4. Look for transcript processing logs after game ends

### Database connection errors

```bash
# Test connection
psql "postgresql://user:password@host:5432/bol_game"

# Check if tables exist
\dt

# Should show: game_sessions, voice_transcripts, transcript_analysis
```

### Migration issues

```bash
# Check migration status
npx node-pg-migrate status

# Rollback if needed
npm run migrate:down

# Re-run migration
npm run migrate:up
```

---

## Daily.co Pricing

- **Free Tier**: 10,000 minutes/month
- **Transcription**: Included in free tier (with limits)
- **Recording**: Cloud recording included

For production use, review [Daily.co pricing](https://www.daily.co/pricing).

---

## Future Enhancements

### Planned Features

1. **Real-time transcription display** during the game
2. **Sentiment analysis** of conversation (using OpenAI)
3. **Keyword extraction** for game insights
4. **Downloadable transcript PDFs**
5. **Player-specific transcript filtering**
6. **Voice activity indicators** in the UI

### API Endpoints to Add

```javascript
// Server routes to implement
app.get('/api/sessions/:sessionId', getSession);
app.get('/api/sessions/:sessionId/transcripts', getTranscripts);
app.get('/api/sessions/:sessionId/analysis', getAnalysis);
app.post('/api/sessions/:sessionId/analyze', createAnalysis);
```

---

## Security Considerations

1. **API Keys**: Never commit `.env` files to git
2. **Database**: Use SSL in production (`ssl: { rejectUnauthorized: false }`)
3. **Daily.co tokens**: Consider using meeting tokens for enhanced security
4. **Transcript privacy**: Add access control for viewing transcripts

---

## Support

For issues or questions:
- Daily.co docs: [https://docs.daily.co](https://docs.daily.co)
- PostgreSQL docs: [https://www.postgresql.org/docs/](https://www.postgresql.org/docs/)
- node-pg-migrate: [https://salsita.github.io/node-pg-migrate/](https://salsita.github.io/node-pg-migrate/)

---

## Migration Commands Reference

```bash
# Create a new migration
npm run migrate:create migration_name

# Run all pending migrations
npm run migrate:up

# Rollback last migration
npm run migrate:down

# Check migration status
npx node-pg-migrate status
```

---

## Quick Start Checklist

- [ ] Create Daily.co account and get API key
- [ ] Set up PostgreSQL database (Railway or local)
- [ ] Update server `.env` with Daily.co and database credentials
- [ ] Update client `.env` with Daily.co domain
- [ ] Run database migrations: `npm run migrate:up`
- [ ] Start server: `npm run dev`
- [ ] Start client: `npm start`
- [ ] Test voice chat by starting a game with 2+ players
- [ ] Verify transcripts save after game ends

---

**That's it!** Your voice chat with transcription is now ready to use. 🎙️
