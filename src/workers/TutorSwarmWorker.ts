import type { AuditEntry } from '../core/AuditLog.js';
import type {
  IntelligenceSummary,
  TutorSwarmAction,
  TutorSwarmMetricBatch,
  TutorSwarmSignal,
  TutorSwarmSnapshot
} from '../core/IntelligenceTypes.js';

const GLOBAL_MAX_DIVERGENCE_THRESHOLD = 0.15;
const GLOBAL_MAX_DECLINE_RATE = -0.02;
const GLOBAL_VARIANCE_TOLERANCE = 0.01;
const GLOBAL_SECURITY_LEVEL = 'HIGH' as const;
const MAX_METRIC_HISTORY = 120;

interface SwarmKnowledge {
  successfulAdaptations: number;
  blockedThreats: number;
}

interface ComplianceResult {
  signal: TutorSwarmSignal;
  message: string;
}

interface MetricSlopes {
  slopeTrain: number;
  slopeVal: number;
}

function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

export class TutorSwarmWorker {
  private metricHistory: TutorSwarmMetricBatch[] = [];

  private iteration = 0;

  private knowledge: SwarmKnowledge = {
    successfulAdaptations: 0,
    blockedThreats: 0
  };

  public evaluate(history: AuditEntry[], summary: IntelligenceSummary): TutorSwarmSnapshot {
    const metric = this.buildMetricBatch(history, summary);

    if (!this.validateMetrics(metric.trainAcc, metric.valAcc, metric.loss)) {
      this.knowledge.blockedThreats += 1;
      return {
        signal: 'SECURITY_ALERT',
        complianceMessage: 'Metrics validation failure',
        diagnosis: 'Metrology rejected invalid metrics',
        interventionAction: 'NO_ACTION',
        slopeTrain: 0,
        slopeVal: 0,
        divergenceGap: 0,
        adaptationZone: false,
        securityLevel: GLOBAL_SECURITY_LEVEL,
        metric,
        successfulAdaptations: this.knowledge.successfulAdaptations,
        blockedThreats: this.knowledge.blockedThreats,
        updatedAt: Date.now()
      };
    }

    this.metricHistory.push(metric);
    if (this.metricHistory.length > MAX_METRIC_HISTORY) {
      this.metricHistory.shift();
    }

    const slopes = this.calculateSlopes(this.metricHistory);
    const compliance = this.checkCompliance(metric, slopes, summary);
    const diagnosis = this.diagnoseDivergence(this.metricHistory);
    const interventionAction = this.executeIntervention(compliance.signal);
    const adaptationZone =
      slopes.slopeVal < 0 &&
      slopes.slopeVal > GLOBAL_MAX_DECLINE_RATE &&
      Math.abs(slopes.slopeVal) <= GLOBAL_VARIANCE_TOLERANCE;

    if (adaptationZone) {
      this.knowledge.successfulAdaptations += 1;
    }

    if (
      compliance.signal === 'INTERVENE_HALT' ||
      compliance.signal === 'SECURITY_ALERT' ||
      compliance.signal === 'INTERVENE_ROLLBACK'
    ) {
      this.knowledge.blockedThreats += 1;
    }

    return {
      signal: compliance.signal,
      complianceMessage: compliance.message,
      diagnosis,
      interventionAction,
      slopeTrain: slopes.slopeTrain,
      slopeVal: slopes.slopeVal,
      divergenceGap: metric.trainAcc - metric.valAcc,
      adaptationZone,
      securityLevel: GLOBAL_SECURITY_LEVEL,
      metric,
      successfulAdaptations: this.knowledge.successfulAdaptations,
      blockedThreats: this.knowledge.blockedThreats,
      updatedAt: Date.now()
    };
  }

