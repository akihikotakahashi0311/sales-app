// RENDER: REPORTS
// ============================================================
function renderReports() {
  // reportMonth が未設定か将来月（データなし）なら最新月に合わせる
  const msrKeys2 = Object.keys(db.monthlySummary||{}).sort();
  const latestMonth = msrKeys2[msrKeys2.length-1] || currentMonth;
  if(!reportMonth || !(reportMonth in (db.monthlySummary||{}))) {
    reportMonth = latestMonth;
  }
  initReportMonthSel();
  // アクティブなタブを再描画
  const activeTab = document.querySelector('#page-reports .tab.active');
  if(activeTab) {
    const m = activeTab.getAttribute('onclick')?.match(/'([^']+)'/);
    const tabId = m ? m[1] : 'rep-kpi';
    if(tabId==='rep-kpi')      { renderKpiMetrics(); renderDeptChart(); renderRepChart(); }
    else if(tabId==='rep-segment')  renderSegmentTab();
    else if(tabId==='rep-owner')    renderOwnerTab();
    else if(tabId==='rep-customer') renderCustomerReport();
    else if(tabId==='rep-trend')    renderTrendChart();
    else if(tabId==='rep-landing')  renderLandingReport();
    else if(tabId==='rep-history')  initHistoryTab();
  } else {
    renderKpiMetrics(); renderDeptChart(); renderRepChart();
  }
}

function renderKpiMetrics() {
  const budget = Object.values(db.monthlySummary||{}).reduce((a,v)=>a+(v.salesTotal||0),0) / Math.max(Object.keys(db.monthlySummary||{}).length,1) * 12 || 4500;
  const monthData = db.monthly[reportMonth]||{};
  let totalSales=0;
  db.opportunities.forEach(o=>{const m=monthData[o.id]||{};totalSales+=m.sales||0;});
  const achv = budget ? Math.round(totalSales/budget*100) : 0;
  const won = db.opportunities.filter(o=>o.stage==='受注');
  const total = db.opportunities.length;
  const winRate = total ? Math.round(won.length/total*100) : 0;
  const avgDeal = won.length ? Math.round(won.reduce((s,o)=>s+o.amount,0)/won.length) : 0;
  document.getElementById('kpi-metrics').innerHTML = `
    <div class="metric-card ${achv>=100?'green':achv>=80?'blue':'amber'}"><div class="metric-label">予算達成率</div><div class="metric-value">${achv}%</div><div class="metric-change neutral">目標 100%</div></div>
    <div class="metric-card blue"><div class="metric-label">受注率</div><div class="metric-value">${winRate}%</div><div class="metric-change neutral">${won.length}件 / ${total}件</div></div>
    <div class="metric-card green"><div class="metric-label">平均受注額</div><div class="metric-value">${fmtM(avgDeal)}</div><div class="metric-change neutral">受注案件平均</div></div>
    <div class="metric-card purple"><div class="metric-label">パイプライン</div><div class="metric-value">${db.opportunities.filter(o=>!['受注','失注'].includes(o.stage)).length}件</div><div class="metric-change neutral">進行中</div></div>
  `;
}

function renderDeptChart() {
  const depts = [...new Set(db.opportunities.map(o=>o.dept))].filter(Boolean);
  const budgetByDept = {東京営業部:2000, 大阪営業部:1500, 名古屋営業部:800};
  const actualByDept = {};
  const monthData = db.monthly[reportMonth]||{};
  db.opportunities.forEach(o=>{
    const m=monthData[o.id]||{};
    actualByDept[o.dept]=(actualByDept[o.dept]||0)+(m.sales||0);
  });
  destroyChart('chartDept');
  const el = document.getElementById('chartDept');
  if(el && depts.length) {
    charts.chartDept = new Chart(el, {
      type:'bar',
      data:{labels:depts,datasets:[
        {label:'予算',data:depts.map(d=>budgetByDept[d]||0),backgroundColor:'rgba(24,95,165,0.25)',borderRadius:4},
        {label:'実績',data:depts.map(d=>actualByDept[d]||0),backgroundColor:'#185FA5',borderRadius:4}
      ]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{font:{size:11},boxWidth:12}}},scales:{y:{ticks:{callback:v=>'¥'+v+'万',font:{size:11}}},x:{ticks:{font:{size:11}},grid:{display:false}}}}
    });
  }
}

function renderRepChart() {
  const owners = [...new Set(db.opportunities.map(o=>o.owner))];
  const won = {};
  db.opportunities.filter(o=>o.stage==='受注').forEach(o=>{won[o.owner]=(won[o.owner]||0)+o.amount;});
  destroyChart('chartRep');
  const el = document.getElementById('chartRep');
  if(el) {
    charts.chartRep = new Chart(el, {
      type:'bar',
      data:{labels:owners,datasets:[{label:'受注額',data:owners.map(o=>won[o]||0),backgroundColor:['#185FA5','#1D9E75','#534AB7','#BA7517','#888780'],borderRadius:4}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`¥${ctx.parsed.y.toLocaleString()}万`}}},scales:{y:{ticks:{callback:v=>'¥'+v+'万',font:{size:11}}},x:{ticks:{font:{size:11}},grid:{display:false}}}}
    });
  }
}

let custSortKey = 'sales';
let custSortDir = -1;
let ownerSortKey = 'sales';
let ownerSortDir = -1;
let _lastFilteredAlerts = [];  // 直前の renderAlerts でフィルターされたアラート
let segSortKey   = 'sales';
let segSortDir   = -1;

function sortCustomers(key) {
  if(custSortKey === key) custSortDir *= -1;
  else { custSortKey = key; custSortDir = 1; }
  document.querySelectorAll('[onclick^="sortCustomers"]').forEach(th => {
    th.classList.remove('sort-asc','sort-desc');
    const k = th.getAttribute('onclick').replace("sortCustomers('","").replace("')","");
    if(k === custSortKey) th.classList.add(custSortDir === 1 ? 'sort-asc' : 'sort-desc');
  });
  renderCustomerReport();
}

