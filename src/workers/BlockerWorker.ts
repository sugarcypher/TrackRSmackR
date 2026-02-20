export class BlockerWorker {
  public async removeCookie(cookie: chrome.cookies.Cookie): Promise<void> {
    const domain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
    const url = `http${cookie.secure ? 's' : ''}://${domain}${cookie.path}`;

    try {
      await chrome.cookies.remove({ url, name: cookie.name });
    } catch (error) {
      console.error(`Failed to remove cookie ${cookie.name} from ${cookie.domain}`, error);
    }
  }
}
