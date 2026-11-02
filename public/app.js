const statusEl = document.getElementById('status');
// add near the top with other state
let dateFrom = null;
let dateTo = null;
let allTransactions = [];
let categoryChart = null;
let timeChart = null;
let categoryGroups = {};   // { Lifestyle: ['FOOD', ...], ... } from /api/categories
let rules = [];            // the user's own { id, keyword, category } rules

const UNKNOWN = 'unknown';

// "PEER_TRANSFERS" -> "Peer transfers", "unknown" -> "Unsorted"
function categoryLabel(category) {
  if (category === UNKNOWN) return 'Unsorted';
  if (category in categoryGroups) return category;
  const words = category.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// Which of the 4 main groups a category belongs to ("Unsorted" if none)
function groupOf(category) {
  if (category in categoryGroups) return category;
  for (const [group, cats] of Object.entries(categoryGroups)) {
    if (cats.includes(category)) return group;
  }
  return 'Unsorted';
}

// These two must match src/categories.js so match counts are accurate
function normaliseDesc(desc) {
  return ` ${desc.toUpperCase().replace(/[\\/]/g, ' ').replace(/\s+/g, ' ').trim()} `;
}
function normaliseKeyword(keyword) {
  return keyword.toUpperCase().replace(/[\\/]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401) {
    window.location.href = '/login.html';
    throw new Error('not signed in');
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}
// replace visibleTransactions()
function visibleTransactions() {
  return allTransactions.filter(t => {
    if (excluded.has(t.category)) return false;
    const d = t.date.slice(0, 10);
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    return true;
  });
}

// add after loadTransactions() is defined
function initDateRange() {
  const fromEl = document.getElementById('dateFrom');
  const toEl = document.getElementById('dateTo');
  const resetEl = document.getElementById('dateReset');

  fromEl.onchange = () => { dateFrom = fromEl.value || null; renderAll(); };
  toEl.onchange = () => { dateTo = toEl.value || null; renderAll(); };
  resetEl.onclick = () => {
    dateFrom = null;
    dateTo = null;
    fromEl.value = '';
    toEl.value = '';
    renderAll();
  };
}

// also set default range once transactions load, add inside loadTransactions() after allTransactions is set:
if (allTransactions.length) {
    const dates = allTransactions.map(t => t.date.slice(0, 10)).sort();
    document.getElementById('dateFrom').value = dates[0];
    document.getElementById('dateTo').value = dates[dates.length - 1];
    dateFrom = dates[0];
    dateTo = dates[dates.length - 1];
}


const excluded = new Set(JSON.parse(localStorage.getItem('excludedCategories') ?? '[]'));
Chart.register(ChartZoom);
function saveExclusions() {
  localStorage.setItem('excludedCategories', JSON.stringify([...excluded]));
}

function renderFilter() {
  const categories = [...new Set(allTransactions.map(t => t.category))].sort();
  const wrap = document.getElementById('categoryFilter');
  wrap.innerHTML = '';

  for (const category of categories) {
    const label = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = !excluded.has(category);
    box.onchange = () => {
      box.checked ? excluded.delete(category) : excluded.add(category);
      saveExclusions();
      renderAll();
    };
    label.append(box, document.createTextNode(categoryLabel(category)));
    wrap.append(label);
  }
}

function renderSummary(transactions) {
  const deposits = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const withdrawals = transactions.filter(t => t.amount < 0).reduce((s, t) => s - t.amount, 0);
  const net = deposits - withdrawals;

  document.getElementById('totalDeposits').textContent = deposits.toFixed(2);
  document.getElementById('totalWithdrawals').textContent = withdrawals.toFixed(2);
  document.getElementById('totalCount').textContent = transactions.length;

  const netEl = document.getElementById('totalNet');
  netEl.textContent = net.toFixed(2);
  netEl.className = 'value ' + (net < 0 ? 'negative' : 'positive');
}

function chartMode() {
  return document.querySelector('input[name="chartMode"]:checked').value;
}

function renderCategoryChart(transactions) {
  const byGroup = chartMode() === 'group';
  const totals = new Map();
  for (const t of transactions) {
    if (t.amount >= 0) continue;
    const key = byGroup ? groupOf(t.category) : categoryLabel(t.category);
    totals.set(key, (totals.get(key) ?? 0) - t.amount);
  }

  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const labels = sorted.map(([c]) => c);
  const values = sorted.map(([, v]) => v);
  const total = values.reduce((s, v) => s + v, 0);

  if (categoryChart) categoryChart.destroy();

  categoryChart = new Chart(document.getElementById('categoryChart'), {
    type: 'pie',
    data: { labels, datasets: [{ data: values }] },
    options: {
      plugins: {
        legend: { position: 'right' },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const pct = total ? (ctx.parsed / total * 100).toFixed(1) : '0.0';
              return `${ctx.label}: $${ctx.parsed.toFixed(2)} (${pct}%)`;
            },
          },
        },
      },
    },
    plugins: [{
      id: 'pieLabels',
      afterDatasetDraw(chart) {
        const { ctx, data } = chart;
        const dataset = data.datasets[0];
        const meta = chart.getDatasetMeta(0);
        const total = dataset.data.reduce((s, v) => s + v, 0);

        meta.data.forEach((arc, i) => {
          const value = dataset.data[i];
          const pct = total ? (value / total * 100) : 0;
          if (pct < 4) return; // skip tiny slices

          const { x, y } = arc.tooltipPosition();
          ctx.save();
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.shadowColor = 'rgba(0,0,0,0.5)';
          ctx.shadowBlur = 3;
          ctx.fillText(data.labels[i], x, y - 14);      // category name
          ctx.fillText(`$${value.toFixed(0)}`, x, y);    // dollar amount
          ctx.fillText(`${pct.toFixed(1)}%`, x, y + 14); // percentage
          ctx.restore();
        });
      }
    }],
  });
}