function renderCustomerReport() {
  const q = (document.getElementById('customer-search')?.value||'').toLowerCase();
  const byCustomer = {};
  db.opportunities.forEach(o=>{
    if(!byCustomer[o.customer]) byCustomer[o.customer]={sales:0,billing:0,cash:0,count:0,segment:'',industry:''};
    const m=db.monthly[reportMonth]?.[o.id]||{};
    byCustomer[o.customer].sales+=m.sales||0;
    byCustomer[o.customer].billing+=m.billing||0;
    byCustomer[o.customer].cash+=m.cash||0;
    byCustomer[o.customer].count++;
    const c=db.customers.find(x=>x.name===o.customer)||{};
    byCustomer[o.customer].industry=c.industry||'—';
    byCustomer[o.customer].segment=c.segment||'—';
  });
  // ソート適用
  let custEntries = Object.entries(byCustomer);
  custEntries.sort(([na,da],[nb,db]) => {
    let va, vb;
    if(custSortKey === 'name')        { va = na; vb = nb; }
    else if(custSortKey === 'uncollected') { va = da.billing-da.cash; vb = db.billing-db.cash; }
    else { va = da[custSortKey] ?? 0; vb = db[custSortKey] ?? 0; }
    if(typeof va === 'number') return (va - vb) * custSortDir;
    return String(va).localeCompare(String(vb), 'ja') * custSortDir;
  });

  document.getElementById('customer-tbody').innerHTML = custEntries.map(([name,d])=>`
    <tr>
      <td class="fw-500">${name}</td>
      <td><span class="badge badge-gray">${d.industry}</span></td>
      <td>${d.segment}</td>
      <td class="text-right">${fmt(d.sales)}</td>
      <td class="text-right">${fmt(d.billing)}</td>
      <td class="text-right">${fmt(d.cash)}</td>
      <td class="text-right ${d.billing-d.cash>0?'text-red fw-500':''}">${fmt(d.billing-d.cash)}</td>
      <td class="text-center">${d.count}件</td>
    </tr>`).join('');
}

function sortOwners(key) {
  if(ownerSortKey === key) ownerSortDir *= -1;
  else { ownerSortKey = key; ownerSortDir = 1; }
  document.querySelectorAll('#owner-detail-thead th.sortable')
    .forEach(th => {
      th.classList.remove('sort-asc','sort-desc');
      if(th.dataset.key === key)
        th.classList.add(ownerSortDir === 1 ? 'sort-asc' : 'sort-desc');
    });
  renderOwnerTable();
}

function sortSegs(key) {
  if(segSortKey === key) segSortDir *= -1;
  else { segSortKey = key; segSortDir = 1; }
  document.querySelectorAll('#seg-detail-thead th.sortable')
    .forEach(th => {
      th.classList.remove('sort-asc','sort-desc');
      if(th.dataset.key === key)
        th.classList.add(segSortDir === 1 ? 'sort-asc' : 'sort-desc');
    });
  renderSegmentTab();
}

function renderTrendChart() {
  const msr = db.monthlySummary || {};
  const tk = Object.keys(msr).sort();
  const tl = tk.map(k=>{ const[y,m]=k.split('-'); return y.slice(2)+'/'+parseInt(m); });
  destroyChart('chartTrend');
  charts.chartTrend = new Chart(document.getElementById('chartTrend'), {
    type:'line',
    data:{labels:tl,datasets:[
      {label:'売上',data:tk.map(k=>msr[k]?.salesTotal||0),borderColor:'#185FA5',borderWidth:2,tension:0.3,pointRadius:2,fill:false},
      {label:'請求',data:tk.map(k=>msr[k]?.billingTotal||0),borderColor:'#1D9E75',borderWidth:2,borderDash:[5,3],tension:0.3,pointRadius:2,fill:false},
      {label:'入金',data:tk.map(k=>msr[k]?.cashTotal||0),borderColor:'#BA7517',borderWidth:2,borderDash:[2,4],tension:0.3,pointRadius:2,fill:false}
    ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{font:{size:11},boxWidth:12}}},scales:{y:{beginAtZero:true,ticks:{callback:v=>'¥'+v+'万',font:{size:10},maxTicksLimit:6},grid:{color:'rgba(0,0,0,0.04)'}},x:{ticks:{font:{size:9},maxRotation:45},grid:{display:false}}}}
  });
}


// ============================================================
// 分析レポート 参照月 管理
// ============================================================
function initReportMonthSel() {
  const msr    = db.monthlySummary || {};
  const months = [...new Set([...Object.keys(msr), ...Object.keys(db.monthly||{})])].sort().reverse();
  const sel    = document.getElementById('report-month-sel');
  if(!sel) return;
  if(!reportMonth || !months.includes(reportMonth)) reportMonth = months[0] || currentMonth;
  sel.innerHTML = months.map(m =>
    `<option value="${m}" ${m===reportMonth?'selected':''}>${monthLabel(m)}</option>`
  ).join('');
}

function changeReportMonth(val) {
  if(!val) return;
  reportMonth = val;
  refreshCurrentReportTab();
}

function shiftReportMonth(delta) {
  const msr    = db.monthlySummary || {};
  const months = [...new Set([...Object.keys(msr), ...Object.keys(db.monthly||{})])].sort();
  const idx    = months.indexOf(reportMonth);
  const ni     = Math.max(0, Math.min(months.length-1, idx + delta));
  reportMonth  = months[ni] || reportMonth;
  const sel    = document.getElementById('report-month-sel');
  if(sel) sel.value = reportMonth;
  refreshCurrentReportTab();
}

function refreshCurrentReportTab() {
  const activeTab = document.querySelector('#page-reports .tab.active');
  if(!activeTab) return;
  const m = activeTab.getAttribute('onclick')?.match(/'([^']+)'/);
  if(!m) return;
  const tabId = m[1];
  switch(tabId) {
    case 'rep-kpi':      renderKpiMetrics(); renderDeptChart(); renderRepChart(); break;
    case 'rep-segment':  renderSegmentTab(); break;
    case 'rep-owner':    renderOwnerTab(); break;
    case 'rep-customer': renderCustomerReport(); break;
    case 'rep-trend':    renderTrendChart(); break;
    case 'rep-landing':  renderLandingReport(); break;
    case 'rep-history':  initHistoryTab(); break;
  }
}

// ============================================================
// switchReportTab
// ============================================================
function switchReportTab(el, tabId) {
  el.parentElement.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  initReportMonthSel();
  ['rep-kpi','rep-segment','rep-owner','rep-customer','rep-trend','rep-landing','rep-history'].forEach(id=>{
    const d = document.getElementById(id);
    if(d) d.style.display = id===tabId ? 'block' : 'none';
  });
  if(tabId==='rep-kpi')      { renderKpiMetrics(); renderDeptChart(); renderRepChart(); }
  if(tabId==='rep-segment')  renderSegmentTab();
  if(tabId==='rep-owner')    renderOwnerTab();
  if(tabId==='rep-customer') renderCustomerReport();
  if(tabId==='rep-trend')    renderTrendChart();
  if(tabId==='rep-landing')  renderLandingReport();
  if(tabId==='rep-history')  initHistoryTab();
}

