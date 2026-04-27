import type { PolicyEvaluationOptions, PolicyResult } from '../core/PolicyEngine.js';
import { PolicyEngine } from '../core/PolicyEngine.js';

export class ClassifierWorker {
  public constructor(private readonly policyEngine: PolicyEngine) {}

  public classify(cookie: chrome.cookies.Cookie, options?: PolicyEvaluationOptions): PolicyResult {
    return this.policyEngine.evaluate(cookie, options);
  }
}
