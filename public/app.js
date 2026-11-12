/**
 * News Agent — Frontend Logic
 */

const state = {
  provider: 'claude',
  model: '',
  providersConfig: {},
  apiKeys: {
    claude: localStorage.getItem('na_key_claude') || '',
    openai: localStorage.getItem('na_key_openai') || '',
    openrouter: localStorage.getItem('na_key_openrouter') || ''
  },
  articleLimit: parseInt(localStorage.getItem('na_limit') || '15', 10),
  customFeed: localStorage.getItem('na_custom_feed') || '',
  currentArticles: [],
  currentAnalysisMarkdown: '',
  isProcessing: false,
  timerInterval: null,
  timerSeconds: 0
};

const $ = (id) => document.getElementById(id);

const el = {
  providerBtns: document.querySelectorAll('.prov-btn'),
  modelSelect: $('modelSelect'),
  settingsBtn: $('btnOpenSettings'),
  settingsIndicator: $('settingsIndicator'),
  searchForm: $('newsSearchForm'),
  topicInput: $('topicInput'),
  btnClear: $('btnClearTopic'),
  btnSubmit: $('btnSubmitSearch'),
  btnRss: $('btnPreviewRss'),
  chips: $('topicChips'),
  pipeline: $('agentPipeline'),
  statusText: $('statusText'),
  timer: $('pipelineTimer'),
  results: $('resultsSection'),
  tabBtns: document.querySelectorAll('.tab'),
  tabPanes: document.querySelectorAll('.tab-pane'),
  briefing: $('briefingContent'),
  metaTopic: $('metaTopic'),
  metaProvider: $('metaProvider'),
  metaFeeds: $('metaFeedsCount'),
  metaBadge: $('metaStatusBadge'),
  sourcesGrid: $('sourcesGrid'),
  sourceCount: $('sourceCountBadge'),
  auditBox: $('auditPromptBox'),
  btnCopy: $('btnCopyReport'),
  copyText: $('copyReportText'),
  btnPrint: $('btnPrintReport'),
  modal: $('settingsModal'),
  btnCloseModal: $('btnCloseSettings'),
  btnSave: $('btnSaveSettings'),
  btnClearKeys: $('btnClearSavedKeys'),
  keyInputs: { claude: $('inputClaudeKey'), openai: $('inputOpenAIKey'), openrouter: $('inputOpenRouterKey') },
  keyStatus: { claude: $('statusClaudeKey'), openai: $('statusOpenAIKey'), openrouter: $('statusOpenRouterKey') },
  limitSelect: $('inputArticleLimit'),
  customFeedInput: $('inputCustomFeed')
};

// Init
async function init() {
  bindEvents();
  loadSettings();
  await fetchProviders();
}

async function fetchProviders() {
  try {
    const res = await fetch('/api/providers');
    const data = await res.json();
    state.providersConfig = data.providers || {};
    const saved = localStorage.getItem('na_provider');
    if (saved) state.provider = saved;
    else if (data.defaultProvider) state.provider = data.defaultProvider;
    updateProviderUI();
    updateKeyStatuses();
  } catch (e) { console.error(e); }
}

function updateProviderUI() {
  el.providerBtns.forEach(b => b.classList.toggle('active', b.dataset.provider === state.provider));
  const cfg = state.providersConfig[state.provider];
  el.modelSelect.innerHTML = '';
  if (cfg?.models) {
    cfg.models.forEach(m => {
      const o = document.createElement('option');
      o.value = m.id; o.textContent = m.name;
      el.modelSelect.appendChild(o);
    });
    const saved = localStorage.getItem(`na_model_${state.provider}`);
    if (saved && cfg.models.some(m => m.id === saved)) { el.modelSelect.value = saved; state.model = saved; }
    else { el.modelSelect.value = cfg.defaultModel; state.model = cfg.defaultModel; }
  }
}

function updateKeyStatuses() {
  let any = false;
  ['claude','openai','openrouter'].forEach(p => {
    const cfg = state.providersConfig[p] || {};
    const has = Boolean(state.apiKeys[p]) || Boolean(cfg.hasServerKey);
    if (has) any = true;
    const badge = el.keyStatus[p];
    if (badge) {
      badge.textContent = state.apiKeys[p] ? '● session' : cfg.hasServerKey ? '● .env' : '';
      badge.className = 'field-badge' + (has ? ' active' : '');
    }
  });
  el.settingsIndicator.style.display = any ? 'block' : 'none';
}

function loadSettings() {
  el.limitSelect.value = state.articleLimit.toString();
}

