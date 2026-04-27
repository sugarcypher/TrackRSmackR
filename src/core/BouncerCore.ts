import {
  AuditLog,
  type AuditEntry,
  type AuditOutcome
} from './AuditLog.js';
import { EventBus } from './EventBus.js';
import type {
  BrowserCompatibilitySnapshot,
  IntelligenceSummary
} from './IntelligenceTypes.js';
import { PolicyEngine, type PolicyMode, type PolicyResult } from './PolicyEngine.js';
import { resolveTutorSwarmPolicyMode } from './TutorSwarmAutopilot.js';
import { CookieJarWorker, JarType } from '../workers/CookieJarWorker.js';
import { CookieObserverWorker } from '../workers/CookieObserverWorker.js';
import { ClassifierWorker } from '../workers/ClassifierWorker.js';
import { TimerDecayWorker } from '../workers/TimerDecayWorker.js';
import { BlockerWorker } from '../workers/BlockerWorker.js';
import { AdaptationHunterWorker } from '../workers/AdaptationHunterWorker.js';
import { UIExplainerWorker } from '../workers/UIExplainerWorker.js';
import { PatternDriftWorker } from '../workers/PatternDriftWorker.js';
import { BehavioralFingerprintWorker } from '../workers/BehavioralFingerprintWorker.js';
import { ThreatModelWorker } from '../workers/ThreatModelWorker.js';
import {
  DeceptionLabyrinthWorker,
  type DeceptionProbeResult
} from '../workers/DeceptionLabyrinthWorker.js';
import { BrowserCapabilityWorker } from '../workers/BrowserCapabilityWorker.js';
import { PerformanceProfilerWorker } from '../workers/PerformanceProfilerWorker.js';
import { RegenerationShieldWorker } from '../workers/RegenerationShieldWorker.js';
import { CakeCookieDecoyWorker } from '../workers/CakeCookieDecoyWorker.js';
import { TutorSwarmWorker } from '../workers/TutorSwarmWorker.js';
import { ContextProfileWorker } from '../workers/ContextProfileWorker.js';
import { PolicyInvariantWorker } from '../workers/PolicyInvariantWorker.js';
import { isGingerbreadDecoyValue, isGingerbreadManEnabled } from '../utils/GingerbreadMan.js';

interface BouncerEventMap {
  COOKIE_OBSERVED: {
    cookie: chrome.cookies.Cookie;
  };
  COOKIE_CLASSIFIED: {
    cookie: chrome.cookies.Cookie;
    decision: PolicyResult;
    adaptationSignals: string[];
    deceptionProbe: DeceptionProbeResult;
    explanation: string;
    confidence: number;
  };
  AUDIT_RECORDED: {
    entry: AuditEntry;
  };
  INTELLIGENCE_UPDATED: {
    summary: IntelligenceSummary;
  };
  DECAY_EXECUTED: {
    cookie: chrome.cookies.Cookie;
    entryId: string;
  };
}

interface EnforcementResult {
  outcome: AuditOutcome;
}

interface TutorSwarmAutopilotState {
  enabled: boolean;
  applied: boolean;
  previousMode: PolicyMode;
  currentMode: PolicyMode;
  reason: string;
  signal?: string;
  updatedAt: number;
}

export class BouncerCore {
  private readonly eventBus = new EventBus<BouncerEventMap>();

  private readonly jarWorker = new CookieJarWorker();

  private readonly policyEngine = new PolicyEngine();

  private readonly classifierWorker = new ClassifierWorker(this.policyEngine);

  private readonly observerWorker = new CookieObserverWorker();

  private readonly timerDecayWorker = new TimerDecayWorker();

  private readonly blockerWorker = new BlockerWorker();

  private readonly adaptationHunterWorker = new AdaptationHunterWorker();

  private readonly uiExplainerWorker = new UIExplainerWorker();

