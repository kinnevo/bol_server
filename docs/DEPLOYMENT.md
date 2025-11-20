# Deployment Guide - Voice Chat with Railway

## Pre-Deployment Checklist

### 1. Daily.co Setup
- [ ] Created Daily.co account
- [ ] Obtained API key from Dashboard → Settings → API Keys
- [ ] Noted your Daily domain (e.g., `yourname.daily.co`)

### 2. Database Setup (Railway)
- [ ] Created PostgreSQL database on Railway
- [ ] Copied database connection string (DATABASE_URL)
- [ ] Connection string format: `postgresql://user:password@host:port/database`

### 3. Environment Variables Configured

**Required on Railway:**
```env
# OpenAI (already configured)
OPENAI_API_KEY=your_openai_key

# Daily.co (NEW - you must add these)
DAILY_API_KEY=your_daily_api_key_here
DAILY_DOMAIN=yourname.daily.co

# PostgreSQL (NEW - Railway will auto-provide this)
DATABASE_URL=${{Postgres.DATABASE_URL}}

# Server Config (already configured)
PORT=3001
NODE_ENV=production
CLIENT_URL=https://your-client-url.railway.app

# Redis (already configured)
REDIS_URL=${{Redis.REDIS_URL}}
REDIS_SESSION_TTL=300
REDIS_ROOM_TTL=3600

# Bots (already configured)
BOTS_AVAILABLE=true
```

---

## Deployment Steps

### Step 1: Link PostgreSQL Database to Server

1. Go to your Railway project
2. Click on your server service
3. Go to **Variables** tab
4. Click **+ New Variable** → **Add Reference**
5. Select your PostgreSQL database
6. Choose `DATABASE_URL`
7. Click **Add**

### Step 2: Add Daily.co Environment Variables

In Railway server variables:

1. Add `DAILY_API_KEY`:
   ```
   DAILY_API_KEY=your_actual_api_key_here
   ```

2. Add `DAILY_DOMAIN`:
   ```
   DAILY_DOMAIN=yourname.daily.co
   ```

### Step 3: Deploy with Migrations

The server is configured to run migrations automatically on deploy via [railway.toml](bol-server/railway.toml:8):

```toml
[deploy]
startCommand = "npm run migrate:up && npm start"
```

This ensures:
1. Migrations run first
2. If migrations succeed, server starts
3. If migrations fail, deployment fails (safe)

### Step 4: Verify Deployment

After deployment:

1. **Check Logs** for migration output:
   ```
   [dotenv@17.2.3] injecting env...
   Creating table: game_sessions
   Creating table: voice_transcripts
   Creating table: transcript_analysis
   ✓ Migration successful
   ```

2. **Check Database** (Railway → PostgreSQL → Data):
   - Should see 3 new tables:
     - `game_sessions`
     - `voice_transcripts`
     - `transcript_analysis`
   - Plus `pgmigrations` table tracking migration history

3. **Check Server Logs** for connection:
   ```
   [DB] PostgreSQL connected successfully
   [Daily] Daily.co configuration loaded
   ```

4. **Test Voice Chat**:
   - Start a game with 2 players
   - Look for: `[Voice Chat] Created Daily room for game: ...`
   - Verify voice chat UI appears in game

---

## Troubleshooting Deployment

### Error: "DAILY_API_KEY is not configured"

**Solution:**
1. Go to Railway → Server → Variables
2. Add `DAILY_API_KEY` variable
3. Redeploy

### Error: "relation 'game_sessions' does not exist"

**Cause:** Migrations didn't run

**Solution:**
1. Check Railway logs for migration errors
2. Verify `DATABASE_URL` is set correctly
3. Manually run migration:
   ```bash
   # In Railway console or locally with production DATABASE_URL
   npm run migrate:up
   ```

### Error: "connection to server failed"

**Cause:** PostgreSQL not linked or wrong credentials

**Solution:**
1. Verify PostgreSQL service is running
2. Check `DATABASE_URL` variable is set
3. Test connection in Railway console:
   ```bash
   psql $DATABASE_URL -c "SELECT 1"
   ```

### Migrations Run Every Deploy

**Expected Behavior:** Migrations are idempotent
- Already-run migrations are skipped
- Only new migrations execute
- Safe to run on every deploy

**Check Migration Status:**
```bash
# Railway console
npm run migrate:status
```

---

## Manual Migration Commands

If you need to manage migrations manually:

### Run Pending Migrations
```bash
# Railway console
npm run migrate:up
```

### Check Migration Status
```bash
npx node-pg-migrate status
```

