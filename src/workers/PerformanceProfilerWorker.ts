import type { PerformancePressure, PerformanceSnapshot } from '../core/IntelligenceTypes.js';

interface TraceTiming {
  observedAt: number;
  classifiedAt?: number;
  enforcedAt?: number;
}

interface PerformanceSample {
  classifyMs: number;
  enforceMs: number;
  totalMs: number;
}

const MAX_SAMPLES = 240;

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile95(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[index] ?? 0;
}

function resolvePressure(avgTotalMs: number, p95TotalMs: number): PerformancePressure {
  if (p95TotalMs >= 45 || avgTotalMs >= 25) {
    return 'CRITICAL';
  }

  if (p95TotalMs >= 20 || avgTotalMs >= 12) {
    return 'ELEVATED';
  }

  return 'NORMAL';
}

export class PerformanceProfilerWorker {
  private readonly traces = new Map<string, TraceTiming>();

  private readonly samples: PerformanceSample[] = [];

  public constructor(private readonly now: () => number = () => Date.now()) {}

  public start(traceId: string): void {
    this.traces.set(traceId, { observedAt: this.now() });
  }

  public markClassified(traceId: string): void {
    const trace = this.traces.get(traceId);
    if (!trace) {
      return;
    }

    trace.classifiedAt = this.now();
  }

  public markEnforced(traceId: string): void {
    const trace = this.traces.get(traceId);
    if (!trace) {
      return;
    }

    trace.enforcedAt = this.now();
  }

  public finalize(traceId: string): PerformanceSnapshot {
    const trace = this.traces.get(traceId);
    if (!trace) {
      return this.snapshot();
    }

    const finishedAt = this.now();
    const classifyMs = Math.max(0, (trace.classifiedAt ?? finishedAt) - trace.observedAt);
    const enforceMs = Math.max(0, (trace.enforcedAt ?? finishedAt) - (trace.classifiedAt ?? trace.observedAt));
    const totalMs = Math.max(0, finishedAt - trace.observedAt);

    this.samples.push({ classifyMs, enforceMs, totalMs });
    if (this.samples.length > MAX_SAMPLES) {
      this.samples.shift();
    }

    this.traces.delete(traceId);
    return this.snapshot();
  }

  public snapshot(): PerformanceSnapshot {
    const classifyValues = this.samples.map((sample) => sample.classifyMs);
    const enforceValues = this.samples.map((sample) => sample.enforceMs);
    const totalValues = this.samples.map((sample) => sample.totalMs);

    const avgClassifyMs = average(classifyValues);
    const avgEnforceMs = average(enforceValues);
    const avgTotalMs = average(totalValues);
    const p95TotalMs = percentile95(totalValues);

    return {
      samples: this.samples.length,
      avgClassifyMs: Number(avgClassifyMs.toFixed(2)),
      avgEnforceMs: Number(avgEnforceMs.toFixed(2)),
      avgTotalMs: Number(avgTotalMs.toFixed(2)),
      p95TotalMs: Number(p95TotalMs.toFixed(2)),
      openTraces: this.traces.size,
      pressure: resolvePressure(avgTotalMs, p95TotalMs),
      updatedAt: this.now()
    };
  }
}