  private readonly deceptionLabyrinthWorker = new DeceptionLabyrinthWorker();

  private readonly driftWorker = new PatternDriftWorker();

  private readonly fingerprintWorker = new BehavioralFingerprintWorker();

  private readonly threatModelWorker = new ThreatModelWorker();

  private readonly browserCapabilityWorker = new BrowserCapabilityWorker();

  private readonly performanceProfiler = new PerformanceProfilerWorker();

  private readonly regenerationShield = new RegenerationShieldWorker();

  private readonly cakeCookieDecoyWorker = new CakeCookieDecoyWorker();

  private readonly tutorSwarmWorker = new TutorSwarmWorker();

  private readonly contextProfileWorker = new ContextProfileWorker();

  private readonly policyInvariantWorker = new PolicyInvariantWorker();

  private tutorSwarmAutopilotEnabled = true;

  private settingsListenerAttached = false;

  private browserCompatibilitySnapshot: BrowserCompatibilitySnapshot | null = null;

  private readonly auditLog = new AuditLog();

  public async start(): Promise<void> {
    await this.jarWorker.init();
    await this.policyEngine.init();

    const settings = (await chrome.storage.local.get([
      'policyMode',
      'userAllowlist',
      'uniformPersonaEnabled',
      'personaEntropyNormalizationEnabled',
      'personaScriptBlocklistEnabled',
      'antiRegenerationEnabled',
      'aggressiveSetCookieStripEnabled',
      'regenerationEscalationThreshold',
      'tutorSwarmAutopilotEnabled',
      'contextPolicyEnabled',
      'contextPolicyRules',
      'contextSensitivityMap',
      'contextBreakageAdaptiveEnabled',
      'contextBreakageRelaxThreshold',
      'contextBreakageMap',
      'policyInvariantFloorMode',
      'policyInvariantDomainBlocklist',
      'policyInvariantEnforcePersona'
    ])) as {
      policyMode?: PolicyMode;
      userAllowlist?: string[];
      uniformPersonaEnabled?: boolean;
      personaEntropyNormalizationEnabled?: boolean;
      personaScriptBlocklistEnabled?: boolean;
      antiRegenerationEnabled?: boolean;
      aggressiveSetCookieStripEnabled?: boolean;
      regenerationEscalationThreshold?: number;
      tutorSwarmAutopilotEnabled?: boolean;
      contextPolicyEnabled?: boolean;
      contextPolicyRules?: unknown[];
      contextSensitivityMap?: Record<string, unknown>;
      contextBreakageAdaptiveEnabled?: boolean;
      contextBreakageRelaxThreshold?: number;
      contextBreakageMap?: Record<string, unknown>;
      policyInvariantFloorMode?: PolicyMode;
      policyInvariantDomainBlocklist?: string[];
      policyInvariantEnforcePersona?: boolean;
    };
    const defaults: Record<string, unknown> = {};
    if (settings.policyMode !== 'STRICT' && settings.policyMode !== 'BALANCED') {
      defaults.policyMode = 'BALANCED';
    }
    if (!Array.isArray(settings.userAllowlist)) {
      defaults.userAllowlist = [];
    }
    if (typeof settings.uniformPersonaEnabled !== 'boolean') {
      defaults.uniformPersonaEnabled = true;
    }
    if (typeof settings.personaEntropyNormalizationEnabled !== 'boolean') {
      defaults.personaEntropyNormalizationEnabled = true;
    }
    if (typeof settings.personaScriptBlocklistEnabled !== 'boolean') {
      defaults.personaScriptBlocklistEnabled = true;
    }
    if (typeof settings.antiRegenerationEnabled !== 'boolean') {
      defaults.antiRegenerationEnabled = true;
    }
    if (typeof settings.aggressiveSetCookieStripEnabled !== 'boolean') {
      defaults.aggressiveSetCookieStripEnabled = true;
    }
    if (typeof settings.regenerationEscalationThreshold !== 'number') {
      defaults.regenerationEscalationThreshold = 2;
    }
    if (typeof settings.tutorSwarmAutopilotEnabled !== 'boolean') {
      defaults.tutorSwarmAutopilotEnabled = true;
    }
    if (typeof settings.contextPolicyEnabled !== 'boolean') {
      defaults.contextPolicyEnabled = true;
    }
    if (!Array.isArray(settings.contextPolicyRules)) {
      defaults.contextPolicyRules = [];
    }
    if (!settings.contextSensitivityMap || typeof settings.contextSensitivityMap !== 'object') {
      defaults.contextSensitivityMap = {};
    }
    if (typeof settings.contextBreakageAdaptiveEnabled !== 'boolean') {
      defaults.contextBreakageAdaptiveEnabled = true;
    }
    if (typeof settings.contextBreakageRelaxThreshold !== 'number') {
      defaults.contextBreakageRelaxThreshold = 4;
    }
    if (!settings.contextBreakageMap || typeof settings.contextBreakageMap !== 'object') {
      defaults.contextBreakageMap = {};
    }
    if (settings.policyInvariantFloorMode !== 'STRICT' && settings.policyInvariantFloorMode !== 'BALANCED') {
      defaults.policyInvariantFloorMode = 'BALANCED';
    }
    if (!Array.isArray(settings.policyInvariantDomainBlocklist)) {
      defaults.policyInvariantDomainBlocklist = [];
    }
    if (typeof settings.policyInvariantEnforcePersona !== 'boolean') {
      defaults.policyInvariantEnforcePersona = true;
    }
    if (Object.keys(defaults).length > 0) {
      await chrome.storage.local.set(defaults);
    }

    this.tutorSwarmAutopilotEnabled = settings.tutorSwarmAutopilotEnabled !== false;
    await this.regenerationShield.init();
    await this.contextProfileWorker.init();
    await this.policyInvariantWorker.init();
    await this.cakeCookieDecoyWorker.seed();
    this.attachSettingsListener();

    this.browserCompatibilitySnapshot = this.browserCapabilityWorker.inspect();
    await chrome.storage.local.set({ browserCompatibility: this.browserCompatibilitySnapshot });

    this.timerDecayWorker.init(async (entryId) => {
      await this.jarWorker.smash(entryId, JarType.QUARANTINE);
    });

    this.configureEventFlow();
    this.observerWorker.start(this.handleCookieObserved.bind(this));

    console.log('TrackRSmackR BouncerCore initialized. The bouncer is at the door.');
  }

