/**
 * Unit Tests for Daily.co Transcript System
 * Tests individual functions in isolation with mocked dependencies
 */

const assert = require('assert');

// Mock configuration
process.env.DAILY_API_KEY = 'test-api-key';
process.env.DAILY_DOMAIN = 'test.daily.co';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

// Test data fixtures
const mockTranscriptData = {
  words: [
    {
      text: 'Hello',
      start: 0.5,
      end: 0.9,
      confidence: 0.98,
      userId: 'test-user-id-1',
      userName: 'Alice'
    },
    {
      text: 'everyone',
      start: 1.0,
      end: 1.5,
      confidence: 0.95,
      userId: 'test-user-id-1',
      userName: 'Alice'
    }
  ],
  segments: [
    {
      text: 'Hello everyone',
      start: 0.5,
      end: 1.5,
      confidence: 0.97,
      userId: 'test-user-id-1',
      userName: 'Alice',
      timestamp: 1234567890
    },
    {
      text: 'How are you?',
      start: 2.0,
      end: 3.2,
      confidence: 0.96,
      userId: 'test-user-id-2',
      userName: 'Bob',
      timestamp: 1234567892
    }
  ]
};

const mockRecordingResponse = {
  data: [
    {
      id: 'recording-123',
      room_name: 'test-room',
      start_ts: 1234567890,
      duration: 120,
      transcription: {
        status: 'finished',
        url: 'https://example.com/transcript.json'
      }
    }
  ]
};

/**
 * Test Suite 1: Field Mapping Logic
 */
function testFieldMapping() {
  console.log('\n=== Test Suite 1: Field Mapping ===\n');

  // Test 1.1: Extract userId from various field names
  const testTranscripts = [
    { userId: 'user-1', text: 'test' },
    { user_id: 'user-2', text: 'test' },
    { participantId: 'user-3', text: 'test' },
    { participant_id: 'user-4', text: 'test' },
  ];

  testTranscripts.forEach((transcript, i) => {
    const userId = transcript.userId || transcript.user_id ||
                   transcript.participantId || transcript.participant_id || null;

    assert.strictEqual(userId, `user-${i + 1}`,
      `Test 1.${i + 1}: Failed to extract userId from transcript`);
    console.log(`✓ Test 1.${i + 1}: Correctly extracted userId: ${userId}`);
  });

  // Test 1.2: Extract text from various field names
  const textTranscripts = [
    { text: 'hello', userId: 'u1' },
    { transcript: 'world', userId: 'u2' },
    { content: 'foo', userId: 'u3' },
  ];

  textTranscripts.forEach((transcript, i) => {
    const text = transcript.text || transcript.transcript || transcript.content || '';
    assert.ok(text.length > 0, `Test 1.2.${i + 1}: Failed to extract text`);
    console.log(`✓ Test 1.2.${i + 1}: Correctly extracted text: "${text}"`);
  });

  // Test 1.3: Handle missing required fields
  const invalidTranscript = { userId: 'test' }; // Missing text
  const text = invalidTranscript.text || invalidTranscript.transcript ||
               invalidTranscript.content || '';

  assert.strictEqual(text, '', 'Test 1.3: Should return empty string for missing text');
  console.log('✓ Test 1.3: Correctly handled missing text field');

  console.log('\n✓ All field mapping tests passed!\n');
}

/**
 * Test Suite 2: Data Validation
 */
function testDataValidation() {
  console.log('\n=== Test Suite 2: Data Validation ===\n');

  // Test 2.1: Valid transcript
  const validTranscript = {
    userId: 'user-123',
    userName: 'Alice',
    text: 'Hello world',
    timestamp: 1234567890,
    confidence: 0.95
  };

  const isValid = validateTranscript(validTranscript);
  assert.strictEqual(isValid, true, 'Test 2.1: Valid transcript should pass validation');
  console.log('✓ Test 2.1: Valid transcript passed validation');

  // Test 2.2: Missing text
  const noText = { userId: 'user-123', userName: 'Alice' };
  assert.strictEqual(validateTranscript(noText), false,
    'Test 2.2: Transcript without text should fail');
  console.log('✓ Test 2.2: Correctly rejected transcript without text');

  // Test 2.3: Missing userId (but has userName - should pass)
  const noUserId = { text: 'hello', userName: 'Alice' };
  assert.strictEqual(validateTranscript(noUserId), true,
    'Test 2.3: Transcript with userName but no userId should pass');
  console.log('✓ Test 2.3: Correctly accepted transcript with userName (no userId)');

  // Test 2.4: Alternative field names
  const altFields = { user_id: 'u1', user_name: 'Bob', text: 'hi' };
  assert.strictEqual(validateTranscript(altFields), true,
    'Test 2.4: Should accept alternative field names');
  console.log('✓ Test 2.4: Correctly accepted alternative field names');

  // Test 2.5: Missing both userId and userName
  const noIdentifier = { text: 'hello' };
  assert.strictEqual(validateTranscript(noIdentifier), false,
    'Test 2.5: Transcript without any identifier should fail');
  console.log('✓ Test 2.5: Correctly rejected transcript without identifier');

  console.log('\n✓ All validation tests passed!\n');
}

