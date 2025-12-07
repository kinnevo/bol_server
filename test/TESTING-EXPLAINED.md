# Static vs Dynamic Testing - Complete Guide

## Overview

Software testing has two fundamental approaches: **Static Testing** and **Dynamic Testing**. Understanding the difference helps you write better tests and catch bugs faster.

---

## Static Testing (Unit Tests)

### Definition
**Static testing examines code WITHOUT executing it**. You test individual functions or components in isolation using controlled, predictable inputs.

### Characteristics

| Aspect | Details |
|--------|---------|
| **Execution** | No actual system running |
| **Data** | Mock/fake data |
| **Dependencies** | All mocked or stubbed |
| **Speed** | Milliseconds |
| **Reliability** | 100% consistent |
| **Setup** | None required |
| **Cost** | Free |

### In Our Transcript System

**File:** `transcript-unit.test.js`

**What it tests:**
```javascript
// Test 1: Field Mapping Logic
const transcript = { user_id: 'alice-123', text: 'Hello world' };

// Extract userId from various possible field names
const userId = transcript.userId || transcript.user_id ||
               transcript.participantId || null;

assert.strictEqual(userId, 'alice-123'); // ✓ Logic works!
```

**Key point:** We're testing the LOGIC of field extraction, not calling the real Daily.co API.

### Real Examples from Our Tests

#### Example 1: Validation Logic
```javascript
function validateTranscript(transcript) {
  const hasText = !!(transcript.text || transcript.transcript);
  const hasUserId = !!(transcript.userId || transcript.user_id);
  return hasText && hasUserId;
}

// Static test
const valid = { text: 'hello', userId: 'u1' };
assert.strictEqual(validateTranscript(valid), true);

const invalid = { text: 'hello' }; // missing userId
assert.strictEqual(validateTranscript(invalid), false);
```

#### Example 2: Timestamp Conversion
```javascript
// Testing the conversion formula
const unixTimestamp = 1234567890;
const date = new Date(unixTimestamp * 1000);

assert.strictEqual(date.getTime(), 1234567890000);
// ✓ Proves the math is correct
```

#### Example 3: Duration Calculation
```javascript
// Testing calculation logic
const transcript = { start: 1.5, end: 4.0 };
const duration = transcript.end - transcript.start;

assert.strictEqual(duration, 2.5);
// ✓ Proves the formula works
```

### Advantages

✅ **Instant Feedback**
- Run in milliseconds
- See results immediately
- Iterate quickly during development

✅ **Always Available**
- No internet needed
- No API keys needed
- No database setup

✅ **Deterministic**
- Same input = same output, always
- No random failures
- Easy to debug

✅ **Comprehensive Coverage**
- Test edge cases easily
- Test error conditions
- Test rare scenarios

✅ **Cheap**
- No API quotas consumed
- No server costs
- Can run thousands per minute

### Disadvantages

❌ **Limited Scope**
- Doesn't test real API responses
- Doesn't catch integration bugs
- Assumes mocks are accurate

❌ **False Confidence**
- Logic might be perfect, but API changed
- Your assumptions might be wrong
- Doesn't test real-world conditions

### When to Use Static Tests

- ✓ During development (TDD - Test Driven Development)
- ✓ Every time you change code
- ✓ In CI/CD pipelines (GitHub Actions, etc.)
- ✓ Before committing code
- ✓ Testing edge cases and error handling

---

## Dynamic Testing (Integration Tests)

### Definition
**Dynamic testing EXECUTES the actual system** with real or near-real components. You test how different parts work together in realistic conditions.

### Characteristics

| Aspect | Details |
|--------|---------|
| **Execution** | Actually runs the system |
| **Data** | Real API responses |
| **Dependencies** | Real services |
| **Speed** | Seconds to minutes |
| **Reliability** | Can be flaky |
| **Setup** | API keys, database, etc. |
| **Cost** | May consume quotas |

### In Our Transcript System

**File:** `transcript-integration.test.js`

**What it tests:**
```javascript
// Actually calling Daily.co API
const roomData = await createDailyRoom('test-room', players);

// Verify we got a real response
assert.ok(roomData.name); // Real room name from Daily.co
assert.ok(roomData.url);  // Real URL we can join

// Actually save to PostgreSQL
const saved = await saveTranscripts(sessionId, transcripts);

// Verify database actually stored it
const retrieved = await getTranscripts(sessionId);
assert.strictEqual(retrieved.length, 2);
```

**Key point:** We're making REAL HTTP requests to Daily.co and REAL database queries to PostgreSQL.

### Real Examples from Our Tests

#### Example 1: API Integration
```javascript
// Test: Can we create a Daily.co room?
async function testRoomCreation() {
  // This makes a REAL HTTP POST to https://api.daily.co/v1/rooms
  const roomData = await createDailyRoom('test-123', players);

  // Verify the API gave us what we need
  assert.ok(roomData.name); // "bol-game-test-123-1234567890"
  assert.ok(roomData.url);  // "https://latteware.daily.co/bol-game-..."

  // Cleanup: delete the room we just created
  await deleteDailyRoom(roomData.name);
}
```