function bindEvents() {
  el.providerBtns.forEach(b => b.addEventListener('click', () => {
    state.provider = b.dataset.provider;
    localStorage.setItem('na_provider', state.provider);
    updateProviderUI();
  }));

  el.modelSelect.addEventListener('change', e => {
    state.model = e.target.value;
    localStorage.setItem(`na_model_${state.provider}`, state.model);
  });

  el.topicInput.addEventListener('input', () => {
    el.btnClear.style.display = el.topicInput.value ? 'block' : 'none';
  });

  el.btnClear.addEventListener('click', () => {
    el.topicInput.value = '';
    el.btnClear.style.display = 'none';
    el.topicInput.focus();
  });

  el.searchForm.addEventListener('submit', e => {
    e.preventDefault();
    const q = el.topicInput.value.trim();
    if (q) runAgent(q);
  });

  el.btnRss.addEventListener('click', () => {
    const q = el.topicInput.value.trim();
    if (q) fetchRssOnly(q);
    else el.topicInput.focus();
  });

  el.chips.addEventListener('click', e => {
    const c = e.target.closest('.chip');
    if (!c) return;
    el.topicInput.value = c.dataset.topic;
    el.btnClear.style.display = 'block';
    runAgent(c.dataset.topic);
  });

  el.tabBtns.forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

  el.btnCopy.addEventListener('click', () => {
    if (!state.currentAnalysisMarkdown) return;
    navigator.clipboard.writeText(state.currentAnalysisMarkdown).then(() => {
      el.copyText.textContent = 'Copied!';
      setTimeout(() => el.copyText.textContent = 'Copy', 1500);
    });
  });

  el.btnPrint.addEventListener('click', () => window.print());

  el.settingsBtn.addEventListener('click', openModal);
  el.btnCloseModal.addEventListener('click', closeModal);
  el.modal.addEventListener('click', e => { if (e.target === el.modal) closeModal(); });
  el.btnSave.addEventListener('click', saveSettings);
  el.btnClearKeys.addEventListener('click', clearKeys);

  document.addEventListener('click', e => {
    const b = e.target.closest('.citation-badge');
    if (b) highlightSource(b.dataset.ref);
  });
}

function switchTab(tab) {
  el.tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  el.tabPanes.forEach(p => p.classList.toggle('active', p.id === `tabPane${tab.charAt(0).toUpperCase() + tab.slice(1)}`));
}

// Timer
function startTimer() {
  state.timerSeconds = 0;
  el.timer.textContent = '00:00';
  clearInterval(state.timerInterval);
  state.timerInterval = setInterval(() => {
    state.timerSeconds++;
    const m = String(Math.floor(state.timerSeconds / 60)).padStart(2, '0');
    const s = String(state.timerSeconds % 60).padStart(2, '0');
    el.timer.textContent = `${m}:${s}`;
  }, 1000);
}

function stopTimer() { clearInterval(state.timerInterval); }

// Agent execution
async function runAgent(topic) {
  if (state.isProcessing) return;
  state.isProcessing = true;
  el.btnSubmit.disabled = true;

  // Reset UI
  state.currentAnalysisMarkdown = '';
  el.pipeline.style.display = 'flex';
  el.pipeline.className = 'status-bar';
  el.statusText.textContent = `Searching RSS for "${topic}"…`;
  el.results.style.display = 'block';
  switchTab('briefing');
  el.briefing.innerHTML = '<p class="muted">Waiting for stream…</p>';
  el.sourcesGrid.innerHTML = '';
  el.sourceCount.textContent = '0';
  el.auditBox.textContent = '';

  const cfg = state.providersConfig[state.provider] || {};
  const model = state.model || cfg.defaultModel || '';
  el.metaTopic.textContent = topic;
  el.metaProvider.textContent = `${cfg.name || state.provider} · ${model}`;
  el.metaFeeds.textContent = '…';
  el.metaBadge.textContent = 'Running';
  el.metaBadge.className = 'status-badge';

  startTimer();

  try {
    const resp = await fetch('/api/agent/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic, provider: state.provider, model,
        apiKey: state.apiKeys[state.provider] || '',
        limit: state.articleLimit,
        customFeeds: state.customFeed ? [state.customFeed] : []
      })
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop();
      for (const part of parts) {
        if (!part.trim()) continue;
        const evMatch = part.match(/^event:\s*(.+)$/m);
        const dataMatch = part.match(/^data:\s*(.+)$/m);
        if (dataMatch) {
          try { handleEvent(evMatch?.[1]?.trim() || 'message', JSON.parse(dataMatch[1])); }
          catch (e) { /* skip bad json */ }
        }
      }
    }
  } catch (err) {
    el.briefing.innerHTML = `<p style="color:var(--red);">Error: ${esc(err.message)}</p>`;
    el.metaBadge.textContent = 'Error';
    el.metaBadge.className = 'status-badge error';
  } finally {
    state.isProcessing = false;
    el.btnSubmit.disabled = false;
    stopTimer();
  }
}

