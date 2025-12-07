# Daily.co Transcript System Tests

Comprehensive test suite for the Daily.co transcript retrieval and storage system.

## Test Files

### 1. `transcript-unit.test.js` - Static Unit Tests
Tests individual functions and logic in isolation without external dependencies.

**Test Suites:**
- Field Mapping Logic - Validates extraction of data from various field name formats
- Data Validation - Ensures transcript data meets requirements
- Timestamp Conversion - Tests Unix timestamp to Date conversion
- Duration Calculation - Tests duration extraction and calculation
- Array Processing - Tests handling of transcript arrays
- API Response Structure - Validates Daily.co API response format
- Error Handling - Tests resilience to invalid inputs

**Run:**
```bash
node test/transcript-unit.test.js
```

### 2. `transcript-integration.test.js` - Dynamic Integration Tests
Tests the complete workflow with real API calls (when credentials are configured).

**Test Suites:**
- Room Management - Creates/deletes Daily.co rooms, generates meeting tokens
- Database Operations - Creates sessions, saves/retrieves transcripts
- Transcript Polling - Tests the polling mechanism with timeouts
- End-to-End Workflow - Simulates complete game lifecycle
- Error Recovery - Tests error handling and graceful degradation

**Run:**
```bash
node test/transcript-integration.test.js
```

**Note:** Integration tests will skip API tests if `DAILY_API_KEY` is not configured, and skip database tests if `DATABASE_URL` is not configured.

### 3. `run-all-tests.js` - Test Runner
Runs all test suites and provides a summary.

**Run all tests:**
```bash
node test/run-all-tests.js
# or
npm test
```

**Run specific test types:**
```bash
node test/run-all-tests.js --unit          # Only unit tests
node test/run-all-tests.js --integration   # Only integration tests
node test/run-all-tests.js --all          # All tests (default)
```

## Prerequisites

### For Unit Tests
- Node.js installed
- No additional configuration needed (uses mock data)

### For Integration Tests

**Daily.co API Tests:**
- `DAILY_API_KEY` - Your Daily.co API key
- `DAILY_DOMAIN` - Your Daily.co domain

**Database Tests:**
- `DATABASE_URL` - PostgreSQL connection string
- Database migrations must be run (`npm run migrate:up`)

**Configuration:**
Set these in your `.env` file:
```bash
DAILY_API_KEY=your_api_key_here
DAILY_DOMAIN=your-domain.daily.co
DATABASE_URL=postgresql://user:password@localhost:5432/database
```

## Test Coverage

### What's Tested

✓ **Field Mapping**
- Multiple field name variations (userId vs user_id, etc.)
- Fallback values for missing fields
- Type conversions

✓ **Data Validation**
- Required field presence
- Empty/null value handling
- Malformed data rejection

✓ **API Integration**
- Room creation and deletion
- Meeting token generation
- Transcript polling with retries
- Timeout handling

✓ **Database Operations**
- Session creation and completion
- Transcript storage and retrieval
- Data integrity verification

✓ **Error Handling**
- Invalid API credentials
- Network failures
- Database connection errors
- Missing/incomplete data

✓ **End-to-End Workflow**
- Complete game lifecycle simulation
- Proper cleanup on errors
- Resource management

### What's NOT Tested

These require manual testing or actual Daily.co calls:
- Actual voice call transcription accuracy
- Real-time transcript streaming
- Multi-participant speaker identification
- Transcript quality with different accents/languages

## Interpreting Results

### Successful Run
```
╔════════════════════════════════════════════╗
║  ✓ ALL TESTS PASSED!                      ║
║  Completed in 150ms                       ║
╚════════════════════════════════════════════╝
```

### Failed Test
Tests will print specific failure messages:
```
✗ TEST FAILED: Expected userId to be extracted
  at testFieldMapping (transcript-unit.test.js:42)
```

### Skipped Tests
Integration tests that require credentials will skip gracefully:
```
⊘ Skipping (no Daily.co API key configured)
```

## Continuous Integration

To add to CI/CD pipeline:

```yaml
# .github/workflows/test.yml
name: Test Daily.co Transcripts
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: npm test
        env:
          DAILY_API_KEY: ${{ secrets.DAILY_API_KEY }}
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

## Troubleshooting

### "Module not found" errors
Make sure you're running tests from the `bol-server` directory:
```bash
cd /path/to/bol-server
node test/transcript-unit.test.js
```

### Integration tests all skipped
Check your `.env` file has the required credentials:
```bash
cat .env | grep DAILY_API_KEY
cat .env | grep DATABASE_URL
```

### Database tests fail
Ensure migrations are run:
```bash
npm run migrate:up
```

### API tests timeout
- Check your internet connection
- Verify API key is valid: https://dashboard.daily.co/
- Daily.co API may have rate limits

## Adding New Tests

### Unit Test Template
```javascript
function testNewFeature() {
  console.log('\n=== Test Suite X: New Feature ===\n');

  // Test X.1: Description
  const input = { /* test data */ };
  const result = myFunction(input);

  assert.strictEqual(result, expectedValue, 'Test X.1: Should do something');
  console.log('✓ Test X.1: Passed');
}
```

### Integration Test Template
```javascript
async function testNewIntegration() {
  console.log('\n=== Test Suite X: New Integration ===\n');

  try {
    // Arrange
    const testData = setupTestData();

    // Act
    const result = await performAction(testData);

    // Assert
    if (!result || !result.expected) {
      throw new Error('Unexpected result');
    }

    console.log('✓ Test X: Integration passed');
    return { success: true };
  } catch (error) {
    console.error('✗ Test X failed:', error.message);
    return { success: false, error: error.message };
  }
}
```

## Best Practices

1. **Cleanup:** Always clean up test resources (rooms, database records)
2. **Isolation:** Tests should not depend on each other
3. **Mocking:** Use real APIs sparingly, mock when possible
4. **Error Messages:** Provide clear, actionable error messages
5. **Documentation:** Keep this README updated with new tests

## Support

For issues or questions about the tests:
1. Check the error message and stack trace
2. Review the test code to understand what's being tested
3. Verify your environment configuration
4. Check Daily.co API status: https://status.daily.co/