// ============================================================
// アラート自動生成
// ============================================================
function renderAlerts() {
  const q          = (document.getElementById('alert-search')?.value||'').toLowerCase();
  const typeFilter = document.getElementById('alert-type-filter')?.value||'';
  const statusFilter = document.getElementById('alert-status-filter')?.value||'active';
  const sortSel    = document.getElementById('alert-sort-sel')?.value||'date-desc';

  const active    = db.alerts.filter(a=>!a.dismissed);
  const dismissed = db.alerts.filter(a=>a.dismissed);

  // フィルター適用
  // 当日の日付
  const _alertToday = new Date(); _alertToday.setHours(0,0,0,0);
  const _alert60Days = new Date(_alertToday); _alert60Days.setDate(_alert60Days.getDate() + 60);

  let filtered = db.alerts.filter(a => {
    if(statusFilter==='active' && a.dismissed) return false;
    if(statusFilter==='dismissed' && !a.dismissed) return false;
    if(typeFilter && a.type!==typeFilter) return false;
    if(q && !a.title.toLowerCase().includes(q) && !a.detail.toLowerCase().includes(q)) return false;
    // 期日フィルター: 過去 + 当日〜60日以内のアラートを表示（60日超の将来のみ除外）
    if(a.date) {
      const aDate = new Date(a.date); aDate.setHours(0,0,0,0);
      if(aDate > _alert60Days) return false; // 60日超の将来は除外
    }
    // スコープフィルター: oppId が紐づくアラートは担当案件のみ表示
    if(a.oppId && viewScope === 'own' && currentUser) {
      const opp = db.opportunities.find(o => o.id === a.oppId);
      if(opp && opp.owner !== currentUser.name) return false;
    }
    return true;
  });

  // ソート
  const typeRank = {danger:0, warning:1, info:2};
  filtered.sort((a,b) => {
    if(sortSel==='date-desc') return (b.date||'').localeCompare(a.date||'');
    if(sortSel==='date-asc')  return (a.date||'').localeCompare(b.date||'');
    if(sortSel==='type')      return (typeRank[a.type]??9)-(typeRank[b.type]??9);
    return 0;
  });

  const iconSVG = {
    danger:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  };

  _lastFilteredAlerts = filtered;  // dismissAll 用に保持
  document.getElementById('alert-metrics').innerHTML = `
    <div class="metric-card red"><div class="metric-label">未対応アラート</div><div class="metric-value">${active.length}</div></div>
    <div class="metric-card red"><div class="metric-label">緊急（未入金等）</div><div class="metric-value">${active.filter(a=>a.type==='danger').length}件</div></div>
    <div class="metric-card amber"><div class="metric-label">警告</div><div class="metric-value">${active.filter(a=>a.type==='warning').length}件</div></div>
    <div class="metric-card gray"><div class="metric-label">対応済</div><div class="metric-value">${dismissed.length}件</div></div>
  `;

  document.getElementById('alerts-list').innerHTML = filtered.length ? filtered.map(a=>{
    // 過去のアラートは赤背景
    const _isPast = a.date && new Date(a.date).setHours(0,0,0,0) < _alertToday.getTime();
    const _rowStyle = a.dismissed ? 'opacity:0.5;' : (_isPast ? 'background:#ffd0d0;border-left:4px solid #e53935;' : '');
    return `
    <div class="alert-row${a.dismissed?' dismissed':''}" id="alert-${a.id}" data-alert-id="${a.id}" style="${_rowStyle}">
      <div class="alert-icon ${a.type}">${iconSVG[a.type]||''}</div>
      <div class="alert-content">
        <div class="alert-title">${a.title}${a.dismissed?' <span style="font-size:10px;color:var(--text-muted);">[対応済]</span>':''}</div>
        <div class="alert-detail">${a.detail||""}</div>
        <div class="alert-meta">${a.date}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;">
        ${a.oppId ? `<button class="btn btn-sm" style="font-size:11px;" onclick="showOppDetail('${a.oppId}')">案件詳細</button>` : ''}
        ${!a.dismissed ? `<button class="btn btn-sm" onclick="dismissAlert('${a.id}')">対応済</button>` : `<span style="font-size:11px;color:var(--text-muted);">対応済</span>`}
      </div>
    </div>`;
  }).join('') : '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg><p>該当するアラートがありません</p></div>';
}


function updateAlertBadge() {
  // renderAlerts と同じフィルター条件でカウント（表示件数と一致させる）
  const _badgeToday = new Date(); _badgeToday.setHours(0,0,0,0);
  const _badge60Days = new Date(_badgeToday); _badge60Days.setDate(_badge60Days.getDate() + 60);
  const count = db.alerts.filter(a => {
    if(a.dismissed) return false;
    // 60日超の将来アラートは除外（renderAlertsと同条件）
    if(a.date) {
      const d = new Date(a.date); d.setHours(0,0,0,0);
      if(d > _badge60Days) return false;
    }
    // スコープフィルター: 担当者フィルター適用中は他担当者分を除外
    if(a.oppId && typeof viewScope !== 'undefined' && viewScope === 'own' && typeof currentUser !== 'undefined' && currentUser) {
      const opp = db.opportunities.find(o => o.id === a.oppId);
      if(opp && opp.owner !== currentUser.name) return false;
    }
    return true;
  }).length;
  const badge = document.getElementById('alert-badge');
  badge.textContent = count;
  badge.style.display = count > 0 ? '' : 'none';
}

