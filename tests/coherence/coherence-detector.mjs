import { readFile } from 'node:fs/promises';

function readPath(snapshot, path) {
  if (!path || typeof path !== 'string') {
    return undefined;
  }

  const segments = path.split('.').filter((segment) => segment.length > 0);
  let current = snapshot;

  for (const segment of segments) {
    if (current === null || typeof current !== 'object') {
      return undefined;
    }

    const key = /^\d+$/.test(segment) ? Number(segment) : segment;
    if (!(key in current)) {
      return undefined;
    }
    current = current[key];
  }

  return current;
}

function arraysEqual(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function evaluateUnaryRule(rule, snapshot) {
  const actual = readPath(snapshot, rule.path);

  switch (rule.type) {
    case 'equals':
      return actual === rule.value;
    case 'includes':
      return typeof actual === 'string' && actual.includes(String(rule.value));
    case 'arrayEquals':
      return arraysEqual(actual, rule.value);
    case 'lengthEquals':
      return Array.isArray(actual) && actual.length === Number(rule.value);
    case 'numberEquals':
      return typeof actual === 'number' && actual === Number(rule.value);
    case 'numberGte':
      return typeof actual === 'number' && actual >= Number(rule.value);
    case 'numberLte':
      return typeof actual === 'number' && actual <= Number(rule.value);
    case 'allEqual':
      return (
        Array.isArray(actual) &&
        actual.length > 1 &&
        actual.every((value) => value === actual[0])
      );
    default:
      return false;
  }
}

function evaluateCrossRule(rule, snapshot) {
  const left = readPath(snapshot, rule.leftPath);
  const right = readPath(snapshot, rule.rightPath);

  switch (rule.type) {
    case 'ifIncludesThenEquals': {
      const triggered = typeof left === 'string' && left.includes(String(rule.leftValue));
      if (!triggered) {
        return true;
      }
      return right === rule.rightValue;
    }
    case 'ifIncludesThenIncludes': {
      const triggered = typeof left === 'string' && left.includes(String(rule.leftValue));
      if (!triggered) {
        return true;
      }
      return typeof right === 'string' && right.includes(String(rule.rightValue));
    }
    case 'ifEqualsThenEquals': {
      if (left !== rule.leftValue) {
        return true;
      }
      return right === rule.rightValue;
    }
    default:
      return false;
  }
}

function evaluateRules(rules, snapshot, cross = false) {
  const failures = [];

  for (const rule of rules) {
    const passed = cross ? evaluateCrossRule(rule, snapshot) : evaluateUnaryRule(rule, snapshot);
    if (!passed) {
      failures.push({
        id: rule.id,
        type: rule.type,
        message: rule.message
      });
    }
  }

  return failures;
}

export async function loadCoherenceRules(pathToRules) {
  const content = await readFile(pathToRules, 'utf8');
  return JSON.parse(content);
}

export function analyzeCoherenceSnapshot(snapshot, rules) {
  const unaryFailures = evaluateRules(rules.rules ?? [], snapshot, false);
  const crossFailures = evaluateRules(rules.crossRules ?? [], snapshot, true);

  const runtimeContradictions = Array.isArray(snapshot?.defense?.personaContradictions)
    ? snapshot.defense.personaContradictions.length
    : 0;
  const contradictionCount = unaryFailures.length + crossFailures.length + runtimeContradictions;
  const coherenceScore =
    typeof snapshot?.defense?.personaCoherenceScore === 'number'
      ? snapshot.defense.personaCoherenceScore
      : null;

  const thresholdFailures = [];
  const maxContradictions = Number(rules?.thresholds?.maxContradictions ?? 0);
  const minCoherenceScore = Number(rules?.thresholds?.minCoherenceScore ?? 0.95);

  if (contradictionCount > maxContradictions) {
    thresholdFailures.push({
      id: 'threshold.maxContradictions',
      type: 'threshold',
      message: `Contradiction count ${contradictionCount} exceeded max ${maxContradictions}.`
    });
  }

  if (coherenceScore !== null && coherenceScore < minCoherenceScore) {
    thresholdFailures.push({
      id: 'threshold.minCoherenceScore',
      type: 'threshold',
      message: `Coherence score ${coherenceScore} fell below min ${minCoherenceScore}.`
    });
  }

  const failures = [...unaryFailures, ...crossFailures, ...thresholdFailures];

  return {
    passed: failures.length === 0,
    metrics: {
      contradictionCount,
      coherenceScore,
      ruleFailureCount: unaryFailures.length + crossFailures.length,
      runtimeContradictions
    },
    failures
  };
}