function renderTable(transactions) {
  const tbody = document.querySelector('#txTable tbody');
  tbody.innerHTML = '';
  const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date));
  for (const t of sorted) {
    const row = tbody.insertRow();
    row.insertCell().textContent = t.date.slice(0, 10);
    row.insertCell().textContent = t.description;
    const amountCell = row.insertCell();
    amountCell.textContent = t.amount.toFixed(2);
    amountCell.className = 'amount ' + (t.amount < 0 ? 'negative' : 'positive');
    renderCategoryCell(row.insertCell(), t);
  }
}

// Shows the category as a button; clicking swaps in a dropdown to set it by hand.
// (A dropdown per row up front would be hundreds of selects, so they're made on demand.)
function renderCategoryCell(cell, t) {
  cell.innerHTML = '';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'category-btn' + (t.category_locked ? ' locked' : '');
  btn.textContent = categoryLabel(t.category);
  btn.title = t.category_locked ? 'Set by hand. Click to change.' : 'Set by rules. Click to change.';
  btn.onclick = () => {
    const select = document.createElement('select');
    if (t.category_locked) select.add(new Option('↺ Back to automatic', '__auto'));
    if (t.category === UNKNOWN) select.add(new Option('Unsorted', UNKNOWN));
    for (const [group, cats] of Object.entries(categoryGroups)) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = group;
      optgroup.append(new Option(`${group} (general)`, group));
      for (const c of cats) optgroup.append(new Option(categoryLabel(c), c));
      select.add(optgroup);
    }
    select.value = t.category;

    select.onchange = async () => {
      if (select.value === t.category) return;
      const category = select.value === '__auto' ? null : select.value;
      try {
        Object.assign(t, await api(`/api/transactions/${t.uid}/category`, { method: 'PUT', body: { category } }));
        renderFilter();
        renderAll();
      } catch (err) {
        statusEl.textContent = 'failed: ' + err.message;
      }
    };
    select.onblur = () => renderCategoryCell(cell, t);
    cell.replaceChildren(select);
    select.focus();
  };
  cell.append(btn);
}

function renderAll() {
  const visible = visibleTransactions();
  renderSummary(visible);
  renderCategoryChart(visible);
  renderTimeChart(visible);
  renderTable(visible);
  renderSorter();
  renderRules();
}

document.getElementById('groupBy').onchange = renderAll;
document.getElementById('cumulative').onchange = renderAll;

for (const radio of document.querySelectorAll('input[name="chartMode"]')) {
  radio.checked = radio.value === (localStorage.getItem('chartMode') ?? 'group');
  radio.onchange = () => {
    localStorage.setItem('chartMode', radio.value);
    renderAll();
  };
}

async function loadTransactions() {
  [allTransactions, categoryGroups, rules] = await Promise.all([
    api('/api/transactions'),
    api('/api/categories'),
    api('/api/rules'),
  ]);
  renderFilter();
  renderAll();
}

document.getElementById('uploadForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const file = document.getElementById('fileInput').files[0];
  const formData = new FormData();
  formData.append('statement', file);

  statusEl.textContent = 'importing...';
  try {
    const res = await fetch('/api/import', { method: 'POST', body: formData });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error);

    statusEl.textContent =
      `${result.inserted} new, ${result.updated} already imported, ${result.rejected} rejected`;
    await loadTransactions();
  } catch (err) {
    statusEl.textContent = 'failed: ' + err.message;
  }
});


