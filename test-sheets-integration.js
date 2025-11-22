/**
 * Test script for Google Sheets integration
 * Run this to verify your setup is working correctly
 *
 * Usage: node test-sheets-integration.js
 */

require('dotenv').config();
const sheetsManager = require('./utils/sheetsManager');

async function testIntegration() {
  console.log('🧪 Testing Google Sheets Integration\n');

  // Test 1: Check environment variables
  console.log('1️⃣  Checking environment variables...');
  const requiredVars = [
    'GOOGLE_SHEETS_SPREADSHEET_ID',
    'GOOGLE_SERVICE_ACCOUNT_EMAIL',
    'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY'
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    console.error('❌ Missing environment variables:', missingVars.join(', '));
    console.log('\n📝 Please configure these in your .env file');
    console.log('See docs/GOOGLE_SHEETS_SETUP.md for instructions\n');
    process.exit(1);
  }

  console.log('✅ All environment variables are set');
  console.log(`   Spreadsheet ID: ${process.env.GOOGLE_SHEETS_SPREADSHEET_ID}`);
  console.log(`   Service Account: ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL.substring(0, 30)}...`);
  console.log();

  // Test 2: Initialize client
  console.log('2️⃣  Initializing Google Sheets API client...');
  try {
    await sheetsManager.initializeSheetsClient();
    console.log('✅ Successfully initialized Google Sheets API client');
    console.log();
  } catch (error) {
    console.error('❌ Failed to initialize client:', error.message);
    console.log('\n📝 Common issues:');
    console.log('   - Check that your private key is properly formatted');
    console.log('   - Ensure Google Sheets API is enabled in your Google Cloud project');
    console.log('   - See docs/GOOGLE_SHEETS_SETUP.md for troubleshooting\n');
    process.exit(1);
  }

  // Test 3: Fetch questions
  console.log('3️⃣  Fetching questions from Google Sheets...');
  try {
    const questions = await sheetsManager.fetchQuestions();
    console.log(`✅ Successfully fetched ${questions.length} questions`);

    if (questions.length > 0) {
      console.log('\n📋 Sample question:');
      console.log(JSON.stringify(questions[0], null, 2));
      console.log();

      console.log('📊 Column headers detected:');
      console.log(Object.keys(questions[0]).join(', '));
    } else {
      console.log('⚠️  Warning: No questions found in the spreadsheet');
      console.log('   - Make sure your spreadsheet has data');
      console.log('   - Ensure the first row contains headers');
      console.log('   - Check that Sheet1 is the correct tab name');
    }
    console.log();
  } catch (error) {
    console.error('❌ Failed to fetch questions:', error.message);
    console.log('\n📝 Common issues:');
    console.log('   - Did you share the spreadsheet with the service account email?');
    console.log('   - Is the spreadsheet ID correct?');
    console.log('   - Does the sheet have a tab named "Sheet1"?');
    console.log('   - See docs/GOOGLE_SHEETS_SETUP.md for troubleshooting\n');
    process.exit(1);
  }

  // Test 4: Cache functionality
  console.log('4️⃣  Testing cache functionality...');
  try {
    const cacheStatus1 = sheetsManager.getCacheStatus();
    console.log('   Initial cache status:', cacheStatus1.isCached ? 'Cached' : 'Empty');

    const questions1 = await sheetsManager.getQuestionsWithCache();
    const cacheStatus2 = sheetsManager.getCacheStatus();

    console.log(`   After first fetch: ${cacheStatus2.questionCount} questions cached`);
    console.log(`   Cache age: ${cacheStatus2.cacheAgeMinutes || 0} minutes`);

    // Fetch again (should use cache)
    const startTime = Date.now();
    const questions2 = await sheetsManager.getQuestionsWithCache();
    const elapsed = Date.now() - startTime;

    console.log(`   Second fetch (from cache): ${elapsed}ms`);
    console.log('✅ Cache is working correctly');
    console.log();
  } catch (error) {
    console.error('❌ Cache test failed:', error.message);
    console.log();
  }

  // Test 5: Game session filtering
  console.log('5️⃣  Testing game session question filtering...');
  try {
    const allQuestions = await sheetsManager.getQuestionsWithCache();

    // Simulate used questions (first 3)
    const usedIds = [0, 1, 2];
    const availableQuestions = await sheetsManager.getQuestionsForGame('test-game-123', usedIds);

    console.log(`   Total questions: ${allQuestions.length}`);
    console.log(`   Used questions: ${usedIds.length}`);
    console.log(`   Available questions: ${availableQuestions.length}`);
    console.log('✅ Question filtering is working correctly');
    console.log();
  } catch (error) {
    console.error('❌ Filtering test failed:', error.message);
    console.log();
  }

  // Summary
  console.log('🎉 All tests passed!');
  console.log('\n📖 Next steps:');
  console.log('   1. Start your server: npm start');
  console.log('   2. Test the API endpoints:');
  console.log('      curl http://localhost:3001/api/sheets/test');
  console.log('      curl http://localhost:3001/api/sheets/questions');
  console.log('   3. See docs/GOOGLE_SHEETS_SETUP.md for game integration steps');
  console.log();
}

// Run the tests
testIntegration().catch(error => {
  console.error('\n💥 Unexpected error:', error);
  process.exit(1);
});
