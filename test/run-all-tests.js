#!/usr/bin/env node

/**
 * Test Runner - Runs all transcript tests
 * Usage: node test/run-all-tests.js [--unit] [--integration] [--all]
 */

const { spawn } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const runUnit = args.includes('--unit') || args.includes('--all') || args.length === 0;
const runIntegration = args.includes('--integration') || args.includes('--all') || args.length === 0;

console.log('\n╔════════════════════════════════════════════╗');
console.log('║  Daily.co Transcript Test Runner         ║');
console.log('╚════════════════════════════════════════════╝\n');

const results = {
  unit: null,
  integration: null
};

function runTest(testName, scriptPath) {
  return new Promise((resolve, reject) => {
    console.log(`\n▶ Running ${testName} tests...\n`);

    const child = spawn('node', [scriptPath], {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });

    child.on('exit', (code) => {
      results[testName.toLowerCase()] = code === 0;
      resolve(code);
    });

    child.on('error', (error) => {
      console.error(`Error running ${testName} tests:`, error);
      results[testName.toLowerCase()] = false;
      reject(error);
    });
  });
}

async function main() {
  const startTime = Date.now();
  let exitCode = 0;

  try {
    if (runUnit) {
      const code = await runTest('Unit', path.join(__dirname, 'transcript-unit.test.js'));
      if (code !== 0) exitCode = 1;
    }

    if (runIntegration) {
      const code = await runTest('Integration', path.join(__dirname, 'transcript-integration.test.js'));
      if (code !== 0) exitCode = 1;
    }

    const duration = Date.now() - startTime;

    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║  Test Runner Summary                      ║');
    console.log('╚════════════════════════════════════════════╝');

    if (results.unit !== null) {
      console.log(`  Unit Tests:        ${results.unit ? '✓ PASSED' : '✗ FAILED'}`);
    }

    if (results.integration !== null) {
      console.log(`  Integration Tests: ${results.integration ? '✓ PASSED' : '✗ FAILED'}`);
    }

    console.log(`  Total Duration:    ${Math.round(duration / 1000)}s`);
    console.log('');

    process.exit(exitCode);
  } catch (error) {
    console.error('\n✗ Test runner failed:', error);
    process.exit(1);
  }
}

main();
