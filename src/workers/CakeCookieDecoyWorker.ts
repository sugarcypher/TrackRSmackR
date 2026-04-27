interface CakeCookieDecoyRecord {
  fileName: string;
  cookieName: string;
  domain: string;
  path: string;
  value: string;
  persistenceDays: number;
  createdAt: number;
  refreshedAt: number;
  expiresAt: number;
  stage: 'browser' | 'policy' | 'vault' | 'quarantine' | 'system';
  note: string;
}

interface CakeCookieLayerState {
  refreshedAt: number;
  records: CakeCookieDecoyRecord[];
}

const DECOY_COOKIE_BLUEPRINTS: Array<{ fileName: string; cookieName: string; domain: string }> = [
  { fileName: '_ga.cookie.json', cookieName: '_ga', domain: '.analytics.edge' },
  { fileName: '_gid.cookie.json', cookieName: '_gid', domain: '.metrics.edge' },
  { fileName: '_fbp.cookie.json', cookieName: '_fbp', domain: '.social-pixel.edge' },
  { fileName: 'IDE.cookie.json', cookieName: 'IDE', domain: '.ad-broker.edge' },
  { fileName: 'uid.cookie.json', cookieName: 'uid', domain: '.identity-broker.edge' },
  { fileName: 'visitor_id.cookie.json', cookieName: 'visitor_id', domain: '.traffic-pulse.edge' },
  { fileName: 'session_replay.cookie.json', cookieName: 'session_replay', domain: '.replay-edge.local' },
  { fileName: 'amplitude_id.cookie.json', cookieName: 'amplitude_id', domain: '.events-edge.local' },
  { fileName: 'mixpanel_distinct_id.cookie.json', cookieName: 'mixpanel_distinct_id', domain: '.cohort-edge.local' },
  { fileName: 'ajs_anonymous_id.cookie.json', cookieName: 'ajs_anonymous_id', domain: '.funnel-edge.local' }
];

const LAYERS: CakeCookieDecoyRecord['stage'][] = [
  'browser',
  'policy',
  'vault',
  'quarantine',
  'system'
];

function makeDecoyValue(seed: string): string {
  return `VOID-${seed}-00000000000000000000`;
}

function buildDecoyRecords(now: number): CakeCookieDecoyRecord[] {
  const persistenceDays = 365;
  const expiresAt = now + persistenceDays * 24 * 60 * 60 * 1000;

  return LAYERS.flatMap((stage, stageIndex) =>
    DECOY_COOKIE_BLUEPRINTS.map((blueprint, index) => {
      const suffix = `${stageIndex + 1}${index + 1}`.padStart(3, '0');
      return {
        fileName: blueprint.fileName,
        cookieName: blueprint.cookieName,
        domain: blueprint.domain,
        path: '/',
        value: makeDecoyValue(`${stage.toUpperCase()}-${suffix}`),
        persistenceDays,
        createdAt: now,
        refreshedAt: now,
        expiresAt,
        stage,
        note: 'Decoy cookie record for staged exfiltration canary defense.'
      };
    })
  );
}

export class CakeCookieDecoyWorker {
  public async seed(): Promise<void> {
    const now = Date.now();
    const records = buildDecoyRecords(now);

    const byStage = records.reduce<Record<string, CakeCookieDecoyRecord[]>>((acc, record) => {
      if (!acc[record.stage]) {
        acc[record.stage] = [];
      }
      acc[record.stage].push(record);
      return acc;
    }, {});

    const payload: Record<string, CakeCookieLayerState> = {
      cakecookiesBrowserLayer: {
        refreshedAt: now,
        records: byStage.browser ?? []
      },
      cakecookiesPolicyLayer: {
        refreshedAt: now,
        records: byStage.policy ?? []
      },
      cakecookiesVaultLayer: {
        refreshedAt: now,
        records: byStage.vault ?? []
      },
      cakecookiesQuarantineLayer: {
        refreshedAt: now,
        records: byStage.quarantine ?? []
      },
      cakecookiesSystemFrontierLayer: {
        refreshedAt: now,
        records: byStage.system ?? []
      }
    };

    await chrome.storage.local.set(payload);
  }
}
