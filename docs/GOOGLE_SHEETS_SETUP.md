# Google Sheets Integration Setup Guide

This guide explains how to set up the Google Sheets integration for the Book of Life game to fetch questions at inflection points.

## Table of Contents
1. [Creating a Google Service Account](#creating-a-google-service-account)
2. [Configuring Environment Variables](#configuring-environment-variables)
3. [Sharing the Spreadsheet](#sharing-the-spreadsheet)
4. [Testing the Connection](#testing-the-connection)
5. [API Endpoints](#api-endpoints)
6. [Next Steps: Integrating Questions into Game](#next-steps-integrating-questions-into-game)
7. [Recommended Spreadsheet Structure](#recommended-spreadsheet-structure)

---

## Creating a Google Service Account

A service account allows your server to access Google Sheets without requiring user authentication.

### Step 1: Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Enter a project name (e.g., "BOL Game Sheets Integration")
4. Click "Create"

### Step 2: Enable Google Sheets API

1. In your project, navigate to **APIs & Services** → **Library**
2. Search for "Google Sheets API"
3. Click on it and click **Enable**

### Step 3: Create a Service Account

1. Navigate to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **Service Account**
3. Fill in the details:
   - **Service account name**: `bol-sheets-reader` (or any name you prefer)
   - **Service account ID**: Will auto-generate
   - **Description**: "Service account for reading game questions from Google Sheets"
4. Click **Create and Continue**
5. Skip the optional "Grant this service account access to project" section (click **Continue**)
6. Skip "Grant users access to this service account" (click **Done**)

### Step 4: Create and Download Service Account Key

1. In the **Credentials** page, find your newly created service account
2. Click on the service account email
3. Go to the **Keys** tab
4. Click **Add Key** → **Create new key**
5. Choose **JSON** format
6. Click **Create**
7. A JSON file will be downloaded to your computer - **keep this file secure!**

### Step 5: Extract Credentials from JSON File

Open the downloaded JSON file. You'll need these two values:

```json
{
  "type": "service_account",
  "project_id": "...",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "bol-sheets-reader@your-project.iam.gserviceaccount.com",
  ...
}
```

You need:
- **client_email**: This is your `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- **private_key**: This is your `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`

---

## Configuring Environment Variables

Add the following to your `.env` file in the `bol-server` directory:

```bash
# Google Sheets Integration
GOOGLE_SHEETS_SPREADSHEET_ID=1a48wedgTqew0kxIAseXlxUjG5gQ9QN8bKuH1DNWXoFc
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYourPrivateKeyHere\n-----END PRIVATE KEY-----\n"
```

### Important Notes:

1. **GOOGLE_SHEETS_SPREADSHEET_ID**: This is already set to your spreadsheet ID (extracted from the URL you provided)

2. **GOOGLE_SERVICE_ACCOUNT_EMAIL**: Copy the `client_email` from your JSON file

3. **GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY**:
   - Copy the entire `private_key` value from the JSON file
   - **Keep the quotes** around it in the .env file
   - The `\n` characters should remain as literal `\n` (the code handles the conversion)
   - Example format:
     ```
     GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgk...\n-----END PRIVATE KEY-----\n"
     ```

---

## Sharing the Spreadsheet

The service account needs permission to access your Google Sheet.

1. Open your Google Sheet: https://docs.google.com/spreadsheets/d/1a48wedgTqew0kxIAseXlxUjG5gQ9QN8bKuH1DNWXoFc
2. Click the **Share** button (top right)
3. Add the service account email (from `GOOGLE_SERVICE_ACCOUNT_EMAIL`)
   - Example: `bol-sheets-reader@your-project.iam.gserviceaccount.com`
4. Set permission to **Viewer** (read-only)
5. Uncheck "Notify people" (no need to send email to a service account)
6. Click **Share**

**The sheet is now accessible to your server!**

---

## Testing the Connection

### Start the Server

```bash
cd bol-server
npm start
```

### Test Endpoints

1. **Test basic connection:**
   ```bash
   curl http://localhost:3001/api/sheets/test
   ```

   Expected response:
   ```json
   {
     "success": true,
     "message": "Google Sheets connection successful",
     "spreadsheetId": "1a48wedgTqew0kxIAseXlxUjG5gQ9QN8bKuH1DNWXoFc"
   }
   ```

2. **Fetch all questions:**
   ```bash
   curl http://localhost:3001/api/sheets/questions
   ```

   Expected response:
   ```json
   {
     "success": true,
     "questions": [...],
     "count": 10
   }
   ```

3. **Check cache status:**
   ```bash
   curl http://localhost:3001/api/sheets/cache-status
   ```

---

## API Endpoints

### GET `/api/sheets/test`
Tests the Google Sheets connection.

**Response:**
```json
{
  "success": true,
  "message": "Google Sheets connection successful",
  "spreadsheetId": "..."
}
```

---

### GET `/api/sheets/questions`
Fetches all questions from the spreadsheet with caching (5-minute cache).

**Response:**
```json
{
  "success": true,
  "questions": [
    {
      "Question": "What brings you joy?",
      "Category": "Reflection",
      "InflectionPoint": "Round 3"
    },
    ...
  ],
  "count": 10
}
```

---

### GET `/api/sheets/questions/:gameSessionId`
Fetches questions for a specific game session, filtering out already-used questions.

**Query Parameters:**
- `usedIds` (optional): JSON array of question IDs already used
- `count` (optional): Number of questions to return

**Example:**
```bash
curl "http://localhost:3001/api/sheets/questions/game-123?usedIds=[0,1,2]&count=3"
```

**Response:**
```json
{
  "success": true,
  "questions": [...],
  "count": 3,
  "gameSessionId": "game-123"
}
```

---

### POST `/api/sheets/refresh-cache`
Forces a refresh of the questions cache (bypasses the 5-minute cache).

**Response:**
```json
{
  "success": true,
  "message": "Cache refreshed successfully",
  "count": 10
}
```

---

### GET `/api/sheets/cache-status`
Returns information about the current cache state.

**Response:**
```json
{
  "success": true,
  "isCached": true,
  "questionCount": 10,
  "lastUpdate": 1234567890,
  "cacheAge": 120000,
  "cacheAgeMinutes": 2
}
```

---

## Next Steps: Integrating Questions into Game

Now that the Google Sheets integration is set up, here's how to integrate questions into your game at inflection points:

### 1. Identify Inflection Points

Inflection points are key moments in the game where you want to ask players questions. Common inflection points might be:

- End of each round
- After certain game events
- At specific score thresholds
- During AI coach conversations

### 2. Track Used Questions Per Game Session

You'll need to track which questions have already been asked in each game session to avoid repeats.

**Option A: Store in Redis** (Recommended for active games)

Add to `bol-server/utils/sessionManager.js`:

```javascript
async function addUsedQuestion(gameSessionId, questionId) {
  const redis = getRedisClient();
  const key = `game:${gameSessionId}:usedQuestions`;
  await redis.sAdd(key, questionId.toString());
  await redis.expire(key, 3600); // Expire after 1 hour
}

async function getUsedQuestions(gameSessionId) {
  const redis = getRedisClient();
  const key = `game:${gameSessionId}:usedQuestions`;
  const usedIds = await redis.sMembers(key);
  return usedIds.map(id => parseInt(id));
}

module.exports = {
  // ... existing exports
  addUsedQuestion,
  getUsedQuestions,
};
```

**Option B: Store in PostgreSQL** (For permanent history)

Add a migration to create a table:

```sql
CREATE TABLE game_questions (
  id SERIAL PRIMARY KEY,
  game_session_id UUID REFERENCES game_sessions(id),
  question_id INTEGER NOT NULL,
  question_text TEXT NOT NULL,
  asked_at TIMESTAMP DEFAULT NOW()
);
```

### 3. Fetch Questions at Inflection Points

In your game logic (e.g., in Socket.IO event handlers in `index.js`):

```javascript
// Example: End of round inflection point
io.on('connection', (socket) => {
  socket.on('end-round', async (data) => {
    const { roomId, round } = data;
    const room = rooms.get(roomId);

    if (!room) return;

    try {
      // Get game session from database
      const session = await getSessionByRoomId(roomId);

      // Get questions already used in this game
      const usedQuestionIds = await sessionManager.getUsedQuestions(session.id);

      // Fetch 1 new question for this round
      const response = await fetch(
        `http://localhost:3001/api/sheets/questions/${session.id}?usedIds=${JSON.stringify(usedQuestionIds)}&count=1`
      );
      const { questions } = await response.json();

      if (questions.length > 0) {
        const question = questions[0];
        const questionId = question.id || question.ID || usedQuestionIds.length; // Use index as ID if no ID field

        // Track that this question was used
        await sessionManager.addUsedQuestion(session.id, questionId);

        // Emit question to all players in the room
        io.to(roomId).emit('inflection-question', {
          question: question.Question,
          category: question.Category,
          round,
        });
      }
    } catch (error) {
      console.error('Error fetching inflection question:', error);
    }
  });
});
```

### 4. Client-Side Integration

On the client side (`bol-client`), listen for the inflection questions:

```javascript
// In your game component or hook
socket.on('inflection-question', (data) => {
  const { question, category, round } = data;

  // Display the question to users
  // Could be a modal, overlay, or part of the game UI
  showQuestionModal({
    title: `Round ${round} Reflection`,
    question,
    category,
  });
});
```

### 5. Consider UI/UX Flow

- **Timing**: When should the question appear? Immediately after round ends? After a delay?
- **Display**: Modal? Card? Overlay?
- **Response**: Do players answer verbally (during voice chat)? Write responses? Just reflect?
- **Duration**: How long should the question be visible?

### Example Implementation Locations:

1. **Socket.IO Events** (`bol-server/index.js`):
   - `end-round` - After each round
   - `game-milestone` - At specific game events
   - `ai-coach-check-in` - During AI coach interactions

2. **Client Components** (`bol-client/src/`):
   - Create `components/InflectionQuestion.js` - Modal/UI for displaying questions
   - Update `pages/Room.js` - Add question handling logic

---

## Recommended Spreadsheet Structure

For optimal use, structure your Google Sheet with the following columns:

### Basic Structure (Current Default)

| Question | Category | InflectionPoint |
|----------|----------|-----------------|
| What brings you the most joy in life? | Reflection | Round 3 |
| Describe a challenge you've overcome recently. | Growth | Round 5 |
| What are you grateful for today? | Gratitude | Round 2 |

### Extended Structure (Optional)

You can add additional columns for more metadata:

| ID | Question | Category | InflectionPoint | Difficulty | MinPlayers | Tags |
|----|----------|----------|-----------------|------------|------------|------|
| 1  | What brings you the most joy? | Reflection | Round 3 | Easy | 2 | joy,happiness |
| 2  | Describe your biggest fear. | Deep | Round 7 | Hard | 3 | fear,vulnerability |

### Column Descriptions:

- **ID** (Optional): Unique identifier for tracking used questions. If not provided, the code uses the row index.
- **Question**: The actual question text to display to players
- **Category**: Type of question (Reflection, Growth, Gratitude, Deep, etc.)
- **InflectionPoint**: When in the game this question should appear
- **Difficulty** (Optional): Easy/Medium/Hard for progressive difficulty
- **MinPlayers** (Optional): Minimum number of players required for this question
- **Tags** (Optional): Comma-separated tags for filtering

### Multiple Sheet Tabs

You can create multiple tabs in your spreadsheet for different question sets:

- **Sheet1** - General questions (default)
- **DeepQuestions** - More vulnerable/intimate questions
- **IcebreakerQuestions** - Light opening questions
- **EndGameQuestions** - Reflection questions for game end

To fetch from a specific sheet, modify the API call:

```javascript
const questions = await sheetsManager.getQuestionsWithCache('DeepQuestions', 'A:Z');
```

---

## Troubleshooting

### Error: "Google Sheets service account credentials are not configured"

**Solution**: Make sure you've added all three environment variables to your `.env` file:
- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`

---

### Error: "The caller does not have permission"

**Solution**: You forgot to share the spreadsheet with the service account email. Go to your Google Sheet and share it with the email from `GOOGLE_SERVICE_ACCOUNT_EMAIL`.

---

### Error: "Failed to parse private key"

**Solution**: Check that your private key is properly formatted in the `.env` file:
- Should be wrapped in quotes
- Should contain `\n` as literal characters (not actual newlines)
- Example: `"-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"`

---

### Questions come back empty

**Solution**:
1. Check that your spreadsheet has data with headers in the first row
2. Verify the sheet name is correct (default is 'Sheet1')
3. Check the range (default is 'A:Z' for all columns)

---

## Architecture Overview

### Caching Strategy

The integration uses an in-memory cache with the following behavior:

- **Cache Duration**: 5 minutes
- **Cache Refresh**: Automatic on first request after expiration
- **Manual Refresh**: Available via `POST /api/sheets/refresh-cache`
- **Benefits**:
  - Reduces API calls to Google Sheets
  - Faster response times
  - Ensures latest questions are available without manual intervention

### Question Tracking Flow

```
1. Game reaches inflection point
2. Server fetches available questions (from cache)
3. Server checks which questions were already used (Redis/DB)
4. Server filters out used questions
5. Server returns fresh question(s)
6. Question ID is tracked as "used" for this game session
7. Question is displayed to players
```

---

## Security Notes

- **Never commit** your `.env` file to version control
- Keep your service account JSON key file **secure and private**
- Service account only has **read** access to the spreadsheet (no write permissions)
- Consider rotating service account keys periodically for security

---

## Support

If you encounter issues:
1. Check the server logs for detailed error messages
2. Test the connection using `/api/sheets/test`
3. Verify environment variables are set correctly
4. Ensure the spreadsheet is shared with the service account

For more information, refer to:
- [Google Sheets API Documentation](https://developers.google.com/sheets/api)
- [Google Service Accounts Guide](https://cloud.google.com/iam/docs/service-accounts)
