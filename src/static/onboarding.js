"use strict";

let currentStep = 1;
let selectedMode = 'balanced';
let customDomains = [];

const progressMap = { 1: 20, 2: 40, 3: 60, 4: 80, 5: 100 };

function goTo(step) {
  document.getElementById('step-' + currentStep).classList.remove('active');
  currentStep = step;
  document.getElementById('step-' + currentStep).classList.add('active');
  document.getElementById('progress').style.width = progressMap[step] + '%';
  if (step === 5) buildSummary();
  window.scrollTo(0, 0);
}

function toggleGroup(id) {
  document.getElementById('group-' + id).classList.toggle('open');
}

function toggleMaster(corp) {
  const master = document.getElementById('master-' + corp);
  document.querySelectorAll('.corp-domain[data-corp="' + corp + '"]').forEach(d => {
    d.checked = master.checked;
  });
}

function selectMode(mode) {
  ['balanced', 'strict', 'permissive'].forEach(m => {
    document.getElementById('mode-' + m).classList.remove('selected');
  });
  document.getElementById('mode-' + mode).classList.add('selected');
  selectedMode = mode;
}

function addCustom() {
  const input = document.getElementById('custom-domain');
  const val = input.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (!val || customDomains.includes(val)) { input.value = ''; return; }
  customDomains.push(val);
  renderCustomTags();
  input.value = '';
}

function removeCustom(domain) {
  customDomains = customDomains.filter(d => d !== domain);
  renderCustomTags();
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderCustomTags() {
  const container = document.getElementById('custom-tags');
  container.innerHTML = customDomains.map(d => {
    const safe = escapeHtml(d);
    return '<div class="custom-tag">' + safe +
      '<button type="button" data-action="remove-custom" data-domain="' + safe + '">×</button></div>';
  }).join('');
}

function getAllowlist() {
  const checked = Array.from(document.querySelectorAll('.corp-domain:checked'))
    .map(cb => {
      const label = cb.parentElement.querySelector('label');
      if (!label) return '';
      return label.textContent.split('\n')[0].trim().split(' ')[0];
    })
    .filter(Boolean);
  return Array.from(new Set([...checked, ...customDomains]));
}

function buildSummary() {
  const allowlist = getAllowlist();
  const gbm = document.getElementById('toggle-gbm').checked;
  const persona = document.getElementById('toggle-persona').checked;
  const regen = document.getElementById('toggle-regen').checked;

  document.getElementById('done-summary').innerHTML =
    '<div class="summary-row"><span class="summary-label">Policy Mode</span><span class="summary-value">' +
      escapeHtml(selectedMode.charAt(0).toUpperCase() + selectedMode.slice(1)) + '</span></div>' +
    '<div class="summary-row"><span class="summary-label">Safe List</span><span class="summary-value">' +
      allowlist.length + ' domains allowlisted</span></div>' +
    '<div class="summary-row"><span class="summary-label">Gingerbread Men Mode</span><span class="summary-value">' +
      (gbm ? '✓ Active' : '✗ Off') + '</span></div>' +
    '<div class="summary-row"><span class="summary-label">Uniform Persona Mode</span><span class="summary-value">' +
      (persona ? '✓ Active' : '✗ Off') + '</span></div>' +
    '<div class="summary-row"><span class="summary-label">Regenerative Cookie Shield</span><span class="summary-value">' +
      (regen ? '✓ Active' : '✗ Off') + '</span></div>';
}

function finishSetup() {
  const allowlist = getAllowlist();
  const settings = {
    onboardingComplete: true,
    userAllowlist: allowlist,
    allowlist: allowlist,
    mode: selectedMode,
    gingerbreadManEnabled: document.getElementById('toggle-gbm').checked,
    uniformPersona: document.getElementById('toggle-persona').checked,
    regenShield: document.getElementById('toggle-regen').checked,
  };
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set(settings, () => {
      try { chrome.runtime && chrome.runtime.sendMessage({ type: 'RELOAD_SETTINGS' }); } catch (_) {}
      window.close();
    });
  } else {
    console.log('Settings:', settings);
  }
}

document.addEventListener('click', (e) => {
  const target = e.target instanceof Element ? e.target : null;
  if (!target) return;
  const actionEl = target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.getAttribute('data-action');

  switch (action) {
    case 'goto': {
      const step = parseInt(actionEl.getAttribute('data-step') || '1', 10);
      goTo(step);
      break;
    }
    case 'toggle-group': {
      toggleGroup(actionEl.getAttribute('data-corp'));
      break;
    }
    case 'toggle-master': {
      e.stopPropagation();
      toggleMaster(actionEl.getAttribute('data-corp'));
      break;
    }
    case 'select-mode': {
      selectMode(actionEl.getAttribute('data-mode'));
      break;
    }
    case 'add-custom': {
      addCustom();
      break;
    }
    case 'remove-custom': {
      removeCustom(actionEl.getAttribute('data-domain'));
      break;
    }
    case 'finish': {
      finishSetup();
      break;
    }
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target && e.target.id === 'custom-domain') {
    e.preventDefault();
    addCustom();
  }
});