### Rollback Last Migration
```bash
npm run migrate:down
```

**⚠️ Warning:** Never run `migrate:down` in production unless you know what you're doing!

---

## Database Backup (Important!)

Before deploying to production:

### Backup via Railway
1. Railway → PostgreSQL → Settings
2. Click **Backup**
3. Download backup file

### Backup via Command Line
```bash
# Export to SQL file
pg_dump $DATABASE_URL > backup.sql

# Restore from backup
psql $DATABASE_URL < backup.sql
```

---

## Monitoring After Deployment

### Key Metrics to Watch

1. **Database Connections**
   - Check for connection pool errors
   - Monitor active connections

2. **Daily.co Usage**
   - Dashboard → Usage
   - Track minutes used
   - Monitor transcription credits

3. **Error Logs**
   - Watch for `[Voice Chat]` errors
   - Monitor `[DB]` connection issues
   - Check transcript retrieval failures

### Useful Log Filters

In Railway logs, filter by:
- `[Voice Chat]` - Voice chat operations
- `[Daily]` - Daily.co API calls
- `[DB]` - Database operations
- `Error` - All errors

---

## Production Environment Variables

### Final Checklist

Verify all these are set on Railway:

```bash
# Required for Voice Chat
✓ DAILY_API_KEY
✓ DAILY_DOMAIN
✓ DATABASE_URL

# Already Configured
✓ OPENAI_API_KEY
✓ CLIENT_URL
✓ NODE_ENV=production
✓ PORT
✓ REDIS_URL (if using Redis)
```

---

## Migration History

Track your migrations in git:

```bash
# Current migrations
migrations/
  └── 1763478327018_initial-voice-chat-schema.js

# View migration history
npx node-pg-migrate status

# Output:
# Migrated:
#   1763478327018_initial-voice-chat-schema.js
```

---

## Rollback Plan

If voice chat deployment fails:

### Option 1: Disable Voice Chat (Quick)
1. Set `DAILY_API_KEY=` (empty) on Railway
2. Server will skip voice chat creation
3. Game continues without voice

### Option 2: Rollback Migration
```bash
# Railway console
npm run migrate:down

# Then redeploy previous version
```

### Option 3: Full Rollback
1. Revert git commits
2. Redeploy previous version
3. Migration tables remain (harmless)

---

## Cost Monitoring

### Daily.co Free Tier Limits
- 10,000 minutes/month
- Unlimited rooms
- Transcription included

### Track Usage
1. Daily.co Dashboard → Usage
2. Set up usage alerts
3. Monitor approaching limits

### PostgreSQL Storage
- Railway free tier: 1GB
- Voice transcripts are text (small)
- Estimate: ~1KB per minute of speech
- 1GB = ~1 million minutes of transcripts

---

## Security Best Practices

### Environment Variables
- ✅ Never commit `.env` to git
- ✅ Use Railway's secure variable storage
- ✅ Rotate API keys periodically

### Database
- ✅ Use SSL in production (auto-enabled)
- ✅ Restrict database access to Railway services
- ✅ Regular backups

### Daily.co Rooms
- ✅ Rooms auto-expire after 2 hours
- ✅ Rooms deleted after game ends
- ✅ Consider adding meeting tokens for extra security

---

## Next Steps After Deployment

1. **Test in Production**
   - Create test game
   - Verify voice chat works
   - Check transcripts save

2. **Monitor First 24 Hours**
   - Watch error logs
   - Track Daily.co usage
   - Monitor database performance

3. **Set Up Alerts**
   - Railway email alerts
   - Daily.co usage notifications
   - Database storage warnings

4. **Document for Team**
   - Share Daily.co credentials securely
   - Document any custom configurations
   - Create runbook for common issues

---

## Support Resources

- **Railway Docs**: [docs.railway.app](https://docs.railway.app)
- **Daily.co Support**: [help.daily.co](https://help.daily.co)
- **PostgreSQL Docs**: [postgresql.org/docs](https://www.postgresql.org/docs/)
- **node-pg-migrate**: [salsita.github.io/node-pg-migrate](https://salsita.github.io/node-pg-migrate/)

---

## Success Indicators ✅

Your deployment is successful when you see:

1. ✅ Server starts without errors
2. ✅ Database connection established: `[DB] PostgreSQL connected`
3. ✅ Migrations completed: Tables exist in database
4. ✅ Daily.co rooms created when game starts
5. ✅ Voice chat UI appears in gameplay
6. ✅ Transcripts saved after game ends
7. ✅ No errors in Railway logs

**You're all set!** 🎉