function autoGenerateAlerts() {
  const today = new Date().toISOString().split('T')[0];
  // 自動生成アラート（AUTO-）は毎回リフレッシュ（対応済のものは保持）
  db.alerts = db.alerts.filter(a => !a.id.startsWith('AUTO-') || a.dismissed);
  // dismissed 含む全IDを登録し、重複生成を防ぐ（AUTO- は上の filter で削除済のため dismissed のみ残る）
  const existingIds = new Set(db.alerts.map(a=>a.id));
  const newAlerts   = [];

  // ──────────────────────────────────────────────
  // A. 月次データ：売上計上済未請求 / 請求済未入金
  //    期日 = 該当月（YM）の月末日を基準とする
  // ──────────────────────────────────────────────
  // 当月以前の月のみ対象（未来月の売上計上済・未請求は除外）
  const _curYm = today.slice(0, 7); // 'YYYY-MM'
  const allMonths = Object.keys(db.monthly||{}).sort().filter(ym => ym <= _curYm).slice(-12);
  allMonths.forEach(ym => {
    const monthData = db.monthly[ym] || {};
    // YMの月末日を算出（例: 2024-03 → 2024-03-31）
    const [_yr, _mo] = ym.split('-').map(Number);
    const _monthEnd = new Date(_yr, _mo, 0); // _mo月の0日 = 前月末 = _mo-1月の末日
    const ymDate = _monthEnd.toISOString().split('T')[0];
    db.opportunities.forEach(o => {
      const m = monthData[o.id] || {};
      if(m.sales>0 && (m.billing===0 || m.billing===undefined || m.billing===null)) {
        const id = `AUTO-NB-${ym}-${o.id}`;
        if(!existingIds.has(id)) newAlerts.push({
          id, type:'warning', title:'売上計上済・未請求',
          detail:`${o.name}（${ym}）— ¥${(m.sales||0).toLocaleString()}万円（${o.owner||'担当不明'}）`,
          date: ymDate, dismissed:false, oppId: o.id
        });
      }
      if(m.billing>0 && (m.cash===0 || m.cash===undefined || m.cash===null)) {
        const id = `AUTO-NI-${ym}-${o.id}`;
        if(!existingIds.has(id)) newAlerts.push({
          id, type:'danger', title:'請求済・未入金',
          detail:`${o.name}（${ym}）— ¥${(m.billing||0).toLocaleString()}万円（${o.customer||'顧客不明'}）`,
          date: ymDate, dismissed:false, oppId: o.id
        });
      }
    });
  });

  // ──────────────────────────────────────────────
  // B. フォローアップ期限チェック
  // ──────────────────────────────────────────────
  db.opportunities.forEach(o => {
    if(!o.nextAction?.date || o.stage === '受注' || o.stage === '失注') return;
    const due = o.nextAction.date;
    const priority = o.nextAction.priority || 'normal';
    const daysLeft = Math.ceil((new Date(due) - new Date(today)) / 86400000);

    if(daysLeft < 0) {
      // 期限切れ
      const id = `FOLLOW-OVR-${o.id}-${due}`;
      if(!existingIds.has(id)) newAlerts.push({
        id,
        type: priority === 'urgent' ? 'danger' : 'warning',
        title: `フォローアップ期限切れ（${Math.abs(daysLeft)}日超過）`,
        detail: `${o.name} — ${o.nextAction.action||'アクション未設定'}（担当：${o.owner||'—'}）`,
        date: today, dismissed: false, oppId: o.id,
        category: 'followup'
      });
    } else if(daysLeft <= 3) {
      // 期限3日以内
      const id = `FOLLOW-SOON-${o.id}-${due}`;
      if(!existingIds.has(id)) newAlerts.push({
        id,
        type: daysLeft === 0 ? 'danger' : 'warning',
        title: daysLeft === 0 ? `本日フォローアップ期限` : `フォローアップ期限まで${daysLeft}日`,
        detail: `${o.name} — ${o.nextAction.action||'アクション未設定'}（担当：${o.owner||'—'}、期日：${due}）`,
        date: today, dismissed: false, oppId: o.id,
        category: 'followup'
      });
    }
  });

  // ──────────────────────────────────────────────
  // C. 長期放置案件（30日以上更新なし・未受注）
  // ──────────────────────────────────────────────
  db.opportunities.filter(o => o.stage !== '受注' && o.stage !== '失注').forEach(o => {
    const lastUpd = o.lastUpdated || o.stageHistory?.slice(-1)[0]?.date || null;
    if(!lastUpd) return;
    const daysSince = Math.ceil((new Date(today) - new Date(lastUpd)) / 86400000);
    const threshold = o.prob >= 80 ? 14 : o.prob >= 50 ? 21 : 30;
    if(daysSince >= threshold) {
      const id = `STALE-${o.id}-${lastUpd}`;
      if(!existingIds.has(id)) newAlerts.push({
        id, type: 'info',
        title: `案件放置 ${daysSince}日（${o.stage}・確度${o.prob}%）`,
        detail: `${o.name} — ¥${(o.amount||0).toLocaleString()}万円（担当：${o.owner||'—'}）`,
        date: today, dismissed: false, oppId: o.id,
        category: 'stale'
      });
    }
  });

  // ──────────────────────────────────────────────
  // D. 高確度・長期未受注案件（確度80%以上・30日以上）
  // ──────────────────────────────────────────────
  db.opportunities.filter(o => o.prob >= 80 && o.stage !== '受注' && o.stage !== '失注').forEach(o => {
    const lastStageDate = o.stageHistory?.slice(-1)[0]?.date;
    if(!lastStageDate) return;
    const days = Math.ceil((new Date(today) - new Date(lastStageDate)) / 86400000);
    if(days >= 30) {
      const id = `HIGH-PROB-${o.id}`;
      if(!existingIds.has(id)) newAlerts.push({
        id, type: 'warning',
        title: `高確度案件が未受注（${days}日経過）`,
        detail: `${o.name} — 確度${o.prob}%・¥${(o.amount||0).toLocaleString()}万円（${o.stage}）`,
        date: today, dismissed: false, oppId: o.id,
        category: 'highprob'
      });
    }
  });

  // ──────────────────────────────────────────────
  // E. 契約期間終了間近（30日以内）
  // ──────────────────────────────────────────────
  db.opportunities.filter(o => o.end && o.stage === '受注').forEach(o => {
    const endDate = o.end;
    const daysLeft = Math.ceil((new Date(endDate) - new Date(today)) / 86400000);
    if(daysLeft >= 0 && daysLeft <= 30) {
      const id = `CONTRACT-END-${o.id}`;
      if(!existingIds.has(id)) newAlerts.push({
        id, type: daysLeft <= 7 ? 'danger' : 'warning',
        title: `契約終了まで${daysLeft}日（更新確認要）`,
        detail: `${o.name} — 契約終了：${endDate}（担当：${o.owner||'—'}）`,
        date: today, dismissed: false, oppId: o.id,
        category: 'contract'
      });
    }
  });

  // ──────────────────────────────────────────────
  // F. 請求予定日間近なのに請求書未発行
  //    billingDate が設定済み && billing === 0 && 請求予定日が7日以内
  // ──────────────────────────────────────────────
  const _todayDate = new Date(today);
  Object.entries(db.monthly || {}).forEach(([ym, monthData]) => {
    // 未来月のみ対象（過去月は別のアラートで対応）
    Object.entries(monthData || {}).forEach(([oppId, m]) => {
      if(!m.billingDate) return;          // 請求予定日が未設定はスキップ
      if(m.billing > 0) return;           // 請求済みはスキップ
      if(m.locked) return;                // 月次締め済みはスキップ
      const o = db.opportunities.find(x => x.id === oppId);
      if(!o) return;
      const bDate = new Date(m.billingDate);
      const daysLeft = Math.ceil((bDate - _todayDate) / 86400000);
      // 7日以内（過去も含む）かつ未発行
      if(daysLeft > 7) return;
      const id7 = `AUTO-BILL7-${ym}-${oppId}`;
      const id3 = `AUTO-BILL3-${ym}-${oppId}`;
      if(daysLeft <= 3) {
        // 3日以内: danger
        if(!existingIds.has(id3)) newAlerts.push({
          id: id3, type: 'danger',
          title: daysLeft < 0
            ? `請求書未発行（${Math.abs(daysLeft)}日超過）`
            : daysLeft === 0
              ? '請求書未発行（本日期限）'
              : `請求書未発行（期限まで${daysLeft}日）`,
          detail: `${o.name}（${ym}）— 請求予定日：${m.billingDate}（担当：${o.owner||'—'}）`,
          date: m.billingDate, dismissed: false, oppId,
          category: 'billing'
        });
      } else {
        // 4〜7日以内: warning
        if(!existingIds.has(id7)) newAlerts.push({
          id: id7, type: 'warning',
          title: `請求書未発行（期限まで${daysLeft}日）`,
          detail: `${o.name}（${ym}）— 請求予定日：${m.billingDate}（担当：${o.owner||'—'}）`,
          date: m.billingDate, dismissed: false, oppId,
          category: 'billing'
        });
      }
    });
  });

  if(newAlerts.length) { db.alerts = [...db.alerts, ...newAlerts]; if(_odSyncEnabled) saveToOneDrive(); }
}

