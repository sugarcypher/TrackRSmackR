declare namespace chrome {
  namespace storage {
    namespace local {
      function get(
        keys?: string | string[] | Record<string, unknown> | null
      ): Promise<Record<string, unknown>>;
      function set(items: Record<string, unknown>): Promise<void>;
    }
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
}
