import { describe, expect, test } from 'vitest';
import type { IntelligenceSummary } from '../../src/core/IntelligenceTypes.js';
import { resolveTutorSwarmPolicyMode } from '../../src/core/TutorSwarmAutopilot.js';

function makeSummary(partial: Partial<IntelligenceSummary>): IntelligenceSummary {
  return {
    posture: 'STABLE',
    trend: 'STEADY',
    score: 2,
    driftCount: 0,
    topDriftAlerts: [],
    fingerprintSignals: 0,
    recurringFingerprintDomains: [],
    deceptionProbes: 0,
    deceptionRouteHotspots: [],
    severeActions: 0,
    modelVersion: 2,
    source: 'engine',
    updatedAt: Date.now(),
    ...partial
  };
}

describe('TutorSwarmAutopilot', () => {
  test('escalates to STRICT when swarm emits a blocking signal', () => {
    const summary = makeSummary({
      tutorSwarm: {
        signal: 'SECURITY_ALERT',
        complianceMessage: 'threat',
        diagnosis: 'Validation Decline',
        interventionAction: 'NO_ACTION',
        slopeTrain: 0,
        slopeVal: -0.03,
        divergenceGap: 0.2,
        adaptationZone: false,
        securityLevel: 'HIGH',
        metric: {
          iteration: 3,
          trainAcc: 0.82,
          valAcc: 0.57,
          loss: 0.53,
          timestamp: Date.now()
        },
        successfulAdaptations: 0,
        blockedThreats: 1,
        updatedAt: Date.now()
      }
    });

    const decision = resolveTutorSwarmPolicyMode(summary, 'BALANCED');

    expect(decision.shouldApply).toBe(true);
    expect(decision.desiredMode).toBe('STRICT');
  });

  test('relaxes to BALANCED when continue signal is stable', () => {
    const summary = makeSummary({
      posture: 'GUARDED',
      trend: 'STEADY',
      score: 6,
      tutorSwarm: {
        signal: 'CONTINUE',
        complianceMessage: 'Within Constraints',
        diagnosis: 'Normal Variance',
        interventionAction: 'NO_ACTION',
        slopeTrain: 0.004,
        slopeVal: -0.002,
        divergenceGap: 0.05,
        adaptationZone: true,
        securityLevel: 'HIGH',
        metric: {
          iteration: 8,
          trainAcc: 0.7,
          valAcc: 0.65,
          loss: 0.4,
          timestamp: Date.now()
        },
        successfulAdaptations: 2,
        blockedThreats: 0,
        updatedAt: Date.now()
      }
    });

    const decision = resolveTutorSwarmPolicyMode(summary, 'STRICT');

    expect(decision.shouldApply).toBe(true);
    expect(decision.desiredMode).toBe('BALANCED');
  });

  test('holds current mode if conditions are inconclusive', () => {
    const summary = makeSummary({
      posture: 'ELEVATED',
      trend: 'RISING',
      score: 12,
      tutorSwarm: {
        signal: 'CONTINUE',
        complianceMessage: 'Within Constraints',
        diagnosis: 'Normal Variance',
        interventionAction: 'NO_ACTION',
        slopeTrain: 0.001,
        slopeVal: 0,
        divergenceGap: 0.03,
        adaptationZone: false,
        securityLevel: 'HIGH',
        metric: {
          iteration: 9,
          trainAcc: 0.66,
          valAcc: 0.63,
          loss: 0.37,
          timestamp: Date.now()
        },
        successfulAdaptations: 0,
        blockedThreats: 0,
        updatedAt: Date.now()
      }
    });

    const decision = resolveTutorSwarmPolicyMode(summary, 'STRICT');

    expect(decision.shouldApply).toBe(false);
    expect(decision.desiredMode).toBe('STRICT');
  });

  test('does not relax below strict floor', () => {
    const summary = makeSummary({
      posture: 'STABLE',
      trend: 'STEADY',
      score: 3,
      tutorSwarm: {
        signal: 'CONTINUE',
        complianceMessage: 'Within Constraints',
        diagnosis: 'Normal Variance',
        interventionAction: 'NO_ACTION',
        slopeTrain: 0.001,
        slopeVal: -0.001,
        divergenceGap: 0.02,
        adaptationZone: true,
        securityLevel: 'HIGH',
        metric: {
          iteration: 10,
          trainAcc: 0.72,
          valAcc: 0.7,
          loss: 0.3,
          timestamp: Date.now()
        },
        successfulAdaptations: 1,
        blockedThreats: 0,
        updatedAt: Date.now()
      }
    });

    const decision = resolveTutorSwarmPolicyMode(summary, 'STRICT', 'STRICT');

    expect(decision.shouldApply).toBe(false);
    expect(decision.desiredMode).toBe('STRICT');
    expect(decision.reason).toMatch(/strict policy floor/i);
  });
});