#### Example 2: Database Integration
```javascript
// Test: Can we save transcripts to PostgreSQL?
async function testDatabaseSave() {
  const sessionId = uuidv4();

  // Create a session (INSERT INTO game_sessions...)
  await createGameSession({
    id: sessionId,
    roomId: 'test-room',
    dailyRoomName: 'test-daily-room'
  });

  // Save transcripts (INSERT INTO voice_transcripts...)
  const transcripts = [
    { userId: 'u1', userName: 'Alice', text: 'Hello' },
    { userId: 'u2', userName: 'Bob', text: 'Hi there' }
  ];
  await saveTranscripts(sessionId, transcripts);

  // Retrieve from database (SELECT * FROM voice_transcripts...)
  const retrieved = await getTranscripts(sessionId);

  // Verify data round-tripped correctly
  assert.strictEqual(retrieved.length, 2);
  assert.strictEqual(retrieved[0].player_name, 'Alice');
  assert.strictEqual(retrieved[1].transcript_text, 'Hi there');
}
```

#### Example 3: End-to-End Workflow
```javascript
// Test: Complete game lifecycle
async function testCompleteWorkflow() {
  // 1. Game starts - create Daily.co room
  const roomData = await createDailyRoom('game-1', players);

  // 2. Create meeting tokens for players
  const tokens = {};
  for (const player of players) {
    tokens[player.id] = await createMeetingToken(
      roomData.name,
      player.name,
      player.id
    );
  }

  // 3. Create database session
  await createGameSession({
    id: sessionId,
    dailyRoomName: roomData.name
  });

  // 4. Game ends
  await endGameSession(sessionId, 'completed');

  // 5. Try to get transcripts (will timeout - no real call happened)
  try {
    await getDailyTranscripts(roomData.name, 10000);
  } catch (error) {
    // Expected: timeout since no actual voice call occurred
    assert.ok(error.message.includes('Timeout'));
  }

  // 6. Cleanup
  await deleteDailyRoom(roomData.name);
}
```

### Advantages

✅ **Realistic**
- Tests real API responses
- Catches integration bugs
- Validates actual behavior

✅ **Comprehensive**
- Tests complete workflows
- Verifies system works end-to-end
- Catches configuration issues

✅ **Confidence**
- If it passes, it really works
- Proves integrations are correct
- Validates assumptions about APIs

### Disadvantages

❌ **Slow**
- Network latency
- API processing time
- Database query time
- Can take minutes to run

❌ **Flaky**
- Network can fail
- APIs can be down
- Rate limits hit
- Timeouts occur

❌ **Expensive**
- Consumes API quotas
- Uses database resources
- May cost money

❌ **Setup Required**
- Need API credentials
- Need database running
- Need internet connection
- Environment-specific

### When to Use Dynamic Tests

- ✓ Before deploying to production
- ✓ After major refactoring
- ✓ When APIs update
- ✓ Weekly/nightly in CI/CD
- ✓ Manual pre-release testing

---

## Comparison Table

| Aspect | Static (Unit) | Dynamic (Integration) |
|--------|---------------|----------------------|
| **What** | Test logic/functions | Test full system |
| **How** | Mock data | Real APIs/DB |
| **Speed** | < 10ms | Seconds+ |
| **Reliability** | 100% | ~95% (flaky) |
| **Setup** | None | Credentials needed |
| **Cost** | Free | May cost $ |
| **When** | Every commit | Before deploy |
| **Catches** | Logic errors | Integration bugs |
| **Dependencies** | None | Internet, services |
| **Debuggability** | Easy | Harder |

---

## Real-World Analogies

### Building a Car

**Static Testing = Blueprint Review**
- Architect reviews car designs on paper
- Checks dimensions, materials, calculations
- Fast, cheap, catches design flaws
- Doesn't prove car will actually run

**Dynamic Testing = Test Drive**
- Actually build and drive the car
- Test on real roads, with real fuel
- Slow, expensive, but proves it works
- Catches issues blueprints miss

### Cooking a Recipe

**Static Testing = Reading the Recipe**
- Check ingredients list is complete
- Verify measurements make sense
- Review cooking times are reasonable
- Fast, but doesn't taste the food

**Dynamic Testing = Actually Cooking**
- Follow recipe and make the dish
- Taste the result
- See if it's actually good
- Takes time, but gives real feedback

---

## What Each Type Catches

### Static Tests Catch

✓ **Logic Errors**
```javascript
// Bug: Wrong operator
const duration = transcript.end + transcript.start; // Should be minus!
// Static test catches this immediately
```

✓ **Type Errors**
```javascript
// Bug: Comparing string to number
if (transcript.confidence > '0.5') { // Should be 0.5 not '0.5'
// Static test catches type mismatch
```