function bucketKey(date, groupBy) {
  const iso = date.slice(0, 10);            // YYYY-MM-DD
  if (groupBy === 'month') return iso.slice(0, 7);
  if (groupBy === 'day') return iso;

  // week: snap back to the Monday
  const d = new Date(iso);
  const day = (d.getUTCDay() + 6) % 7;      // Mon = 0
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

function renderTimeChart(transactions) {
  const groupBy = document.getElementById('groupBy').value;
  const cumulative = document.getElementById('cumulative').checked;

  const totals = new Map();
  for (const t of transactions) {
    if (t.amount >= 0) continue;            // spending only
    const key = bucketKey(t.date, groupBy);
    totals.set(key, (totals.get(key) ?? 0) - t.amount);
  }

  const labels = [...totals.keys()].sort();
  let values = labels.map(k => totals.get(k));

  if (cumulative) {
    let running = 0;
    values = values.map(v => (running += v));
  }

  if (timeChart) timeChart.destroy();

  timeChart = new Chart(document.getElementById('timeChart'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: cumulative ? 'Cumulative spending' : 'Spending',
        data: values,
        borderColor: '#c0392b',
        backgroundColor: 'rgba(192, 57, 43, 0.15)',
        fill: true,
        tension: 0.25,
        pointRadius: labels.length > 60 ? 0 : 3,
      }],
    },
    options: {
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, ticks: { callback: (v) => v.toFixed(0) } },
        x: { ticks: { maxRotation: 60, autoSkip: true } },
      },
      plugins: {
        zoom: {
        pan: { enabled: true, mode: 'x', modifierKey: 'ctrl' },
        zoom: {
            wheel: { enabled: true },
            pinch: { enabled: true },
            drag: { enabled: true, backgroundColor: 'rgba(192, 57, 43, 0.15)' },
            mode: 'x',
        },
        limits: { x: { minRange: 3 } },
        },
        legend: { display: false },
        tooltip: {
          callbacks: { label: (ctx) => ctx.parsed.y.toFixed(2) },
        },
      },
    },
  });
}
document.getElementById('resetZoom').onclick = () => timeChart?.resetZoom();

document.getElementById('clearBtn').addEventListener('click', async () => {
  if (!confirm('Delete all transactions? This cannot be undone.')) return;

  statusEl.textContent = 'clearing...';
  try {
    const res = await fetch('/api/clear', { method: 'POST' });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error);

    statusEl.textContent = `deleted ${result.deleted} transactions`;
    await loadTransactions();
  } catch (err) {
    statusEl.textContent = 'failed: ' + err.message;
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/login.html';
});
async function loadUser() {
  const res = await fetch('/api/me');
  if (res.ok) {
    const user = await res.json();
    document.getElementById('navUser').textContent = user.username;
  }
}
// --- sorting unknowns ---

// Strips bank/payment-processor noise so the same shop groups together:
// "VISA DEBIT PURCHASE CARD 1234 SQ *BONFIRE PIZZA KOGARAH" -> "BONFIRE PIZZA KOGARAH"
function merchantName(desc) {
  return normaliseDesc(desc).trim()
    .replace(/^VISA DEBIT (PURCHASE|DEPOSIT) CARD \d+ /, '')
    .replace(/^EFTPOS /, '')
    .replace(/^(SQ \*|KPAY\*|KPY\*|ZLR\*|LS |LIVE PAYMENTS\*|PAYPAL \*|TS )/, '')
    .replace(/ AU$/, '')
    .replace(/ \d{5,}$/, '');
}

// First two words usually name the shop without the suburb ("ME COFFEE", "APW FUEL").
// Short first words ("I LOVE PHO", "EL JANNAH") get a third word.
function suggestKeyword(name) {
  const words = name.split(' ');
  return words.slice(0, words[0].length <= 2 ? 3 : 2).join(' ');
}

const skippedMerchants = new Set(JSON.parse(sessionStorage.getItem('skippedMerchants') ?? '[]'));
let sorterHidden = sessionStorage.getItem('sorterHidden') === '1';
let sorterCurrent = null;   // the merchant group currently shown
let sorterGroup = null;     // main group picked, waiting on a detailed pick

// Unsorted transactions grouped by shop, most frequent (then biggest spend) first
function unsortedMerchants() {
  const byName = new Map();
  for (const t of allTransactions) {
    if (t.category !== UNKNOWN) continue;
    const name = merchantName(t.description);
    if (!byName.has(name)) byName.set(name, { name, transactions: [], total: 0 });
    const m = byName.get(name);
    m.transactions.push(t);
    m.total += t.amount;
  }
  return [...byName.values()].sort((a, b) =>
    b.transactions.length - a.transactions.length || Math.abs(b.total) - Math.abs(a.total)
  );
}

