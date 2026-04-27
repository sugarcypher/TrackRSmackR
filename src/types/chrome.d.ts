declare namespace chrome {
  namespace storage {
    interface StorageChange {
      oldValue?: unknown;
      newValue?: unknown;
    }

    interface StorageChangedEvent {
      addListener(
        callback: (changes: Record<string, StorageChange>, areaName: string) => void
      ): void;
    }

    namespace local {
      function get(
        keys?: string | string[] | Record<string, unknown> | null
      ): Promise<Record<string, unknown>>;
      function get(
        keys: string | string[] | Record<string, unknown> | null,
        callback: (items: Record<string, unknown>) => void
      ): void;
      function set(items: Record<string, unknown>): Promise<void>;
      function set(items: Record<string, unknown>, callback: () => void): void;
    }

    const onChanged: StorageChangedEvent;
  }

  namespace cookies {
    interface Cookie {
      domain: string;
      name: string;
      value: string;
      secure: boolean;
      httpOnly: boolean;
      session: boolean;
      path: string;
    }

    interface OnChangedDetails {
      cookie: Cookie;
      removed: boolean;
    }

    interface CookieRemoveDetails {
      url: string;
      name: string;
    }

    interface CookiesChangedEvent {
      addListener(callback: (changeInfo: OnChangedDetails) => void): void;
      removeListener(callback: (changeInfo: OnChangedDetails) => void): void;
    }

    const onChanged: CookiesChangedEvent;
    function remove(details: CookieRemoveDetails): Promise<unknown>;
  }

  namespace alarms {
    interface Alarm {
      name: string;
      scheduledTime: number;
    }

    interface AlarmCreateInfo {
      when?: number;
      delayInMinutes?: number;
      periodInMinutes?: number;
    }

    interface AlarmsEvent {
      addListener(callback: (alarm: Alarm) => void): void;
    }

    function create(name: string, alarmInfo?: AlarmCreateInfo): void;
    const onAlarm: AlarmsEvent;
  }

  namespace runtime {
    interface InstalledDetails {
      reason: 'install' | 'update' | 'chrome_update' | 'shared_module_update';
      previousVersion?: string;
      id?: string;
    }

    interface MessageSender {
      tab?: { id?: number; url?: string };
      frameId?: number;
      id?: string;
      url?: string;
    }

    interface InstalledEvent {
      addListener(callback: (details: InstalledDetails) => void): void;
    }

    type MessageHandler = (
      message: unknown,
      sender: MessageSender,
      sendResponse: (response?: unknown) => void
    ) => boolean | void | Promise<unknown>;

    interface MessageEvent {
      addListener(callback: MessageHandler): void;
      removeListener(callback: MessageHandler): void;
    }

    const onInstalled: InstalledEvent;
    const onMessage: MessageEvent;
    const lastError: { message?: string } | undefined;

    function getURL(path: string): string;
    function sendMessage<TResponse = unknown>(message: unknown): Promise<TResponse>;
  }

  namespace tabs {
    interface CreateProperties {
      url?: string;
      active?: boolean;
    }

    interface Tab {
      id?: number;
      url?: string;
    }

    function create(properties: CreateProperties): Promise<Tab>;
  }
}