  private configureEventFlow(): void {
    this.eventBus.subscribe('COOKIE_OBSERVED', async (event) => {
      const { cookie } = event.payload;
      this.performanceProfiler.start(event.id);

      const deceptionProbe = this.deceptionLabyrinthWorker.inspect(cookie);
      const adaptationSignals = this.adaptationHunterWorker.inspect(cookie);
      const regenerationObservation = await this.regenerationShield.observe(cookie);
      const baseMode = this.policyEngine.getMode();
      const contextResolution = this.contextProfileWorker.resolve(cookie.domain, baseMode);
      let decision = this.classifierWorker.classify(cookie, {
        modeOverride: contextResolution.mode
      });
      const invariantResult = this.policyInvariantWorker.apply(cookie, decision);
      decision = invariantResult.decision;
      const regenerationSignals: string[] = [];
      const contextSignals: string[] = [
        `Context profile: ${contextResolution.reason}`,
        `Context mode: ${contextResolution.mode}`
      ];
      if (contextResolution.sensitivity) {
        contextSignals.push(`Context sensitivity: ${contextResolution.sensitivity}`);
      }
      if (typeof contextResolution.breakageScore === 'number') {
        contextSignals.push(`Context breakage score: ${contextResolution.breakageScore}`);
      }
      if (contextResolution.breakagePressure) {
        contextSignals.push(`Context breakage pressure: ${contextResolution.breakagePressure}`);
      }

      if (regenerationObservation.signal) {
        regenerationSignals.push(regenerationObservation.signal);
      }

      if (regenerationObservation.forceBlock) {
        decision = {
          action: 'BLOCK',
          reason: 'Regeneration denylist enforcement',
          targetJar: JarType.QUARANTINE
        };
      }

      if (deceptionProbe.triggered) {
        decision = {
          action: 'QUARANTINE',
          reason: `Deception Trap: ${deceptionProbe.probeType}`,
          targetJar: JarType.QUARANTINE
        };
      }

      const mergedSignals = this.mergeSignals(
        this.mergeSignals(
          this.mergeSignals(this.mergeSignals(adaptationSignals, regenerationSignals), contextSignals),
          invariantResult.signals
        ),
        deceptionProbe.matchedSignals.map((signal) => `Deception: ${signal}`)
      );
      const explanation = this.uiExplainerWorker.explain(decision, mergedSignals);
      const confidence = Math.max(
        this.estimateDecisionConfidence(decision, mergedSignals),
        deceptionProbe.confidence
      );
      this.performanceProfiler.markClassified(event.id);

      await this.eventBus.publish(
        'COOKIE_CLASSIFIED',
        'ClassifierWorker',
        {
          cookie,
          decision,
          adaptationSignals: mergedSignals,
          deceptionProbe,
          explanation,
          confidence
        },
        {
          confidence,
          correlationId: event.id
        }
      );
    });

    this.eventBus.subscribe('COOKIE_CLASSIFIED', async (event) => {
      const { cookie, decision, adaptationSignals, deceptionProbe, explanation, confidence } =
        event.payload;
      const enforcement = await this.enforceDecision(cookie, decision, event.id);
      const regenerationUpdate = await this.regenerationShield.recordEnforcement(
        cookie,
        decision,
        enforcement.outcome
      );
      const mergedSignals = regenerationUpdate.signal
        ? this.mergeSignals(adaptationSignals, [regenerationUpdate.signal])
        : adaptationSignals;
      this.performanceProfiler.markEnforced(event.id);

      const entry: AuditEntry = {
        timestamp: Date.now(),
        domain: cookie.domain,
        name: cookie.name,
        action: decision.action,
        reason: explanation,
        eventType: 'COOKIE_DECISION',
        policyReason: decision.reason,
        explanation,
        targetJar: decision.targetJar ?? 'NONE',
        adaptationSignals: mergedSignals,
        confidence,
        outcome: enforcement.outcome,
        driftKey: this.buildDriftKey(cookie, decision, mergedSignals, deceptionProbe),
        deceptionTriggered: deceptionProbe.triggered,
        deceptionType: deceptionProbe.triggered ? deceptionProbe.probeType : undefined,
        deceptionSignals: deceptionProbe.triggered ? deceptionProbe.matchedSignals : undefined,
        deceptionRoute: deceptionProbe.route ?? undefined,
        deceptionConfidence: deceptionProbe.triggered ? deceptionProbe.confidence : undefined
      };

      await this.auditLog.log(entry);
      const performanceSnapshot = this.performanceProfiler.finalize(event.id);
      await chrome.storage.local.set({ performanceSnapshot });

      await this.eventBus.publish('AUDIT_RECORDED', 'AuditLog', { entry }, { correlationId: event.id });
    });

    this.eventBus.subscribe('AUDIT_RECORDED', async (event) => {
      const history = await this.auditLog.getHistory();
      const driftAnalysis = this.driftWorker.analyze(history);
      const fingerprintPressure = this.fingerprintWorker.analyze(history);
      const summary = this.threatModelWorker.summarize(history, driftAnalysis, fingerprintPressure);
      const enrichedSummary: IntelligenceSummary = {
        ...summary,
        performance: this.performanceProfiler.snapshot(),
        browserCompatibility:
          this.browserCompatibilitySnapshot ?? this.browserCapabilityWorker.inspect()
      };
      const tutorSwarm = this.tutorSwarmWorker.evaluate(history, enrichedSummary);
      const summaryWithSwarm: IntelligenceSummary = {
        ...enrichedSummary,
        tutorSwarm
      };

      await this.eventBus.publish(
        'INTELLIGENCE_UPDATED',
        'ThreatModelWorker',
        { summary: summaryWithSwarm },
        {
          confidence: 0.88,
          correlationId: event.id
        }
      );
    });

    this.eventBus.subscribe('INTELLIGENCE_UPDATED', async (event) => {
      const autopilotState = this.applyTutorSwarmAutopilot(event.payload.summary);
      const payload: Record<string, unknown> = {
        intelligenceSummary: event.payload.summary,
        tutorSwarmSnapshot: event.payload.summary.tutorSwarm ?? null,
        tutorSwarmAutopilotState: autopilotState
      };
      if (autopilotState.applied) {
        payload.policyMode = autopilotState.currentMode;
      }

      await chrome.storage.local.set({
        ...payload
      });
    });

    this.eventBus.subscribe('DECAY_EXECUTED', async (event) => {
      const { cookie, entryId } = event.payload;
      await this.regenerationShield.recordDecayExecution(cookie);

      const entry: AuditEntry = {
        timestamp: Date.now(),
        domain: cookie.domain,
        name: cookie.name,
        action: 'DECAY',
        reason: 'Decay timer executed: cookie removed and quarantine entry smashed.',
        eventType: 'DECAY_EXECUTION',
        policyReason: 'Policy: Unknown Cookie (Decay)',
        explanation: 'Timed decay execution completed.',
        targetJar: JarType.QUARANTINE,
        adaptationSignals: [],
        confidence: event.confidence,
        outcome: 'DECAY_EXECUTED',
        driftKey: `${cookie.domain}|DECAY_EXECUTED|${entryId}`,
        deceptionTriggered: false
      };

      await this.auditLog.log(entry);
      await this.eventBus.publish('AUDIT_RECORDED', 'AuditLog', { entry }, { correlationId: event.id });
    });
  }

