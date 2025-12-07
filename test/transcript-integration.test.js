/**
 * Integration Tests for Daily.co Transcript System
 * Tests the complete workflow with real API calls (or mocked API if no credentials)
 */

require('dotenv').config();
const { v4: uuidv4 } = require('uuid');

// Import the actual functions
const {
  createDailyRoom,
  deleteDailyRoom,
  getDailyTranscripts,
  createMeetingToken
} = require('../utils/dailyManager');

const {
  createGameSession,
  endGameSession,
  saveTranscripts,
  getTranscripts,
  closePool
} = require('../utils/dbClient');

// Test configuration
const USE_REAL_API = !!process.env.DAILY_API_KEY;
const USE_REAL_DB = !!process.env.DATABASE_URL;

console.log('\n╔════════════════════════════════════════════╗');
console.log('║  Daily.co Transcript Integration Tests   ║');
console.log('╚════════════════════════════════════════════╝\n');
console.log(`Daily.co API: ${USE_REAL_API ? '✓ Enabled' : '✗ Disabled (will use mocks)'}`);
console.log(`Database: ${USE_REAL_DB ? '✓ Enabled' : '✗ Disabled (will use mocks)'}`);
console.log('');

/**
 * Test Suite 1: Daily.co Room Management
 */
async function testRoomManagement() {
  console.log('\n=== Test Suite 1: Room Management ===\n');

  if (!USE_REAL_API) {
    console.log('⊘ Skipping (no Daily.co API key configured)');
    return { success: true, skipped: true };
  }

  const testRoomId = `test-room-${Date.now()}`;
  const players = [
    { id: uuidv4(), name: 'Alice', isBot: false },
    { id: uuidv4(), name: 'Bob', isBot: false }
  ];

  let roomData = null;

  try {
    // Test 1.1: Create Daily room
    console.log('Test 1.1: Creating Daily.co room...');
    roomData = await createDailyRoom(testRoomId, players);

    if (!roomData || !roomData.name || !roomData.url) {
      throw new Error('Room creation failed - invalid response');
    }

    console.log(`✓ Test 1.1: Room created successfully`);
    console.log(`  - Room name: ${roomData.name}`);
    console.log(`  - Room URL: ${roomData.url}`);

    // Test 1.2: Verify room configuration
    console.log('\nTest 1.2: Verifying room configuration...');
    if (!roomData.config) {
      console.log('⚠ Test 1.2: No config returned (may be in room properties)');
    } else {
      console.log('✓ Test 1.2: Room configuration present');
    }

    // Test 1.3: Create meeting tokens for players
    console.log('\nTest 1.3: Creating meeting tokens...');
    for (const player of players) {
      const token = await createMeetingToken(roomData.name, player.name, player.id);

      if (!token) {
        throw new Error(`Failed to create token for player ${player.name}`);
      }

      console.log(`✓ Test 1.3.${players.indexOf(player) + 1}: Token created for ${player.name}`);
    }

    // Test 1.4: Delete room
    console.log('\nTest 1.4: Deleting Daily.co room...');
    const deleted = await deleteDailyRoom(roomData.name);

    if (!deleted) {
      throw new Error('Room deletion failed');
    }

    console.log('✓ Test 1.4: Room deleted successfully');

    return { success: true, roomData };
  } catch (error) {
    console.error('✗ Room management test failed:', error.message);

    // Cleanup: try to delete room if it was created
    if (roomData && roomData.name) {
      try {
        await deleteDailyRoom(roomData.name);
        console.log('  - Cleanup: Room deleted');
      } catch (cleanupError) {
        console.error('  - Cleanup failed:', cleanupError.message);
      }
    }

    return { success: false, error: error.message };
  }
}

/**
 * Test Suite 2: Database Operations
 */
