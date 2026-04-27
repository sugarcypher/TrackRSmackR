import type { IntelligenceSummary } from './IntelligenceTypes.js';
import type { PolicyMode } from './PolicyEngine.js';

export interface TutorSwarmAutopilotDecision {
  desiredMode: PolicyMode;
  shouldApply: boolean;
  reason: string;
}

export function resolveTutorSwarmPolicyMode(
  summary: IntelligenceSummary,
  currentMode: PolicyMode,
  floorMode: PolicyMode = 'BALANCED'
): TutorSwarmAutopilotDecision {
  const signal = summary.tutorSwarm?.signal;

  if (
    signal === 'SECURITY_ALERT' ||
    signal === 'INTERVENE_HALT' ||
    signal === 'INTERVENE_ROLLBACK' ||
    signal === 'INTERVENE_ADJUST_PARAMS'
  ) {
    const desiredMode: PolicyMode = 'STRICT';
    return {
      desiredMode,
      shouldApply: desiredMode !== currentMode,
      reason: `Swarm signal ${signal} raised risk posture`
    };
  }

  const canRelaxToBalanced =
    signal === 'CONTINUE' &&
    summary.posture !== 'ELEVATED' &&
    summary.trend !== 'RISING' &&
    summary.score < 8;

  if (canRelaxToBalanced) {
    const desiredMode: PolicyMode = floorMode === 'STRICT' ? 'STRICT' : 'BALANCED';
    return {
      desiredMode,
      shouldApply: desiredMode !== currentMode,
      reason:
        floorMode === 'STRICT'
          ? 'Swarm relaxation blocked by strict policy floor'
          : 'Swarm signal CONTINUE with stable trend'
    };
  }

  return {
    desiredMode: currentMode,
    shouldApply: false,
    reason: 'Autopilot held current policy mode'
  };
}
