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
    ownerSel.innerHTML = '<option value="">全担当者</option>' + owners.map(o=>`<option value="${_ha(o)}">${_h(o)}</option>`).join('');
    if(of) ownerSel.value = of;
  }
  const deptSel = document.getElementById('opp-dept-filter');
  if(deptSel && deptSel.options.length <= 1) {
    const depts = [...new Set(db.opportunities.map(o=>o.dept||'').filter(Boolean))].sort();
    deptSel.innerHTML = '<option value="">全部門</option>' + depts.map(d=>`<option value="${_ha(d)}">${_h(d)}</option>`).join('');
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
  // BUG-15対策: 1000件超でブラウザがフリーズするため、案件一覧は最大表示件数を設定。
  //   500件を超える場合は上位500件のみ表示し、件数バッジでフィルター利用を促す。
  const OPP_LIST_LIMIT = 500;
  const _filteredAll = filtered;
  const _truncated = _filteredAll.length > OPP_LIST_LIMIT;
  if(_truncated) {
    filtered = _filteredAll.slice(0, OPP_LIST_LIMIT);
  }

  const totalAmt = _filteredAll.reduce((s,o)=>s+o.amount,0);
  const weighted = _filteredAll.reduce((s,o)=>s+o.amount*o.prob/100,0);
  document.getElementById('opp-metrics').innerHTML = `
    <div class="metric-card blue"><div class="metric-label">表示件数</div><div class="metric-value">${_filteredAll.length}件${_truncated?'<span style="font-size:10px;color:var(--amber);margin-left:4px;">(上位'+OPP_LIST_LIMIT+'件のみ表示)</span>':''}</div></div>
    <div class="metric-card purple"><div class="metric-label">総契約額</div><div class="metric-value">${fmtM(totalAmt)}</div></div>
    <div class="metric-card green"><div class="metric-label">加重合計</div><div class="metric-value">${fmtM(weighted)}</div></div>
    <div class="metric-card amber"><div class="metric-label">受注案件</div><div class="metric-value">${_filteredAll.filter(o=>o.stage==='受注').length}件</div></div>
  `;
  document.getElementById('opp-total-amount').textContent = fmt(totalAmt);
  document.getElementById('opp-weighted-amount').textContent = fmt(weighted);
  selectedOpps.clear();
  document.getElementById('opp-bulk-bar')?.classList.remove('show');
  const opSel = document.getElementById('opp-select-all');
  if(opSel){ opSel.checked = false; opSel.indeterminate = false; }
  document.getElementById('opp-tbody').innerHTML = filtered.length ? filtered.map(o=>`
    <tr id="opp-row-${_h(o.id)}">
      <td class="chk-col"><input type="checkbox" class="row-chk" data-id="${_ha(o.id)}" onchange="onOppChk(this,'${_hj(o.id)}')"></td>
      <td style="font-size:11px;color:var(--text-muted);font-family:monospace;">${_h(o.id)}</td>
      <td><a href="#" style="color:var(--accent);text-decoration:none;font-weight:500;" onclick="showOppDetail('${_hj(o.id)}');return false;">${_h(o.name)}</a>${teamsIconHtml(o)}</td>
      <td>${_h(o.customer)}</td>
      <td>${stageBadge(o.stage)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:5px;">
          <div class="progress-bar"><div class="progress-fill" style="width:${Number(o.prob)||0}%;background:${o.prob>=70?'var(--green)':o.prob>=40?'var(--amber)':'var(--red)'}"></div></div>
          <span style="font-size:12px;">${Number(o.prob)||0}%</span>
        </div>
      </td>
      <td class="fw-500 text-right">${fmt(o.amount)}</td>
      <td class="text-right" style="color:var(--text-secondary);">${fmt(o.amount*o.prob/100)}</td>
      <td>${recogBadge(o.recog)}</td>
      <td style="font-size:12px;">${_h(o.start)||'—'}</td>
      <td style="font-size:12px;">${_h(o.end)||'—'}</td>
      <td>${ownerCellHtml(o)}</td>
      <td>${(()=>{const na=o.nextAction;if(!na?.date&&!na?.action)return '<span style="color:var(--text-muted);font-size:11px;">—</span>';const tod=new Date().toISOString().split('T')[0];const ov=na.date&&na.date<=tod;const pc={urgent:'#E24B4A',high:'#BA7517',normal:'#185FA5'}[na.priority||'normal'];return '<div style="font-size:11px;"><div style="font-weight:600;color:'+(ov?'#E24B4A':pc)+';"'+'>'+_h(na.date||'—')+(ov?' ⚠':'')+'</div><div style="color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:90px;">'+_h(na.action||'')+'</div></div>';})()}</td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-sm" onclick="populateOppModal(db.opportunities.find(x=>x.id==='${_hj(o.id)}'));document.getElementById('modal-opp').classList.add('open');">編集</button>
          <button class="btn btn-sm btn-danger" onclick="deleteOpportunity('${_hj(o.id)}')">×</button>
        </div>
      </td>
    </tr>`).join('') : '<tr><td colspan="14"><div class="empty-state"><p>案件がありません</p></div></td></tr>';
}

// ============================================================
// RENDER: MONTHLY
// ============================================================
// ※ 月切替は全画面共通の setCurrentMonth() を経由する（monthly.js で定義）
//    これにより 月次管理 / 入金管理 / キャッシュフロー予測 の3画面が連動する