// ============================================================
// セグメント別分析
// ============================================================
const OWNER_COLORS_EXT = ['#185FA5','#1D9E75','#534AB7','#BA7517','#E24B4A','#888780','#D4537E','#639922','#378ADD'];
let activeSegFilter = '';

function renderSegmentTab() {
  const monthData = db.monthly[reportMonth] || {};
  const msr = db.monthlySummary || {};
  const segData = {};
  db.opportunities.forEach(o => {
    const seg = o.dept || 'その他';
    if(!segData[seg]) segData[seg] = {sales:0,billing:0,amount:0,count:0,won:0,weighted:0};
    const m = monthData[o.id] || {};
    segData[seg].sales    += m.sales    || 0;
    segData[seg].billing  += m.billing  || 0;
    segData[seg].amount   += o.amount;
    segData[seg].count    += 1;
    segData[seg].weighted += o.amount * o.prob / 100;
    if(o.stage==='受注') segData[seg].won++;
  });
  const segs      = Object.keys(segData).sort((a,b)=>{
    let va,vb;
    switch(segSortKey){
      case 'name':     va=a; vb=b; return segSortDir*(va<vb?-1:va>vb?1:0);
      case 'count':    return segSortDir*(segData[b].count-segData[a].count);
      case 'amount':   return segSortDir*(segData[b].amount-segData[a].amount);
      case 'billing':  return segSortDir*(segData[b].billing-segData[a].billing);
      case 'weighted': return segSortDir*(segData[b].weighted-segData[a].weighted);
      case 'won':      return segSortDir*(segData[b].won-segData[a].won);
      default:         return segSortDir*(segData[b].sales-segData[a].sales);
    }
  });
  const segColors = segs.map((_,i)=>OWNER_COLORS_EXT[i%OWNER_COLORS_EXT.length]);
  const totalSales = segs.reduce((s,k)=>s+segData[k].sales,0);
  const topSeg = segs[0]||'—';

  document.getElementById('seg-metrics').innerHTML = `
    <div class="metric-card blue"><div class="metric-label">セグメント数</div><div class="metric-value">${segs.length}</div></div>
    <div class="metric-card green"><div class="metric-label">最大売上</div><div class="metric-value" style="font-size:15px;">${topSeg}</div><div class="metric-change neutral">${fmt(segData[topSeg]?.sales||0)}</div></div>
    <div class="metric-card purple"><div class="metric-label">当月売上合計</div><div class="metric-value">${fmtM(totalSales)}</div></div>
    <div class="metric-card amber"><div class="metric-label">全案件数</div><div class="metric-value">${db.opportunities.length}件</div></div>
  `;

  destroyChart('chartSegSales');
  const elSS = document.getElementById('chartSegSales');
  if(elSS && segs.length) charts.chartSegSales = new Chart(elSS, {
    type:'bar', data:{labels:segs, datasets:[{label:'売上', data:segs.map(s=>segData[s].sales), backgroundColor:segColors, borderRadius:4}]},
    options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',
      plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>'¥'+ctx.parsed.x.toLocaleString()+'万'}}},
      scales:{x:{beginAtZero:true,ticks:{callback:v=>'¥'+v+'万',font:{size:10}}},y:{ticks:{font:{size:11}},grid:{display:false}}}
    }
  });

  destroyChart('chartSegCount');
  const elSC = document.getElementById('chartSegCount');
  if(elSC && segs.length) charts.chartSegCount = new Chart(elSC, {
    type:'doughnut', data:{labels:segs, datasets:[{data:segs.map(s=>segData[s].count), backgroundColor:segColors, borderWidth:0, hoverOffset:4}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'60%',
      plugins:{legend:{position:'right',labels:{font:{size:11},boxWidth:12}},
               tooltip:{callbacks:{label:ctx=>ctx.label+': '+ctx.parsed+'件'}}}
    }
  });

  document.getElementById('seg-detail-tbody').innerHTML = segs.map(s => {
    const d = segData[s];
    return `<tr>
      <td class="fw-500">${s}</td>
      <td class="text-right">${d.count}</td>
      <td class="text-right">${fmtM(d.amount)}</td>
      <td class="text-right ${d.sales>0?'text-green':''}">${fmt(d.sales)}</td>
      <td class="text-right">${fmt(d.billing)}</td>
      <td class="text-right">${fmt(Math.round(d.weighted))}</td>
      <td class="text-right">${d.won}</td>
    </tr>`;
  }).join('');

  const btnEl = document.getElementById('seg-filter-btns');
  if(btnEl) btnEl.innerHTML = ['全セグメント',...segs.slice(0,8)].map(s => {
    const active = (!activeSegFilter&&s==='全セグメント')||activeSegFilter===s;
    return `<button class="btn btn-sm" style="${active?'background:var(--accent);color:white;border-color:var(--accent);font-size:11px;':'font-size:11px;'}" onclick="activeSegFilter='${s==='全セグメント'?'':s}';renderSegTrend();">${s}</button>`;
  }).join('');
  renderSegTrend();
}

function renderSegTrend() {
  const msr = db.monthlySummary || {};
  const monthKeys = Object.keys(msr).sort();
  const labels = monthKeys.map(k=>{const[y,m]=k.split('-');return y.slice(2)+'/'+parseInt(m);});
  const segsAll = [...new Set(db.opportunities.map(o=>o.dept||'その他'))];
  const targetSegs = activeSegFilter ? [activeSegFilter] : segsAll.slice(0,5);
  const datasets = targetSegs.map((seg,i) => ({
    label:seg,
    data:monthKeys.map(mk=>{
      const md=db.monthly[mk]||{};
      return db.opportunities.filter(o=>(o.dept||'その他')===seg).reduce((s,o)=>s+(md[o.id]?.sales||0),0);
    }),
    borderColor:OWNER_COLORS_EXT[i%OWNER_COLORS_EXT.length],
    borderWidth:2, tension:0.3, pointRadius:2, fill:false
  }));
  destroyChart('chartSegTrend');
  const el = document.getElementById('chartSegTrend');
  if(!el) return;
  charts.chartSegTrend = new Chart(el, {
    type:'line', data:{labels, datasets},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{position:'top',labels:{font:{size:10},boxWidth:12}},
               tooltip:{callbacks:{label:ctx=>'¥'+ctx.parsed.y.toLocaleString()+'万'}}},
      scales:{
        y:{beginAtZero:true,ticks:{callback:v=>'¥'+v+'万',font:{size:10},maxTicksLimit:5},grid:{color:'rgba(0,0,0,0.04)'}},
        x:{ticks:{font:{size:9},maxRotation:45},grid:{display:false}}
      }
    }
  });
  const btnEl = document.getElementById('seg-filter-btns');
  if(btnEl) btnEl.innerHTML = ['全セグメント',...segsAll.slice(0,8)].map(s=>{
    const active = (!activeSegFilter&&s==='全セグメント')||activeSegFilter===s;
    return `<button class="btn btn-sm" style="${active?'background:var(--accent);color:white;border-color:var(--accent);font-size:11px;':'font-size:11px;'}" onclick="activeSegFilter='${s==='全セグメント'?'':s}';renderSegTrend();">${s}</button>`;
  }).join('');
}