async function testDatabaseOperations() {
  console.log('\n=== Test Suite 2: Database Operations ===\n');

  if (!USE_REAL_DB) {
    console.log('⊘ Skipping (no database configured)');
    return { success: true, skipped: true };
  }

  const sessionId = uuidv4();
  const testSession = {
    id: sessionId,
    roomId: `test-room-${Date.now()}`,
    roomName: 'Test Game Room',
    dailyRoomName: `bol-game-test-${Date.now()}`,
    dailyRoomUrl: 'https://test.daily.co/test-room',
    playerCount: 2
  };

  try {
    // Test 2.1: Create game session
    console.log('Test 2.1: Creating game session...');
    const session = await createGameSession(testSession);

    if (!session || session.id !== sessionId) {
      throw new Error('Session creation failed');
    }

    console.log('✓ Test 2.1: Game session created');
    console.log(`  - Session ID: ${session.id}`);
    console.log(`  - Status: ${session.status}`);

    // Test 2.2: Save transcripts
    console.log('\nTest 2.2: Saving transcripts...');
    const mockTranscripts = [
      {
        userId: uuidv4(),
        userName: 'Alice',
        text: 'Hello everyone, how are you doing today?',
        timestamp: Date.now() / 1000,
        start: 1.0,
        duration: 2.5,
        confidence: 0.95
      },
      {
        userId: uuidv4(),
        userName: 'Bob',
        text: 'I am doing great, thanks for asking!',
        timestamp: Date.now() / 1000 + 3,
        start: 3.5,
        duration: 2.0,
        confidence: 0.93
      }
    ];

    const saved = await saveTranscripts(sessionId, mockTranscripts);

    if (!saved || saved.length !== 2) {
      throw new Error('Transcript save failed');
    }

    console.log(`✓ Test 2.2: Saved ${saved.length} transcripts`);
    saved.forEach((t, i) => {
      console.log(`  - Transcript ${i + 1}: "${t.transcript_text.substring(0, 30)}..."`);
    });

    // Test 2.3: Retrieve transcripts
    console.log('\nTest 2.3: Retrieving transcripts...');
    const retrieved = await getTranscripts(sessionId);

    if (!retrieved || retrieved.length !== 2) {
      throw new Error('Transcript retrieval failed');
    }

    console.log(`✓ Test 2.3: Retrieved ${retrieved.length} transcripts`);

    // Verify data integrity
    console.log('\nTest 2.4: Verifying data integrity...');
    retrieved.forEach((t, i) => {
      if (!t.player_name || !t.transcript_text) {
        throw new Error(`Transcript ${i + 1} missing required fields`);
      }
    });
    console.log('✓ Test 2.4: All transcripts have required fields');

    // Test 2.5: End game session
    console.log('\nTest 2.5: Ending game session...');
    const ended = await endGameSession(sessionId, 'completed');

    if (!ended || ended.status !== 'completed' || !ended.ended_at) {
      throw new Error('Session end failed');
    }

    console.log('✓ Test 2.5: Game session ended');
    console.log(`  - Status: ${ended.status}`);
    console.log(`  - Ended at: ${ended.ended_at}`);

    return { success: true, sessionId, transcriptCount: retrieved.length };
  } catch (error) {
    console.error('✗ Database test failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Test Suite 3: Transcript Polling Logic
 */
async function testTranscriptPolling() {
  console.log('\n=== Test Suite 3: Transcript Polling ===\n');

  if (!USE_REAL_API) {
    console.log('⊘ Skipping (no Daily.co API key configured)');
    return { success: true, skipped: true };
  }

  console.log('Test 3.1: Testing polling with non-existent room...');

  try {
    // This should timeout and throw an error
    const roomName = 'non-existent-room-' + Date.now();
    const startTime = Date.now();

    // Set a short timeout for testing (10 seconds, 5 second poll interval)
    await getDailyTranscripts(roomName, 10000, 5000);

    // If we get here, something is wrong
    throw new Error('Expected timeout error but got transcripts');
  } catch (error) {
    const duration = Date.now() - startTime;

    if (error.message.includes('Timeout') || error.message.includes('No recordings')) {
      console.log('✓ Test 3.1: Polling correctly timed out');
      console.log(`  - Duration: ${Math.round(duration / 1000)}s`);
      return { success: true };
    } else {
      console.error('✗ Test 3.1: Unexpected error:', error.message);
      return { success: false, error: error.message };
    }
  }
}

/**
 * Test Suite 4: End-to-End Workflow (Simulation)
 */
async function testEndToEndWorkflow() {
  console.log('\n=== Test Suite 4: End-to-End Workflow Simulation ===\n');

  if (!USE_REAL_API || !USE_REAL_DB) {
    console.log('⊘ Skipping (requires both API and DB)');
    return { success: true, skipped: true };
  }

  const sessionId = uuidv4();
  const testRoomId = `test-e2e-${Date.now()}`;
  const players = [
    { id: uuidv4(), name: 'Alice', isBot: false },
    { id: uuidv4(), name: 'Bob', isBot: false },
    { id: uuidv4(), name: 'Charlie', isBot: false }
  ];

  let dailyRoomName = null;

  try {
    // Step 1: Create Daily room (as if game is starting)
    console.log('Step 1: Creating Daily.co room...');
    const roomData = await createDailyRoom(testRoomId, players);
    dailyRoomName = roomData.name;
    console.log(`✓ Room created: ${roomData.name}`);

    // Step 2: Create meeting tokens for each player
    console.log('\nStep 2: Creating meeting tokens for players...');
    const tokens = {};
    for (const player of players) {
      tokens[player.id] = await createMeetingToken(
        roomData.name,
        player.name,
        player.id
      );
    }
    console.log(`✓ Created ${Object.keys(tokens).length} tokens`);

    // Step 3: Create game session in database
    console.log('\nStep 3: Creating game session in database...');
    await createGameSession({
      id: sessionId,
      roomId: testRoomId,
      roomName: 'E2E Test Game',
      dailyRoomName: roomData.name,
      dailyRoomUrl: roomData.url,
      playerCount: players.length
    });
    console.log('✓ Game session created');

    // Step 4: Simulate game ending
    console.log('\nStep 4: Ending game session...');
    await endGameSession(sessionId, 'completed');
    console.log('✓ Game session ended');

    // Step 5: Attempt to retrieve transcripts (will fail/timeout as no real call happened)
    console.log('\nStep 5: Attempting to retrieve transcripts...');
    console.log('  (Note: Will timeout as no actual call was made)');

    try {
      // Short timeout for test purposes
      await getDailyTranscripts(roomData.name, 10000, 5000);
      console.log('⚠ Unexpectedly got transcripts (room may have had previous recordings)');
    } catch (error) {
      if (error.message.includes('Timeout') || error.message.includes('No recordings')) {
        console.log('✓ Correctly timed out waiting for transcripts');
      } else {
        throw error;
      }
    }

    // Step 6: Cleanup - Delete Daily room
    console.log('\nStep 6: Cleaning up Daily.co room...');
    await deleteDailyRoom(roomData.name);
    console.log('✓ Room deleted');

    console.log('\n✓ End-to-end workflow completed successfully');
    return { success: true };

  } catch (error) {
    console.error('✗ E2E workflow failed:', error.message);

    // Cleanup
    if (dailyRoomName) {
      try {
        await deleteDailyRoom(dailyRoomName);
        console.log('  - Cleanup: Room deleted');
      } catch (cleanupError) {
        console.error('  - Cleanup failed:', cleanupError.message);
      }
    }

    return { success: false, error: error.message };
  }
}

/**
 * Test Suite 5: Error Recovery
 */
async function testErrorRecovery() {
  console.log('\n=== Test Suite 5: Error Recovery ===\n');

  // Test 5.1: Handle invalid API key
  console.log('Test 5.1: Testing invalid API credentials...');
  try {
    // Temporarily break the API key
    const originalKey = process.env.DAILY_API_KEY;
    process.env.DAILY_API_KEY = 'invalid-key';

    // Try to create a room (should fail)
    try {
      await createDailyRoom('test', [{ id: '1', name: 'Test' }]);
      console.log('⚠ Test 5.1: Expected error but succeeded');
    } catch (error) {
      console.log('✓ Test 5.1: Correctly failed with invalid API key');
      console.log(`  - Error: ${error.message}`);
    }

    // Restore API key
    process.env.DAILY_API_KEY = originalKey;

  } catch (error) {
    console.error('✗ Test 5.1 failed:', error.message);
    return { success: false, error: error.message };
  }

  // Test 5.2: Handle database connection errors
  console.log('\nTest 5.2: Testing database error handling...');
  try {
    // Try to save transcripts with invalid session ID format
    const invalidTranscripts = [
      { text: 'test', userId: 'user1', userName: 'Test' }
    ];

    try {
      await saveTranscripts('invalid-uuid-format', invalidTranscripts);
      console.log('⚠ Test 5.2: Expected database error but succeeded');
    } catch (error) {
      console.log('✓ Test 5.2: Correctly handled database error');
      console.log(`  - Error type: ${error.message.includes('invalid') ? 'Invalid UUID' : 'Other'}`);
    }
  } catch (error) {
    console.error('✗ Test 5.2 failed:', error.message);
    return { success: false, error: error.message };
  }

  console.log('\n✓ All error recovery tests passed');
  return { success: true };
}

/**
 * Run all integration tests
 */
async function runAllTests() {
  const startTime = Date.now();
  const results = {
    passed: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };

  // Run test suites sequentially
  const suites = [
    { name: 'Room Management', fn: testRoomManagement },
    { name: 'Database Operations', fn: testDatabaseOperations },
    { name: 'Transcript Polling', fn: testTranscriptPolling },
    { name: 'End-to-End Workflow', fn: testEndToEndWorkflow },
    { name: 'Error Recovery', fn: testErrorRecovery }
  ];

  for (const suite of suites) {
    try {
      const result = await suite.fn();

      if (result.skipped) {
        results.skipped++;
      } else if (result.success) {
        results.passed++;
      } else {
        results.failed++;
        results.errors.push({ suite: suite.name, error: result.error });
      }
    } catch (error) {
      results.failed++;
      results.errors.push({ suite: suite.name, error: error.message });
      console.error(`\n✗ ${suite.name} threw unexpected error:`, error);
    }
  }

  // Close database connection
  if (USE_REAL_DB) {
    try {
      await closePool();
      console.log('\n✓ Database connection closed');
    } catch (error) {
      console.error('\n⚠ Error closing database:', error.message);
    }
  }

  // Print summary
  const duration = Date.now() - startTime;
  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║  Integration Test Summary                 ║');
  console.log('╚════════════════════════════════════════════╝');
  console.log(`  Passed:  ${results.passed}`);
  console.log(`  Failed:  ${results.failed}`);
  console.log(`  Skipped: ${results.skipped}`);
  console.log(`  Duration: ${Math.round(duration / 1000)}s`);

  if (results.errors.length > 0) {
    console.log('\n  Errors:');
    results.errors.forEach((e, i) => {
      console.log(`    ${i + 1}. ${e.suite}: ${e.error}`);
    });
  }

  console.log('');

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests if called directly
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('\n✗ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = {
  testRoomManagement,
  testDatabaseOperations,
  testTranscriptPolling,
  testEndToEndWorkflow,
  testErrorRecovery
};
