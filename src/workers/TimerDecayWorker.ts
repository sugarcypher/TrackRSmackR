const DECAY_ALARM_PREFIX = 'trackr-smackr-decay:';

export type SmashHandler = (id: string) => Promise<void>;

export class TimerDecayWorker {
  private smashHandler: SmashHandler | null = null;

  private readonly pendingActions = new Map<string, () => Promise<void>>();

  private initialized = false;

  public init(smashHandler: SmashHandler): void {
    this.smashHandler = smashHandler;

    if (this.initialized) {
      return;
    }

    chrome.alarms.onAlarm.addListener((alarm) => {
      if (!alarm.name.startsWith(DECAY_ALARM_PREFIX) || !this.smashHandler) {
        return;
      }

      const entryId = alarm.name.slice(DECAY_ALARM_PREFIX.length);
      const pendingAction = this.pendingActions.get(entryId);
      if (pendingAction) {
        this.pendingActions.delete(entryId);
        void pendingAction();
        return;
      }

      void this.smashHandler(entryId);
    });

    this.initialized = true;
  }

  public scheduleSmash(entryId: string, delayMs: number): void {
    this.pendingActions.delete(entryId);
    const safeDelayMs = Math.max(1_000, delayMs);
    chrome.alarms.create(`${DECAY_ALARM_PREFIX}${entryId}`, {
      when: Date.now() + safeDelayMs
    });
  }

  public scheduleAction(entryId: string, delayMs: number, action: () => Promise<void>): void {
    this.pendingActions.set(entryId, action);
    const safeDelayMs = Math.max(1_000, delayMs);
    chrome.alarms.create(`${DECAY_ALARM_PREFIX}${entryId}`, {
      when: Date.now() + safeDelayMs
    });
  }
}