function renderSorter() {
  const sorter = document.getElementById('sorter');
  const openBtn = document.getElementById('sorterOpen');
  const merchants = unsortedMerchants();
  const remaining = merchants.filter(m => !skippedMerchants.has(m.name));

  openBtn.hidden = !sorterHidden || merchants.length === 0;
  openBtn.textContent = `Sort ${merchants.length} unsorted shop${merchants.length === 1 ? '' : 's'}`;
  sorter.hidden = sorterHidden || merchants.length === 0;
  if (sorter.hidden) return;

  document.getElementById('sorterProgress').textContent =
    `${merchants.length} shop${merchants.length === 1 ? '' : 's'} left` +
    (skippedMerchants.size ? ` (${merchants.length - remaining.length} skipped)` : '');

  const body = document.getElementById('sorterBody');
  if (remaining.length === 0) {
    body.hidden = true;
    document.getElementById('sorterStatus').textContent = '';
    showSorterMessage('You skipped the rest. ', 'Start over', () => {
      skippedMerchants.clear();
      sessionStorage.removeItem('skippedMerchants');
      document.getElementById('sorterSaved').hidden = true;
      renderSorter();
    });
    return;
  }
  body.hidden = false;

  // Keep showing the same shop across re-renders unless it's been sorted
  const keep = sorterCurrent && remaining.find(m => m.name === sorterCurrent.name);
  const isNew = !keep;
  sorterCurrent = keep ?? remaining[0];
  if (isNew) sorterGroup = null;

  const m = sorterCurrent;
  const spend = m.total < 0 ? `$${(-m.total).toFixed(2)} spent` : `$${m.total.toFixed(2)} received`;
  document.getElementById('sorterName').textContent = m.name;
  document.getElementById('sorterMeta').textContent =
    `${m.transactions.length} transaction${m.transactions.length === 1 ? '' : 's'} · ${spend}`;

  const examples = document.getElementById('sorterExamples');
  examples.innerHTML = '';
  for (const t of m.transactions.slice(0, 3)) {
    const li = document.createElement('li');
    li.textContent = `${t.date.slice(0, 10)}  ${t.description}  ${t.amount.toFixed(2)}`;
    examples.append(li);
  }

  const keywordEl = document.getElementById('sorterKeyword');
  if (isNew) keywordEl.value = suggestKeyword(m.name);
  keywordEl.oninput = renderSorterMatches;
  renderSorterMatches();
  renderSorterChoices();
}

// Live preview of what the keyword would catch
function renderSorterMatches() {
  const keyword = normaliseKeyword(document.getElementById('sorterKeyword').value);
  const el = document.getElementById('sorterMatches');
  if (keyword.length < 2) {
    el.textContent = 'Type at least 2 characters.';
    el.className = 'warn';
    return;
  }
  let unsorted = 0, sorted = 0;
  for (const t of allTransactions) {
    if (!normaliseDesc(t.description).includes(keyword)) continue;
    if (t.category === UNKNOWN) unsorted++;
    else if (!t.category_locked) sorted++;
  }
  el.textContent = `Matches ${unsorted} unsorted transaction${unsorted === 1 ? '' : 's'}` +
    (sorted ? `, and will re-sort ${sorted} already sorted` : '') +
    (unsorted === 0 ? ' (none from this shop, so check the keyword)' : '');
  el.className = unsorted === 0 || sorted > 0 ? 'warn' : '';
}

function renderSorterChoices() {
  const groupsEl = document.getElementById('sorterGroups');
  const subsEl = document.getElementById('sorterSubs');
  groupsEl.innerHTML = '';
  for (const group of Object.keys(categoryGroups)) {
    const btn = chip(group, () => {
      sorterGroup = group;
      renderSorterChoices();
    });
    if (group === sorterGroup) btn.classList.add('active');
    groupsEl.append(btn);
  }

  subsEl.hidden = !sorterGroup;
  subsEl.innerHTML = '';
  if (!sorterGroup) return;
  for (const category of categoryGroups[sorterGroup]) {
    subsEl.append(chip(categoryLabel(category), () => saveSorterRule(category)));
  }
  const general = chip(`Just ${sorterGroup}`, () => saveSorterRule(sorterGroup));
  general.classList.add('general');
  subsEl.append(general);
}

function chip(text, onclick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'chip';
  btn.textContent = text;
  btn.onclick = onclick;
  return btn;
}