// ============================================================
// 担当者別分析
// ============================================================
function renderOwnerTab() {
  const monthData = db.monthly[reportMonth] || {};
  const owners = [...new Set(db.opportunities.map(o=>o.owner).filter(Boolean))];
  const ownerData = {};
  owners.forEach(ow=>{ownerData[ow]={sales:0,billing:0,amount:0,count:0,won:0,pipe:0};});
  db.opportunities.forEach(o=>{
    const ow = o.owner||'未設定';
    if(!ownerData[ow]) ownerData[ow]={sales:0,billing:0,amount:0,count:0,won:0,pipe:0};
    const m = monthData[o.id]||{};
    ownerData[ow].sales   += m.sales   ||0;
    ownerData[ow].billing += m.billing ||0;
    ownerData[ow].amount  += o.amount;
    ownerData[ow].count   += 1;
    ownerData[ow].pipe    += o.amount*o.prob/100;
    if(o.stage==='受注') ownerData[ow].won++;
  });
  const sorted  = owners.sort((a,b)=>ownerData[b].sales-ownerData[a].sales);
  const owColors = sorted.map((_,i)=>OWNER_COLORS_EXT[i%OWNER_COLORS_EXT.length]);

  document.getElementById('owner-metrics').innerHTML = sorted.slice(0,4).map((ow,i)=>{
    const cls=['blue','green','purple','amber'][i]||'gray';
    const d=ownerData[ow];
    return `<div class="metric-card ${cls}"><div class="metric-label">${ow}</div><div class="metric-value">${fmt(d.sales)}</div><div class="metric-change neutral">担当${d.count}件 / 受注${d.won}件</div></div>`;
  }).join('');

  destroyChart('chartOwnerSales');
  const elOS = document.getElementById('chartOwnerSales');
  if(elOS&&sorted.length) charts.chartOwnerSales = new Chart(elOS,{
    type:'bar',data:{labels:sorted,datasets:[{label:'売上',data:sorted.map(o=>ownerData[o].sales),backgroundColor:owColors,borderRadius:4}]},
    options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',
      plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>'¥'+ctx.parsed.x.toLocaleString()+'万'}}},
      scales:{x:{beginAtZero:true,ticks:{callback:v=>'¥'+v+'万',font:{size:10}}},y:{ticks:{font:{size:11}},grid:{display:false}}}
    }
  });

  destroyChart('chartOwnerPipe');
  const elOP = document.getElementById('chartOwnerPipe');
  if(elOP&&sorted.length) charts.chartOwnerPipe = new Chart(elOP,{
    type:'bar',data:{labels:sorted,datasets:[{label:'加重パイプライン',data:sorted.map(o=>Math.round(ownerData[o].pipe)),backgroundColor:owColors.map(c=>c+'99'),borderRadius:4}]},
    options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',
      plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>'¥'+ctx.parsed.x.toLocaleString()+'万'}}},
      scales:{x:{beginAtZero:true,ticks:{callback:v=>'¥'+v+'万',font:{size:10}}},y:{ticks:{font:{size:11}},grid:{display:false}}}
    }
  });

  const sel = document.getElementById('owner-filter');
  if(sel) sel.innerHTML = '<option value="">全担当者</option>'+owners.map(o=>`<option>${o}</option>`).join('');
  renderOwnerTable();
}

function renderOwnerTable() {
  const monthData = db.monthly[reportMonth]||{};
  const filter = document.getElementById('owner-filter')?.value||'';
  const opps   = filter ? db.opportunities.filter(o=>o.owner===filter) : db.opportunities;
  document.getElementById('owner-detail-tbody').innerHTML = [...opps]
    .sort((a,b)=>{
      const ma=monthData[a.id]||{}, mb=monthData[b.id]||{};
      let va,vb;
      switch(ownerSortKey){
        case 'name':    va=a.name;       vb=b.name;       return ownerSortDir*(va<vb?-1:va>vb?1:0);
        case 'customer':va=a.customer;   vb=b.customer;   return ownerSortDir*(va<vb?-1:va>vb?1:0);
        case 'owner':   va=a.owner||'';  vb=b.owner||'';  return ownerSortDir*(va<vb?-1:va>vb?1:0);
        case 'stage':   va=a.stage;      vb=b.stage;      return ownerSortDir*(va<vb?-1:va>vb?1:0);
        case 'amount':  va=a.amount;     vb=b.amount;     return ownerSortDir*(vb-va);
        case 'sales':   va=ma.sales||0;  vb=mb.sales||0;  return ownerSortDir*(vb-va);
        default:        return ownerSortDir*((mb.sales||0)-(ma.sales||0));
      }
    })
    .slice(0,80).map(o=>{
      const m=monthData[o.id]||{};
      return `<tr>
        <td style="font-size:12px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          <a href="#" onclick="showOppDetail('${o.id}');return false;" style="color:var(--accent);text-decoration:none;">${o.name}</a>
        </td>
        <td style="font-size:12px;">${o.customer}</td>
        <td><span class="badge badge-gray" style="font-size:10px;">${o.owner||'—'}</span></td>
        <td>${stageBadge(o.stage)}</td>
        <td class="text-right fw-500">${fmt(o.amount)}</td>
        <td class="text-right ${(m.sales||0)>0?'text-green':''}">${fmt(m.sales||0)}</td>
        <td>${recogBadge(o.recog)}</td>
      </tr>`;
    }).join('')||'<tr><td colspan="7" class="text-center" style="padding:20px;color:var(--text-muted);">データなし</td></tr>';
}

