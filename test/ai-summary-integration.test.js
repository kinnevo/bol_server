/**
 * Integration Tests for AI Summary Feature
 * Tests the complete flow from transcript retrieval to summary generation and database storage
 */

require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const {
  generatePlayerSummary,
  generateAllPlayerSummaries,
} = require('../utils/aiSummaryService');

const {
  createGameSession,
  endGameSession,
  saveTranscripts,
  getTranscriptsByPlayer,
  savePlayerSummary,
  getPlayerSummaries,
  pool,
} = require('../utils/dbClient');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
};

function log(color, message) {
  console.log(color + message + colors.reset);
}

// Generate test UUIDs
const testPlayer1Id = uuidv4();
const testPlayer2Id = uuidv4();
const testPlayer3Id = uuidv4();

// Mock transcript data
const mockTranscripts = [
  {
    userId: testPlayer1Id,
    userName: 'TestPlayer',
    text: 'I\'ve been thinking a lot about changing careers. I feel stuck in my current job and want to explore something that truly excites me.',
    timestamp: Date.now() / 1000,
    startTime: 0,
    duration: 5.0,
    confidence: 0.95,
  },
  {
    userId: testPlayer1Id,
    userName: 'TestPlayer',
    text: 'What makes me feel alive is creating things with my hands. I used to love woodworking but gave it up years ago.',
    timestamp: (Date.now() / 1000) + 10,
    startTime: 10,
    duration: 6.0,
    confidence: 0.92,
  },
  {
    userId: testPlayer1Id,
    userName: 'TestPlayer',
    text: 'I think I\'m afraid of failing if I try something new. But staying where I am feels like a slower kind of failure.',
    timestamp: (Date.now() / 1000) + 20,
    startTime: 20,
    duration: 5.5,
    confidence: 0.93,
  },
];

