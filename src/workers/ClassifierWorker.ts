import type { PolicyResult } from '../core/PolicyEngine.js';
import { PolicyEngine } from '../core/PolicyEngine.js';
import {
  getGingerbreadValue,
  loadGingerbreadManEnabled
} from '../utils/GingerbreadMan.js';

export interface ClassifiedCookieResult {
  cookie: chrome.cookies.Cookie;
  decision: PolicyResult;
  outcome?: 'GINGERBREAD_SUBSTITUTED';
}

export class ClassifierWorker {
  public constructor(private readonly policyEngine: PolicyEngine) {}

  public async classify(cookie: chrome.cookies.Cookie): Promise<ClassifiedCookieResult> {
    const decision = this.policyEngine.evaluate(cookie);

    if (
      decision.targetJar === 'QUARANTINE' &&
      decision.action !== 'ALLOW' &&
      (await loadGingerbreadManEnabled())
    ) {
      return {
        cookie: {
          ...cookie,
          value: getGingerbreadValue(cookie.name)
        },
        decision,
        outcome: 'GINGERBREAD_SUBSTITUTED'
      };
    }

    return { cookie, decision };
  }
}
