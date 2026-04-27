import { describe, expect, test } from 'vitest';
import { analyzeCoherenceSnapshot } from '../coherence/coherence-detector.mjs';

const rules = {
  thresholds: {
    maxContradictions: 0,
    minCoherenceScore: 0.95
  },
  rules: [
    {
      id: 'platform',
      type: 'equals',
      path: 'navigator.platform',
      value: 'Win32',
      message: 'platform mismatch'
    },
    {
      id: 'canvas-stable',
      type: 'allEqual',
      path: 'canvas.hashes',
      message: 'canvas unstable'
    }
  ],
  crossRules: [
    {
      id: 'ua-platform',
      type: 'ifIncludesThenEquals',
      leftPath: 'navigator.userAgent',
      leftValue: 'Windows NT',
      rightPath: 'navigator.platform',
      rightValue: 'Win32',
      message: 'ua/platform mismatch'
    }
  ]
};

describe('coherence detector', () => {
  test('passes consistent snapshot', () => {
    const snapshot = {
      navigator: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
        platform: 'Win32'
      },
      canvas: {
        hashes: ['a', 'a', 'a']
      },
      defense: {
        personaCoherenceScore: 1,
        personaContradictions: []
      }
    };

    const result = analyzeCoherenceSnapshot(snapshot, rules);

    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
  });

  test('flags contradictions from mismatched snapshot', () => {
    const snapshot = {
      navigator: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
        platform: 'Linux x86_64'
      },
      canvas: {
        hashes: ['a', 'b', 'c']
      },
      defense: {
        personaCoherenceScore: 0.5,
        personaContradictions: ['platform-useragent mismatch']
      }
    };

    const result = analyzeCoherenceSnapshot(snapshot, rules);

    expect(result.passed).toBe(false);
    expect(result.failures.length).toBeGreaterThan(0);
    expect(result.metrics.contradictionCount).toBeGreaterThan(0);
  });
});
