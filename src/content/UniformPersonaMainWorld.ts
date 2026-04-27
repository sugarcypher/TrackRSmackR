(() => {
  const PERSONA_MARKER = '__trackr_uniform_persona_applied__';
  const PERSONA_ENTROPY_ATTR = 'data-labcoat-entropy';
  const PERSONA_SCRIPT_BLOCKLIST_ATTR = 'data-labcoat-script-blocklist';
  const PERSONA_ASSIGNMENT_ATTR = 'data-labcoat-persona-data';

  const root = document.documentElement;
  if (!root) {
    return;
  }

  const labWindow = window as Window & {
    __trackrUniformPersonaApplied?: boolean;
    __labCoatDefense?: unknown;
  };

  if (labWindow.__trackrUniformPersonaApplied || root.hasAttribute(PERSONA_MARKER)) {
    return;
  }

  Object.defineProperty(window, '__trackrUniformPersonaApplied', {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });
  root.setAttribute(PERSONA_MARKER, '1');

  const entropyNormalizationEnabled = root.getAttribute(PERSONA_ENTROPY_ATTR) !== '0';
  const scriptBlocklistEnabled = root.getAttribute(PERSONA_SCRIPT_BLOCKLIST_ATTR) !== '0';
  const personaJsonAttr = root.getAttribute(PERSONA_ASSIGNMENT_ATTR);
  root.removeAttribute(PERSONA_ENTROPY_ATTR);
  root.removeAttribute(PERSONA_SCRIPT_BLOCKLIST_ATTR);
  root.removeAttribute(PERSONA_ASSIGNMENT_ATTR);

  if (personaJsonAttr === null) {
    return;
  }

  let personaProfile: {
    id: string;
    hardwareConcurrency: number;
    deviceMemory: number;
    language: string;
    languages: readonly string[];
    platform: string;
    userAgent: string;
    vendor: string;
    doNotTrack: string;
    maxTouchPoints: number;
    webdriver: boolean;
    uaPlatform: string;
    uaArchitecture: string;
    uaBitness: string;
    uaPlatformVersion: string;
    uaFullVersion: string;
    uaBrands: ReadonlyArray<{ brand: string; version: string }>;
    uaFullVersionList: ReadonlyArray<{ brand: string; version: string }>;
    screenColorDepth: number;
    screenPixelDepth: number;
    devicePixelRatio: number;
    timezone: string;
    timezoneOffset: number;
    webglVendor: string;
    webglRenderer: string;
    glVendor: string;
    glVersion: string;
  };
  try {
    personaProfile = JSON.parse(personaJsonAttr);
  } catch (_error) {
    return;
  }
  if (
    personaProfile === null ||
    typeof personaProfile !== 'object' ||
    typeof personaProfile.userAgent !== 'string' ||
    typeof personaProfile.platform !== 'string' ||
    !Array.isArray(personaProfile.languages)
  ) {
    return;
  }

  const hostPatternSources = [
    '(^|\\.)fingerprintjs\\.com$',
    '(^|\\.)fpapi\\.io$',
    '(^|\\.)openfpcdn\\.io$',
    '(^|\\.)client-analytics\\.'
  ];
  const resourcePatternSources = [
    'fingerprint',
    'device[-_]?fingerprint',
    'visitor[-_]?id',
    'browser[-_]?signature',
    'canvas[-_]?probe',
    'webgl[-_]?probe'
  ];
  const inlinePatternSources = [
    'FingerprintJS',
    'new\\s+Fingerprint2',
    'WEBGL_debug_renderer_info',
    'canvas\\s*\\.toDataURL\\(',
    'AudioContext\\s*\\('
  ];

  const hostPatterns = hostPatternSources.map((source) => new RegExp(source, 'i'));
  const resourcePatterns = resourcePatternSources.map((source) => new RegExp(source, 'i'));
  const inlinePatterns = inlinePatternSources.map((source) => new RegExp(source, 'i'));


  const fallbackSeed = (() => {
    try {
      const bytes = new Uint32Array(1);
      crypto.getRandomValues(bytes);
      return bytes[0] >>> 0;
    } catch (_error) {
      return Math.floor(Math.random() * 0xffffffff) >>> 0;
    }
  })();

  const contradictions: string[] = [];

  const isWindowsUA = personaProfile.userAgent.includes('Windows NT');
  const isMacUA = personaProfile.userAgent.includes('Mac OS X') || personaProfile.userAgent.includes('Macintosh');
  const isLinuxUA = personaProfile.userAgent.includes('Linux') || personaProfile.userAgent.includes('X11');

  if (isWindowsUA && personaProfile.platform !== 'Win32') {
    contradictions.push('platform-useragent mismatch');
  } else if (isMacUA && personaProfile.platform !== 'MacIntel') {
    contradictions.push('platform-useragent mismatch');
  } else if (isLinuxUA && !personaProfile.platform.includes('Linux')) {
    contradictions.push('platform-useragent mismatch');
  }

  const isAngle = personaProfile.webglRenderer.startsWith('ANGLE');
  const isApple = personaProfile.webglRenderer.startsWith('Apple') || personaProfile.webglVendor === 'Apple Inc.';
  const isMesa = personaProfile.webglRenderer.startsWith('Mesa') || personaProfile.webglVendor === 'Mesa';

  if (isWindowsUA && !isAngle) {
    contradictions.push('webgl-useragent mismatch');
  } else if (isMacUA && !isApple) {
    contradictions.push('webgl-useragent mismatch');
  } else if (isLinuxUA && !isMesa) {
    contradictions.push('webgl-useragent mismatch');
  }

  const expectedUaPlatform = isWindowsUA ? 'Windows' : isMacUA ? 'macOS' : isLinuxUA ? 'Linux' : '';
  if (
    expectedUaPlatform !== '' &&
    (personaProfile.uaPlatform !== expectedUaPlatform || !Array.isArray(personaProfile.uaBrands))
  ) {
    contradictions.push('ua-client-hints mismatch');
  }

  const coherenceScore = Math.max(0, 1 - contradictions.length * 0.34);

  const defenseState = {
    sessionId: `lc-${Math.random().toString(36).slice(2, 10)}`,
    blockedScripts: 0,
    blockedEndpoints: 0,
    normalizedRequests: 0,
    personaProfileId: personaProfile.id,
    personaCoherenceScore: Number(coherenceScore.toFixed(2)),
    personaContradictions: contradictions.slice(),
    startedAt: Date.now()
  };

  Object.defineProperty(window, '__labCoatDefense', {
    get: () => ({ ...defenseState }),
    configurable: false,
    enumerable: false
  });

  const defineGetter = (target: object, key: string, value: unknown): void => {
    try {
      Object.defineProperty(target, key, {
        get: () => value,
        configurable: true
      });
    } catch (_error) {
      // no-op
    }
  };

  const freezeArray = <T>(items: T[]): readonly T[] => {
    try {
      return Object.freeze(items.slice());
    } catch (_error) {
      return items;
    }
  };

  const toUrl = (value: string): URL | null => {
    if (typeof value !== 'string' || value.trim() === '') {
      return null;
    }

    try {
      return new URL(value, window.location.href);
    } catch (_error) {
      return null;
    }
  };

  const isCrossOrigin = (url: URL): boolean => url.origin !== window.location.origin;

  const readScriptSource = (script: HTMLScriptElement): string => script.getAttribute('src') || script.src || '';

  const maybeCount = (counter: 'script' | 'endpoint' | 'normalized') => {
    if (counter === 'script') {
      defenseState.blockedScripts += 1;
      return;
    }

    if (counter === 'endpoint') {
      defenseState.blockedEndpoints += 1;
      return;
    }

    defenseState.normalizedRequests += 1;
  };

  const shouldBlockFingerprintResource = (rawUrl: string): boolean => {
    if (!scriptBlocklistEnabled) {
      return false;
    }

    const parsed = toUrl(rawUrl);
    if (!parsed) {
      return false;
    }

    const host = parsed.hostname.toLowerCase();
    const urlBody = (parsed.pathname + parsed.search).toLowerCase();
    return (
      hostPatterns.some((pattern) => pattern.test(host)) ||
      resourcePatterns.some((pattern) => pattern.test(urlBody))
    );
  };

  const shouldBlockInlineScript = (scriptText: string): boolean => {
    if (!scriptBlocklistEnabled) {
      return false;
    }

    if (typeof scriptText !== 'string' || scriptText.trim() === '') {
      return false;
    }

    const sample = scriptText.slice(0, 12000);
    return inlinePatterns.some((pattern) => pattern.test(sample));
  };

  const markScriptBlocked = (script: HTMLScriptElement, reason: string): void => {
    maybeCount('script');

    try {
      script.type = 'application/labcoat-blocked';
      script.removeAttribute('src');
      script.textContent = '';
      script.setAttribute('data-labcoat-blocked', reason);
      script.remove();
    } catch (_error) {
      // no-op
    }
  };

  const inspectScriptNode = (script: HTMLScriptElement): boolean => {
    const source = readScriptSource(script);
    if (source && shouldBlockFingerprintResource(source)) {
      markScriptBlocked(script, 'fingerprint-source-blocklist');
      return true;
    }

    if (shouldBlockInlineScript(script.textContent || '')) {
      markScriptBlocked(script, 'fingerprint-inline-signature');
      return true;
    }

    return false;
  };

  const inspectNodeForScripts = (node: Node): boolean => {
    if (node instanceof HTMLScriptElement) {
      return inspectScriptNode(node);
    }

    if (node instanceof Element || node instanceof DocumentFragment) {
      const scripts = node.querySelectorAll('script');
      let blocked = false;
      scripts.forEach((script) => {
        blocked = inspectScriptNode(script) || blocked;
      });
      return blocked;
    }

    return false;
  };

  const setNoReferrerMeta = (): boolean => {
    try {
      const existing = document.querySelector('meta[name="referrer"]');
      if (existing) {
        existing.setAttribute('content', 'no-referrer');
        return true;
      }

      const meta = document.createElement('meta');
      meta.setAttribute('name', 'referrer');
      meta.setAttribute('content', 'no-referrer');
      const target = document.head || document.documentElement;
      if (!target) {
        return false;
      }
      target.prepend(meta);
      return true;
    } catch (_error) {
      return false;
    }
  };

  const hardenAnchor = (anchor: HTMLAnchorElement): void => {
    const href = anchor.getAttribute('href') || '';
    const parsed = toUrl(href);
    if (parsed && isCrossOrigin(parsed)) {
      anchor.referrerPolicy = 'no-referrer';
    }

    if (anchor.target === '_blank') {
      const tokens = new Set((anchor.rel || '').split(/\s+/).filter(Boolean));
      tokens.add('noopener');
      tokens.add('noreferrer');
      anchor.rel = Array.from(tokens).join(' ');
    }
  };

  const hardenForm = (form: HTMLFormElement): void => {
    const action = form.getAttribute('action') || window.location.href;
    const parsed = toUrl(action);
    if (parsed && isCrossOrigin(parsed)) {
      form.referrerPolicy = 'no-referrer';
    }
  };

  const hardenNodeForLeakage = (node: Node): void => {
    if (node instanceof HTMLAnchorElement) {
      hardenAnchor(node);
      return;
    }

    if (node instanceof HTMLFormElement) {
      hardenForm(node);
      return;
    }

    if (node instanceof Element || node instanceof DocumentFragment) {
      node.querySelectorAll('a').forEach((anchor) => hardenAnchor(anchor));
      node.querySelectorAll('form').forEach((form) => hardenForm(form));
    }
  };

  const requestUrlFromFetchInput = (input: Request | string | URL): string => {
    if (typeof input === 'string') {
      return input;
    }
    if (input instanceof URL) {
      return input.href;
    }
    if (input instanceof Request) {
      return input.url;
    }
    return '';
  };

  const noiseHash = (x: number, y: number, salt: number): number => {
    let value = fallbackSeed ^ (x + 0x9e3779b9) ^ (y * 0x85ebca6b) ^ salt;
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    return (value ^ (value >>> 16)) >>> 0;
  };

  const perturbCanvasSnapshot = (canvas: HTMLCanvasElement): HTMLCanvasElement => {
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width === 0 || canvas.height === 0) {
      return canvas;
    }

    const clone = document.createElement('canvas');
    clone.width = canvas.width;
    clone.height = canvas.height;
    const cloneContext = clone.getContext('2d', { willReadFrequently: true });
    if (!cloneContext) {
      return canvas;
    }

    cloneContext.drawImage(canvas, 0, 0);

    const x = noiseHash(canvas.width, canvas.height, 0x1f123bb5) % canvas.width;
    const y = noiseHash(canvas.height, canvas.width, 0x2c1b3c6d) % canvas.height;

    try {
      const pixel = cloneContext.getImageData(x, y, 1, 1);
      pixel.data[0] = (pixel.data[0] + ((fallbackSeed % 5) + 1)) % 256;
      cloneContext.putImageData(pixel, x, y);
    } catch (_error) {
      return canvas;
    }

    return clone;
  };

  if (entropyNormalizationEnabled && typeof Navigator !== 'undefined') {
    const navProto = Navigator.prototype as unknown as Record<string, unknown>;
    defineGetter(navProto, 'hardwareConcurrency', personaProfile.hardwareConcurrency);
    defineGetter(navProto, 'deviceMemory', personaProfile.deviceMemory);
    defineGetter(navProto, 'language', personaProfile.language);
    defineGetter(navProto, 'languages', freezeArray([...personaProfile.languages]));
    defineGetter(navProto, 'platform', personaProfile.platform);
    defineGetter(navProto, 'userAgent', personaProfile.userAgent);
    defineGetter(navProto, 'vendor', personaProfile.vendor);
    defineGetter(navProto, 'plugins', freezeArray([]));
    defineGetter(navProto, 'mimeTypes', freezeArray([]));
    defineGetter(navProto, 'doNotTrack', personaProfile.doNotTrack);
    defineGetter(navProto, 'maxTouchPoints', personaProfile.maxTouchPoints);
    defineGetter(navProto, 'webdriver', personaProfile.webdriver);
    defineGetter(navProto, 'userAgentData', {
      brands: freezeArray(personaProfile.uaBrands.map((item) => ({ ...item }))),
      mobile: false,
      platform: personaProfile.uaPlatform,
      getHighEntropyValues: async (hints: string[] = []) => {
        const response: Record<string, unknown> = {};
        hints.forEach((hint) => {
          if (hint === 'architecture') {
            response.architecture = personaProfile.uaArchitecture;
          } else if (hint === 'bitness') {
            response.bitness = personaProfile.uaBitness;
          } else if (hint === 'model') {
            response.model = '';
          } else if (hint === 'platformVersion') {
            response.platformVersion = personaProfile.uaPlatformVersion;
          } else if (hint === 'uaFullVersion') {
            response.uaFullVersion = personaProfile.uaFullVersion;
          } else if (hint === 'fullVersionList') {
            response.fullVersionList = freezeArray(
              personaProfile.uaFullVersionList.map((item) => ({ ...item }))
            );
          } else if (hint === 'platform') {
            response.platform = personaProfile.uaPlatform;
          }
        });
        return response;
      }
    });
  }

  if (entropyNormalizationEnabled && typeof Screen !== 'undefined') {
    defineGetter(Screen.prototype, 'colorDepth', personaProfile.screenColorDepth);
    defineGetter(Screen.prototype, 'pixelDepth', personaProfile.screenPixelDepth);
  }

  if (entropyNormalizationEnabled) {
    defineGetter(window, 'devicePixelRatio', personaProfile.devicePixelRatio);
  }

  if (entropyNormalizationEnabled && typeof Document !== 'undefined') {
    defineGetter(Document.prototype, 'referrer', '');
  }

  if (
    entropyNormalizationEnabled &&
    typeof Intl !== 'undefined' &&
    Intl.DateTimeFormat &&
    Intl.DateTimeFormat.prototype
  ) {
    const originalResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
    if (typeof originalResolvedOptions === 'function') {
      Intl.DateTimeFormat.prototype.resolvedOptions = function(...args: unknown[]) {
        const result = originalResolvedOptions.apply(this, args as []);
        if (!result || typeof result !== 'object') {
          return result;
        }
        return { ...result, timeZone: personaProfile.timezone };
      };
    }
  }

  if (
    entropyNormalizationEnabled &&
    typeof Date !== 'undefined' &&
    typeof Date.prototype.getTimezoneOffset === 'function'
  ) {
    Date.prototype.getTimezoneOffset = function() {
      return personaProfile.timezoneOffset;
    };
  }

  const patchWebGl = (prototype: any): void => {
    if (!prototype || typeof prototype.getParameter !== 'function' || typeof prototype.getExtension !== 'function') {
      return;
    }

    const originalGetParameter = prototype.getParameter;
    const originalGetExtension = prototype.getExtension;
    const originalGetSupportedExtensions = prototype.getSupportedExtensions;

    prototype.getParameter = function(parameter: number) {
      if (parameter === 37445) {
        return personaProfile.webglVendor;
      }
      if (parameter === 37446) {
        return personaProfile.webglRenderer;
      }
      if (parameter === 7936) {
        return personaProfile.glVendor;
      }
      if (parameter === 7937) {
        return personaProfile.glVersion;
      }
      return originalGetParameter.apply(this, arguments as unknown as []);
    };

    prototype.getExtension = function(name: string) {
      if (name === 'WEBGL_debug_renderer_info') {
        return null;
      }
      return originalGetExtension.apply(this, arguments as unknown as []);
    };

    if (typeof originalGetSupportedExtensions === 'function') {
      prototype.getSupportedExtensions = function() {
        const extensions = originalGetSupportedExtensions.apply(this, arguments as unknown as []) || [];
        return extensions.filter((entry: string) => entry !== 'WEBGL_debug_renderer_info');
      };
    }
  };

  if (entropyNormalizationEnabled) {
    patchWebGl((window as any).WebGLRenderingContext && (window as any).WebGLRenderingContext.prototype);
    patchWebGl((window as any).WebGL2RenderingContext && (window as any).WebGL2RenderingContext.prototype);
  }

  if (entropyNormalizationEnabled && typeof HTMLCanvasElement !== 'undefined') {
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    if (typeof originalToDataURL === 'function') {
      HTMLCanvasElement.prototype.toDataURL = function(...args: unknown[]): string {
        const snapshot = perturbCanvasSnapshot(this);
        return originalToDataURL.apply(snapshot, args as []);
      };
    }

    const originalToBlob = HTMLCanvasElement.prototype.toBlob;
    if (typeof originalToBlob === 'function') {
      HTMLCanvasElement.prototype.toBlob = function(
        callback: BlobCallback,
        type?: string,
        quality?: number
      ): void {
        const snapshot = perturbCanvasSnapshot(this);
        originalToBlob.call(snapshot, callback, type, quality);
      };
    }
  }

  if (entropyNormalizationEnabled && typeof CanvasRenderingContext2D !== 'undefined') {
    const originalMeasureText = CanvasRenderingContext2D.prototype.measureText;
    if (typeof originalMeasureText === 'function') {
      CanvasRenderingContext2D.prototype.measureText = function(text: string): TextMetrics {
        const metrics = originalMeasureText.call(this, text);
        if (metrics && typeof metrics.width === 'number') {
          try {
            Object.defineProperty(metrics, 'width', {
              value: Math.round(metrics.width * 2) / 2
            });
          } catch (_error) {
            // no-op
          }
        }
        return metrics;
      };
    }
  }

  const patchAudioContext = (ctor: any): void => {
    if (!ctor || !ctor.prototype || typeof ctor.prototype.createAnalyser !== 'function') {
      return;
    }

    const originalCreateAnalyser = ctor.prototype.createAnalyser;
    ctor.prototype.createAnalyser = function(...args: unknown[]) {
      const analyser = originalCreateAnalyser.apply(this, args as []);
      if (!analyser || typeof analyser.getFloatFrequencyData !== 'function') {
        return analyser;
      }

      const originalGetFloatFrequencyData = analyser.getFloatFrequencyData;
      analyser.getFloatFrequencyData = function(array: Float32Array): void {
        originalGetFloatFrequencyData.call(this, array);
        for (let index = 0; index < array.length; index += 1) {
          array[index] = Math.round(array[index] / 10) * 10;
        }
      };
      return analyser;
    };
  };

  if (entropyNormalizationEnabled) {
    patchAudioContext((window as any).AudioContext);
    patchAudioContext((window as any).OfflineAudioContext);
  }

  const scriptSrcDescriptor = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
  if (scriptSrcDescriptor && typeof scriptSrcDescriptor.set === 'function') {
    try {
      Object.defineProperty(HTMLScriptElement.prototype, 'src', {
        configurable: true,
        enumerable: scriptSrcDescriptor.enumerable,
        get: function() {
          if (typeof scriptSrcDescriptor.get === 'function') {
            return scriptSrcDescriptor.get.call(this);
          }
          return '';
        },
        set: function(nextValue: string) {
          if (shouldBlockFingerprintResource(String(nextValue ?? ''))) {
            markScriptBlocked(this, 'fingerprint-src-setter');
            return;
          }
          scriptSrcDescriptor.set?.call(this, nextValue);
        }
      });
    } catch (_error) {
      // no-op
    }
  }

  const originalSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function(name: string, value: string): void {
    if (this instanceof HTMLScriptElement && String(name).toLowerCase() === 'src') {
      if (shouldBlockFingerprintResource(String(value ?? ''))) {
        markScriptBlocked(this, 'fingerprint-src-attribute');
        return;
      }
    }

    originalSetAttribute.call(this, name, value);
  };

  const originalAppendChild = Node.prototype.appendChild;
  Node.prototype.appendChild = function<T extends Node>(node: T): T {
    if (inspectNodeForScripts(node)) {
      return node;
    }
    hardenNodeForLeakage(node);
    return originalAppendChild.call(this, node) as T;
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function<T extends Node>(newNode: T, referenceNode: Node | null): T {
    if (inspectNodeForScripts(newNode)) {
      return newNode;
    }
    hardenNodeForLeakage(newNode);
    return originalInsertBefore.call(this, newNode, referenceNode) as T;
  };

  const originalReplaceChild = Node.prototype.replaceChild;
  Node.prototype.replaceChild = function<T extends Node>(newChild: Node, oldChild: T): T {
    if (inspectNodeForScripts(newChild)) {
      return oldChild;
    }
    hardenNodeForLeakage(newChild);
    return originalReplaceChild.call(this, newChild, oldChild) as T;
  };

  if (typeof window.fetch === 'function') {
    const originalFetch = window.fetch.bind(window);
    const patchedFetch = (input: Request | string | URL, init?: RequestInit): Promise<Response> => {
      const requestUrl = requestUrlFromFetchInput(input);
      const parsed = toUrl(requestUrl);

      if (parsed && shouldBlockFingerprintResource(parsed.href)) {
        maybeCount('endpoint');
        return Promise.reject(new Error('TrackRSmackR blocked a known fingerprint endpoint.'));
      }

      if (parsed && isCrossOrigin(parsed)) {
        const safeInit: RequestInit = { ...(init || {}) };
        if (!safeInit.referrerPolicy) {
          safeInit.referrerPolicy = 'no-referrer';
          maybeCount('normalized');
        }
        return originalFetch(input as RequestInfo, safeInit);
      }

      return originalFetch(input as RequestInfo, init);
    };

    try {
      Object.defineProperty(window, 'fetch', {
        configurable: true,
        writable: true,
        value: patchedFetch
      });
    } catch (_error) {
      // no-op
    }
  }

  if (typeof XMLHttpRequest !== 'undefined') {
    const requestUrlMap = new WeakMap<XMLHttpRequest, string>();
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(
      method: string,
      url: string | URL,
      async?: boolean,
      username?: string | null,
      password?: string | null
    ): void {
      requestUrlMap.set(this, String(url ?? ''));
      (originalOpen as (...args: unknown[]) => unknown).call(this, method, url, async, username, password);
    };

    XMLHttpRequest.prototype.send = function(body?: Document | XMLHttpRequestBodyInit | null): void {
      const parsed = toUrl(requestUrlMap.get(this) ?? '');
      if (parsed && shouldBlockFingerprintResource(parsed.href)) {
        maybeCount('endpoint');
        this.abort();
        return;
      }

      if (parsed && isCrossOrigin(parsed)) {
        try {
          this.withCredentials = false;
          maybeCount('normalized');
        } catch (_error) {
          // no-op
        }
      }

      (originalSend as (...args: unknown[]) => unknown).call(this, body);
    };
  }

  if (typeof navigator.sendBeacon === 'function') {
    const originalSendBeacon = navigator.sendBeacon.bind(navigator);
    const patchedSendBeacon = (url: string | URL, data?: BodyInit | null): boolean => {
      const parsed = toUrl(String(url ?? ''));
      if (parsed && (shouldBlockFingerprintResource(parsed.href) || isCrossOrigin(parsed))) {
        maybeCount('endpoint');
        return false;
      }
      return originalSendBeacon(url, data);
    };

    try {
      Object.defineProperty(Navigator.prototype, 'sendBeacon', {
        configurable: true,
        writable: true,
        value: patchedSendBeacon
      });
    } catch (_error) {
      // no-op
    }
  }

  if (!setNoReferrerMeta()) {
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        setNoReferrerMeta();
        hardenNodeForLeakage(document);
      },
      { once: true }
    );
  } else {
    hardenNodeForLeakage(document);
  }

  const observer = new MutationObserver((records) => {
    records.forEach((record) => {
      record.addedNodes.forEach((node) => {
        inspectNodeForScripts(node);
        hardenNodeForLeakage(node);
      });
    });
  });

  observer.observe(document.documentElement || document, { childList: true, subtree: true });
})();