// ============================================================
// 着地予測
// ============================================================
function renderLandingReport() {
  const fyCode = document.getElementById('landing-fy')?.value || dashFY || 'fy25';
  const {start,end} = FY_RANGES[fyCode] || FY_RANGES.fy25;
  const msr = db.monthlySummary||{};
  const allMonths  = Object.keys(msr).sort();
  const fyKeys     = allMonths.filter(k=>k>=start&&k<=end);
  const elapsed    = fyKeys.filter(k=>k<=reportMonth);
  const remaining  = fyKeys.filter(k=>k>reportMonth);
  const totalActual = elapsed.reduce((s,k)=>s+(msr[k]?.salesTotal||0),0);
  const stageF  = document.getElementById('landing-stage-filter')?.value||'';
  const opps    = db.opportunities.filter(o=>o.stage!=='失注'&&(!stageF||o.stage===stageF));
  const monthData = db.monthly[reportMonth]||{};
  const phaseAdj  = {'受注':1.0,'交渉中':0.75,'提案中':0.45,'リード':0.2,'失注':0};

  function calcRem(o) {
    const m = monthData[o.id]||{};
    if(o.recog==='進行基準') return Math.max(0,Math.round(o.amount*(100-(m.cumProgress||0))/100));
    if(o.recog==='月額按分'){
      let done=0;
      Object.keys(db.monthly).forEach(mk=>{done+=db.monthly[mk]?.[o.id]?.sales||0;});
      return Math.max(0,o.amount-done);
    }
    return (m.sales||0)>0?0:o.amount;
  }

  const avg3   = elapsed.slice(-3).reduce((s,k)=>s+(msr[k]?.salesTotal||0),0)/Math.max(elapsed.slice(-3).length,1);
  let m1proj=Math.round(avg3*remaining.length), m2proj=0, m3proj=0;
  opps.forEach(o=>{
    const rem=calcRem(o);
    m2proj+=rem*(o.prob/100)*(phaseAdj[o.stage]||0.5);
    m3proj+=o.recog==='進行基準'?rem*(o.prob/100):rem*(o.prob/100)*0.9;
  });
  m2proj=Math.round(m2proj); m3proj=Math.round(m3proj);
  const consensus=Math.round((totalActual+m1proj+totalActual+m2proj+totalActual+m3proj)/3);
  const simpleW=opps.reduce((s,o)=>s+o.amount*o.prob/100,0);
  const pocOpps=db.opportunities.filter(o=>o.recog==='進行基準'&&o.stage!=='失注');
  const pocWgtRem=pocOpps.reduce((s,o)=>s+calcRem(o)*(o.prob/100),0);

  document.getElementById('landing-metrics').innerHTML = `
    <div class="metric-card blue"><div class="metric-label">累計売上実績</div><div class="metric-value">¥${(totalActual/100).toFixed(1)}M</div><div class="metric-change neutral">${elapsed.length}ヶ月経過</div></div>
    <div class="metric-card green"><div class="metric-label">コンセンサス着地</div><div class="metric-value">¥${(consensus/100).toFixed(1)}M</div><div class="metric-change neutral">3モデル平均</div></div>
    <div class="metric-card purple"><div class="metric-label">PoC残余（加重）</div><div class="metric-value">${fmtM(Math.round(pocWgtRem))}</div><div class="metric-change neutral">進行基準${pocOpps.length}件</div></div>
    <div class="metric-card amber"><div class="metric-label">確度加重</div><div class="metric-value">¥${(simpleW/100).toFixed(1)}M</div></div>
  `;

  const models=[
    {label:'実績トレンド延長',total:totalActual+m1proj,proj:m1proj,desc:`直近3ヶ月平均×残${remaining.length}ヶ月`,color:'#185FA5'},
    {label:'確度加重（フェーズ補正）',total:totalActual+m2proj,proj:m2proj,desc:'フェーズ補正×確度×残余',color:'#1D9E75'},
    {label:'PoC積み上げ',total:totalActual+m3proj,proj:m3proj,desc:'進行基準残余精算+確度加重',color:'#534AB7'},
  ];
  const maxV=Math.max(...models.map(m=>m.total),consensus,1);
  document.getElementById('landing-model-bars').innerHTML=[...models,{label:'コンセンサス',total:consensus,proj:consensus-totalActual,color:'#BA7517'}].map(m=>{
    const pctT=Math.min(96,m.total/maxV*100), pctA=Math.min(96,totalActual/maxV*100);
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;">
      <div style="font-size:13px;font-weight:600;color:${m.color};">¥${(m.total/100).toFixed(1)}M</div>
      <div style="width:100%;flex:1;position:relative;background:var(--bg-secondary);border-radius:6px;overflow:hidden;min-height:80px;">
        <div style="position:absolute;bottom:0;left:0;right:0;height:${pctT}%;background:${m.color}22;"></div>
        <div style="position:absolute;bottom:0;left:0;right:0;height:${pctA}%;background:${m.color};"></div>
      </div>
      <div style="font-size:10px;color:var(--text-muted);text-align:center;line-height:1.3;">${m.label}</div>
    </div>`;
  }).join('');
  document.getElementById('landing-model-detail').innerHTML=models.map(m=>`
    <div style="padding:12px;background:var(--bg-secondary);border-radius:var(--radius-md);">
      <div style="font-size:11px;font-weight:600;color:${m.color};margin-bottom:4px;">${m.label}</div>
      <div style="font-size:20px;font-weight:600;margin-bottom:3px;">¥${(m.total/100).toFixed(1)}M</div>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;">${m.desc}</div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-secondary);">
        <span>実績 ¥${(totalActual/100).toFixed(1)}M</span>
        <span style="color:${m.color};">+¥${(m.proj/100).toFixed(1)}M</span>
      </div>
    </div>`).join('');

  let pd=0,pr=0,pw=0;
  document.getElementById('poc-detail-tbody').innerHTML=pocOpps.sort((a,b)=>calcRem(b)-calcRem(a)).map(o=>{
    const m=monthData[o.id]||{};
    const cum=m.cumProgress||0,done=Math.round(o.amount*cum/100),rem=calcRem(o),wgt=Math.round(rem*o.prob/100);
    pd+=done;pr+=rem;pw+=wgt;
    return `<tr>
      <td style="font-size:12px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${o.name}</td>
      <td class="text-right">${fmt(o.amount)}</td>
      <td class="text-right"><div style="display:flex;align-items:center;gap:5px;justify-content:flex-end;"><div class="progress-bar" style="width:48px;"><div class="progress-fill" style="width:${Math.min(100,cum)}%;background:var(--accent);"></div></div><span style="font-size:11px;">${cum.toFixed(1)}%</span></div></td>
      <td class="text-right">${fmt(done)}</td>
      <td class="text-right fw-500 text-accent">${fmt(rem)}</td>
      <td class="text-right">${fmt(wgt)}</td>
      <td style="font-size:11px;color:var(--text-muted);">${o.owner||'—'}</td>
    </tr>`;
  }).join('')||'<tr><td colspan="7" class="text-center" style="padding:16px;color:var(--text-muted);">進行基準案件なし</td></tr>';
  const pb=document.getElementById('poc-remaining-badge');
  if(pb) pb.textContent='残余合計 '+fmt(pr);
  const pdt=document.getElementById('poc-done-total'); if(pdt) pdt.textContent=fmt(pd);
  const prt=document.getElementById('poc-rem-total');  if(prt) prt.textContent=fmt(pr);
  const pwt=document.getElementById('poc-wgt-total');  if(pwt) pwt.textContent=fmt(pw);

  const totalW=opps.reduce((s,o)=>s+calcRem(o)*o.prob/100,0)||1;
  document.getElementById('landing-tbody').innerHTML=opps
    .sort((a,b)=>calcRem(b)*b.prob/100-calcRem(a)*a.prob/100).slice(0,80).map(o=>{
      const m=monthData[o.id]||{},rem=calcRem(o),wgt=Math.round(rem*o.prob/100);
      return `<tr>
        <td style="font-size:12px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          <a href="#" onclick="showOppDetail('${o.id}');return false;" style="color:var(--accent);text-decoration:none;">${o.name}</a>
        </td>
        <td>${stageBadge(o.stage)}</td>
        <td style="font-size:12px;">${o.prob}%</td>
        <td>${recogBadge(o.recog)}</td>
        <td class="text-right">${fmt(o.amount)}</td>
        <td class="text-right ${(m.sales||0)>0?'text-green':''}">${fmt(m.sales||0)}</td>
        <td class="text-right">${fmt(rem)}</td>
        <td class="text-right fw-500 text-accent">${fmt(wgt)}</td>
        <td style="font-size:11px;color:var(--text-muted);">${o.owner||'—'}</td>
      </tr>`;
    }).join('');
}

// ============================================================
// 過去月参照タブ
// ============================================================
function initHistoryTab() {
  const msr    = db.monthlySummary||{};
  const months = [...new Set([...Object.keys(msr),...Object.keys(db.monthly||{})])].sort().reverse();
  const sel    = document.getElementById('history-month-sel');
  if(!sel) return;
  sel.innerHTML = months.map(m=>`<option value="${m}">${monthLabel(m)}</option>`).join('');
  renderHistoryTab();
}

function renderHistoryTab() {
  const sel   = document.getElementById('history-month-sel');
  const month = sel?.value || reportMonth;
  const msr   = db.monthlySummary||{};
  const ms    = msr[month]||{};
  const md    = db.monthly?.[month]||{};
  const lockEl = document.getElementById('history-lock-status');
  if(lockEl) lockEl.innerHTML = db.monthlyLocked?.[month]
    ? '<span class="badge badge-red">締め済</span>'
    : '<span class="badge badge-gray">未締め</span>';

  let ts = ms.salesTotal   || Object.values(md).reduce((a,v)=>a+(v.sales||0),0);
  let tb = ms.billingTotal || Object.values(md).reduce((a,v)=>a+(v.billing||0),0);
  let tc = ms.cashTotal    || Object.values(md).reduce((a,v)=>a+(v.cash||0),0);

  document.getElementById('history-metrics').innerHTML = `
    <div class="metric-card blue"><div class="metric-label">売上計上額</div><div class="metric-value">${fmtM(ts)}</div></div>
    <div class="metric-card green"><div class="metric-label">請求額</div><div class="metric-value">${fmtM(tb)}</div></div>
    <div class="metric-card amber"><div class="metric-label">入金額</div><div class="metric-value">${fmtM(tc)}</div></div>
    <div class="metric-card red"><div class="metric-label">未回収</div><div class="metric-value">${fmtM(tb-tc)}</div></div>
  `;

  let rs=0,rb=0,rc=0;
  const rows = db.opportunities.filter(o=>{
    const m=md[o.id];
    return m&&(m.sales||m.billing||m.cash);
  }).sort((a,b)=>(md[b.id]?.sales||0)-(md[a.id]?.sales||0)).map(o=>{
    const m=md[o.id]||{};
    rs+=m.sales||0; rb+=m.billing||0; rc+=m.cash||0;
    const unc=(m.billing||0)-(m.cash||0);
    let status='';
    if(m.sales>0&&m.billing===0) status='<span class="badge badge-amber">未請求</span>';
    else if(m.billing>0&&m.cash===0) status='<span class="badge badge-red">未入金</span>';
    else if(m.cash>=m.billing&&m.cash>0) status='<span class="badge badge-green">入金済</span>';
    else if(m.billing>0) status='<span class="badge badge-amber">一部入金</span>';
    else status='<span class="badge badge-gray">—</span>';
    return `<tr>
      <td style="font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
        <a href="#" onclick="showOppDetail('${o.id}');return false;" style="color:var(--accent);text-decoration:none;">${o.name}</a>
      </td>
      <td>${recogBadge(o.recog)}</td>
      <td class="text-right">${fmt(m.sales||0)}</td>
      <td class="text-right">${fmt(m.billing||0)}</td>
      <td class="text-right">${fmt(m.cash||0)}</td>
      <td class="text-right ${unc>0?'text-red fw-500':''}">${fmt(unc)}</td>
      <td>${status}</td>
    </tr>`;
  });
  document.getElementById('history-tbody').innerHTML = rows.join('')||
    '<tr><td colspan="7" class="text-center" style="padding:20px;color:var(--text-muted);">この月のデータなし</td></tr>';
  document.getElementById('hist-s').textContent=fmt(rs);
  document.getElementById('hist-b').textContent=fmt(rb);
  document.getElementById('hist-c').textContent=fmt(rc);
  document.getElementById('hist-u').textContent=fmt(rb-rc);
}


function renderMaster() {
  document.getElementById('users-tbody').innerHTML = db.users.map(u=>`
    <tr>
      <td class="fw-500">${u.name}</td>
      <td style="font-size:12px;color:var(--text-secondary);">${u.email}</td>
      <td>${roleBadge(u.role)}</td>
      <td>${u.dept}</td>
      <td><span class="badge ${u.active?'badge-green':'badge-red'}">${u.active?'有効':'無効'}</span></td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-sm" onclick="editUser('${u.id}')">編集</button>
          <button class="btn btn-sm btn-danger" onclick="if(confirm('削除しますか？')){db.users=db.users.filter(x=>x.id!=='${u.id}');save();renderMaster();}">削除</button>
        </div>
      </td>
    </tr>`).join('');
  document.getElementById('org-tbody').innerHTML = db.orgs.map(o=>`
    <tr>
      <td class="fw-500">${o.name}</td>
      <td>${o.manager}</td>
      <td>${db.users.filter(u=>u.dept===o.name).length}名</td>
      <td class="text-right">${o.budget.toLocaleString()}</td>
      <td><div style="display:flex;gap:4px;"><button class="btn btn-sm" onclick="editOrg('${o.id}')">編集</button><button class="btn btn-sm btn-danger" onclick="if(confirm('削除しますか？')){db.orgs=db.orgs.filter(x=>x.id!=='${o.id}');save();renderMaster();}">削除</button></div></td>
    </tr>`).join('');
  document.getElementById('cust-master-tbody').innerHTML = db.customers.map(c=>`
    <tr>
      <td class="fw-500">${c.name}</td>
      <td><span class="badge badge-gray">${c.industry}</span></td>
      <td>${c.segment}</td>
      <td>${c.owner}</td>
      <td><button class="btn btn-sm btn-danger" onclick="deleteCustomer('${c.id}')">削除</button></td>
    </tr>`).join('');
}


function switchMasterTab(el, tabId) {
  el.parentElement.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  ['master-users','master-org','master-customers','master-phases','master-backup'].forEach(id=>{
    const d=document.getElementById(id);
    if(d) d.style.display=id===tabId?'block':'none';
  });
  if(tabId === 'master-backup') renderBackupHistory();
}

// ============================================================
