# Quick Start Guide - Testing Transcripts

## Run Tests Immediately

```bash
# Unit tests (no setup needed)
npm run test:unit

# All tests
npm test
```

## Test Output Example

✅ **All tests passing:**
```
╔════════════════════════════════════════════╗
║  ✓ ALL TESTS PASSED!                      ║
║  Completed in 2ms                         ║
╚════════════════════════════════════════════╝
```

❌ **Test failure:**
```
✗ TEST FAILED: Expected field to be extracted
```

## What Gets Tested?

### Unit Tests (Always Run)
- ✓ Field mapping from different API formats
- ✓ Data validation
- ✓ Timestamp conversions
- ✓ Duration calculations
- ✓ Error handling

### Integration Tests (Require Setup)
- ⊘ Daily.co room creation (needs `DAILY_API_KEY`)
- ⊘ Meeting token generation (needs `DAILY_API_KEY`)
- ⊘ Database operations (needs `DATABASE_URL`)
- ⊘ End-to-end workflow (needs both)

## Setup for Integration Tests

1. **Add Daily.co credentials to `.env`:**
```bash
DAILY_API_KEY=your_api_key_here
DAILY_DOMAIN=your-domain.daily.co
```

2. **Add database URL to `.env`:**
```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/dbname
```

3. **Run migrations:**
```bash
npm run migrate:up
```

4. **Run integration tests:**
```bash
npm run test:integration
```

## Common Issues

### "Module not found"
```bash
# Make sure you're in the right directory
cd bol-server
npm run test:unit
```

### Integration tests skip
- Check your `.env` file has credentials
- Tests will skip gracefully if credentials are missing

### Database errors
```bash
# Run migrations first
npm run migrate:up
```

## Next Steps

After tests pass:
1. Run a real game with voice chat
2. Check server logs for transcript data
3. Query database: `SELECT * FROM voice_transcripts;`

See [README.md](README.md) for full documentation.
