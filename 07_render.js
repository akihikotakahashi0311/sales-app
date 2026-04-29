// RENDER: LEADS
// ============================================================
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
  const total = db.leads.length;
  const conv = db.leads.filter(l=>l.status==='案件化').length;
  document.getElementById('lead-metrics').innerHTML = `
    <div class="metric-card blue"><div class="metric-label">総リード数</div><div class="metric-value">${total}</div></div>
    <div class="metric-card green"><div class="metric-label">案件化数</div><div class="metric-value">${conv}</div></div>
    <div class="metric-card amber"><div class="metric-label">案件化率</div><div class="metric-value">${total?Math.round(conv/total*100):0}%</div></div>
    <div class="metric-card purple"><div class="metric-label">今月新規</div><div class="metric-value">${db.leads.filter(l=>l.date&&l.date.startsWith(currentMonth)).length}件</div></div>
  `;
  selectedLeads.clear();
  document.getElementById('lead-bulk-bar')?.classList.remove('show');
  const ldSel = document.getElementById('lead-select-all');
  if(ldSel){ ldSel.checked = false; ldSel.indeterminate = false; }
  document.getElementById('leads-tbody').innerHTML = filtered.length ? filtered.map(l=>`
    <tr id="lead-row-${l.id}">
      <td class="chk-col"><input type="checkbox" class="row-chk" data-id="${l.id}" onchange="onLeadChk(this,'${l.id}')"></td>
      <td style="font-size:11px;color:var(--text-muted);font-family:monospace;">${l.id}</td>
      <td class="fw-500">${l.company}</td>
      <td>${l.name||'—'}</td>
      <td style="font-size:12px;">${l.tel||'—'}</td>
      <td><span class="badge badge-gray">${l.source}</span></td>
      <td>${leadStatusBadge(l.status)}</td>
      <td style="font-size:12px;color:var(--text-muted);">${l.date}</td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-sm" onclick="editLead('${l.id}')">編集</button>
          ${l.status !== '案件化' ? `<button class="btn btn-sm btn-primary" onclick="convertLead('${l.id}')">案件化</button>` : ''}
          <button class="btn btn-sm btn-danger" onclick="deleteLead('${l.id}')">×</button>
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
let monthlySortKey = '';
let monthlySortDir = 1;
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

function renderOpportunities() {
  const q  = (document.getElementById('opp-search')?.value||'').toLowerCase();
  const sf = document.getElementById('opp-stage-filter')?.value||'';
  const rf = document.getElementById('opp-recog-filter')?.value||'';
  const of = document.getElementById('opp-owner-filter')?.value||'';
  const df = document.getElementById('opp-dept-filter')?.value||'';
  const pf = document.getElementById('opp-period-filter')?.value || 'all';

  // 期間フィルターの範囲を計算
  const _now  = new Date();
  const _yr   = _now.getFullYear();
  const _mo   = _now.getMonth() + 1; // 1-12
  // FY（10月始まり）: 10月以降は当年度、それ以前は前年度
  const _fy   = _mo >= 10 ? _yr : _yr - 1;
  const _fyStart = `${_fy}-10`; // FY開始月 YYYY-MM
  const _fyEnd   = `${_fy+1}-09`; // FY終了月
  // 現四半期（Q1=10-12, Q2=1-3, Q3=4-6, Q4=7-9）
  const _qMap = {
    10:'Q1',11:'Q1',12:'Q1', 1:'Q2',2:'Q2',3:'Q2',
     4:'Q3', 5:'Q3', 6:'Q3', 7:'Q4',8:'Q4',9:'Q4'
  };
  const _qRanges = {
    Q1:[`${_fy}-10`,`${_fy}-12`], Q2:[`${_fy+1}-01`,`${_fy+1}-03`],
    Q3:[`${_fy+1}-04`,`${_fy+1}-06`], Q4:[`${_fy+1}-07`,`${_fy+1}-09`]
  };
  const _curQ   = _qMap[_mo];
  const _qRange = _qRanges[_curQ];
  // 今月
  const _curMonth = currentMonth; // 'YYYY-MM'
  // 直近6ヶ月
  const _6mStart  = addMonthKey(currentMonth, -5);

  // 案件が期間内かどうか判定（start または end が期間内に重なる）
  function inPeriod(o) {
    if(pf === 'all') return true;
    const s = o.start ? o.start.slice(0,7) : '';
    const e = o.end   ? o.end.slice(0,7)   : (s || '');
    if(!s) return pf === 'all';
    // 案件期間と選択期間が重なるか
    let rangeS, rangeE;
    if(pf === 'fy')      { rangeS = _fyStart; rangeE = _fyEnd; }
    else if(pf === 'quarter') { rangeS = _qRange[0]; rangeE = _qRange[1]; }
    else if(pf === 'month')   { rangeS = _curMonth; rangeE = _curMonth; }
    else if(pf === '6months') { rangeS = _6mStart; rangeE = _curMonth; }
    // 案件期間[s,e] と [rangeS,rangeE] が重なる
    return s <= rangeE && e >= rangeS;
  }

  // 担当者・部門フィルターの選択肢を動的生成
  const ownerSel = document.getElementById('opp-owner-filter');
  if(ownerSel && ownerSel.options.length <= 1) {
    const owners = [...new Set(db.opportunities.map(o=>o.owner).filter(Boolean))].sort();
    ownerSel.innerHTML = '<option value="">全担当者</option>' + owners.map(o=>`<option>${o}</option>`).join('');
    if(of) ownerSel.value = of;
  }
  const deptSel = document.getElementById('opp-dept-filter');
  if(deptSel && deptSel.options.length <= 1) {
    const depts = [...new Set(db.opportunities.map(o=>o.dept||'').filter(Boolean))].sort();
    deptSel.innerHTML = '<option value="">全部門</option>' + depts.map(d=>`<option>${d}</option>`).join('');
    if(df) deptSel.value = df;
  }

  let filtered = db.opportunities.filter(o =>
    matchesScope(o) &&
    inPeriod(o) &&
    (!q  || o.name.toLowerCase().includes(q) || o.customer.toLowerCase().includes(q) || (o.id||'').toLowerCase().includes(q) || (o.owner||'').toLowerCase().includes(q)) &&
    (!sf || o.stage === sf) &&
    (!rf || o.recog === rf) &&
    (!of || o.owner === of) &&
    (!df || o.dept  === df)
  );

  // ソート適用
  filtered = [...filtered].sort((a, b) => {
    let va, vb;
    if(oppSortKey === 'weighted') { va = a.amount*a.prob/100; vb = b.amount*b.prob/100; }
    else { va = (a[oppSortKey]??''); vb = (b[oppSortKey]??''); }
    if(typeof va === 'number') return (va - vb) * oppSortDir;
    return String(va).localeCompare(String(vb), 'ja') * oppSortDir;
  });
  const totalAmt = filtered.reduce((s,o)=>s+o.amount,0);
  const weighted = filtered.reduce((s,o)=>s+o.amount*o.prob/100,0);
  document.getElementById('opp-metrics').innerHTML = `
    <div class="metric-card blue"><div class="metric-label">表示件数</div><div class="metric-value">${filtered.length}件</div></div>
    <div class="metric-card purple"><div class="metric-label">総契約額</div><div class="metric-value">${fmtM(totalAmt)}</div></div>
    <div class="metric-card green"><div class="metric-label">加重合計</div><div class="metric-value">${fmtM(weighted)}</div></div>
    <div class="metric-card amber"><div class="metric-label">受注案件</div><div class="metric-value">${filtered.filter(o=>o.stage==='受注').length}件</div></div>
  `;
  document.getElementById('opp-total-amount').textContent = fmt(totalAmt);
  document.getElementById('opp-weighted-amount').textContent = fmt(weighted);
  selectedOpps.clear();
  document.getElementById('opp-bulk-bar')?.classList.remove('show');
  const opSel = document.getElementById('opp-select-all');
  if(opSel){ opSel.checked = false; opSel.indeterminate = false; }
  document.getElementById('opp-tbody').innerHTML = filtered.length ? filtered.map(o=>`
    <tr id="opp-row-${o.id}">
      <td class="chk-col"><input type="checkbox" class="row-chk" data-id="${o.id}" onchange="onOppChk(this,'${o.id}')"></td>
      <td style="font-size:11px;color:var(--text-muted);font-family:monospace;">${o.id}</td>
      <td><a href="#" style="color:var(--accent);text-decoration:none;font-weight:500;" onclick="showOppDetail('${o.id}');return false;">${o.name}</a></td>
      <td>${o.customer}</td>
      <td>${stageBadge(o.stage)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:5px;">
          <div class="progress-bar"><div class="progress-fill" style="width:${o.prob}%;background:${o.prob>=70?'var(--green)':o.prob>=40?'var(--amber)':'var(--red)'}"></div></div>
          <span style="font-size:12px;">${o.prob}%</span>
        </div>
      </td>
      <td class="fw-500 text-right">${fmt(o.amount)}</td>
      <td class="text-right" style="color:var(--text-secondary);">${fmt(o.amount*o.prob/100)}</td>
      <td>${recogBadge(o.recog)}</td>
      <td style="font-size:12px;">${o.start||'—'}</td>
      <td style="font-size:12px;">${o.end||'—'}</td>
      <td style="font-size:12px;">${o.owner}</td>
      <td>${(()=>{const na=o.nextAction;if(!na?.date&&!na?.action)return '<span style="color:var(--text-muted);font-size:11px;">—</span>';const tod=new Date().toISOString().split('T')[0];const ov=na.date&&na.date<=tod;const pc={urgent:'#E24B4A',high:'#BA7517',normal:'#185FA5'}[na.priority||'normal'];return '<div style="font-size:11px;"><div style="font-weight:600;color:'+(ov?'#E24B4A':pc)+';"'+'>'+(na.date||'—')+(ov?' ⚠':'')+'</div><div style="color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:90px;">'+(na.action||'')+'</div></div>';})()}</td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-sm" onclick="populateOppModal(db.opportunities.find(x=>x.id==='${o.id}'));document.getElementById('modal-opp').classList.add('open');">編集</button>
          <button class="btn btn-sm btn-danger" onclick="deleteOpportunity('${o.id}')">×</button>
        </div>
      </td>
    </tr>`).join('') : '<tr><td colspan="14"><div class="empty-state"><p>案件がありません</p></div></td></tr>';
}

// ============================================================
// RENDER: MONTHLY
// ============================================================
function changeMonth(delta) {
  if(delta < 0) currentMonth = prevMonthKey(currentMonth);
  else currentMonth = nextMonthKey(currentMonth);
  // ピッカーのvalueを同期
  const picker = document.getElementById('monthly-month-picker');
  if(picker) picker.value = currentMonth;
  renderMonthly();
}


// 入金管理の月ナビ
function changePaymentMonth(delta) {
  if(delta < 0) currentPaymentMonth = prevMonthKey(currentPaymentMonth);
  else currentPaymentMonth = nextMonthKey(currentPaymentMonth);
  renderPayment();
}
function changePaymentMonthPicker(val) {
  if(!val) return;
  currentPaymentMonth = val;
  renderPayment();
}
function changeMonthPicker(val) {
  if(!val) return;
  currentMonth = val;
  renderMonthly();
}


// ============================================================
// 月次管理 担当者チェックボックスフィルター
// ============================================================
// selectedOwners === null  → 全員表示（初期状態・全選択）
// selectedOwners = Set([A,B,...]) → そのセットの担当者のみ表示
// selectedOwners = Set([]) → 誰も選択なし（0件）
let selectedOwners = null;

function _getOwnerList() {
  return [...new Set(db.opportunities.map(o => o.owner).filter(Boolean))].sort();
}

function toggleOwnerFilter(e) {
  e.stopPropagation();
  const dd = document.getElementById('monthly-owner-filter-dropdown');
  if(!dd) return;
  dd.classList.toggle('open');
  if(dd.classList.contains('open')) buildOwnerList();
}

// ドロップダウン外クリックで閉じる
document.addEventListener('click', e => {
  const wrap = document.getElementById('monthly-owner-filter-wrap');
  if(wrap && !wrap.contains(e.target)) {
    document.getElementById('monthly-owner-filter-dropdown')?.classList.remove('open');
  }
});

function buildOwnerList() {
  const owners = _getOwnerList();
  const listEl = document.getElementById('monthly-owner-list');
  if(!listEl) return;
  listEl.innerHTML = owners.map(owner => {
    // null=全員, または Set内にある場合はチェック
    // null=全員チェック、空Set=全解除、Set要素あり=その担当者のみ
    const checked = selectedOwners === null || (selectedOwners.size > 0 && selectedOwners.has(owner));
    return `<label class="owner-filter-item">
      <input type="checkbox" ${checked ? 'checked' : ''}
        onchange="onOwnerCheck(this, '${owner.replace(/'/g, "\'")}')">
      <span>${owner}</span>
    </label>`;
  }).join('');
}

function onOwnerCheck(el, owner) {
  const owners = _getOwnerList();
  if(el.checked) {
    if(selectedOwners === null) {
      // 全員チェック状態: そのままnull（変化なし）
    } else {
      selectedOwners.add(owner);
      // 全員揃ったら null に戻す（全選択状態）
      if(selectedOwners.size === owners.length) selectedOwners = null;
    }
  } else {
    // チェックを外す
    if(selectedOwners === null) {
      // null（全員）から1人外す → その人以外の全員Set
      selectedOwners = new Set(owners);
      selectedOwners.delete(owner);
    } else {
      selectedOwners.delete(owner);
    }
  }
  updateOwnerBadge();
  renderMonthly();
}

function selectAllOwners() {
  selectedOwners = null; // 全員表示
  buildOwnerList();
  updateOwnerBadge();
  renderMonthly();
}

function clearOwners() {
  // 全解除 = 全チェックOFF = 空Set → 担当者フィルターで全件除外（0件表示）
  selectedOwners = new Set();
  buildOwnerList();
  updateOwnerBadge();
  renderMonthly();
}

function updateOwnerBadge() {
  const badge = document.getElementById('monthly-owner-badge');
  const label = document.getElementById('monthly-owner-filter-label');
  if(!badge || !label) return;
  if(selectedOwners === null) {
    // 全員選択状態（全チェックON）
    badge.style.display = 'none';
    label.textContent = '担当者';
  } else if(selectedOwners.size === 0) {
    // 全解除状態（全チェックOFF）→ 0件表示
    badge.style.display = '';
    badge.textContent = '0';
    badge.style.background = '#888';
    label.textContent = '担当者';
  } else {
    // 一部選択
    badge.style.display = '';
    badge.textContent = selectedOwners.size;
    badge.style.background = 'var(--accent)';
    const names = [...selectedOwners];
    label.textContent = names.length === 1 ? names[0].slice(0, 5) : '担当者';
  }
}

function renderMonthly() {
  const label = monthLabel(currentMonth);
  document.getElementById('monthly-period-badge').textContent = label;
  // 月ラベルを更新（YYYY年MM月 形式）
  const labelEl = document.getElementById('monthly-month-label');
  if(labelEl) {
    const [y, m] = currentMonth.split('-');
    labelEl.textContent = `${y}年${parseInt(m)}月`;
  }
  const picker = document.getElementById('monthly-month-picker-hidden');
  if(picker) picker.value = currentMonth;
  const cpEl = document.getElementById('current-period'); if(cpEl) cpEl.textContent = label;
  const locked = isMonthLocked();
  const lockBadge = document.getElementById('lock-badge');
  const lockBtn = document.getElementById('btn-monthly-lock');
  if(locked) {
    lockBadge.innerHTML = '<span class="badge badge-red">締め済（ロック中）</span>';
    lockBtn.textContent = '締め解除';
    lockBtn.className = 'btn btn-sm';
  } else {
    lockBadge.innerHTML = '';
    lockBtn.textContent = '月次確定';
    lockBtn.className = 'btn btn-primary';
  }

  let totalSales=0, totalBilling=0, totalCash=0;
  const prevKey = prevMonthKey(currentMonth);
  const prevData = db.monthly[prevKey]||{};

  // 月次フィルター
  const mq  = (document.getElementById('monthly-search')?.value||'').toLowerCase();
  const mdf = document.getElementById('monthly-dept-filter')?.value||'';
  const mrf = document.getElementById('monthly-recog-filter')?.value||'';
  const mcf = document.getElementById('monthly-customer-filter')?.value||'';

  // 部門フィルターの選択肢を動的生成
  const mDeptSel = document.getElementById('monthly-dept-filter');
  if(mDeptSel && mDeptSel.options.length <= 1) {
    const depts = [...new Set(db.opportunities.map(o=>o.dept||'').filter(Boolean))].sort();
    mDeptSel.innerHTML = '<option value="">全部門</option>' + depts.map(d=>`<option>${d}</option>`).join('');
    if(mdf) mDeptSel.value = mdf;
  }

  // 顧客フィルターの選択肢を動的生成
  const mCustSel = document.getElementById('monthly-customer-filter');
  if(mCustSel) {
    const prevCust = mCustSel.value;
    const custs = [...new Set(db.opportunities.map(o=>o.customer||'').filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ja'));
    mCustSel.innerHTML = '<option value="">全顧客</option>' + custs.map(c=>`<option value="${c}">${c}</option>`).join('');
    if(prevCust) mCustSel.value = prevCust;
  }

  const mpf = document.getElementById('monthly-period-filter')?.value || 'active';

  // 契約期間フィルターの基準月（専用ピッカー > currentMonth）
  const refMonth = currentMonth;

  let monthlyOpps = db.opportunities.filter(o => {
    // テキスト検索
    if(mq && !o.id.toLowerCase().includes(mq) && !o.name.toLowerCase().includes(mq) &&
       !o.customer.toLowerCase().includes(mq) && !(o.dept||'').toLowerCase().includes(mq)) return false;
    // 部門フィルター
    if(mdf && o.dept !== mdf) return false;
    // 顧客フィルター
    if(mcf && o.customer !== mcf) return false;
    // 計上方式フィルター
    if(mrf && o.recog !== mrf) return false;
    // スコープフィルター（自分の案件のみ/全件）
    if(!matchesScope(o)) return false;
    // 担当者フィルター: null または空Set = 全員表示、要素あり = 絞り込み
    if(selectedOwners !== null && selectedOwners.size > 0 && !selectedOwners.has(o.owner)) return false;
    // 契約期間フィルター（基準月で判定）
    if(mpf === 'active') {
      const ym = refMonth; // 基準月（専用ピッカーまたはcurrentMonth）
      const s  = o.start ? o.start.slice(0,7) : null;
      const e  = o.end   ? o.end.slice(0,7)   : null;
      if(!s && !e) return false;
      if(s && !e) return ym >= s;
      if(!s && e) return ym <= e;
      return ym >= s && ym <= e;
    }
    if(mpf === 'data') {
      const m = db.monthly[currentMonth]?.[o.id];
      return m && (m.sales || m.billing || m.cash);
    }
    return true;
  });

  // 月次ソート（全列対応）
  if(monthlySortKey) {
    const mdAll = db.monthly[currentMonth] || {};
    monthlyOpps = [...monthlyOpps].sort((a,b) => {
      const ma = mdAll[a.id] || {sales:0,billing:0,cash:0,progress:0,cumProgress:0,updatedBy:''};
      const mb = mdAll[b.id] || {sales:0,billing:0,cash:0,progress:0,cumProgress:0,updatedBy:''};
      let va, vb;
      switch(monthlySortKey) {
        case 'sales':       va=ma.sales;       vb=mb.sales;       break;
        case 'billing':     va=ma.billing;     vb=mb.billing;     break;
        case 'cash':        va=ma.cash;        vb=mb.cash;        break;
        case 'progress':    va=ma.progress;    vb=mb.progress;    break;
        case 'cumProgress': va=ma.cumProgress; vb=mb.cumProgress; break;
        case 'uncollected': va=ma.billing-ma.cash; vb=mb.billing-mb.cash; break;
        case 'updatedBy':   va=ma.updatedBy||''; vb=mb.updatedBy||''; break;
        case 'status': {
          const statusRank = m => m.sales>0&&m.billing===0?0 : m.billing>0&&m.cash===0?1 : m.billing>0&&m.cash>0&&m.cash<m.billing?2 : m.cash>=m.billing&&m.cash>0?3 : 4;
          va=statusRank(ma); vb=statusRank(mb); break;
        }
        case 'owner': va=a.owner||''; vb=b.owner||''; break;
        case 'nextDate': va=a.nextAction?.date||'9999'; vb=b.nextAction?.date||'9999'; break;
        default: va=a[monthlySortKey]??''; vb=b[monthlySortKey]??'';
      }
      if(typeof va==='number') return (va-vb)*monthlySortDir;
      return String(va).localeCompare(String(vb),'ja')*monthlySortDir;
    });
  }

  const rows = monthlyOpps.map(o => {
    const m = getMonthly(o.id);
    totalSales += m.sales; totalBilling += m.billing; totalCash += m.cash;
    const uncollected = m.billing - m.cash;
    let statusBadge = '';
    if(m.sales > 0 && m.billing === 0) statusBadge = '<span class="badge badge-amber">未請求</span>';
    else if(m.billing > 0 && m.cash === 0) statusBadge = '<span class="badge badge-red">未入金</span>';
    else if(m.cash > 0 && m.cash >= m.billing) statusBadge = '<span class="badge badge-green">入金済</span>';
    else if(m.billing > 0) statusBadge = '<span class="badge badge-amber">一部入金</span>';
    else statusBadge = '<span class="badge badge-gray">未着手</span>';
    const isPoc = o.recog === '進行基準';
    const dis = locked ? 'disabled' : '';
    // 契約終了日との残日数でハイライト色を決定
    const _today = new Date(); _today.setHours(0,0,0,0);
    const _endDate = o.end ? new Date(o.end) : null;
    const _daysToEnd = _endDate ? Math.ceil((_endDate - _today) / 86400000) : null;
    let _rowBg = '';
    if(_daysToEnd !== null && _daysToEnd >= 0) {
      if(_daysToEnd <= 3)  _rowBg = 'background:#ffd0d0;'; // 薄い赤（3日以内）
      else if(_daysToEnd <= 30) _rowBg = 'background:#ffd6e8;'; // 薄いピンク（30日以内）
      else if(_daysToEnd <= 60) _rowBg = 'background:#ffe8cc;'; // 薄いオレンジ（60日以内）
    }
    return `<tr style="${_rowBg}">
      <td style="font-size:11px;color:var(--text-muted);font-family:monospace;white-space:nowrap;">${o.id}</td>
      <td style="font-size:12px;"><a href="#" style="color:var(--accent);text-decoration:none;" onclick="showOppDetail('${o.id}');return false;">${o.name}</a></td>
      <td>${recogBadge(o.recog)}</td>
      <td class="text-right"><input class="cell-input" type="text" value="${m.sales}" ${dis}
        onclick="openCalcFor(this,{unit:'万円',step:0.0001,onConfirm:v=>updateMonthlyCell('${o.id}','sales',v)})"
        style="cursor:${locked?'default':'pointer'};" readonly></td>
      <td class="text-right"><input class="cell-input" type="text" value="${m.billing}" ${dis}
        onclick="openCalcFor(this,{unit:'万円',step:0.0001,onConfirm:v=>updateMonthlyCell('${o.id}','billing',v)})"
        style="cursor:${locked?'default':'pointer'};" readonly></td>
      <td class="text-right"><input class="cell-input" type="text" value="${m.cash}" ${dis}
        onclick="openCalcFor(this,{unit:'万円',step:0.0001,onConfirm:v=>updateMonthlyCell('${o.id}','cash',v)})"
        style="cursor:${locked?'default':'pointer'};" readonly></td>
      <td class="text-right"><input class="cell-input ${isPoc?'poc':''}" type="text" value="${m.progress.toFixed(1)}" ${!isPoc||locked?'disabled':''}
        onclick="openCalcFor(this,{unit:'%',max:100,step:1,onConfirm:v=>updateMonthlyCell('${o.id}','progress',v)})"
        style="cursor:pointer;" readonly></td>
      <td class="text-right" style="font-size:12px;">${m.cumProgress.toFixed(1)}%</td>
      <td class="text-right fw-500" style="font-size:12px;color:${uncollected>0?'var(--red-dark)':'var(--text-muted)'};">${fmt(uncollected)}</td>
      <td>${statusBadge}</td>
      <td style="font-size:12px;color:var(--text-secondary);white-space:nowrap;">${o.owner||'—'}</td>
      <td style="font-size:11px;color:var(--text-muted);">${m.updatedBy||'—'}</td>
      <td style="white-space:nowrap;display:flex;gap:4px;">
        <button class="btn btn-sm" style="font-size:11px;padding:2px 8px;"
          onclick="generateInvoice('${o.id}','${currentMonth}')">請求書作成</button>
        <button class="btn btn-sm" style="font-size:11px;padding:2px 8px;background:var(--green);color:#fff;border-color:var(--green);"
          onclick="generateDelivery('${o.id}','${currentMonth}')">納品書作成</button>
      </td>
    </tr>`;
  }).join('');

  document.getElementById('monthly-tbody').innerHTML = rows;
  document.getElementById('m-total-sales').textContent = fmt(totalSales);
  document.getElementById('m-total-billing').textContent = fmt(totalBilling);
  document.getElementById('m-total-cash').textContent = fmt(totalCash);
  document.getElementById('m-total-uncollected').textContent = fmt(totalBilling - totalCash);
  renderPocTable();
}

function updateMonthlyCell(oppId, field, value) {
  const m = getMonthly(oppId);
  const v = Math.round((parseFloat(value)||0) * 10000) / 10000;
  m[field] = v;
  m.updatedBy = currentUser ? currentUser.name : '—';

  const o4poc = db.opportunities.find(x=>x.id===oppId);
  const prevKey4poc  = prevMonthKey(currentMonth);
  const prevData4poc = db.monthly[prevKey4poc]||{};
  const prevCum4poc  = prevData4poc[oppId]?.cumProgress||0;

  if(field === 'progress') {
    // 進捗率 → 売上を計算
    m.cumProgress = Math.min(100, Math.round((prevCum4poc + v) * 10000) / 10000);
    if(o4poc && o4poc.recog === '進行基準' && o4poc.amount > 0) {
      const prevSales = o4poc.amount * prevCum4poc / 100;
      const curSales  = o4poc.amount * m.cumProgress / 100;
      m.sales = Math.round((curSales - prevSales) * 10000) / 10000;
    }
  } else if(field === 'poc_sales') {
    // 当月売上（差分）→ 進捗率を逆算（端数はそのまま保持）
    m.sales = v;
    if(o4poc && o4poc.recog === '進行基準' && o4poc.amount > 0) {
      // 割り切れない場合でも浮動小数のまま保持する（丸めない）
      const diffProg  = v / o4poc.amount * 100;
      m.progress    = diffProg;
      m.cumProgress = Math.min(100, prevCum4poc + diffProg);
    }
  }
  save();
  // PoC詳細テーブルを即時更新
  const pocTbody = document.getElementById('poc-tbody');
  if(pocTbody) renderPocTable();
  // Update totals live
  let ts=0,tb=0,tc=0;
  db.opportunities.forEach(o => { const md = getMonthly(o.id); ts+=md.sales; tb+=md.billing; tc+=md.cash; });
  document.getElementById('m-total-sales').textContent = fmt(ts);
  document.getElementById('m-total-billing').textContent = fmt(tb);
  document.getElementById('m-total-cash').textContent = fmt(tc);
  document.getElementById('m-total-uncollected').textContent = fmt(tb-tc);
}

function renderPocTable() {
  const prevKey  = prevMonthKey(currentMonth);
  const prevData = db.monthly[prevKey]||{};

  // renderMonthly と同じフィルター条件を適用
  const _mq  = (document.getElementById('monthly-search')?.value||'').toLowerCase();
  const _mdf = document.getElementById('monthly-dept-filter')?.value||'';
  const _mcf = document.getElementById('monthly-customer-filter')?.value||'';
  const _mpf = document.getElementById('monthly-period-filter')?.value || 'active';

  const pocLocked = isMonthLocked();
  const pocRows = db.opportunities.filter(o => {
    if(o.recog !== '進行基準') return false;
    if(_mq && !o.name.toLowerCase().includes(_mq) && !o.customer.toLowerCase().includes(_mq)) return false;
    if(_mdf && o.dept !== _mdf) return false;
    if(_mcf && o.customer !== _mcf) return false;
    if(!matchesScope(o)) return false;
    if(selectedOwners !== null && selectedOwners.size > 0 && !selectedOwners.has(o.owner)) return false;
    if(_mpf === 'active') {
      const s = o.start ? o.start.slice(0,7) : null;
      const e = o.end   ? o.end.slice(0,7)   : null;
      if(!s && !e) return false;
      if(s && !e) return currentMonth >= s;
      if(!s && e) return currentMonth <= e;
      return currentMonth >= s && currentMonth <= e;
    }
    if(_mpf === 'data') {
      const md = db.monthly[currentMonth]?.[o.id];
      return md && (md.sales || md.billing || md.cash);
    }
    return true;
  }).map(o => {
    const m = getMonthly(o.id);
    const prevM = prevData[o.id]||{};
    const prevCum   = prevM.cumProgress||0;
    const prevSales = o.amount * prevCum / 100;
    const curSales  = o.amount * m.cumProgress / 100;
    const delta     = curSales - prevSales;
    const remaining = o.amount - prevSales - delta;
    return `<tr>
      <td style="font-size:12px;font-weight:500;">
        <a href="#" style="color:var(--accent);text-decoration:none;" onclick="showOppDetail('${o.id}');return false;">${o.name}</a>
        <div style="font-size:10px;color:var(--text-muted);">${o.customer}</div>
      </td>
      <td class="text-right">${fmt(o.amount)}</td>
      <td class="text-right" style="color:var(--text-muted);">${+prevCum.toFixed(4)}%</td>
      <td class="text-right">
        ${pocLocked
          ? `<span style="font-size:13px;font-weight:600;color:var(--accent);">${+((m.progress||0).toFixed(4))}%</span>`
          : `<input type="number" min="0" max="100" step="0.0001"
              value="${+((m.progress||0).toFixed(4))}"
              style="width:80px;text-align:right;border:1px solid var(--accent);border-radius:4px;padding:3px 6px;font-size:13px;font-weight:600;color:var(--accent);background:var(--bg-primary);"
              onchange="updateMonthlyCell('${o.id}','progress',this.value)"
              onclick="this.select()">`
        }
      </td>
      <td class="text-right">${+((m.cumProgress||0).toFixed(4))}%</td>
      <td class="text-right" style="color:var(--text-muted);">${fmt(prevSales)}</td>
      <td class="text-right">
        ${pocLocked
          ? `<span style="font-size:13px;font-weight:600;color:var(--green);">${fmt(delta)}</span>`
          : `<div style="display:flex;align-items:center;justify-content:flex-end;gap:4px;">
              <input type="number" step="0.0001"
                value="${Math.round(delta*10000)/10000}"
                style="width:84px;text-align:right;border:1px solid var(--green);border-radius:4px;padding:3px 6px;font-size:13px;font-weight:600;color:var(--green);background:var(--bg-primary);"
                onchange="updateMonthlyCell('${o.id}','poc_sales',this.value)"
                onclick="this.select()">
              <span style="font-size:11px;color:var(--text-muted);">万</span>
            </div>`
        }
      </td>
      <td class="text-right" style="color:var(--text-secondary);">${fmt(remaining)}</td>
    </tr>`;
  }).join('');
  document.getElementById('poc-tbody').innerHTML = pocRows || '<tr><td colspan="8" class="text-center text-muted" style="padding:16px;">進行基準案件なし</td></tr>';
}

function recalcPOC() {
  const prevKey = prevMonthKey(currentMonth);
  const prevData = db.monthly[prevKey]||{};
  db.opportunities.filter(o=>o.recog==='進行基準').forEach(o => {
    const m = getMonthly(o.id);
    const prevCum = prevData[o.id]?.cumProgress||0;
    m.cumProgress = Math.min(100, prevCum + m.progress);
    const prevSales = o.amount * prevCum / 100;
    const curSales = o.amount * m.cumProgress / 100;
    m.sales = Math.round(curSales - prevSales);
  });
  save();
  renderMonthly();
  toast('進行基準を再計算しました', 'success');
}

function toggleMonthlyLock() {
  const locked = isMonthLocked();
  if(!locked) {
    if(!confirm(`${monthLabel(currentMonth)}を月次確定（ロック）します。入力できなくなります。よろしいですか？`)) return;
    db.monthlyLocked[currentMonth] = true;
    toast(`${monthLabel(currentMonth)}を確定しました`, 'success');
  } else {
    if(!confirm('確定を解除しますか？')) return;
    delete db.monthlyLocked[currentMonth];
    toast('確定を解除しました');
  }
  save();
  renderMonthly();
}

// ============================================================
