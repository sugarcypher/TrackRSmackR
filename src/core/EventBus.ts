export interface EventEnvelope<TType extends string, TPayload> {
  id: string;
  type: TType;
  source: string;
  timestamp: number;
  confidence: number;
  correlationId?: string;
  payload: TPayload;
}

type EventHandler<TType extends string, TPayload> = (
  event: EventEnvelope<TType, TPayload>
) => void | Promise<void>;

type EventMap = object;

type HandlerRegistry<TEvents extends EventMap> = {
  [TType in keyof TEvents]?: Set<EventHandler<TType & string, TEvents[TType]>>;
};

function makeEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `evt-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export class EventBus<TEvents extends EventMap> {
  private readonly handlers: HandlerRegistry<TEvents> = {};

  public subscribe<TType extends keyof TEvents & string>(
    type: TType,
    handler: EventHandler<TType, TEvents[TType]>
  ): () => void {
    const bucket = this.handlers[type] ?? new Set<EventHandler<TType, TEvents[TType]>>();
    bucket.add(handler);
    this.handlers[type] = bucket as HandlerRegistry<TEvents>[TType];

    return () => {
      const current = this.handlers[type];
      if (!current) {
        return;
      }

      current.delete(handler as EventHandler<string, unknown>);
      if (current.size === 0) {
        delete this.handlers[type];
      }
    };
  }

  public async publish<TType extends keyof TEvents & string>(
    type: TType,
    source: string,
    payload: TEvents[TType],
    options?: { confidence?: number; correlationId?: string }
  ): Promise<EventEnvelope<TType, TEvents[TType]>> {
    const envelope: EventEnvelope<TType, TEvents[TType]> = {
      id: makeEventId(),
      type,
      source,
      timestamp: Date.now(),
      confidence: Math.max(0, Math.min(1, options?.confidence ?? 1)),
      correlationId: options?.correlationId,
      payload
    };

    const listeners = this.handlers[type];
    if (!listeners || listeners.size === 0) {
      return envelope;
    }

    for (const listener of listeners) {
      await listener(envelope);
    }

    return envelope;
  }
}