function changeMonth(delta) {
  const next = delta < 0 ? prevMonthKey(currentMonth) : nextMonthKey(currentMonth);
  setCurrentMonth(next);
}

// 月次管理の月ピッカー
function changeMonthPicker(val) {
  setCurrentMonth(val);
}

// 入金管理の月ナビ（月次と同じ currentMonth を更新）
function changePaymentMonth(delta) {
  const next = delta < 0 ? prevMonthKey(currentMonth) : nextMonthKey(currentMonth);
  setCurrentMonth(next);
}
function changePaymentMonthPicker(val) {
  setCurrentMonth(val);
}

// キャッシュフロー予測の月ナビ（同上）
function changeCashflowMonth(delta) {
  const next = delta < 0 ? prevMonthKey(currentMonth) : nextMonthKey(currentMonth);
  setCurrentMonth(next);
}
function changeCashflowMonthPicker(val) {
  setCurrentMonth(val);
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
        onchange="onOwnerCheck(this, '${_hj(owner)}')">
      <span>${_h(owner)}</span>
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


// ============================================================
// 月次管理 ステータス（フェーズ）チェックボックスフィルター
// ============================================================
// selectedStages = Set([...]) → そのセットの stage のみ表示
// デフォルト：「受注」のみ
// 全フェーズ：受注 / リード / 提案中 / 見積提出 / 交渉中 / 失注
const ALL_STAGES = ['受注', 'リード', '提案中', '見積提出', '交渉中', '失注'];
let selectedStages = new Set(['受注']); // デフォルト：受注のみ

function _getStageList() {
  const fromData = [...new Set(db.opportunities.map(o => o.stage).filter(Boolean))];
  const merged = [...new Set([...ALL_STAGES, ...fromData])];
  // ALL_STAGES の順を優先
  return merged.sort((a, b) => {
    const ia = ALL_STAGES.indexOf(a);
    const ib = ALL_STAGES.indexOf(b);
    if(ia >= 0 && ib >= 0) return ia - ib;
    if(ia >= 0) return -1;
    if(ib >= 0) return 1;
    return a.localeCompare(b, 'ja');
  });
}

function toggleStageFilter(e) {
  e.stopPropagation();
  const dd = document.getElementById('monthly-stage-filter-dropdown');
  if(!dd) return;
  dd.classList.toggle('open');
  if(dd.classList.contains('open')) buildStageList();
}

// ドロップダウン外クリックで閉じる
document.addEventListener('click', e => {
  const wrap = document.getElementById('monthly-stage-filter-wrap');
  if(wrap && !wrap.contains(e.target)) {
    document.getElementById('monthly-stage-filter-dropdown')?.classList.remove('open');
  }
});

function buildStageList() {
  const stages = _getStageList();
  const listEl = document.getElementById('monthly-stage-list');
  if(!listEl) return;
  // フェーズごとの色（バッジ風表示）
  const stageColor = {
    '受注':    { bg: '#d1fae5', fg: '#065f46', border: '#86efac' },
    'リード':  { bg: '#f3f4f6', fg: '#4b5563', border: '#d1d5db' },
    '提案中':  { bg: '#dbeafe', fg: '#1e40af', border: '#93c5fd' },
    '見積提出':{ bg: '#fef3c7', fg: '#92400e', border: '#fcd34d' },
    '交渉中':  { bg: '#ede9fe', fg: '#5b21b6', border: '#c4b5fd' },
    '失注':    { bg: '#fee2e2', fg: '#991b1b', border: '#fca5a5' },
  };
  listEl.innerHTML = stages.map(stage => {
    const checked = selectedStages.has(stage);
    const c = stageColor[stage] || { bg: '#f3f4f6', fg: '#4b5563', border: '#d1d5db' };
    return `<label class="owner-filter-item">
      <input type="checkbox" ${checked ? 'checked' : ''}
        onchange="onStageCheck(this, '${_hj(stage)}')">
      <span class="badge" style="background:${c.bg};color:${c.fg};border:1px solid ${c.border};font-size:11px;padding:2px 8px;">${_h(stage)}</span>
    </label>`;
  }).join('');
}

function onStageCheck(el, stage) {
  if(el.checked) selectedStages.add(stage);
  else selectedStages.delete(stage);
  updateStageBadge();
  renderMonthly();
}

function selectAllStages() {
  selectedStages = new Set(_getStageList());
  buildStageList();
  updateStageBadge();
  renderMonthly();
}

function clearStages() {
  selectedStages = new Set();
  buildStageList();
  updateStageBadge();
  renderMonthly();
}

function updateStageBadge() {
  const badge = document.getElementById('monthly-stage-badge');
  const label = document.getElementById('monthly-stage-filter-label');
  if(!badge || !label) return;
  const allStages = _getStageList();
  if(selectedStages.size === 0) {
    badge.style.display = '';
    badge.textContent = '0';
    badge.style.background = '#888';
    label.textContent = 'ステータス';
  } else if(selectedStages.size === allStages.length) {
    badge.style.display = 'none';
    label.textContent = 'ステータス（全て）';
  } else if(selectedStages.size === 1 && selectedStages.has('受注')) {
    // デフォルト状態
    badge.style.display = 'none';
    label.textContent = '受注のみ';
  } else {
    badge.style.display = '';
    badge.textContent = selectedStages.size;
    badge.style.background = 'var(--accent)';
    const names = [...selectedStages];
    label.textContent = names.length === 1 ? names[0] : 'ステータス';
  }
}
