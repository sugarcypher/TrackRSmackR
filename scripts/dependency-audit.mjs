import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const reportDir = resolve(process.cwd(), 'audit-reports');
const auditJsonPath = resolve(reportDir, 'npm-audit.json');
const outdatedJsonPath = resolve(reportDir, 'npm-outdated.json');
const summaryPath = resolve(reportDir, 'dependency-audit-summary.md');

const severityRank = {
  none: 0,
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
};

function runJsonCommand(command) {
  try {
    const stdout = execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, payload: JSON.parse(stdout || '{}'), raw: stdout };
  } catch (error) {
    const stdout = String(error?.stdout ?? '');
    const stderr = String(error?.stderr ?? '');
    const combined = stdout || stderr;
    let payload = {};
    try {
      payload = JSON.parse(combined || '{}');
    } catch {
      payload = { error: combined.trim() || `${command} failed without JSON output.` };
    }
    return { ok: false, payload, raw: combined };
  }
}

function extractAuditSeverityCounts(auditPayload) {
  const metadataCounts = auditPayload?.metadata?.vulnerabilities;
  if (metadataCounts && typeof metadataCounts === 'object') {
    return {
      low: Number(metadataCounts.low ?? 0),
      moderate: Number(metadataCounts.moderate ?? 0),
      high: Number(metadataCounts.high ?? 0),
      critical: Number(metadataCounts.critical ?? 0),
      total: Number(metadataCounts.total ?? 0),
    };
  }

  const counters = {
    low: 0,
    moderate: 0,
    high: 0,
    critical: 0,
    total: 0,
  };

  const vulnerabilities = auditPayload?.vulnerabilities;
  if (vulnerabilities && typeof vulnerabilities === 'object') {
    for (const record of Object.values(vulnerabilities)) {
      const severity = String(record?.severity ?? '').toLowerCase();
      if (severity in counters && severity !== 'total') {
        counters[severity] += 1;
      }
      counters.total += 1;
    }
  }

  return counters;
}

function extractOutdatedPackageCount(outdatedPayload) {
  if (!outdatedPayload || typeof outdatedPayload !== 'object') {
    return 0;
  }
  return Object.keys(outdatedPayload).length;
}

function highestSeverity(counts) {
  if ((counts.critical ?? 0) > 0) {
    return 'critical';
  }
  if ((counts.high ?? 0) > 0) {
    return 'high';
  }
  if ((counts.moderate ?? 0) > 0) {
    return 'moderate';
  }
  if ((counts.low ?? 0) > 0) {
    return 'low';
  }
  return 'none';
}

function shouldFailBuild(highest, failOn) {
  const failThreshold = String(failOn || 'none').toLowerCase();
  if (!(failThreshold in severityRank)) {
    return false;
  }
  return severityRank[highest] >= severityRank[failThreshold] && failThreshold !== 'none';
}

function buildSummary({
  generatedAt,
  auditCommandOk,
  outdatedCommandOk,
  counts,
  outdatedCount,
  highest,
  failOn,
}) {
  return [
    '# Dependency Audit Summary',
    '',
    `- Generated At: ${generatedAt}`,
    `- Audit Command Success: ${auditCommandOk}`,
    `- Outdated Command Success: ${outdatedCommandOk}`,
    `- Highest Severity: ${highest}`,
    `- Fail Threshold: ${failOn}`,
    '',
    '## Vulnerability Counts',
    '',
    `- Critical: ${counts.critical}`,
    `- High: ${counts.high}`,
    `- Moderate: ${counts.moderate}`,
    `- Low: ${counts.low}`,
    `- Total: ${counts.total}`,
    '',
    '## Outdated Packages',
    '',
    `- Count: ${outdatedCount}`,
    '',
    '## Artifacts',
    '',
    '- `npm-audit.json`',
    '- `npm-outdated.json`',
    '- `dependency-audit-summary.md`',
    '',
  ].join('\n');
}

mkdirSync(reportDir, { recursive: true });

const auditResult = runJsonCommand('npm audit --json');
const outdatedResult = runJsonCommand('npm outdated --json');

writeFileSync(auditJsonPath, `${JSON.stringify(auditResult.payload, null, 2)}\n`, 'utf8');
writeFileSync(outdatedJsonPath, `${JSON.stringify(outdatedResult.payload, null, 2)}\n`, 'utf8');

const vulnerabilityCounts = extractAuditSeverityCounts(auditResult.payload);
const outdatedCount = extractOutdatedPackageCount(outdatedResult.payload);
const highest = highestSeverity(vulnerabilityCounts);
const failOn = String(process.env.AUDIT_FAIL_ON ?? 'none').toLowerCase();

const summary = buildSummary({
  generatedAt: new Date().toISOString(),
  auditCommandOk: auditResult.ok,
  outdatedCommandOk: outdatedResult.ok,
  counts: vulnerabilityCounts,
  outdatedCount,
  highest,
  failOn,
});

writeFileSync(summaryPath, `${summary}\n`, 'utf8');

const fail = shouldFailBuild(highest, failOn);
if (fail) {
  console.error(`Dependency audit failed: highest severity is '${highest}', threshold is '${failOn}'.`);
  process.exit(1);
}

console.log(summary);
