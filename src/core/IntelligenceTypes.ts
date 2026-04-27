export type ThreatPosture = 'STABLE' | 'GUARDED' | 'ELEVATED';
export type ThreatTrend = 'RISING' | 'STEADY' | 'FALLING';
export type BrowserReadiness = 'READY' | 'PARTIAL' | 'RISK';
export type PerformancePressure = 'NORMAL' | 'ELEVATED' | 'CRITICAL';
export type TutorSwarmSignal =
  | 'CONTINUE'
  | 'INTERVENE_HALT'
  | 'INTERVENE_ROLLBACK'
  | 'INTERVENE_ADJUST_PARAMS'
  | 'SECURITY_ALERT';
export type TutorSwarmAction = 'NO_ACTION' | 'ROLLED_BACK' | 'PARAMS_ADJUSTED';

export interface DriftAlert {
  key: string;
  domain: string;
  action: string;
  signalKey: string;
  delta: number;
  recentCount: number;
  baselineCount: number;
}

export interface DriftAnalysis {
  alerts: DriftAlert[];
  distinctRecentPatterns: number;
  recentWindowSize: number;
  baselineWindowSize: number;
}

export interface FingerprintPressure {
  totalEvents: number;
  recentEvents: number;
  recurringDomains: string[];
  pressureLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface BrowserCompatibilitySnapshot {
  browserFamily: 'CHROMIUM' | 'EDGE' | 'FIREFOX' | 'SAFARI' | 'UNKNOWN';
  userAgent: string;
  manifestVersion: number | null;
  cookiesApi: boolean;
  storageApi: boolean;
  alarmsApi: boolean;
  supportScore: number;
  readiness: BrowserReadiness;
  warnings: string[];
  detectedAt: number;
}

export interface PerformanceSnapshot {
  samples: number;
  avgClassifyMs: number;
  avgEnforceMs: number;
  avgTotalMs: number;
  p95TotalMs: number;
  openTraces: number;
  pressure: PerformancePressure;
  updatedAt: number;
}

export interface TutorSwarmMetricBatch {
  iteration: number;
  trainAcc: number;
  valAcc: number;
  loss: number;
  timestamp: number;
}

export interface TutorSwarmSnapshot {
  signal: TutorSwarmSignal;
  complianceMessage: string;
  diagnosis: string;
  interventionAction: TutorSwarmAction;
  slopeTrain: number;
  slopeVal: number;
  divergenceGap: number;
  adaptationZone: boolean;
  securityLevel: 'HIGH';
  metric: TutorSwarmMetricBatch;
  successfulAdaptations: number;
  blockedThreats: number;
  updatedAt: number;
}

export interface IntelligenceSummary {
  posture: ThreatPosture;
  trend: ThreatTrend;
  score: number;
  driftCount: number;
  topDriftAlerts: DriftAlert[];
  fingerprintSignals: number;
  recurringFingerprintDomains: string[];
  deceptionProbes: number;
  deceptionRouteHotspots: string[];
  severeActions: number;
  performance?: PerformanceSnapshot;
  browserCompatibility?: BrowserCompatibilitySnapshot;
  tutorSwarm?: TutorSwarmSnapshot;
  modelVersion: number;
  source: 'engine' | 'fallback';
  updatedAt: number;
}
