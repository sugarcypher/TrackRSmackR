import { describe, expect, test } from 'vitest';
import { ContextProfileWorker } from '../../src/workers/ContextProfileWorker.js';

describe('ContextProfileWorker', () => {
  test('applies explicit user rule before heuristics', () => {
    const worker = new ContextProfileWorker();
    worker.setStateForTesting({
      enabled: true,
      rules: [{ pattern: '*.examplebank.com', mode: 'BALANCED', label: 'custom-bank-relaxed' }]
    });

    const result = worker.resolve('secure.examplebank.com', 'STRICT');

    expect(result.mode).toBe('BALANCED');
    expect(result.source).toBe('rule');
    expect(result.reason).toMatch(/custom-bank-relaxed/i);
  });

  test('promotes high sensitivity contexts to strict', () => {
    const worker = new ContextProfileWorker();
    worker.setStateForTesting({
      enabled: true,
      sensitivityMap: {
        'portal.example.com': {
          sensitivity: 'HIGH',
          source: 'form-detection',
          updatedAt: Date.now(),
          matchedFields: ['password']
        }
      }
    });

    const result = worker.resolve('accounts.portal.example.com', 'BALANCED');

    expect(result.mode).toBe('STRICT');
    expect(result.source).toBe('sensitivity');
    expect(result.sensitivity).toBe('HIGH');
  });

  test('uses heuristics for news domains', () => {
    const worker = new ContextProfileWorker();
    worker.setStateForTesting({ enabled: true });

    const result = worker.resolve('worldnews.example', 'BALANCED');

    expect(result.mode).toBe('STRICT');
    expect(result.category).toBe('NEWS');
    expect(result.source).toBe('heuristic');
  });

  test('relaxes strict heuristic when breakage budget pressure is elevated', () => {
    const worker = new ContextProfileWorker();
    worker.setStateForTesting({
      enabled: true,
      breakageAdaptiveEnabled: true,
      breakageRelaxThreshold: 4,
      breakageMap: {
        'news.example': {
          score: 7,
          scriptErrors: 2,
          rejectedPromises: 1,
          resourceFailures: 1,
          rageClicks: 1,
          lastSignalAt: Date.now(),
          updatedAt: Date.now()
        }
      }
    });

    const result = worker.resolve('news.example', 'BALANCED');

    expect(result.mode).toBe('BALANCED');
    expect(result.source).toBe('breakage');
    expect(result.breakagePressure).toBe('MEDIUM');
    expect(result.reason).toMatch(/Breakage budget relief/i);
  });

  test('keeps strict mode for high sensitivity even with breakage pressure', () => {
    const worker = new ContextProfileWorker();
    worker.setStateForTesting({
      enabled: true,
      sensitivityMap: {
        'secure.example': {
          sensitivity: 'HIGH',
          source: 'form-detection',
          matchedFields: ['password'],
          updatedAt: Date.now()
        }
      },
      breakageAdaptiveEnabled: true,
      breakageRelaxThreshold: 3,
      breakageMap: {
        'secure.example': {
          score: 10,
          scriptErrors: 3,
          rejectedPromises: 2,
          resourceFailures: 2,
          rageClicks: 1,
          lastSignalAt: Date.now(),
          updatedAt: Date.now()
        }
      }
    });

    const result = worker.resolve('secure.example', 'BALANCED');

    expect(result.mode).toBe('STRICT');
    expect(result.source).toBe('sensitivity');
    expect(result.breakagePressure).toBe('HIGH');
  });
});
