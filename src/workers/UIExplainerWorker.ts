import type { PolicyResult } from '../core/PolicyEngine.js';

export class UIExplainerWorker {
  public explain(decision: PolicyResult, adaptationSignals: string[]): string {
    let explanation = decision.reason;

    if (decision.action === 'QUARANTINE') {
      explanation = `${explanation} — contained and removed from browser storage`;
    } else if (decision.action === 'DECAY') {
      explanation = `${explanation} — temporarily quarantined with timed smash`;
    } else if (decision.action === 'ALLOW') {
      explanation = `${explanation} — preserved for site functionality`;
    }

    if (adaptationSignals.length > 0) {
      explanation = `${explanation} [signals: ${adaptationSignals.join(', ')}]`;
    }

    return explanation;
  }
}
