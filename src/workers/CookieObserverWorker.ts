export type CookieChangeHandler = (
  changeInfo: chrome.cookies.OnChangedDetails
) => void | Promise<void>;

export class CookieObserverWorker {
  private listener: ((changeInfo: chrome.cookies.OnChangedDetails) => void) | null = null;

  public start(handler: CookieChangeHandler): void {
    if (this.listener) {
      return;
    }

    this.listener = (changeInfo) => {
      void handler(changeInfo);
    };

    chrome.cookies.onChanged.addListener(this.listener);
  }

  public stop(): void {
    if (!this.listener) {
      return;
    }

    chrome.cookies.onChanged.removeListener(this.listener);
    this.listener = null;
  }
}