async function runIntegrationTests() {
  log(colors.cyan, '\n========================================');
  log(colors.cyan, 'AI SUMMARY - INTEGRATION TESTS');
  log(colors.cyan, '========================================\n');

  let passedTests = 0;
  let failedTests = 0;
  let sessionId = null;
  let roomId = null;

  try {
    // Test 1: Database Connection
    try {
      log(colors.blue, '📝 Test 1: Verify database connection');

      const result = await pool.query('SELECT NOW()');
      if (!result.rows || result.rows.length === 0) {
        throw new Error('Database query returned no results');
      }

      log(colors.green, '✓ Database connection successful');
      log(colors.green, `✓ Current DB time: ${result.rows[0].now}\n`);
      passedTests++;
    } catch (error) {
      log(colors.red, `✗ Test 1 FAILED: ${error.message}\n`);
      failedTests++;
      throw error; // Exit if DB connection fails
    }

    // Test 2: Create Test Game Session
    try {
      log(colors.blue, '📝 Test 2: Create test game session');

      sessionId = uuidv4();
      roomId = `test-room-${Date.now()}`;

      const sessionData = {
        id: sessionId,
        roomId: roomId,
        roomName: 'Integration Test Room',
        dailyRoomName: `test-daily-${Date.now()}`,
        dailyRoomUrl: 'https://test.daily.co/test-room',
        playerCount: 1,
      };

      const session = await createGameSession(sessionData);

      if (!session || session.id !== sessionId) {
        throw new Error('Game session creation failed');
      }

      log(colors.green, `✓ Created test session: ${sessionId}`);
      log(colors.green, `✓ Room ID: ${roomId}\n`);
      passedTests++;
    } catch (error) {
      log(colors.red, `✗ Test 2 FAILED: ${error.message}\n`);
      failedTests++;
      throw error;
    }

    // Test 3: Save Mock Transcripts
    try {
      log(colors.blue, '📝 Test 3: Save mock transcripts to database');

      const savedTranscripts = await saveTranscripts(sessionId, mockTranscripts);

      if (!savedTranscripts || savedTranscripts.length !== mockTranscripts.length) {
        throw new Error(`Expected ${mockTranscripts.length} transcripts, got ${savedTranscripts?.length || 0}`);
      }

      log(colors.green, `✓ Saved ${savedTranscripts.length} transcripts`);
      log(colors.green, `✓ Transcript 1: "${savedTranscripts[0].transcript_text.substring(0, 50)}..."`);
      passedTests++;
    } catch (error) {
      log(colors.red, `✗ Test 3 FAILED: ${error.message}\n`);
      failedTests++;
    }

    // Test 4: Retrieve Player Transcripts
    try {
      log(colors.blue, '📝 Test 4: Retrieve transcripts for specific player');

      const playerTranscripts = await getTranscriptsByPlayer(sessionId, testPlayer1Id);

      if (!playerTranscripts || playerTranscripts.length === 0) {
        throw new Error('No transcripts retrieved for player');
      }

      if (playerTranscripts.length !== mockTranscripts.length) {
        throw new Error(`Expected ${mockTranscripts.length} transcripts, got ${playerTranscripts.length}`);
      }

      log(colors.green, `✓ Retrieved ${playerTranscripts.length} transcripts for player`);
      log(colors.green, `✓ First transcript: "${playerTranscripts[0].transcript_text.substring(0, 50)}..."\n`);
      passedTests++;
    } catch (error) {
      log(colors.red, `✗ Test 4 FAILED: ${error.message}\n`);
      failedTests++;
    }

    // Test 5: Generate AI Summary (Real API Call)
    try {
      log(colors.blue, '📝 Test 5: Generate AI summary with real LangChain API call');
      log(colors.yellow, '⏳ This may take 10-30 seconds...\n');

      const startTime = Date.now();
      const summary = await generatePlayerSummary(sessionId, testPlayer1Id, 'TestPlayer');
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      // Validate summary structure
      if (!summary.commonTopics || !Array.isArray(summary.commonTopics)) {
        throw new Error('Missing commonTopics array');
      }

      if (!summary.emotionalHighlights || !Array.isArray(summary.emotionalHighlights)) {
        throw new Error('Missing emotionalHighlights array');
      }

      if (!summary.areasToExplore || !Array.isArray(summary.areasToExplore)) {
        throw new Error('Missing areasToExplore array');
      }

      if (!summary.nextSteps || !Array.isArray(summary.nextSteps)) {
        throw new Error('Missing nextSteps array');
      }

      if (!summary.nextGameSuggestions || !Array.isArray(summary.nextGameSuggestions)) {
        throw new Error('Missing nextGameSuggestions array');
      }

      if (!summary.narrative || typeof summary.narrative !== 'string') {
        throw new Error('Missing narrative string');
      }

      log(colors.green, `✓ AI summary generated successfully in ${duration}s`);
      log(colors.green, `✓ Common Topics (${summary.commonTopics.length}): ${summary.commonTopics.join(', ')}`);
      log(colors.green, `✓ Emotional Highlights (${summary.emotionalHighlights.length}): ${summary.emotionalHighlights[0].substring(0, 50)}...`);
      log(colors.green, `✓ Areas to Explore (${summary.areasToExplore.length}): ${summary.areasToExplore[0].substring(0, 50)}...`);
      log(colors.green, `✓ Next Steps (${summary.nextSteps.length}): ${summary.nextSteps[0].substring(0, 50)}...`);
      log(colors.green, `✓ Next Game Suggestions (${summary.nextGameSuggestions.length}): ${summary.nextGameSuggestions[0].substring(0, 50)}...`);
      log(colors.green, `✓ Narrative (${summary.narrative.split(/\s+/).length} words): ${summary.narrative.substring(0, 100)}...\n`);

      // Store summary for next test
      global.testSummary = summary;

      passedTests++;
    } catch (error) {
      log(colors.red, `✗ Test 5 FAILED: ${error.message}\n`);
      if (error.stack) {
        log(colors.yellow, error.stack);
      }
      failedTests++;
    }

    // Test 6: Save Summary to Database
    try {
      log(colors.blue, '📝 Test 6: Save AI summary to database');

      if (!global.testSummary) {
        throw new Error('No summary available from previous test');
      }

      const savedSummary = await savePlayerSummary(sessionId, testPlayer1Id, global.testSummary);

      if (!savedSummary || !savedSummary.id) {
        throw new Error('Summary save failed');
      }

      log(colors.green, `✓ Summary saved to database with ID: ${savedSummary.id}`);
      log(colors.green, `✓ Analysis type: ${savedSummary.analysis_type || 'player_summary'}\n`);
      passedTests++;
    } catch (error) {
      log(colors.red, `✗ Test 6 FAILED: ${error.message}\n`);
      failedTests++;
    }

    // Test 7: Retrieve Saved Summaries
    try {
      log(colors.blue, '📝 Test 7: Retrieve player summaries from database');

      const summaries = await getPlayerSummaries(sessionId);

      if (!summaries || typeof summaries !== 'object') {
        throw new Error('Failed to retrieve summaries');
      }

      if (!summaries[testPlayer1Id]) {
        throw new Error('Player summary not found in results');
      }

      const retrievedSummary = summaries[testPlayer1Id];

      if (!retrievedSummary.commonTopics || !retrievedSummary.narrative) {
        throw new Error('Retrieved summary missing expected fields');
      }

      log(colors.green, '✓ Successfully retrieved summaries');
      log(colors.green, `✓ Found summary for player`);
      log(colors.green, `✓ Summary has all required fields\n`);
      passedTests++;
    } catch (error) {
      log(colors.red, `✗ Test 7 FAILED: ${error.message}\n`);
      failedTests++;
    }

    // Test 8: Parallel Summary Generation (Multiple Players)
    try {
      log(colors.blue, '📝 Test 8: Generate summaries for multiple players in parallel');
      log(colors.yellow, '⏳ This may take 15-45 seconds...\n');

      // Add transcripts for 2 more test players
      const player2Transcripts = mockTranscripts.map(t => ({
        ...t,
        userId: testPlayer2Id,
        userName: 'Player2'
      }));

      const player3Transcripts = mockTranscripts.map(t => ({
        ...t,
        userId: testPlayer3Id,
        userName: 'Player3'
      }));

      await saveTranscripts(sessionId, [...player2Transcripts, ...player3Transcripts]);

      const players = [
        { id: testPlayer1Id, name: 'TestPlayer' },
        { id: testPlayer2Id, name: 'Player2' },
        { id: testPlayer3Id, name: 'Player3' },
      ];

      const startTime = Date.now();
      const allSummaries = await generateAllPlayerSummaries(sessionId, players);
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      if (!allSummaries || typeof allSummaries !== 'object') {
        throw new Error('Failed to generate summaries');
      }

      const summaryCount = Object.keys(allSummaries).length;
      if (summaryCount !== players.length) {
        throw new Error(`Expected ${players.length} summaries, got ${summaryCount}`);
      }

      log(colors.green, `✓ Generated ${summaryCount} summaries in parallel in ${duration}s`);
      log(colors.green, `✓ Average time per player: ${(duration / summaryCount).toFixed(2)}s`);
      log(colors.green, `✓ All summaries have required structure\n`);
      passedTests++;
    } catch (error) {
      log(colors.red, `✗ Test 8 FAILED: ${error.message}\n`);
      failedTests++;
    }

  } finally {
    // Cleanup: End test session and clean up data
    try {
      if (sessionId) {
        log(colors.yellow, '🧹 Cleaning up test data...');

        // Delete transcript analysis records
        await pool.query(
          'DELETE FROM transcript_analysis WHERE session_id = $1',
          [sessionId]
        );

        // Delete transcripts
        await pool.query(
          'DELETE FROM voice_transcripts WHERE session_id = $1',
          [sessionId]
        );

        // Delete game session
        await pool.query(
          'DELETE FROM game_sessions WHERE id = $1',
          [sessionId]
        );

        log(colors.green, '✓ Test data cleaned up\n');
      }
    } catch (cleanupError) {
      log(colors.yellow, `⚠ Cleanup warning: ${cleanupError.message}\n`);
    }
  }

  // Test Summary
  log(colors.cyan, '========================================');
  log(colors.cyan, 'TEST SUMMARY');
  log(colors.cyan, '========================================');
  log(colors.green, `✓ Passed: ${passedTests}`);
  if (failedTests > 0) {
    log(colors.red, `✗ Failed: ${failedTests}`);
  }
  log(colors.cyan, `Total: ${passedTests + failedTests}`);
  log(colors.cyan, '========================================\n');

  if (failedTests === 0) {
    log(colors.green, '🎉 All integration tests passed!\n');
    process.exit(0);
  } else {
    log(colors.red, '❌ Some tests failed. Please review.\n');
    process.exit(1);
  }
}

// Run tests
runIntegrationTests().catch((error) => {
  log(colors.red, `\n❌ Test suite error: ${error.message}\n`);
  console.error(error);
  process.exit(1);
});
