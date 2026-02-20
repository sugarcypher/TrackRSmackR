import { AuditLog, type AuditEntry } from './AuditLog.js';
import { PolicyEngine } from './PolicyEngine.js';
import { CookieJarWorker, JarType } from '../workers/CookieJarWorker.js';
import { CookieObserverWorker } from '../workers/CookieObserverWorker.js';
import { ClassifierWorker } from '../workers/ClassifierWorker.js';
import { TimerDecayWorker } from '../workers/TimerDecayWorker.js';
import { BlockerWorker } from '../workers/BlockerWorker.js';
import { AdaptationHunterWorker } from '../workers/AdaptationHunterWorker.js';
import { UIExplainerWorker } from '../workers/UIExplainerWorker.js';

export class BouncerCore {
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

    this.observerWorker.start(this.handleCookieChange.bind(this));

    console.log('TrackRSmackR BouncerCore initialized. The bouncer is at the door.');
  }

  private async handleCookieChange(changeInfo: chrome.cookies.OnChangedDetails): Promise<void> {
    const { cookie, removed } = changeInfo;

    if (removed) {
      return;
    }

    const adaptationSignals = this.adaptationHunterWorker.inspect(cookie);
    const decision = this.classifierWorker.classify(cookie);
    const explanation = this.uiExplainerWorker.explain(decision, adaptationSignals);

    const entry: AuditEntry = {
      timestamp: Date.now(),
      domain: cookie.domain,
      name: cookie.name,
      action: decision.action,
      reason: explanation
    };
    await this.auditLog.log(entry);

    if (decision.action === 'QUARANTINE' || decision.action === 'BLOCK') {
      await this.blockerWorker.removeCookie(cookie);

      if (decision.targetJar === JarType.QUARANTINE) {
        const entryId = await this.jarWorker.jarCookie(cookie, JarType.QUARANTINE);
        this.timerDecayWorker.scheduleSmash(entryId, 30_000);
      }
      return;
    }

    if (decision.action === 'DECAY' && decision.targetJar === JarType.QUARANTINE) {
      const entryId = await this.jarWorker.jarCookie(cookie, JarType.QUARANTINE);
      this.timerDecayWorker.scheduleAction(entryId, 30_000, async () => {
        await this.blockerWorker.removeCookie(cookie);
        await this.jarWorker.smash(entryId, JarType.QUARANTINE);
      });
      return;
    }

    if (decision.action === 'ALLOW' && decision.targetJar === JarType.VAULT) {
      await this.jarWorker.jarCookie(cookie, JarType.VAULT);
    }
  }
}
