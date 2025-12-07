/**
 * Test Runner for AI Summary Feature
 * Runs both unit and integration tests
 */

const { spawn } = require('child_process');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
};

function log(color, message) {
  console.log(color + message + colors.reset);
}

function runTest(testFile, testName) {
  return new Promise((resolve, reject) => {
    log(colors.magenta, `\n${'='.repeat(60)}`);
    log(colors.magenta, `Running: ${testName}`);
    log(colors.magenta, `${'='.repeat(60)}\n`);

    const testProcess = spawn('node', [testFile], {
      stdio: 'inherit',
      env: process.env,
    });

    testProcess.on('close', (code) => {
      if (code === 0) {
        log(colors.green, `\n✓ ${testName} completed successfully\n`);
        resolve();
      } else {
        log(colors.red, `\n✗ ${testName} failed with exit code ${code}\n`);
        reject(new Error(`${testName} failed`));
      }
    });

    testProcess.on('error', (error) => {
      log(colors.red, `\n✗ ${testName} error: ${error.message}\n`);
      reject(error);
    });
  });
}

async function runAllTests() {
  log(colors.cyan, '\n' + '='.repeat(60));
  log(colors.cyan, 'AI SUMMARY FEATURE - COMPLETE TEST SUITE');
  log(colors.cyan, '='.repeat(60) + '\n');

  const args = process.argv.slice(2);
  const runAll = args.includes('--all');
  const runUnit = args.includes('--unit') || runAll;
  const runIntegration = args.includes('--integration') || runAll;

  if (!runUnit && !runIntegration) {
    // Default: run all tests
    log(colors.yellow, 'No test type specified. Running all tests...\n');
  }

  let passedSuites = 0;
  let failedSuites = 0;

  // Run Unit Tests
  if (runUnit || !args.length) {
    try {
      await runTest(
        './test/ai-summary-unit.test.js',
        'Unit Tests'
      );
      passedSuites++;
    } catch (error) {
      failedSuites++;
    }
  }

  // Run Integration Tests
  if (runIntegration || !args.length) {
    try {
      await runTest(
        './test/ai-summary-integration.test.js',
        'Integration Tests'
      );
      passedSuites++;
    } catch (error) {
      failedSuites++;
    }
  }

  // Final Summary
  log(colors.cyan, '\n' + '='.repeat(60));
  log(colors.cyan, 'FINAL TEST SUMMARY');
  log(colors.cyan, '='.repeat(60));

  if (passedSuites > 0) {
    log(colors.green, `✓ Test Suites Passed: ${passedSuites}`);
  }

  if (failedSuites > 0) {
    log(colors.red, `✗ Test Suites Failed: ${failedSuites}`);
  }

  log(colors.cyan, `Total Test Suites: ${passedSuites + failedSuites}`);
  log(colors.cyan, '='.repeat(60) + '\n');

  if (failedSuites === 0) {
    log(colors.green, '🎉 All test suites passed!\n');
    process.exit(0);
  } else {
    log(colors.red, '❌ Some test suites failed. Please review the output above.\n');
    process.exit(1);
  }
}

// Show usage if --help
if (process.argv.includes('--help')) {
  console.log(`
AI Summary Test Runner

Usage:
  node test/run-ai-summary-tests.js [options]

Options:
  --all           Run all tests (default)
  --unit          Run only unit tests
  --integration   Run only integration tests
  --help          Show this help message

Examples:
  node test/run-ai-summary-tests.js
  node test/run-ai-summary-tests.js --unit
  node test/run-ai-summary-tests.js --integration
  node test/run-ai-summary-tests.js --all
`);
  process.exit(0);
}

// Run the tests
runAllTests().catch((error) => {
  log(colors.red, `\n❌ Test runner error: ${error.message}\n`);
  console.error(error);
  process.exit(1);
});
