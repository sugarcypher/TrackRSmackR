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
    classifierOutcome?: 'GINGERBREAD_SUBSTITUTED';
  };
  DECAY_EXECUTED: {
    cookie: chrome.cookies.Cookie;
    entryId: string;
  };
  SESSION_APPROVE_DOMAIN: {
    domain: string;
    permanent: boolean;
  };
}

interface EnforcementResult {
  outcome: AuditOutcome;
}

interface IncomingPopupMessage {
  type?: unknown;
  payload?: unknown;
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
    await this.adaptationHunterWorker.init();

    this.timerDecayWorker.init(async (entryId) => {
      await this.jarWorker.smash(entryId, JarType.QUARANTINE);
    });

    this.configureEventFlow();
    this.registerOnboardingHandler();
    this.registerPopupMessageHandler();
    this.observerWorker.start(this.handleCookieObserved.bind(this));

    console.log('TrackRSmackR BouncerCore initialized. The bouncer is at the door.');
  }

  private configureEventFlow(): void {
    this.eventBus.subscribe('COOKIE_OBSERVED', async (event) => {
      const { cookie } = event.payload;
      const adaptationSignals = this.adaptationHunterWorker.inspect(cookie);
      const result = await this.classifierWorker.classify(cookie);
      const explanation = this.uiExplainerWorker.explain(result.decision, adaptationSignals);
      const confidence = this.estimateDecisionConfidence(result.decision, adaptationSignals);

      await this.eventBus.publish(
        'COOKIE_CLASSIFIED',
        'ClassifierWorker',
        {
          cookie: result.cookie,
          decision: result.decision,
          adaptationSignals,
          explanation,
          confidence,
          classifierOutcome: result.outcome
        },
        {
          confidence,
          correlationId: event.id
        }
      );
    });

    this.eventBus.subscribe('COOKIE_CLASSIFIED', async (event) => {
      const {
        cookie,
        decision,
        adaptationSignals,
        explanation,
        confidence,
        classifierOutcome
      } = event.payload;
      const enforcement = await this.enforceDecision(cookie, decision, event.id);

      const outcome: AuditOutcome = classifierOutcome ?? enforcement.outcome;

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
        outcome,
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

    this.eventBus.subscribe('SESSION_APPROVE_DOMAIN', async (event) => {
      const { domain, permanent } = event.payload;
      if (permanent) {
        await this.jarWorker.approvePermanently(domain);
      } else {
        this.jarWorker.approveForSession(domain);
      }
    });
  }

  private registerOnboardingHandler(): void {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.onInstalled) {
      return;
    }

    chrome.runtime.onInstalled.addListener(async () => {
      try {
        const data = (await chrome.storage.local.get('onboardingComplete')) as {
          onboardingComplete?: unknown;
        };

        if (data.onboardingComplete === true) {
          return;
        }

        await chrome.tabs.create({ url: chrome.runtime.getURL('static/onboarding.html') });
      } catch (error) {
        console.error('Failed to open onboarding tab', error);
      }
    });
  }

  private registerPopupMessageHandler(): void {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.onMessage) {
      return;
    }

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const incoming = (message ?? {}) as IncomingPopupMessage;

      if (incoming.type === 'SESSION_APPROVE_DOMAIN') {
        const payload = (incoming.payload ?? {}) as { domain?: unknown; permanent?: unknown };
        const domain = typeof payload.domain === 'string' ? payload.domain : '';
        const permanent = payload.permanent === true;

        if (!domain) {
          sendResponse({ ok: false, error: 'missing domain' });
          return false;
        }

        void this.eventBus
          .publish(
            'SESSION_APPROVE_DOMAIN',
            'PopupUI',
            { domain, permanent },
            { confidence: 0.99 }
          )
          .then(() => {
            sendResponse({ ok: true, sessionApprovedCount: this.jarWorker.sessionApprovedCount() });
          })
          .catch((error) => {
            sendResponse({ ok: false, error: String(error) });
          });

        return true;
      }

      if (incoming.type === 'GET_SESSION_APPROVED_COUNT') {
        sendResponse({ ok: true, sessionApprovedCount: this.jarWorker.sessionApprovedCount() });
        return false;
      }

      return false;
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
      if (
        decision.targetJar === JarType.QUARANTINE &&
        this.jarWorker.isSessionApproved(cookie.domain)
      ) {
        await this.jarWorker.jarCookie(cookie, JarType.VAULT);
        return { outcome: 'SESSION_APPROVED' };
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
      if (this.jarWorker.isSessionApproved(cookie.domain)) {
        await this.jarWorker.jarCookie(cookie, JarType.VAULT);
        return { outcome: 'SESSION_APPROVED' };
      }

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