  private buildMetricBatch(history: AuditEntry[], summary: IntelligenceSummary): TutorSwarmMetricBatch {
    const recent = history.slice(-40);
    const total = Math.max(1, recent.length);

    const severeActions = recent.filter(
      (entry) => entry.action === 'BLOCK' || entry.action === 'QUARANTINE'
    ).length;
    const decayActions = recent.filter((entry) => entry.action === 'DECAY').length;
    const strongOutcomes = recent.filter(
      (entry) =>
        entry.outcome === 'REMOVED' ||
        entry.outcome === 'REMOVED_AND_QUARANTINED' ||
        entry.outcome === 'DECAY_EXECUTED'
    ).length;
    const adaptationSignals = recent.filter((entry) => (entry.adaptationSignals ?? []).length > 0).length;

    const trainAcc = clamp01(
      (severeActions + decayActions * 0.4 + adaptationSignals * 0.25) / total
    );

    let valAcc = clamp01((strongOutcomes + severeActions * 0.2 + decayActions * 0.2) / total);
    if (summary.trend === 'FALLING') {
      valAcc = clamp01(valAcc - 0.02);
    }

    const loss = clamp01(1 - valAcc + Math.max(0, trainAcc - valAcc));

    this.iteration += 1;

    return {
      iteration: this.iteration,
      trainAcc,
      valAcc,
      loss,
      timestamp: Date.now()
    };
  }

  private validateMetrics(trainAcc: number, valAcc: number, loss: number): boolean {
    if (Number.isNaN(trainAcc) || Number.isNaN(valAcc) || Number.isNaN(loss)) {
      return false;
    }

    if (!Number.isFinite(trainAcc) || !Number.isFinite(valAcc) || !Number.isFinite(loss)) {
      return false;
    }

    if (trainAcc > 1 || trainAcc < 0) {
      return false;
    }

    if (valAcc > 1 || valAcc < 0) {
      return false;
    }

    if (loss < 0) {
      return false;
    }

    return true;
  }

  private diagnoseDivergence(history: TutorSwarmMetricBatch[]): string {
    if (history.length < 2) {
      return 'Insufficient Data';
    }

    const last = history[history.length - 1];
    const prev = history[history.length - 2];

    const gap = last.trainAcc - last.valAcc;
    const prevGap = prev.trainAcc - prev.valAcc;

    if (gap > prevGap && gap > 0.1) {
      return 'Overfitting Detected';
    }

    if (last.valAcc < prev.valAcc) {
      return 'Validation Decline';
    }

    return 'Normal Variance';
  }

  private calculateSlopes(history: TutorSwarmMetricBatch[]): MetricSlopes {
    if (history.length < 5) {
      return { slopeTrain: 0, slopeVal: 0 };
    }

    const recent = history.slice(-5);
    const first = recent[0];
    const last = recent[recent.length - 1];
    const denominator = Math.max(1, last.iteration - first.iteration);

    return {
      slopeTrain: (last.trainAcc - first.trainAcc) / denominator,
      slopeVal: (last.valAcc - first.valAcc) / denominator
    };
  }

  private checkCompliance(
    metric: TutorSwarmMetricBatch,
    slopes: MetricSlopes,
    summary: IntelligenceSummary
  ): ComplianceResult {
    if (!this.vetExternalStrategy(summary)) {
      return {
        signal: 'SECURITY_ALERT',
        message: 'Blocked risky external strategy signal'
      };
    }

    if (summary.posture === 'ELEVATED' && summary.trend === 'RISING' && summary.score >= 20) {
      return {
        signal: 'SECURITY_ALERT',
        message: 'Threat posture escalation requires security intervention'
      };
    }

    if (slopes.slopeVal < GLOBAL_MAX_DECLINE_RATE) {
      return {
        signal: 'INTERVENE_HALT',
        message: 'Critical Decline'
      };
    }

    if (slopes.slopeVal < 0 && slopes.slopeVal > GLOBAL_MAX_DECLINE_RATE) {
      return {
        signal: 'CONTINUE',
        message: 'Adaptation Zone (Monitoring)'
      };
    }

    const gap = metric.trainAcc - metric.valAcc;
    if (gap > GLOBAL_MAX_DIVERGENCE_THRESHOLD) {
      return {
        signal: 'INTERVENE_ADJUST_PARAMS',
        message: 'Divergence Threshold Breach'
      };
    }

    return {
      signal: 'CONTINUE',
      message: 'Within Constraints'
    };
  }

  private executeIntervention(signal: TutorSwarmSignal): TutorSwarmAction {
    if (signal === 'INTERVENE_ROLLBACK') {
      return 'ROLLED_BACK';
    }

    if (signal === 'INTERVENE_ADJUST_PARAMS') {
      return 'PARAMS_ADJUSTED';
    }

    return 'NO_ACTION';
  }

  private vetExternalStrategy(summary: IntelligenceSummary): boolean {
    const risk = clamp01(summary.score / 30);
    return risk <= 0.9;
  }
}
