/**
 * Unified E2E Test Suite Runner for WinIsle Tauri 2.0 Migration
 *
 * Usage:
 *   deno run -A --config tests/deno.json tests/e2e/runner.ts
 *   or: deno test --config tests/deno.json -A tests/e2e/
 */

interface TierResult {
  tierName: string;
  category: string;
  testsPassed: number;
  testsFailed: number;
  durationMs: number;
}

async function runDenoTest(targetPath: string): Promise<{ success: boolean; output: string }> {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ['test', '--config', 'tests/deno.json', '-A', targetPath],
    stdout: 'piped',
    stderr: 'piped',
  });

  const output = await cmd.output();
  const textOutput = new TextDecoder().decode(output.stdout) + new TextDecoder().decode(output.stderr);
  return {
    success: output.code === 0,
    output: textOutput,
  };
}

function parseTestCount(output: string): { passed: number; failed: number } {
  const match = output.match(/(\d+)\s+passed\s+\|\s+(\d+)\s+failed/);
  if (match) {
    return {
      passed: parseInt(match[1], 10),
      failed: parseInt(match[2], 10),
    };
  }
  return { passed: 0, failed: 0 };
}

async function main() {
  console.log('='.repeat(70));
  console.log('   WINISLE TAURI 2.0 MIGRATION — E2E TEST SUITE RUNNER');
  console.log('='.repeat(70));
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`OS: ${Deno.build.os} | Deno: ${Deno.version.deno}\n`);

  const suites = [
    { name: 'Tier 1: Feature Coverage (R1–R4)', path: 'tests/e2e/tier1_features/' },
    { name: 'Tier 2: Boundary & Corner Cases', path: 'tests/e2e/tier2_boundaries/' },
    { name: 'Tier 3: Cross-Feature Combinations', path: 'tests/e2e/tier3_combinations/' },
    { name: 'Tier 4: Real-World Workflows', path: 'tests/e2e/tier4_scenarios/' },
  ];

  let totalPassed = 0;
  let totalFailed = 0;
  const suiteResults: TierResult[] = [];
  const overallStart = performance.now();

  for (const suite of suites) {
    process.stdout.write(`Executing ${suite.name}... `);
    const start = performance.now();
    const result = await runDenoTest(suite.path);
    const durationMs = Math.round(performance.now() - start);
    const counts = parseTestCount(result.output);

    totalPassed += counts.passed;
    totalFailed += counts.failed;

    suiteResults.push({
      tierName: suite.name,
      category: suite.path,
      testsPassed: counts.passed,
      testsFailed: counts.failed,
      durationMs,
    });

    if (result.success) {
      console.log(`[PASS] (${counts.passed} tests, ${durationMs}ms)`);
    } else {
      console.log(`[FAIL] (${counts.failed} failed, ${durationMs}ms)`);
      console.error(result.output);
    }
  }

  const overallDuration = (performance.now() - overallStart) / 1000;

  console.log('\n' + '='.repeat(70));
  console.log('   TEST EXECUTION SUMMARY');
  console.log('='.repeat(70));
  for (const r of suiteResults) {
    const status = r.testsFailed === 0 ? 'PASS' : 'FAIL';
    console.log(
      `  [${status}] ${r.tierName.padEnd(38)}: ${String(r.testsPassed).padStart(3)} passed, ${String(r.testsFailed).padStart(2)} failed (${r.durationMs}ms)`
    );
  }
  console.log('-'.repeat(70));
  console.log(
    `  TOTAL TESTS: ${totalPassed + totalFailed} | PASSED: ${totalPassed} | FAILED: ${totalFailed} | DURATION: ${overallDuration.toFixed(2)}s`
  );
  console.log(
    `  THRESHOLD STATUS: ${totalPassed + totalFailed >= 115 ? 'MET (≥ 115 required)' : 'UNMET (< 115 required)'}`
  );
  console.log('='.repeat(70) + '\n');

  if (totalFailed > 0 || totalPassed < 115) {
    Deno.exit(1);
  } else {
    Deno.exit(0);
  }
}

if (import.meta.main) {
  main();
}
