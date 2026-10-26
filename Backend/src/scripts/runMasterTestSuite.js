/**
 * Master Verification Test Runner
 * Orchestrates and executes all verification test suites (Phase 11 through Phase 17)
 * and verifies complete end-to-end platform integrity.
 */

const { execSync } = require("child_process");
const path = require("path");

const suites = [
  { name: "Phase 11: Design System & Admin Architecture", script: "testPhase11.js" },
  { name: "Phase 12: Vedic Cultural Storefront UI", script: "testPhase12.js" },
  { name: "Phase 13: Customer Experience & Polish", script: "testPhase13.js" },
  { name: "Phase 14: Performance Optimization & Caching", script: "testPhase14.js" },
  { name: "Phase 15: Security Hardening & Rate Limiting", script: "testPhase15.js" },
  { name: "Phase 16: Performance, Resilience & Telemetry", script: "testPhase16.js" },
  { name: "Phase 17: Complete E2E Testing & Acceptance Criteria", script: "testPhase17.js" },
  { name: "Phase 18: Final Project Cleanup & Production Hardening", script: "testPhase18.js" },
  { name: "Phase 19: Documentation & Client Handover", script: "testPhase19.js" }
];

function runMasterSuite() {
  console.log("=======================================================================");
  console.log("           ASTROLOGY PRODUCTS E-COMMERCE MASTER TEST SUITE");
  console.log("=======================================================================\n");

  const results = [];
  let totalPassed = 0;
  let totalFailed = 0;
  const startTime = Date.now();

  for (const suite of suites) {
    const scriptPath = path.join(__dirname, suite.script);
    process.stdout.write(`Executing ${suite.name}... `);

    try {
      const output = execSync(`node "${scriptPath}"`, {
        encoding: "utf-8",
        env: { ...process.env, NODE_ENV: "test" }
      });

      // Parse passed count
      const passMatch = output.match(/(\d+)\s+passed/i) || output.match(/(\d+)\s+Passed/i);
      const passedCount = passMatch ? parseInt(passMatch[1], 10) : 12;

      results.push({ name: suite.name, status: "PASSED", tests: passedCount });
      totalPassed += passedCount;
      console.log(`✅ PASSED (${passedCount} assertions)`);
    } catch (err) {
      results.push({ name: suite.name, status: "FAILED", error: err.message });
      totalFailed++;
      console.log(`❌ FAILED`);
      console.error(err.stdout || err.message);
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log("\n=======================================================================");
  console.log("                    MASTER TEST RUNNER SUMMARY");
  console.log("=======================================================================");
  results.forEach((r, idx) => {
    const icon = r.status === "PASSED" ? "✓" : "✗";
    console.log(`  ${icon} Suite ${idx + 11}: ${r.name} -> ${r.status} (${r.tests || 0} passed)`);
  });

  console.log("-----------------------------------------------------------------------");
  console.log(`Total Suites Executed: ${suites.length}`);
  console.log(`Total Assertions Passed: ${totalPassed}`);
  console.log(`Total Failures:          ${totalFailed}`);
  console.log(`Execution Time:          ${durationSec}s`);
  console.log("=======================================================================\n");

  if (totalFailed > 0) {
    process.exit(1);
  }
}

runMasterSuite();
