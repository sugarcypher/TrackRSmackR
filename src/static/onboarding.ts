let currentPage = 1;
const totalPages = 4;

function getCustomDomains(pageOrKey: string): string[] {
  const inputs = document.querySelectorAll<HTMLInputElement>(
    `input[data-custom="${pageOrKey}"]`
  );
  const domains: string[] = [];
  for (const input of inputs) {
    const val = input.value.trim().toLowerCase();
    if (val.length > 0) {
      domains.push(val);
    }
  }
  return domains;
}

function getCheckedDomains(): string[] {
  const checked = document.querySelectorAll<HTMLInputElement>(
    'input[data-domain]:checked'
  );
  const domains: string[] = [];
  for (const cb of checked) {
    const domain = cb.dataset.domain;
    if (domain) {
      domains.push(domain.toLowerCase());
    }
  }
  return domains;
}

function getAllCustomDomains(): string[] {
  const all: string[] = [];
  for (const key of ['1', '2', '3', 'final']) {
    all.push(...getCustomDomains(key));
  }
  return all;
}

function collectAllDomains(): string[] {
  const checked = getCheckedDomains();
  const custom = getAllCustomDomains();
  const combined = [...checked, ...custom];
  const unique = Array.from(new Set(combined.filter((d) => d.length > 0)));
  return unique.sort();
}

function updateProgressBar(): void {
  for (let i = 1; i <= totalPages; i++) {
    const step = document.getElementById(`step-${i}`);
    if (!step) continue;
    step.classList.remove('active', 'done');
    if (i < currentPage) {
      step.classList.add('done');
    } else if (i === currentPage) {
      step.classList.add('active');
    }
  }
}

function showPage(page: number): void {
  for (let i = 1; i <= totalPages; i++) {
    const el = document.getElementById(`page-${i}`);
    if (el) {
      el.classList.toggle('visible', i === page);
    }
  }
  currentPage = page;
  updateProgressBar();

  if (page === totalPages) {
    renderReview();
  }

  document.body.scrollTop = 0;
}

function renderReview(): void {
  const container = document.getElementById('review-list');
  if (!container) return;

  const domains = collectAllDomains();

  if (domains.length === 0) {
    container.innerHTML =
      '<p class="empty-note">No sites selected yet. Go back to pick some, or add them below.</p>';
    return;
  }

  const checkedSet = new Set(getCheckedDomains());
  const presetDomains = domains.filter((d) => checkedSet.has(d));
  const customDomains = domains.filter((d) => !checkedSet.has(d));

  let html = '';

  if (presetDomains.length > 0) {
    html += '<div class="summary-section"><h3>Selected Sites</h3><div class="summary-chips">';
    for (const d of presetDomains) {
      html += `<span class="chip">${escapeHtml(d)}</span>`;
    }
    html += '</div></div>';
  }

  if (customDomains.length > 0) {
    html += '<div class="summary-section"><h3>Custom Entries</h3><div class="summary-chips">';
    for (const d of customDomains) {
      html += `<span class="chip custom">${escapeHtml(d)}</span>`;
    }
    html += '</div></div>';
  }

  container.innerHTML = html;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Navigation functions — attached to window for onclick handlers
(window as any).nextPage = function nextPage(): void {
  if (currentPage < totalPages) {
    showPage(currentPage + 1);
  }
};

(window as any).prevPage = function prevPage(): void {
  if (currentPage > 1) {
    showPage(currentPage - 1);
  }
};

(window as any).skipPage = function skipPage(): void {
  // Uncheck everything on the current page
  const checkboxes = document.querySelectorAll<HTMLInputElement>(
    `input[data-page="${currentPage}"]`
  );
  for (const cb of checkboxes) {
    cb.checked = false;
  }
  // Clear custom inputs on this page
  const customs = document.querySelectorAll<HTMLInputElement>(
    `input[data-custom="${currentPage}"]`
  );
  for (const input of customs) {
    input.value = '';
  }

  if (currentPage < totalPages) {
    showPage(currentPage + 1);
  }
};

(window as any).saveAndFinish = async function saveAndFinish(): Promise<void> {
  const statusEl = document.getElementById('save-status');
  const domains = collectAllDomains();

  if (domains.length === 0) {
    if (statusEl) {
      statusEl.textContent = 'No domains selected. Add at least one or go back.';
      statusEl.style.color = '#d9534f';
    }
    return;
  }

  try {
    // Merge with any existing allowlist rather than overwriting
    const stored = await chrome.storage.local.get(['userAllowlist', 'onboardingComplete']);
    const existing: string[] = Array.isArray(stored.userAllowlist)
      ? stored.userAllowlist
      : [];

    const merged = Array.from(
      new Set([...existing, ...domains].map((d) => d.trim().toLowerCase()))
    )
      .filter((d) => d.length > 0)
      .sort();

    await chrome.storage.local.set({
      userAllowlist: merged,
      onboardingComplete: true
    });

    if (statusEl) {
      statusEl.textContent = `Saved ${merged.length} domain(s) to your whitelist.`;
      statusEl.style.color = '#5cb85c';
    }

    // Notify background to reload the allowlist
    try {
      await chrome.runtime.sendMessage({ type: 'RELOAD_SETTINGS' });
    } catch {
      // Background may not have this handler yet — that's fine
    }

    // Swap the finish button to indicate done
    const btn = document.querySelector('.btn-success') as HTMLButtonElement | null;
    if (btn) {
      btn.textContent = 'Done!';
      btn.disabled = true;
      btn.style.opacity = '0.6';
    }
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = 'Failed to save. Try again.';
      statusEl.style.color = '#d9534f';
    }
  }
};

// Select-all toggles
document.addEventListener('change', (e) => {
  const target = e.target as HTMLInputElement;

  // Handle select-all checkboxes
  const selectAllGroup = target.dataset.selectAll;
  if (selectAllGroup) {
    // If the group is a page ID like "page-2", select all data-page checkboxes on that page
    // If it's a sub-group like "page-3-social", select all with that data-group
    const isPageLevel = /^page-\d+$/.test(selectAllGroup);
    const selector = isPageLevel
      ? `input[data-page="${selectAllGroup.replace('page-', '')}"]`
      : `input[data-group="${selectAllGroup}"]`;

    const checkboxes = document.querySelectorAll<HTMLInputElement>(selector);
    for (const cb of checkboxes) {
      cb.checked = target.checked;
    }
  }

  // Update select-all state when individual checkboxes change
  if (target.dataset.domain) {
    const group = target.dataset.group;
    const page = target.dataset.page;

    // Update sub-group select-all if applicable
    if (group) {
      updateSelectAll(group);
    }
    // Update page-level select-all
    if (page) {
      updateSelectAll(`page-${page}`);
    }
  }
});

function updateSelectAll(groupId: string): void {
  const selectAllCb = document.querySelector<HTMLInputElement>(
    `input[data-select-all="${groupId}"]`
  );
  if (!selectAllCb) return;

  const isPageLevel = /^page-\d+$/.test(groupId);
  const selector = isPageLevel
    ? `input[data-page="${groupId.replace('page-', '')}"]`
    : `input[data-group="${groupId}"]`;

  const checkboxes = document.querySelectorAll<HTMLInputElement>(selector);
  const allChecked = checkboxes.length > 0 && Array.from(checkboxes).every((cb) => cb.checked);
  selectAllCb.checked = allChecked;
}

// Initialize
showPage(1);
