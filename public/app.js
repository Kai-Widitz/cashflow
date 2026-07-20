const statusEl = document.getElementById('status');

async function loadTransactions() {
  const res = await fetch('/api/transactions');
  const transactions = await res.json();

  const tbody = document.querySelector('#txTable tbody');
  tbody.innerHTML = '';
  for (const t of transactions) {
    const row = tbody.insertRow();
    row.insertCell().textContent = t.date.slice(0, 10);
    row.insertCell().textContent = t.description;
    const amountCell = row.insertCell();
    amountCell.textContent = t.amount.toFixed(2);
    amountCell.className = 'amount' + (t.amount < 0 ? ' negative' : '');
    row.insertCell().textContent = t.category;
  }
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

loadTransactions();