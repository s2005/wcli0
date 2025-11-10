#!/usr/bin/env node

/**
 * Performance testing script for modular shell builds
 * Measures startup time, memory usage, and shell loading performance
 */

const { performance } = require('perf_hooks');
const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m'
};

// Available build configurations
const BUILD_CONFIGS = ['full', 'windows', 'unix', 'gitbash-only', 'cmd-only'];

// Results storage
const results = {};

/**
 * Format bytes to human-readable format
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / 1048576).toFixed(2)} MB`;
}

/**
 * Format milliseconds to human-readable format
 */
function formatMs(ms) {
  if (ms < 1000) return `${ms.toFixed(2)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/**
 * Measure startup time for a build
 */
async function measureStartupTime(buildName) {
  const buildPath = path.join(__dirname, '..', 'dist', `index.${buildName}.js`);

  if (!fs.existsSync(buildPath)) {
    return null;
  }

  const iterations = 5;
  const times = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();

    // Clear require cache
    delete require.cache[require.resolve(buildPath)];

    // Load the module (but don't execute server)
    try {
      require(buildPath);
    } catch (e) {
      // Expected - server tries to start
    }

    const end = performance.now();
    times.push(end - start);

    // Small delay between iterations
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Calculate average, excluding outliers
  times.sort((a, b) => a - b);
  const middle = times.slice(1, -1);
  const average = middle.reduce((a, b) => a + b, 0) / middle.length;

  return {
    average,
    min: Math.min(...times),
    max: Math.max(...times),
    samples: times.length
  };
}

/**
 * Measure memory usage for a build
 */
function measureMemoryUsage(buildName) {
  const buildPath = path.join(__dirname, '..', 'dist', `index.${buildName}.js`);

  if (!fs.existsSync(buildPath)) {
    return null;
  }

  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }

  const before = process.memoryUsage();

  // Load the module
  try {
    require(buildPath);
  } catch (e) {
    // Expected - server tries to start
  }

  const after = process.memoryUsage();

  return {
    heapUsed: after.heapUsed - before.heapUsed,
    heapTotal: after.heapTotal - before.heapTotal,
    external: after.external - before.external,
    rss: after.rss - before.rss
  };
}

/**
 * Get file size for a build
 */
function getFileSize(buildName) {
  const buildPath = path.join(__dirname, '..', 'dist', `index.${buildName}.js`);

  if (!fs.existsSync(buildPath)) {
    return null;
  }

  const stats = fs.statSync(buildPath);
  return stats.size;
}

/**
 * Run performance tests for all builds
 */
async function runTests() {
  console.log(`${colors.blue}==================================================`);
  console.log(`  Modular Shell Architecture - Performance Tests`);
  console.log(`==================================================${colors.reset}\n`);

  console.log('Running performance tests...\n');

  // Collect results
  for (const buildName of BUILD_CONFIGS) {
    const buildPath = path.join(__dirname, '..', 'dist', `index.${buildName}.js`);

    if (!fs.existsSync(buildPath)) {
      console.log(`${colors.yellow}Skipping ${buildName}: build not found${colors.reset}`);
      continue;
    }

    console.log(`${colors.blue}Testing: ${buildName}${colors.reset}`);

    results[buildName] = {
      fileSize: getFileSize(buildName),
      startupTime: await measureStartupTime(buildName),
      memory: measureMemoryUsage(buildName)
    };

    console.log(`  ✓ Completed\n`);
  }

  // Display results
  displayResults();
}

/**
 * Display test results
 */
function displayResults() {
  console.log(`\n${colors.blue}==================================================`);
  console.log(`  Results`);
  console.log(`==================================================${colors.reset}\n`);

  // File Size Comparison
  console.log(`${colors.yellow}File Size Comparison:${colors.reset}\n`);
  console.log('Build                Size          Reduction     % of Full');
  console.log('-------------------  ------------  ------------  ----------');

  const fullSize = results['full']?.fileSize;

  for (const buildName of BUILD_CONFIGS) {
    if (!results[buildName]) continue;

    const size = results[buildName].fileSize;
    const sizeFormatted = formatBytes(size);
    const reduction = fullSize ? ((fullSize - size) / fullSize * 100).toFixed(1) + '%' : 'N/A';
    const percent = fullSize ? (size / fullSize * 100).toFixed(1) + '%' : 'N/A';

    console.log(
      `${buildName.padEnd(20)} ${sizeFormatted.padEnd(13)} ` +
      `${(buildName === 'full' ? 'Baseline' : reduction).padEnd(13)} ${percent}`
    );
  }

  // Startup Time Comparison
  console.log(`\n${colors.yellow}Startup Time Comparison:${colors.reset}\n`);
  console.log('Build                Average       Min           Max');
  console.log('-------------------  ------------  ------------  ------------');

  const fullStartup = results['full']?.startupTime?.average;

  for (const buildName of BUILD_CONFIGS) {
    if (!results[buildName]?.startupTime) continue;

    const { average, min, max } = results[buildName].startupTime;
    const improvement = fullStartup && buildName !== 'full'
      ? ` (${((fullStartup - average) / fullStartup * 100).toFixed(1)}% faster)`
      : '';

    console.log(
      `${buildName.padEnd(20)} ${formatMs(average).padEnd(13)} ` +
      `${formatMs(min).padEnd(13)} ${formatMs(max)}${improvement}`
    );
  }

  // Memory Usage Comparison
  console.log(`\n${colors.yellow}Memory Usage Comparison:${colors.reset}\n`);
  console.log('Build                Heap Used     RSS           Improvement');
  console.log('-------------------  ------------  ------------  ------------');

  const fullMemory = results['full']?.memory?.heapUsed;

  for (const buildName of BUILD_CONFIGS) {
    if (!results[buildName]?.memory) continue;

    const { heapUsed, rss } = results[buildName].memory;
    const improvement = fullMemory && buildName !== 'full'
      ? `${((fullMemory - heapUsed) / fullMemory * 100).toFixed(1)}% less`
      : 'Baseline';

    console.log(
      `${buildName.padEnd(20)} ${formatBytes(heapUsed).padEnd(13)} ` +
      `${formatBytes(rss).padEnd(13)} ${improvement}`
    );
  }

  // Success Metrics
  console.log(`\n${colors.blue}==================================================`);
  console.log(`  Success Metrics`);
  console.log(`==================================================${colors.reset}\n`);

  const gitbashSize = results['gitbash-only']?.fileSize;
  if (fullSize && gitbashSize) {
    const reduction = ((fullSize - gitbashSize) / fullSize * 100).toFixed(1);
    console.log(`Target: 30-65% bundle size reduction for specialized builds`);
    console.log(`Actual: ${reduction}% reduction for Git Bash-only build`);

    if (parseFloat(reduction) >= 30) {
      console.log(`${colors.green}✓ Target met!${colors.reset}`);
    } else {
      console.log(`${colors.yellow}⚠ Below target${colors.reset}`);
    }
  }

  const gitbashStartup = results['gitbash-only']?.startupTime?.average;
  if (fullStartup && gitbashStartup) {
    const improvement = ((fullStartup - gitbashStartup) / fullStartup * 100).toFixed(1);
    console.log(`\nTarget: 20-45% startup time improvement`);
    console.log(`Actual: ${improvement}% faster startup for Git Bash-only build`);

    if (parseFloat(improvement) >= 20) {
      console.log(`${colors.green}✓ Target met!${colors.reset}`);
    } else {
      console.log(`${colors.yellow}⚠ Below target${colors.reset}`);
    }
  }

  console.log(`\n${colors.blue}==================================================`);
  console.log(`  Performance Testing Complete`);
  console.log(`==================================================${colors.reset}\n`);

  // Save results to JSON
  const resultsPath = path.join(__dirname, '..', 'performance-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`Results saved to: ${resultsPath}\n`);
}

// Run tests
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { runTests, measureStartupTime, measureMemoryUsage, getFileSize };