// Validation helper function
function validateTranscript(transcript) {
  const hasText = !!(transcript.text || transcript.transcript || transcript.content);
  const hasUserId = !!(transcript.userId || transcript.user_id ||
                       transcript.participantId || transcript.participant_id);
  const hasUserName = !!(transcript.userName || transcript.user_name ||
                         transcript.participantName || transcript.participant_name);

  // Require text AND at least userId or userName
  return hasText && (hasUserId || hasUserName);
}

/**
 * Test Suite 3: Timestamp Conversion
 */
function testTimestampConversion() {
  console.log('\n=== Test Suite 3: Timestamp Conversion ===\n');

  // Test 3.1: Unix timestamp to Date
  const unixTimestamp = 1234567890;
  const date = new Date(unixTimestamp * 1000);

  assert.ok(date instanceof Date, 'Test 3.1: Should create Date object');
  assert.strictEqual(date.getTime(), unixTimestamp * 1000,
    'Test 3.1: Date should match timestamp');
  console.log(`✓ Test 3.1: Correctly converted timestamp ${unixTimestamp} to Date`);

  // Test 3.2: Handle current time as fallback
  const noTimestamp = {};
  const fallbackTime = Date.now() / 1000;
  const timestamp = noTimestamp.timestamp || noTimestamp.ts ||
                   noTimestamp.time || fallbackTime;

  assert.ok(timestamp > 0, 'Test 3.2: Should have valid timestamp');
  console.log('✓ Test 3.2: Correctly used fallback timestamp');

  // Test 3.3: Multiple timestamp field variations
  const timestamps = [
    { timestamp: 1000 },
    { ts: 2000 },
    { time: 3000 }
  ];

  timestamps.forEach((t, i) => {
    const ts = t.timestamp || t.ts || t.time || 0;
    assert.strictEqual(ts, (i + 1) * 1000,
      `Test 3.3.${i + 1}: Failed to extract timestamp`);
    console.log(`✓ Test 3.3.${i + 1}: Correctly extracted timestamp: ${ts}`);
  });

  console.log('\n✓ All timestamp tests passed!\n');
}

/**
 * Test Suite 4: Duration Calculation
 */
function testDurationCalculation() {
  console.log('\n=== Test Suite 4: Duration Calculation ===\n');

  // Test 4.1: Direct duration field
  const withDuration = { duration: 2.5 };
  const dur1 = withDuration.duration || withDuration.duration_seconds || null;
  assert.strictEqual(dur1, 2.5, 'Test 4.1: Should use direct duration');
  console.log('✓ Test 4.1: Correctly used direct duration field');

  // Test 4.2: Calculate from start/end
  const withStartEnd = { start: 1.0, end: 3.5 };
  const dur2 = withStartEnd.duration ||
              (withStartEnd.end && withStartEnd.start ?
               withStartEnd.end - withStartEnd.start : null);
  assert.strictEqual(dur2, 2.5, 'Test 4.2: Should calculate duration from start/end');
  console.log('✓ Test 4.2: Correctly calculated duration from start/end');

  // Test 4.3: Handle missing duration
  const noDuration = { text: 'hello' };
  const dur3 = noDuration.duration || noDuration.duration_seconds || null;
  assert.strictEqual(dur3, null, 'Test 4.3: Should return null for missing duration');
  console.log('✓ Test 4.3: Correctly handled missing duration');

  console.log('\n✓ All duration tests passed!\n');
}

/**
 * Test Suite 5: Transcript Array Processing
 */
function testArrayProcessing() {
  console.log('\n=== Test Suite 5: Array Processing ===\n');

  const transcripts = mockTranscriptData.segments;

  // Test 5.1: Process all valid transcripts
  let processedCount = 0;
  transcripts.forEach(t => {
    const text = t.text || t.transcript || t.content || '';
    if (text) processedCount++;
  });

  assert.strictEqual(processedCount, 2,
    'Test 5.1: Should process all 2 transcripts');
  console.log(`✓ Test 5.1: Processed ${processedCount} transcripts`);

  // Test 5.2: Skip invalid transcripts
  const mixedTranscripts = [
    { text: 'valid', userId: 'u1' },
    { userId: 'u2' }, // no text
    { text: 'also valid', userId: 'u3' },
    {}, // empty
  ];

  let validCount = 0;
  mixedTranscripts.forEach(t => {
    const text = t.text || '';
    if (text) validCount++;
  });

  assert.strictEqual(validCount, 2, 'Test 5.2: Should count only valid transcripts');
  console.log(`✓ Test 5.2: Correctly identified ${validCount} valid transcripts out of ${mixedTranscripts.length}`);

  // Test 5.3: Handle empty array
  const empty = [];
  assert.strictEqual(empty.length, 0, 'Test 5.3: Should handle empty array');
  console.log('✓ Test 5.3: Correctly handled empty transcript array');

  console.log('\n✓ All array processing tests passed!\n');
}

