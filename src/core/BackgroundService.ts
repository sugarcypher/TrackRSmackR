import { BouncerCore } from './BouncerCore.js';
import { enforceLocalOnlyRuntime } from './LocalOnlyGuard.js';
import { getOrCreateInstallId } from '../utils/PersonaSelector.js';

enforceLocalOnlyRuntime();
const bouncer = new BouncerCore();
void bouncer.start();
void getOrCreateInstallId();

const ONBOARDING_URL_PATH = 'static/onboarding.html';

async function openOnboarding(): Promise<void> {
  try {
    await chrome.tabs.create({ url: chrome.runtime.getURL(ONBOARDING_URL_PATH) });
  } catch (error) {
    console.error('Failed to open onboarding tab', error);
  }
}

async function openOnboardingIfIncomplete(): Promise<void> {
  const data = (await chrome.storage.local.get('onboardingComplete')) as {
    onboardingComplete?: boolean;
  };
  if (data.onboardingComplete !== true) {
    await openOnboarding();
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== 'install') {
    return;
  }
  void openOnboarding();
});

chrome.runtime.onStartup.addListener(() => {
  void openOnboardingIfIncomplete();
});
