import { getGingerbreadValue } from '../utils/GingerbreadMan.js';

export class BlockerWorker {
  public async removeCookie(cookie: chrome.cookies.Cookie): Promise<void> {
    const url = this.cookieUrl(cookie);

    try {
      await chrome.cookies.remove({ url, name: cookie.name });
    } catch (error) {
      console.error(`Failed to remove cookie ${cookie.name} from ${cookie.domain}`, error);
    }
  }

  public async substituteWithDecoy(cookie: chrome.cookies.Cookie): Promise<boolean> {
    const url = this.cookieUrl(cookie);

    try {
      await chrome.cookies.remove({ url, name: cookie.name });

      const details: chrome.cookies.SetDetails = {
        url,
        name: cookie.name,
        value: await getGingerbreadValue(cookie.name),
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
        storeId: cookie.storeId
      };

      if (cookie.domain.startsWith('.')) {
        details.domain = cookie.domain;
      }

      if (!cookie.session && typeof cookie.expirationDate === 'number') {
        details.expirationDate = cookie.expirationDate;
      }

      await chrome.cookies.set(details);
      return true;
    } catch (error) {
      console.error(
        `Failed to substitute decoy for cookie ${cookie.name} from ${cookie.domain}`,
        error
      );
      return false;
    }
  }

  private cookieUrl(cookie: chrome.cookies.Cookie): string {
    const cleanDomain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
    return `http${cookie.secure ? 's' : ''}://${cleanDomain}${cookie.path}`;
  }
}