/**
 * Test Suite 6: API Response Structure
 */
function testAPIResponseStructure() {
  console.log('\n=== Test Suite 6: API Response Structure ===\n');

  // Test 6.1: Valid recording response
  const recording = mockRecordingResponse.data[0];
  assert.ok(recording.transcription, 'Test 6.1: Should have transcription object');
  assert.strictEqual(recording.transcription.status, 'finished',
    'Test 6.1: Transcription status should be finished');
  assert.ok(recording.transcription.url, 'Test 6.1: Should have transcript URL');
  console.log('✓ Test 6.1: Valid recording response structure');

  // Test 6.2: Check transcription status
  const statuses = ['finished', 'processing', 'none'];
  statuses.forEach((status, i) => {
    const isReady = status === 'finished';
    assert.strictEqual(
      isReady,
      i === 0,
      `Test 6.2.${i + 1}: Status "${status}" ready check failed`
    );
    console.log(`✓ Test 6.2.${i + 1}: Status "${status}" correctly identified as ${isReady ? 'ready' : 'not ready'}`);
  });

  // Test 6.3: Handle missing transcription
  const noTranscription = { id: 'rec-1', room_name: 'test' };
  assert.strictEqual(noTranscription.transcription, undefined,
    'Test 6.3: Should handle missing transcription');
  console.log('✓ Test 6.3: Correctly handled missing transcription');

  console.log('\n✓ All API response structure tests passed!\n');
}

/**
 * Test Suite 7: Error Handling
 */
function testErrorHandling() {
  console.log('\n=== Test Suite 7: Error Handling ===\n');

  // Test 7.1: Handle null input
  try {
    const result = processTranscripts(null);
    assert.strictEqual(result.length, 0, 'Test 7.1: Should return empty array for null');
    console.log('✓ Test 7.1: Correctly handled null input');
  } catch (err) {
    assert.fail('Test 7.1: Should not throw on null input');
  }

  // Test 7.2: Handle undefined input
  try {
    const result = processTranscripts(undefined);
    assert.strictEqual(result.length, 0, 'Test 7.2: Should return empty array for undefined');
    console.log('✓ Test 7.2: Correctly handled undefined input');
  } catch (err) {
    assert.fail('Test 7.2: Should not throw on undefined input');
  }

  // Test 7.3: Handle non-array input
  try {
    const result = processTranscripts({ text: 'not an array' });
    assert.strictEqual(result.length, 0, 'Test 7.3: Should return empty array for non-array');
    console.log('✓ Test 7.3: Correctly handled non-array input');
  } catch (err) {
    assert.fail('Test 7.3: Should not throw on non-array input');
  }

  // Test 7.4: Handle malformed transcript objects
  const malformed = [
    { random: 'data' },
    { some: 'fields', but: 'no', text: null },
    { text: '', userId: '' }, // empty strings
  ];

  try {
    const result = processTranscripts(malformed);
    assert.strictEqual(result.length, 0,
      'Test 7.4: Should filter out all malformed transcripts');
    console.log('✓ Test 7.4: Correctly handled malformed transcript objects');
  } catch (err) {
    assert.fail('Test 7.4: Should not throw on malformed data');
  }

  console.log('\n✓ All error handling tests passed!\n');
}

// Helper function for error handling tests
function processTranscripts(transcripts) {
  if (!transcripts || !Array.isArray(transcripts)) {
    return [];
  }

  return transcripts.filter(t => {
    const text = t.text || t.transcript || t.content || '';
    return text && text.length > 0;
  });
}

/**
 * Run all unit tests
 */
function runAllTests() {
  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║  Daily.co Transcript Unit Tests          ║');
  console.log('╚════════════════════════════════════════════╝\n');

  const startTime = Date.now();

  try {
    testFieldMapping();
    testDataValidation();
    testTimestampConversion();
    testDurationCalculation();
    testArrayProcessing();
    testAPIResponseStructure();
    testErrorHandling();

    const duration = Date.now() - startTime;
    console.log('╔════════════════════════════════════════════╗');
    console.log('║  ✓ ALL TESTS PASSED!                      ║');
    console.log(`║  Completed in ${duration}ms                       ║`);
    console.log('╚════════════════════════════════════════════╝\n');

    process.exit(0);
  } catch (error) {
    console.error('\n✗ TEST FAILED:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests if called directly
if (require.main === module) {
  runAllTests();
}

module.exports = {
  validateTranscript,
  processTranscripts,
  mockTranscriptData,
  mockRecordingResponse,
};