  private async handleCookieObserved(changeInfo: chrome.cookies.OnChangedDetails): Promise<void> {
    const { cookie, removed } = changeInfo;

    if (removed) {
      return;
    }

    if (isGingerbreadDecoyValue(cookie.value)) {
      return;
    }

    await this.eventBus.publish('COOKIE_OBSERVED', 'CookieObserverWorker', { cookie }, { confidence: 0.98 });
  }

  private async enforceDecision(
    cookie: chrome.cookies.Cookie,
    decision: PolicyResult,
    correlationId: string
  ): Promise<EnforcementResult> {
    if (decision.action === 'QUARANTINE' || decision.action === 'BLOCK') {
      if (await isGingerbreadManEnabled()) {
        const substituted = await this.blockerWorker.substituteWithDecoy(cookie);
        if (substituted) {
          return { outcome: 'GINGERBREAD_SUBSTITUTED' };
        }
      }

      await this.blockerWorker.removeCookie(cookie);

      if (decision.targetJar === JarType.QUARANTINE) {
        const entryId = await this.jarWorker.jarCookie(cookie, JarType.QUARANTINE);
        this.timerDecayWorker.scheduleSmash(entryId, 30_000);
        return { outcome: 'REMOVED_AND_QUARANTINED' };
      }

      return { outcome: 'REMOVED' };
    }

    if (decision.action === 'DECAY' && decision.targetJar === JarType.QUARANTINE) {
      const entryId = await this.jarWorker.jarCookie(cookie, JarType.QUARANTINE);
      this.timerDecayWorker.scheduleAction(entryId, 30_000, async () => {
        await this.blockerWorker.removeCookie(cookie);
        await this.jarWorker.smash(entryId, JarType.QUARANTINE);

        await this.eventBus.publish(
          'DECAY_EXECUTED',
          'TimerDecayWorker',
          {
            cookie,
            entryId
          },
          {
            confidence: 0.9,
            correlationId
          }
        );
      });

      return { outcome: 'DECAY_PENDING' };
    }

    if (decision.action === 'ALLOW' && decision.targetJar === JarType.VAULT) {
      await this.jarWorker.jarCookie(cookie, JarType.VAULT);
      return { outcome: 'ALLOWED_VAULTED' };
    }

    return { outcome: 'ALLOWED' };
  }

