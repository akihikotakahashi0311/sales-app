function renderLeads() {
  const q  = (document.getElementById('lead-search')?.value||'').toLowerCase();
  const sf = document.getElementById('lead-status-filter')?.value||'';

  let filtered = db.leads.filter(l =>
    (!q  || l.company.toLowerCase().includes(q) || (l.name||'').toLowerCase().includes(q) || (l.source||'').toLowerCase().includes(q)) &&
    (!sf || l.status === sf)
  );

  // ソート適用
  filtered = [...filtered].sort((a, b) => {
    const va = a[leadSortKey] ?? '';
    const vb = b[leadSortKey] ?? '';
    if(typeof va === 'number') return (va - vb) * leadSortDir;
    return String(va).localeCompare(String(vb), 'ja') * leadSortDir;
  });
  // BUG-15対策: 1000件超でブラウザがフリーズするため、リード一覧も上限500件
  const LEAD_LIST_LIMIT = 500;
  const _leadAll = filtered;
  const _leadTruncated = _leadAll.length > LEAD_LIST_LIMIT;
  if(_leadTruncated) filtered = _leadAll.slice(0, LEAD_LIST_LIMIT);

  const total = db.leads.length;
  const conv = db.leads.filter(l=>l.status==='案件化').length;
  document.getElementById('lead-metrics').innerHTML = `
    <div class="metric-card blue"><div class="metric-label">総リード数</div><div class="metric-value">${total}${_leadTruncated?'<span style="font-size:10px;color:var(--amber);margin-left:4px;">(上位'+LEAD_LIST_LIMIT+'件のみ表示)</span>':''}</div></div>
    <div class="metric-card green"><div class="metric-label">案件化数</div><div class="metric-value">${conv}</div></div>
    <div class="metric-card amber"><div class="metric-label">案件化率</div><div class="metric-value">${total?Math.round(conv/total*100):0}%</div></div>
    <div class="metric-card purple"><div class="metric-label">今月新規</div><div class="metric-value">${db.leads.filter(l=>l.date&&l.date.startsWith(currentMonth)).length}件</div></div>
  `;
  selectedLeads.clear();
  document.getElementById('lead-bulk-bar')?.classList.remove('show');
  const ldSel = document.getElementById('lead-select-all');
  if(ldSel){ ldSel.checked = false; ldSel.indeterminate = false; }
  document.getElementById('leads-tbody').innerHTML = filtered.length ? filtered.map(l=>`
    <tr id="lead-row-${_h(l.id)}">
      <td class="chk-col"><input type="checkbox" class="row-chk" data-id="${_ha(l.id)}" onchange="onLeadChk(this,'${_hj(l.id)}')"></td>
      <td style="font-size:11px;color:var(--text-muted);font-family:monospace;">${_h(l.id)}</td>
      <td class="fw-500">${_h(l.company)}</td>
      <td>${_h(l.name)||'—'}</td>
      <td style="font-size:12px;">${_h(l.tel)||'—'}</td>
      <td><span class="badge badge-gray">${_h(l.source)}</span></td>
      <td>${leadStatusBadge(l.status)}</td>
      <td style="font-size:12px;color:var(--text-muted);">${_h(l.date)}</td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-sm" onclick="editLead('${_hj(l.id)}')">編集</button>
          ${l.status !== '案件化' ? `<button class="btn btn-sm btn-primary" onclick="convertLead('${_hj(l.id)}')">案件化</button>` : ''}
          <button class="btn btn-sm btn-danger" onclick="deleteLead('${_hj(l.id)}')">×</button>
        </div>
      </td>
    </tr>`).join('') : '<tr><td colspan="9"><div class="empty-state"><p>リードがありません</p></div></td></tr>';
}

// ============================================================
// RENDER: OPPORTUNITIES
// ============================================================
// ============================================================
// ソート状態管理
// ============================================================
let oppSortKey = 'id';
let oppSortDir = 1;
var monthlySortKey = '';
var monthlySortDir = 1;
  // 1=昇順, -1=降順
let leadSortKey = 'date';
let leadSortDir = -1;

function sortOpps(key) {
  if(oppSortKey === key) oppSortDir *= -1;
  else { oppSortKey = key; oppSortDir = 1; }
  // ヘッダークラス更新
  document.querySelectorAll('#opp-tbody').forEach(()=>{});
  document.querySelectorAll('[onclick^="sortOpps"]').forEach(th => {
    th.classList.remove('sort-asc','sort-desc');
    const k = th.getAttribute('onclick').match(/sortOpps\('(\w+)'\)/)?.[1];
    if(k === oppSortKey) th.classList.add(oppSortDir === 1 ? 'sort-asc' : 'sort-desc');
  });
  renderOpportunities();
}

function sortLeads(key) {
  if(leadSortKey === key) leadSortDir *= -1;
  else { leadSortKey = key; leadSortDir = 1; }
  document.querySelectorAll('[onclick^="sortLeads"]').forEach(th => {
    th.classList.remove('sort-asc','sort-desc');
    const k = th.getAttribute('onclick').match(/sortLeads\('(\w+)'\)/)?.[1];
    if(k === leadSortKey) th.classList.add(leadSortDir === 1 ? 'sort-asc' : 'sort-desc');
  });
  renderLeads();
}

function sortMonthly(key) {
  if(monthlySortKey === key) monthlySortDir *= -1;
  else { monthlySortKey = key; monthlySortDir = 1; }
  document.querySelectorAll('[onclick^="sortMonthly"]').forEach(th => {
    th.classList.remove('sort-asc','sort-desc');
    const k = th.getAttribute('onclick').replace("sortMonthly('","").replace("')","");
    if(k === monthlySortKey) th.classList.add(monthlySortDir === 1 ? 'sort-asc' : 'sort-desc');
  });
  renderMonthly();
}