async function saveSorterRule(category) {
  const keyword = normaliseKeyword(document.getElementById('sorterKeyword').value);
  const statusEl = document.getElementById('sorterStatus');
  const previous = rules.find(r => r.keyword === keyword);
  statusEl.textContent = 'saving...';
  try {
    const { changed } = await api('/api/rules', { method: 'POST', body: { keyword, category } });
    statusEl.textContent = '';
    await loadTransactions();
    const saved = rules.find(r => r.keyword === keyword);
    showSorterMessage(
      `Saved: "${keyword}" → ${categoryLabel(category)} (${changed} updated). `,
      'Undo',
      async () => {
        // Undo puts back the rule this replaced, or removes the new one
        if (previous) {
          await api('/api/rules', { method: 'POST', body: { keyword, category: previous.category } });
        } else if (saved) {
          await api(`/api/rules/${saved.id}`, { method: 'DELETE' });
        }
        document.getElementById('sorterSaved').hidden = true;
        await loadTransactions();
      }
    );
  } catch (err) {
    statusEl.textContent = 'failed: ' + err.message;
  }
}

function showSorterMessage(text, actionText, action) {
  const el = document.getElementById('sorterSaved');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'link';
  btn.textContent = actionText;
  btn.onclick = action;
  el.replaceChildren(document.createTextNode(text), btn);
  el.hidden = false;
}

document.getElementById('sorterSkip').onclick = () => {
  skippedMerchants.add(sorterCurrent.name);
  sessionStorage.setItem('skippedMerchants', JSON.stringify([...skippedMerchants]));
  document.getElementById('sorterSaved').hidden = true;
  renderSorter();
};

document.getElementById('sorterHide').onclick = () => {
  sorterHidden = true;
  sessionStorage.setItem('sorterHidden', '1');
  renderSorter();
};

document.getElementById('sorterOpen').onclick = () => {
  sorterHidden = false;
  sessionStorage.removeItem('sorterHidden');
  renderSorter();
};

// --- rules list ---

function categoryTarget(category) {
  const group = groupOf(category);
  return group === category ? group : `${group} › ${categoryLabel(category)}`;
}

// Fills the "Add keyword" category dropdown (only once the groups have loaded)
function renderRuleCategoryOptions() {
  const select = document.getElementById('ruleCategory');
  if (select.options.length) return;
  select.add(new Option('Pick a category', ''));
  for (const [group, cats] of Object.entries(categoryGroups)) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = group;
    optgroup.append(new Option(`${group} (general)`, group));
    for (const c of cats) optgroup.append(new Option(categoryLabel(c), c));
    select.add(optgroup);
  }
}

function renderRules() {
  renderRuleCategoryOptions();
  document.getElementById('rulesCount').textContent = rules.length;

  const search = normaliseKeyword(document.getElementById('ruleSearch').value);
  const shown = rules.filter(r =>
    !search || r.keyword.includes(search) || categoryTarget(r.category).toUpperCase().includes(search)
  );

  const list = document.getElementById('rulesList');
  list.innerHTML = '';
  if (rules.length === 0) {
    list.innerHTML = '<li class="muted">No keywords yet. Add one above, or sort shops in the card above.</li>';
  }
  for (const rule of shown) {
    const li = document.createElement('li');
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'link';
    del.textContent = 'remove';
    del.onclick = async () => {
      try {
        await api(`/api/rules/${rule.id}`, { method: 'DELETE' });
        await loadTransactions();
      } catch (err) {
        statusEl.textContent = 'failed: ' + err.message;
      }
    };
    const keyword = document.createElement('code');
    keyword.textContent = rule.keyword.trim();
    const wholeWord = rule.keyword !== rule.keyword.trim() ? ' (whole word)' : '';
    li.append(keyword, document.createTextNode(`${wholeWord} → ${categoryTarget(rule.category)} `), del);
    list.append(li);
  }
}

document.getElementById('ruleSearch').oninput = renderRules;

document.getElementById('ruleForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const statusEl = document.getElementById('ruleStatus');
  const keywordEl = document.getElementById('ruleKeyword');
  const body = {
    keyword: keywordEl.value,
    category: document.getElementById('ruleCategory').value,
    wholeWord: document.getElementById('ruleWholeWord').checked,
  };
  statusEl.textContent = 'saving...';
  try {
    const { changed } = await api('/api/rules', { method: 'POST', body });
    statusEl.textContent = `Saved, ${changed} transaction${changed === 1 ? '' : 's'} re-sorted.`;
    keywordEl.value = '';
    await loadTransactions();
  } catch (err) {
    statusEl.textContent = 'failed: ' + err.message;
  }
});

loadUser();
loadTransactions();
initDateRange()