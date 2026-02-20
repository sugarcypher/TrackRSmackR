import {
  AuditLog,
  type AuditEntry,
  type AuditOutcome
} from './AuditLog.js';
import { EventBus } from './EventBus.js';
import { PolicyEngine, type PolicyResult } from './PolicyEngine.js';
import { CookieJarWorker, JarType } from '../workers/CookieJarWorker.js';
import { CookieObserverWorker } from '../workers/CookieObserverWorker.js';
import { ClassifierWorker } from '../workers/ClassifierWorker.js';
import { TimerDecayWorker } from '../workers/TimerDecayWorker.js';
import { BlockerWorker } from '../workers/BlockerWorker.js';
import { AdaptationHunterWorker } from '../workers/AdaptationHunterWorker.js';
import { UIExplainerWorker } from '../workers/UIExplainerWorker.js';

interface BouncerEventMap {
  COOKIE_OBSERVED: {
    cookie: chrome.cookies.Cookie;
  };
  COOKIE_CLASSIFIED: {
    cookie: chrome.cookies.Cookie;
    decision: PolicyResult;
    adaptationSignals: string[];
    explanation: string;
    confidence: number;
  };
  DECAY_EXECUTED: {
    cookie: chrome.cookies.Cookie;
    entryId: string;
  };
}

interface EnforcementResult {
  outcome: AuditOutcome;
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

  private readonly auditLog = new AuditLog();

  public async start(): Promise<void> {
    await this.jarWorker.init();
    await this.policyEngine.init();

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
      const adaptationSignals = this.adaptationHunterWorker.inspect(cookie);
      const decision = this.classifierWorker.classify(cookie);
      const explanation = this.uiExplainerWorker.explain(decision, adaptationSignals);
      const confidence = this.estimateDecisionConfidence(decision, adaptationSignals);

      await this.eventBus.publish(
        'COOKIE_CLASSIFIED',
        'ClassifierWorker',
        {
          cookie,
          decision,
          adaptationSignals,
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
      const { cookie, decision, adaptationSignals, explanation, confidence } = event.payload;
      const enforcement = await this.enforceDecision(cookie, decision, event.id);

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
        adaptationSignals,
        confidence,
        outcome: enforcement.outcome,
        driftKey: this.buildDriftKey(cookie, decision, adaptationSignals)
      };

      await this.auditLog.log(entry);
    });

    this.eventBus.subscribe('DECAY_EXECUTED', async (event) => {
      const { cookie, entryId } = event.payload;

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
        driftKey: `${cookie.domain}|DECAY_EXECUTED|${entryId}`
      };

      await this.auditLog.log(entry);
    });
  }

  private async handleCookieObserved(changeInfo: chrome.cookies.OnChangedDetails): Promise<void> {
    const { cookie, removed } = changeInfo;

    if (removed) {
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
    adaptationSignals: string[]
  ): string {
    const signalKey =
      adaptationSignals.length > 0
        ? adaptationSignals.map((signal) => signal.toLowerCase()).sort().join('+')
        : 'none';

    return `${cookie.domain}|${decision.action}|${signalKey}`;
  }
}