function handleEvent(type, data) {
  if (type === 'status') {
    if (data.stage === 'rss_fetching') {
      el.statusText.textContent = data.message;
    } else if (data.stage === 'rss_completed') {
      state.currentArticles = data.articles || [];
      el.metaFeeds.textContent = `${state.currentArticles.length} sources`;
      el.statusText.textContent = `${state.currentArticles.length} articles found — synthesizing…`;
      renderSources(state.currentArticles);
      renderAudit(state.currentArticles);
    } else if (data.stage === 'llm_starting') {
      el.statusText.textContent = `Generating with ${data.provider}…`;
      el.briefing.innerHTML = '<p class="muted">Streaming…</p>';
    }
  } else if (type === 'chunk') {
    state.currentAnalysisMarkdown += data.text;
    renderBriefing(state.currentAnalysisMarkdown);
  } else if (type === 'done') {
    el.pipeline.className = 'status-bar done';
    el.statusText.textContent = 'Complete';
    el.metaBadge.textContent = 'Done';
    el.metaBadge.className = 'status-badge done';
  } else if (type === 'error') {
    el.briefing.innerHTML += `<p style="color:var(--red);">${esc(data.message)}</p>`;
    el.metaBadge.textContent = 'Error';
    el.metaBadge.className = 'status-badge error';
  }
}

function renderBriefing(md) {
  let html = typeof marked !== 'undefined' ? marked.parse(md) : `<pre>${md}</pre>`;
  html = html.replace(/\[(\d+(?:,\s*\d+)*)\]/g, (_, refs) => {
    return refs.split(',').map(r => r.trim()).map(r =>
      `<button type="button" class="citation-badge" data-ref="${r}">[${r}]</button>`
    ).join(' ');
  });
  el.briefing.innerHTML = html;
}

function renderSources(articles) {
  el.sourceCount.textContent = articles.length;
  el.sourcesGrid.innerHTML = '';
  if (!articles.length) { el.sourcesGrid.innerHTML = '<p class="muted" style="padding:16px;">No articles.</p>'; return; }
  articles.forEach(a => {
    const div = document.createElement('div');
    div.className = 'source-item';
    div.id = `src-${a.refIndex}`;
    div.innerHTML = `
      <span class="source-ref">[${a.refIndex}]</span>
      <div class="source-body">
        <div class="source-title">${esc(a.title)}</div>
        <div class="source-meta">
          <span>${esc(a.publisher)}</span>
          <span>${esc(a.formattedDate)}</span>
        </div>
      </div>
      <a href="${esc(a.link)}" target="_blank" rel="noopener" class="source-link">↗</a>
    `;
    el.sourcesGrid.appendChild(div);
  });
}

function highlightSource(ref) {
  switchTab('sources');
  const card = $(`src-${ref}`);
  if (!card) return;
  document.querySelectorAll('.source-item').forEach(c => c.classList.remove('highlighted'));
  card.classList.add('highlighted');
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => card.classList.remove('highlighted'), 2500);
}

function renderAudit(articles) {
  el.auditBox.textContent = articles.map(a =>
    `[${a.refIndex}] ${a.title}\n    ${a.publisher} · ${a.formattedDate}\n    ${a.link}`
  ).join('\n\n');
}

async function fetchRssOnly(topic) {
  el.btnRss.disabled = true;
  el.results.style.display = 'block';
  el.pipeline.style.display = 'none';
  switchTab('sources');
  try {
    const r = await fetch('/api/news/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, limit: state.articleLimit, customFeeds: state.customFeed ? [state.customFeed] : [] })
    });
    const data = await r.json();
    state.currentArticles = data.articles || [];
    renderSources(state.currentArticles);
    renderAudit(state.currentArticles);
    el.metaTopic.textContent = topic;
    el.metaProvider.textContent = 'RSS only';
    el.metaFeeds.textContent = `${state.currentArticles.length} sources`;
    el.metaBadge.textContent = 'Done';
    el.metaBadge.className = 'status-badge done';
  } catch (e) { alert(e.message); }
  finally { el.btnRss.disabled = false; }
}

// Settings modal
function openModal() {
  el.keyInputs.claude.value = state.apiKeys.claude;
  el.keyInputs.openai.value = state.apiKeys.openai;
  el.keyInputs.openrouter.value = state.apiKeys.openrouter;
  el.limitSelect.value = state.articleLimit.toString();
  el.customFeedInput.value = state.customFeed;
  el.modal.style.display = 'flex';
}

function closeModal() { el.modal.style.display = 'none'; }

function saveSettings() {
  ['claude','openai','openrouter'].forEach(p => {
    state.apiKeys[p] = el.keyInputs[p].value.trim();
    localStorage.setItem(`na_key_${p}`, state.apiKeys[p]);
  });
  state.articleLimit = parseInt(el.limitSelect.value, 10);
  state.customFeed = el.customFeedInput.value.trim();
  localStorage.setItem('na_limit', state.articleLimit);
  localStorage.setItem('na_custom_feed', state.customFeed);
  updateKeyStatuses();
  closeModal();
}

function clearKeys() {
  ['claude','openai','openrouter'].forEach(p => {
    state.apiKeys[p] = '';
    localStorage.removeItem(`na_key_${p}`);
    el.keyInputs[p].value = '';
  });
  updateKeyStatuses();
}

function esc(t = '') { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

document.addEventListener('DOMContentLoaded', init);
