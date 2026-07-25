const statusEl = document.getElementById('status');

let categoryChart = null;
let allTransactions = [];
const excluded = new Set(JSON.parse(localStorage.getItem('excludedCategories') ?? '[]'));
Chart.register(ChartZoom);
function saveExclusions() {
  localStorage.setItem('excludedCategories', JSON.stringify([...excluded]));
}

function visibleTransactions() {
  return allTransactions.filter(t => !excluded.has(t.category));
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
    label.append(box, document.createTextNode(category));
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

function renderCategoryChart(transactions) {
  const totals = new Map();
  for (const t of transactions) {
    if (t.amount >= 0) continue;               // spending only
    totals.set(t.category, (totals.get(t.category) ?? 0) - t.amount);
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
              return `${ctx.label}: ${ctx.parsed.toFixed(2)} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

function renderTable(transactions) {
  const tbody = document.querySelector('#txTable tbody');
  tbody.innerHTML = '';
  for (const t of transactions) {
    const row = tbody.insertRow();
    row.insertCell().textContent = t.date.slice(0, 10);
    row.insertCell().textContent = t.description;
    const amountCell = row.insertCell();
    amountCell.textContent = t.amount.toFixed(2);
    amountCell.className = 'amount ' + (t.amount < 0 ? 'negative' : 'positive');
    row.insertCell().textContent = t.category;
  }
}

function renderAll() {
  const visible = visibleTransactions();
  renderSummary(visible);
  renderCategoryChart(visible);
  renderTimeChart(visible);
  renderTable(visible);
}

document.getElementById('groupBy').onchange = renderAll;
document.getElementById('cumulative').onchange = renderAll;

async function loadTransactions() {
  const res = await fetch('/api/transactions');
  allTransactions = await res.json();
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
      `${result.inserted} new, ${result.skipped} duplicates, ${result.rejected} rejected`;
    await loadTransactions();
  } catch (err) {
    statusEl.textContent = 'failed: ' + err.message;
  }
});
let timeChart = null;

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

loadTransactions();