  private estimateDecisionConfidence(decision: PolicyResult, adaptationSignals: string[]): number {
    if (decision.reason === 'User Allowlisted') {
      return 0.99;
    }

    if (decision.reason.startsWith('Signature Match')) {
      return 0.94;
    }

    if (decision.action === 'DECAY') {
      return adaptationSignals.length > 0 ? 0.78 : 0.66;
    }

    if (decision.action === 'ALLOW') {
      return 0.9;
    }

    return 0.82;
  }

  private buildDriftKey(
    cookie: chrome.cookies.Cookie,
    decision: PolicyResult,
    adaptationSignals: string[],
    deceptionProbe?: DeceptionProbeResult
  ): string {
    const mergedSignals = deceptionProbe?.triggered
      ? [...adaptationSignals, `deception:${deceptionProbe.probeType}`]
      : adaptationSignals;

    const signalKey =
      mergedSignals.length > 0
        ? mergedSignals.map((signal) => signal.toLowerCase()).sort().join('+')
        : 'none';

    return `${cookie.domain}|${decision.action}|${signalKey}`;
  }

  private mergeSignals(primary: string[], extra: string[]): string[] {
    return Array.from(new Set([...primary, ...extra]));
  }

  private applyTutorSwarmAutopilot(summary: IntelligenceSummary): TutorSwarmAutopilotState {
    const previousMode = this.policyEngine.getMode();
    const now = Date.now();
    const signal = summary.tutorSwarm?.signal;

    if (!this.tutorSwarmAutopilotEnabled) {
      return {
        enabled: false,
        applied: false,
        previousMode,
        currentMode: previousMode,
        reason: 'Tutor Swarm autopilot disabled',
        signal,
        updatedAt: now
      };
    }

    const decision = resolveTutorSwarmPolicyMode(
      summary,
      previousMode,
      this.policyInvariantWorker.getFloorMode()
    );
    if (!decision.shouldApply) {
      return {
        enabled: true,
        applied: false,
        previousMode,
        currentMode: previousMode,
        reason: decision.reason,
        signal,
        updatedAt: now
      };
    }

    this.policyEngine.setMode(decision.desiredMode);
    return {
      enabled: true,
      applied: true,
      previousMode,
      currentMode: decision.desiredMode,
      reason: decision.reason,
      signal,
      updatedAt: now
    };
  }

  private attachSettingsListener(): void {
    if (this.settingsListenerAttached) {
      return;
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') {
        return;
      }

      if (changes.policyMode) {
        const next = changes.policyMode.newValue;
        if (next === 'STRICT' || next === 'BALANCED') {
          this.policyEngine.setMode(next);
        }
      }

      if (changes.userAllowlist) {
        const nextAllowlist = Array.isArray(changes.userAllowlist.newValue)
          ? (changes.userAllowlist.newValue as unknown[]).filter(
              (value): value is string => typeof value === 'string'
            )
          : [];
        this.policyEngine.setAllowlist(nextAllowlist);
      }

      if (changes.tutorSwarmAutopilotEnabled) {
        this.tutorSwarmAutopilotEnabled = changes.tutorSwarmAutopilotEnabled.newValue !== false;
      }
    });

    this.settingsListenerAttached = true;
  }
}