✓ **Null/Undefined Handling**
```javascript
// Bug: No null check
const text = transcript.text.toLowerCase(); // Crashes if text is null
// Static test with null input catches this
```

✓ **Edge Cases**
```javascript
// What if array is empty?
// What if timestamp is negative?
// What if userId is empty string?
// Static tests cover all these
```

### Dynamic Tests Catch

✓ **API Format Changes**
```javascript
// Daily.co changed response structure:
// Used to be: { userId: '...' }
// Now is: { participant_id: '...' }
// Dynamic test catches this (static wouldn't!)
```

✓ **Database Schema Mismatches**
```javascript
// Code expects: player_id (UUID)
// Database has: player_id (VARCHAR)
// Dynamic test catches the type mismatch
```

✓ **Network/Timeout Issues**
```javascript
// API takes 3 minutes to respond
// Your timeout is 2 minutes
// Dynamic test discovers this
```

✓ **Authentication Problems**
```javascript
// API key is expired
// API key lacks required permissions
// Only dynamic tests catch this
```

✓ **Real-World Race Conditions**
```javascript
// Transcription isn't ready after 2 minutes
// Database connection pool exhausted
// These only appear in real usage
```

---

## Our Implementation

### transcript-unit.test.js (Static)

**7 Test Suites, 35+ Tests**

1. **Field Mapping** - Extract userId from multiple field name formats
2. **Data Validation** - Reject invalid transcripts
3. **Timestamp Conversion** - Unix timestamp to Date
4. **Duration Calculation** - Calculate from start/end times
5. **Array Processing** - Handle empty arrays, filter invalid items
6. **API Response Structure** - Validate expected format
7. **Error Handling** - Null, undefined, malformed data

**Run time:** ~2ms
**Dependencies:** None
**Always runs:** Yes

### transcript-integration.test.js (Dynamic)

**5 Test Suites, 15+ Tests**

1. **Room Management** - Create/delete Daily.co rooms, generate tokens
2. **Database Operations** - Create sessions, save/retrieve transcripts
3. **Transcript Polling** - Test retry logic with real API
4. **End-to-End Workflow** - Complete game lifecycle
5. **Error Recovery** - Handle API failures, DB errors

**Run time:** ~30 seconds (with real API)
**Dependencies:** Daily.co API, PostgreSQL
**Conditionally runs:** Only if credentials available

---

## Best Practices

### Development Workflow

```bash
# 1. Write new feature
vim utils/dailyManager.js

# 2. Write static test first (TDD)
vim test/transcript-unit.test.js

# 3. Run static test (should fail - feature not implemented)
npm run test:unit
# ✗ FAILED: Field extraction not working

# 4. Implement feature
# ... code code code ...

# 5. Run static test again
npm run test:unit
# ✓ PASSED: All logic tests pass

# 6. Run dynamic test to verify integration
npm run test:integration
# ✓ PASSED: Works with real API

# 7. Commit
git commit -m "Add field extraction for participant_id"
```

### Testing Pyramid

```
        /\
       /  \
      / E2E \  ← Few (5-10) - Dynamic - Slow, expensive
     /______\
    /        \
   /   INT   \  ← Some (20-30) - Dynamic - Medium speed
  /__________\
 /            \
/     UNIT     \  ← Many (100+) - Static - Fast, cheap
/_______________\
```

**Principle:** Many fast static tests, fewer slow dynamic tests.

### When to Run What

**Every Code Change:**
```bash
npm run test:unit  # Fast feedback
```

**Before Committing:**
```bash
npm run test:unit  # Ensure logic works
```

**Before Deploying:**
```bash
npm test  # Run everything
```

**In CI/CD Pipeline:**
```yaml
# Always run
- npm run test:unit

# Only on main branch
- npm run test:integration
```

---

## Common Misconceptions

### ❌ "Static tests are enough"
No! Static tests use fake data. Real API might behave differently.

### ❌ "Dynamic tests are better"
No! They're slower, more complex, and catch different bugs. Use both.

### ❌ "100% code coverage means no bugs"
No! Code coverage measures lines run, not correctness or integration.

### ❌ "Integration tests replace unit tests"
No! Integration tests are slow. Can't run them after every tiny change.

### ✅ "Use both in combination"
Yes! Static for fast feedback, dynamic for real-world validation.

---

## Summary

### Static Tests
- **What:** Test logic without running system
- **Speed:** Milliseconds
- **When:** Every code change
- **Catches:** Logic errors, edge cases
- **Cost:** Free

### Dynamic Tests
- **What:** Test with real APIs/database
- **Speed:** Seconds to minutes
- **When:** Before deploys
- **Catches:** Integration bugs, API changes
- **Cost:** May use quotas/money

### Both Together
Static tests give you fast feedback during development.
Dynamic tests give you confidence before deployment.

**Use both for robust, reliable software!** 🚀
