// ============================================================
function renderDashboard() {
  // 月セレクトを常に最新データで更新
  initDashMonthSel();
  const msr = db.monthlySummary || {};
  const monthRange = getMonthRange();
  const prevRange  = getPrevMonthRange();

  // 確度フィルター
  const probFilterVal = document.getElementById('dash-prob-filter')?.value || '';
  function matchesProb(o) {
    if(!probFilterVal) return true;
    const p = o.prob;
    if(probFilterVal === '100')  return p === 100;
    if(probFilterVal === '80+')  return p >= 80;
    if(probFilterVal === '50+')  return p >= 50;
    if(probFilterVal === '20+')  return p >= 20;
    if(probFilterVal === '0')    return p === 0;
    return true;
  }

  const allOpps = db.opportunities.filter(matchesScope); // スコープフィルター
  const opps    = allOpps.filter(matchesProb); // 確度フィルター適用

  // 期間内の売上・請求・入金
  // 確度フィルターがある場合は案件別monthly合計、なければmonthlySummary優先
  let totalSales   = 0, totalBilling = 0, totalCash = 0;
  if(probFilterVal) {
    // 確度フィルター適用: 案件別に集計
    monthRange.forEach(mk => {
      const md = db.monthly[mk] || {};
      opps.forEach(o => {
        const m = md[o.id] || {};
        totalSales   += m.sales   || 0;
        totalBilling += m.billing || 0;
        totalCash    += m.cash    || 0;
      });
    });
  } else {
    // フィルターなし: monthlySummary優先（高速）
    totalSales   = monthRange.reduce((s,k) => s + (msr[k]?.salesTotal   || 0), 0);
    totalBilling = monthRange.reduce((s,k) => s + (msr[k]?.billingTotal  || 0), 0);
    totalCash    = monthRange.reduce((s,k) => s + (msr[k]?.cashTotal     || 0), 0);
    // フォールバック
    if(totalSales === 0) {
      monthRange.forEach(mk => {
        const md = db.monthly[mk] || {};
        allOpps.forEach(o => {
          const m = md[o.id] || {};
          totalSales   += m.sales   || 0;
          totalBilling += m.billing || 0;
          totalCash    += m.cash    || 0;
        });
      });
    }
  }

  const prevSales = prevRange.reduce((s,k) => s + (msr[k]?.salesTotal || 0), 0);
  const pipeline  = opps.filter(o => !['受注','失注'].includes(o.stage)).reduce((s,o) => s + o.amount, 0);
  const weighted  = opps.reduce((s,o) => s + o.amount * o.prob / 100, 0);
  const yoy       = prevSales > 0 ? Math.round((totalSales - prevSales) / prevSales * 100) : 0;
  const yoySign   = yoy >= 0 ? '▲' : '▼';
  const yoyCls    = yoy >= 0 ? 'up' : 'down';
  const modeLabel = dashMode === 'fy' ? '年度' : dashMode === 'quarter' ? '四半期' : '当月';
  const probLabel = probFilterVal
    ? (probFilterVal==='100' ? '確度100%' : probFilterVal==='80+'  ? '確度80%+'
     : probFilterVal==='50+' ? '確度50%+' : probFilterVal==='20+'  ? '確度20%+' : '確度0%')
    : '';
  const filterSuffix = probLabel ? ` (${probLabel})` : '';

  // 期間ラベル更新
  const periodLabelEl = document.getElementById('dash-period-label');
  if(periodLabelEl) periodLabelEl.textContent = getPeriodLabel();

  // 予算達成率をKPIに含める
  const budgetForPeriod = monthRange.reduce((s,k) => s + ((db.monthlyBudget||{})[k]||0), 0);
  const achv = budgetForPeriod > 0 ? Math.round(totalSales / budgetForPeriod * 100) : null;
  const budgetGap = budgetForPeriod > 0 ? totalSales - budgetForPeriod : null;

  // KPIカード
  // ── 受注率ファネル計算（TEST案件除外） ──
  const _nonTestOpps = db.opportunities.filter(o => !o.name.includes('TEST'));
  // 各ステージに到達した案件数（stageHistory を参照、なければ現在のstageで判定）
  const _hasStage = (o, stage) => {
    if(o.stageHistory?.some(h => h.stage === stage)) return true;
    const order = ['リード','提案中','見積提出','交渉中','受注','失注'];
    const targetIdx = order.indexOf(stage);
    const currentIdx = order.indexOf(o.stage);
    return currentIdx >= targetIdx && targetIdx >= 0;
  };
  const _cntLead     = _nonTestOpps.length; // 案件化数（全案件 = リード段階以上）
  const _cntProposal = _nonTestOpps.filter(o => _hasStage(o, '提案中')).length;
  const _cntQuote    = _nonTestOpps.filter(o => _hasStage(o, '見積提出')).length;
  const _cntNego     = _nonTestOpps.filter(o => _hasStage(o, '交渉中')).length;
  const _cntWon      = _nonTestOpps.filter(o => _hasStage(o, '受注')).length;
  const _rate = (n, d) => d > 0 ? Math.round(n / d * 100) : 0;
  const winRateCard = `
    <div class="metric-card" style="grid-column:1/-1;background:var(--bg-secondary);border:1px solid var(--border-medium);">
      <div class="metric-label" style="font-size:12px;font-weight:600;margin-bottom:8px;">📊 受注率ファネル（TEST案件除外）</div>
      <div style="display:flex;align-items:center;gap:0;flex-wrap:wrap;">
        <div style="text-align:center;padding:6px 10px;">
          <div style="font-size:18px;font-weight:700;color:var(--accent);">${_cntLead}</div>
          <div style="font-size:10px;color:var(--text-muted);">案件化</div>
        </div>
        <div style="color:var(--text-muted);font-size:11px;">→<br>${_rate(_cntProposal,_cntLead)}%</div>
        <div style="text-align:center;padding:6px 10px;">
          <div style="font-size:18px;font-weight:700;color:var(--accent);">${_cntProposal}</div>
          <div style="font-size:10px;color:var(--text-muted);">提案</div>
        </div>
        <div style="color:var(--text-muted);font-size:11px;">→<br>${_rate(_cntQuote,_cntProposal)}%</div>
        <div style="text-align:center;padding:6px 10px;">
          <div style="font-size:18px;font-weight:700;color:var(--accent);">${_cntQuote}</div>
          <div style="font-size:10px;color:var(--text-muted);">見積</div>
        </div>
        <div style="color:var(--text-muted);font-size:11px;">→<br>${_rate(_cntNego,_cntQuote)}%</div>
        <div style="text-align:center;padding:6px 10px;">
          <div style="font-size:18px;font-weight:700;color:var(--accent);">${_cntNego}</div>
          <div style="font-size:10px;color:var(--text-muted);">交渉</div>
        </div>
        <div style="color:var(--text-muted);font-size:11px;">→<br>${_rate(_cntWon,_cntNego)}%</div>
        <div style="text-align:center;padding:6px 10px;background:var(--accent-light);border-radius:8px;">
          <div style="font-size:18px;font-weight:700;color:var(--accent);">${_cntWon}</div>
          <div style="font-size:10px;color:var(--text-muted);">受注</div>
        </div>
        <div style="margin-left:16px;padding:6px 12px;background:${_rate(_cntWon,_cntLead)>=30?'var(--green-light,#f0fdf4)':'var(--bg-primary)'};border-radius:8px;border:1px solid var(--border-medium);">
          <div style="font-size:22px;font-weight:800;color:${_rate(_cntWon,_cntLead)>=30?'var(--green-dark)':'var(--accent)'};">受注率 ${_rate(_cntWon,_cntLead)}%</div>
          <div style="font-size:10px;color:var(--text-muted);">案件化 → 受注</div>
        </div>
      </div>
    </div>`;

  document.getElementById('dash-metrics').innerHTML = `
    <div class="metric-card blue">
      <div class="metric-label">売上実績（${modeLabel}${filterSuffix}）</div>
      <div class="metric-value">${fmtM(totalSales)}</div>
      <div class="metric-change ${yoyCls}">${yoySign}${Math.abs(yoy)}% 前期比</div>
    </div>
    ${budgetForPeriod > 0 ? `
    <div class="metric-card ${achv>=100?'green':achv>=80?'blue':'amber'}">
      <div class="metric-label">予算達成率</div>
      <div class="metric-value">${achv}%</div>
      <div class="metric-change ${budgetGap>=0?'up':'down'}" style="color:${budgetGap>=0?'var(--green-dark)':'var(--red-dark)'};">
        ${budgetGap>=0?'▲':'▼'}¥${Math.abs(budgetGap).toLocaleString()}万 ${budgetGap>=0?'超過':'未達'}
      </div>
    </div>` : ''}
    <div class="metric-card green">
      <div class="metric-label">請求額（${modeLabel}）</div>
      <div class="metric-value">${fmtM(totalBilling)}</div>
      <div class="metric-change neutral">売上比 ${totalSales ? Math.round(totalBilling/totalSales*100) : 0}%</div>
    </div>
    <div class="metric-card amber">
      <div class="metric-label">未回収残高</div>
      <div class="metric-value">${fmtM(totalBilling - totalCash)}</div>
      <div class="metric-change neutral">請求 − 入金</div>
    </div>
    <div class="metric-card purple">
      <div class="metric-label">パイプライン</div>
      <div class="metric-value">${fmtM(pipeline)}</div>
      <div class="metric-change neutral">進行中案件</div>
    </div>
    <div class="metric-card green">
      <div class="metric-label">確度加重 着地</div>
      <div class="metric-value">${fmtM(Math.round(weighted))}</div>
      <div class="metric-change neutral">全案件加重</div>
    </div>
    <div class="metric-card ${yoy >= 0 ? 'green' : 'red'}">
      <div class="metric-label">前期比</div>
      <div class="metric-value" style="color:${yoy >= 0 ? 'var(--green-dark)' : 'var(--red-dark)'};">${yoySign}${Math.abs(yoy)}%</div>
      <div class="metric-change neutral">¥${(prevSales/100).toFixed(1)}M → ¥${(totalSales/100).toFixed(1)}M</div>
    </div>
    ${winRateCard}
  `;

  // 売上推移チャート（確度別 積み上げ棒グラフ）
  const chartTitle = document.getElementById('dash-chart-title');
  let chartRange;
  if(dashMode === 'month') {
    chartRange = Array.from({length:13}, (_,i) => addMonths(dashMonth, -6 + i));
    if(chartTitle) chartTitle.textContent = '月次売上推移（確度別）';
  } else {
    chartRange = monthRange;
    if(chartTitle) chartTitle.textContent = '月次売上推移（確度別・' + getPeriodLabel() + '）';
  }
  const chartLabels = chartRange.map(k => { const [y,m] = k.split('-'); return y.slice(2)+'/'+parseInt(m); });

  // 確度別設定
  const PROB_LEVELS = [100, 80, 50, 20, 0];
  const PROB_COLORS_CHART = { 100:'#1D9E75', 80:'#185FA5', 50:'#534AB7', 20:'#BA7517', 0:'#C8C7C4' };
  const PROB_LABELS_CHART = { 100:'確度100%', 80:'確度80%', 50:'確度50%', 20:'確度20%', 0:'確度0%' };

  // 月×確度 の売上を集計（monthly データから案件別）
  const probDatasets = PROB_LEVELS.map(prob => ({
    label: PROB_LABELS_CHART[prob],
    data: chartRange.map(ym => {
      const md = db.monthly[ym] || {};
      return db.opportunities
        .filter(o => o.prob === prob && matchesProb(o))
        .reduce((s, o) => s + (md[o.id]?.sales || 0), 0);
    }),
    backgroundColor: PROB_COLORS_CHART[prob],
    borderWidth: 0,
    borderRadius: 2,
    stack: 'sales',
  }));

  // 合計ライン
  const totalLine = {
    label: '合計',
    type: 'line',
    data: chartRange.map(ym => {
      const md = db.monthly[ym] || {};
      return opps.reduce((s, o) => s + (md[o.id]?.sales || 0), 0);
    }),
    borderColor: '#E24B4A',
    borderWidth: 2,
    borderDash: [4, 3],
    pointRadius: 2,
    tension: 0.3,
    fill: false,
    order: 0,
  };

  destroyChart('chartSales');
  charts.chartSales = new Chart(document.getElementById('chartSales'), {
    type: 'bar',
    data: { labels: chartLabels, datasets: [...probDatasets, totalLine] },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, position: 'top',
                  labels: { font: { size: 10 }, boxWidth: 12, padding: 6 } },
        tooltip: { callbacks: {
          label: ctx => ctx.dataset.label + ': ¥' + (ctx.parsed.y || 0).toLocaleString() + '万'
        }}
      },
      scales: {
        x: { stacked: true, ticks: { font: { size: 9 }, maxRotation: 45 }, grid: { display: false } },
        y: { stacked: true, beginAtZero: true,
             ticks: { callback: v => '¥' + v + '万', font: { size: 10 }, maxTicksLimit: 6 },
             grid: { color: 'rgba(0,0,0,0.04)' } }
      }
    }
  });

  // フロー（売上・請求・入金）
  const flowTitle = document.getElementById('dash-flow-title');
  if(flowTitle) flowTitle.textContent = '売上・請求・入金（' + modeLabel + '）';
  destroyChart('chartFlow');
  charts.chartFlow = new Chart(document.getElementById('chartFlow'), {
    type: 'bar',
    data: {labels:['売上計上','請求','入金'], datasets:[{data:[totalSales, totalBilling, totalCash], backgroundColor:['#185FA5','#1D9E75','#639922'], borderRadius:5}]},
    options: {responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}, tooltip:{callbacks:{label:ctx => '¥'+ctx.parsed.y.toLocaleString()+'万'}}},
      scales:{y:{beginAtZero:true, ticks:{callback:v=>'¥'+v+'万', font:{size:10}}, grid:{color:'rgba(0,0,0,0.04)'}}, x:{ticks:{font:{size:11}}, grid:{display:false}}}
    }
  });

  // 担当者別売上（期間内）
  // owner 名前を db.users で正規化（姓のみ→フルネーム等の表記ゆれを統一）
  // email が同じユーザーは先頭のユーザーに統一（重複ユーザー対応）
  const _uniqueUsers = [];
  const _seenEmails = new Set();
  db.users.filter(u=>u.active!==false).forEach(u => {
    if(!_seenEmails.has(u.email)) { _seenEmails.add(u.email); _uniqueUsers.push(u); }
  });
  // 同一メールの別名マップ（例: ギブラン → Gibran）
  const _emailToName = {};
  db.users.forEach(u => { if(!_emailToName[u.email]) _emailToName[u.email] = u.name; });
  const _normalizeOwner = (name) => {
    if(!name) return '未設定';
    // 完全一致
    const exact = db.users.find(u => u.name === name);
    if(exact) return _emailToName[exact.email] || exact.name;
    // 部分一致（姓のみ or 名のみ）
    const partial = db.users.find(u => u.name.includes(name) || name.includes(u.name));
    if(partial) return _emailToName[partial.email] || partial.name;
    return name; // マッチしなければそのまま
  };
  const ownerSales = {};
  monthRange.forEach(mk => {
    const md = db.monthly[mk] || {};
    opps.forEach(o => {
      const m = md[o.id] || {};
      const ownerKey = _normalizeOwner(o.owner);
      ownerSales[ownerKey] = (ownerSales[ownerKey] || 0) + (m.sales || 0);
    });
  });
  const ownerEntries = Object.entries(ownerSales).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1]);
  destroyChart('chartOwnerDash');
  // 担当者別チャート（確度フィルター適用済みの opps を使用）
  const elOD = document.getElementById('chartOwnerDash');
  if(elOD && ownerEntries.length) {
    charts.chartOwnerDash = new Chart(elOD, {
      type:'bar',
      data:{labels:ownerEntries.map(([k])=>k), datasets:[{label:'売上', data:ownerEntries.map(([,v])=>v), backgroundColor:OWNER_COLORS.slice(0, ownerEntries.length), borderRadius:4}]},
      options:{responsive:true, maintainAspectRatio:false, indexAxis:'y',
        plugins:{legend:{display:false}, tooltip:{callbacks:{label:ctx=>'¥'+ctx.parsed.x.toLocaleString()+'万'}}},
        scales:{x:{beginAtZero:true, ticks:{callback:v=>'¥'+v+'万', font:{size:10}}}, y:{ticks:{font:{size:11}}, grid:{display:false}}}
      }
    });
  }

  // 前期比グラフ
  destroyChart('chartYoY');
  const elYY = document.getElementById('chartYoY');
  if(elYY) {
    const prevLabel = dashMode==='fy' ? '前年度' : dashMode==='quarter' ? '前四半期' : '前月';
    charts.chartYoY = new Chart(elYY, {
      type:'bar',
      data:{labels:[prevLabel, '当期'], datasets:[{data:[prevSales, totalSales], backgroundColor:['rgba(136,135,128,0.6)', '#185FA5'], borderRadius:5}]},
      options:{responsive:true, maintainAspectRatio:false,
        plugins:{legend:{display:false}, tooltip:{callbacks:{label:ctx=>'¥'+ctx.parsed.y.toLocaleString()+'万'}}},
        scales:{y:{beginAtZero:true, ticks:{callback:v=>'¥'+v+'万', font:{size:10}}, grid:{color:'rgba(0,0,0,0.04)'}}, x:{ticks:{font:{size:11}}, grid:{display:false}}}
      }
    });
  }

  // ── 予算 vs 実績チャート ──
  const budget = db.monthlyBudget || {};

  // 期間内の予算合計
  const totalBudget = monthRange.reduce((s,k) => s + (budget[k] || 0), 0);
  const achvPct = totalBudget > 0 ? Math.round(totalSales / totalBudget * 100) : 0;
  const achvBadge = document.getElementById('budget-achv-badge');
  if(achvBadge) {
    achvBadge.textContent = `達成率 ${achvPct}%`;
    achvBadge.style.background = achvPct >= 100 ? 'var(--green)' : achvPct >= 80 ? '#185FA5' : '#BA7517';
    achvBadge.style.color = '#fff';
    achvBadge.style.padding = '3px 8px';
    achvBadge.style.borderRadius = '10px';
  }

  // 棒グラフ（予算 vs 実績 累計）
  destroyChart('chartBudgetBar');
  const elBB = document.getElementById('chartBudgetBar');
  if(elBB && totalBudget > 0) {
    charts.chartBudgetBar = new Chart(elBB, {
      type:'bar',
      data:{
        labels:['予算', '実績'],
        datasets:[{
          data:[totalBudget, totalSales],
          backgroundColor:['rgba(136,135,128,0.5)', totalSales >= totalBudget ? '#1D9E75' : '#185FA5'],
          borderRadius:5
        }]
      },
      options:{responsive:true, maintainAspectRatio:false,
        plugins:{legend:{display:false},
          tooltip:{callbacks:{label:ctx=>'¥'+ctx.parsed.y.toLocaleString()+'万'}}},
        scales:{
          y:{beginAtZero:true, ticks:{callback:v=>'¥'+v+'万',font:{size:10}}, grid:{color:'rgba(0,0,0,0.04)'}},
          x:{ticks:{font:{size:12}}, grid:{display:false}}
        }
      }
    });
  }

  // 折れ線グラフ（月次推移 予算 vs 実績）
  const trendRange = dashMode === 'month'
    ? Array.from({length:13}, (_,i) => addMonths(dashMonth, -6+i))
    : monthRange;
  const trendLabels = trendRange.map(k=>{const[y,m]=k.split('-');return y.slice(2)+'/'+parseInt(m);});
  destroyChart('chartBudgetTrend');
  const elBT = document.getElementById('chartBudgetTrend');
  if(elBT) {
    charts.chartBudgetTrend = new Chart(elBT, {
      type:'line',
      data:{labels:trendLabels, datasets:[
        {label:'予算', data:trendRange.map(k=>budget[k]||null), borderColor:'#888780', borderWidth:2, borderDash:[5,3], pointRadius:2, tension:0.3, fill:false},
        {label:'実績', data:trendRange.map(k=>msr[k]?.salesTotal||null), borderColor:'#185FA5', borderWidth:2, pointRadius:3, tension:0.3, fill:false}
      ]},
      options:{responsive:true, maintainAspectRatio:false,
        plugins:{legend:{position:'top', labels:{font:{size:10}, boxWidth:12}},
          tooltip:{callbacks:{label:ctx=>ctx.dataset.label+' ¥'+( ctx.parsed.y||0).toLocaleString()+'万'}}},
        scales:{
          y:{beginAtZero:true, ticks:{callback:v=>'¥'+v+'万',font:{size:9},maxTicksLimit:5}, grid:{color:'rgba(0,0,0,0.04)'}},
          x:{ticks:{font:{size:9},maxRotation:45}, grid:{display:false}}
        }
      }
    });
  }


  // ── 今日のフォローアップウィジェット ──
  (function renderFollowupWidget() {
    const today = new Date().toISOString().split('T')[0];
    const el = document.getElementById('dash-followup-section');
    if(!el) return;

    // 今日・直近3日以内のフォローアップ
    const urgent = db.opportunities.filter(o =>
      o.nextAction?.date && o.stage !== '受注' && o.stage !== '失注' &&
      o.nextAction.date <= today
    ).sort((a,b) => a.nextAction.date.localeCompare(b.nextAction.date));

    const upcoming = db.opportunities.filter(o => {
      if(!o.nextAction?.date || o.stage === '受注' || o.stage === '失注') return false;
      const d = Math.ceil((new Date(o.nextAction.date) - new Date(today)) / 86400000);
      return d > 0 && d <= 7;
    }).sort((a,b) => a.nextAction.date.localeCompare(b.nextAction.date));

    if(!urgent.length && !upcoming.length) { el.innerHTML = ''; return; }

    const priorityColor = {urgent:'#E24B4A', high:'#BA7517', normal:'#185FA5'};
    const priorityLabel = {urgent:'緊急', high:'高', normal:'通常'};

    const makeRow = (o, isOverdue) => {
      const daysLeft = Math.ceil((new Date(o.nextAction.date) - new Date(today)) / 86400000);
      const pri = o.nextAction.priority || 'normal';
      const color = isOverdue ? '#E24B4A' : priorityColor[pri];
      return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;
        border-left:3px solid ${color};background:${isOverdue?'rgba(226,75,74,0.05)':'var(--bg-secondary)'};
        border-radius:0 6px 6px 0;cursor:pointer;"
        onclick="showOppDetail('${o.id}')">
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            ${isOverdue?'⚠ ':''}${o.name}
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:1px;">
            ${o.nextAction.action||'—'}　／　${o.owner||'—'}
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-size:11px;font-weight:600;color:${color};">
            ${isOverdue ? Math.abs(daysLeft)+'日超過' : daysLeft===0?'本日':'あと'+daysLeft+'日'}
          </div>
          <div style="font-size:10px;color:var(--text-muted);">${o.nextAction.date}</div>
        </div>
        <span style="font-size:10px;padding:2px 6px;border-radius:4px;background:${color}22;color:${color};white-space:nowrap;">
          ${priorityLabel[pri]||'通常'}
        </span>
      </div>`;
    };

    el.innerHTML = `
      <div class="card">
        <div class="card-header" style="padding:10px 16px;">
          <span class="card-title" style="font-size:13px;">📅 フォローアップ一覧</span>
          <span style="font-size:11px;color:var(--text-muted);">
            ${urgent.length ? `<span style="color:#E24B4A;font-weight:600;">${urgent.length}件 期限切れ・本日</span>` : ''}
            ${upcoming.length ? `　${upcoming.length}件 7日以内` : ''}
          </span>
        </div>
        <div style="padding:8px 12px;display:flex;flex-direction:column;gap:6px;">
          ${urgent.map(o=>makeRow(o,true)).join('')}
          ${upcoming.map(o=>makeRow(o,false)).join('')}
        </div>
      </div>`;
  })();

  // 計上方式ドーナツ
  const recogCounts = {};
  opps.forEach(o => { recogCounts[o.recog] = (recogCounts[o.recog] || 0) + 1; });
  const recogColors = {'進行基準':'#534AB7','一括計上':'#185FA5','月額按分':'#1D9E75','検収基準':'#BA7517','手動計上':'#888780'};
  const recogLabels = Object.keys(recogCounts);
  const recogData   = recogLabels.map(k => recogCounts[k]);
  destroyChart('chartRecog');
  charts.chartRecog = new Chart(document.getElementById('chartRecog'), {
    type:'doughnut',
    data:{labels:recogLabels, datasets:[{data:recogData, backgroundColor:recogLabels.map(k=>recogColors[k]||'#888'), borderWidth:0, hoverOffset:4}]},
    options:{responsive:true, maintainAspectRatio:false, cutout:'68%', plugins:{legend:{display:false}}}
  });
  const rtotal = recogData.reduce((a,b) => a+b, 0);
  document.getElementById('recog-legend').innerHTML = recogLabels.map((k,i) => `
    <span style="display:flex;align-items:center;gap:7px;">
      <span style="width:10px;height:10px;border-radius:2px;background:${recogColors[k]||'#888'};flex-shrink:0;"></span>
      <span style="color:var(--text-secondary);">${k} <strong>${Math.round(recogData[i]/rtotal*100)}%</strong></span>
    </span>`).join('');

  // ファネル（フェーズ変更履歴つき）
  const stages = ['リード','提案中','見積提出','交渉中','受注'];
  const stageColors = {'リード':'#888780','提案中':'#378ADD','見積提出':'#BA7517','交渉中':'#534AB7','受注':'#1D9E75'};

  // フェーズ別: 平均滞留日数を計算
  function calcAvgDays(stage) {
    const oppsInStage = opps.filter(o => o.stage === stage && o.stageHistory?.length);
    if(!oppsInStage.length) return null;
    const now = new Date();
    const days = oppsInStage.map(o => {
      const hist = o.stageHistory;
      const entry = [...hist].reverse().find(h => h.stage === stage);
      if(!entry) return null;
      const entryDate = new Date(entry.date);
      // 次のフェーズ変更日（or 今日）
      const entryIdx = hist.indexOf(entry);
      const nextEntry = hist[entryIdx + 1];
      const exitDate  = nextEntry ? new Date(nextEntry.date) : now;
      const diff = Math.round((exitDate - entryDate) / 86400000);
      return diff >= 0 ? diff : null;
    }).filter(d => d !== null);
    if(!days.length) return null;
    return Math.round(days.reduce((a,b)=>a+b,0) / days.length);
  }

  // フェーズ別: 前フェーズからのCV率
  function calcCvRate(fromStage, toStage) {
    const fromCount = opps.filter(o =>
      o.stageHistory?.some(h=>h.stage===fromStage)
    ).length;
    const toCount = opps.filter(o =>
      o.stageHistory?.some(h=>h.stage===fromStage) &&
      o.stageHistory?.some(h=>h.stage===toStage)
    ).length;
    return fromCount > 0 ? Math.round(toCount/fromCount*100) : null;
  }

  const stageData = stages.map(s => ({
    stage: s,
    count: opps.filter(o=>o.stage===s).length,
    amt:   opps.filter(o=>o.stage===s).reduce((a,o)=>a+o.amount,0),
    avgDays: calcAvgDays(s)
  }));
  const maxAmt = Math.max(...stageData.map(d=>d.amt)) || 1;

  document.getElementById('funnel-chart').innerHTML = stageData.map((d, i) => {
    const pct = Math.max(8, Math.round(d.amt/maxAmt*100));
    const daysLabel = d.avgDays !== null
      ? `<span style="font-size:10px;color:var(--text-muted);margin-left:6px;">平均${d.avgDays}日</span>`
      : '';
    // CV率（前フェーズ→このフェーズ）
    let cvLabel = '';
    if(i > 0) {
      const cv = calcCvRate(stages[i-1], d.stage);
      if(cv !== null) {
        cvLabel = `<div style="font-size:10px;color:var(--text-muted);text-align:center;margin:-2px 0 2px;">▼ CV ${cv}%</div>`;
      }
    }
    return `${cvLabel}<div class="funnel-row">
      <div class="funnel-label">${d.stage}${daysLabel}</div>
      <div class="funnel-track">
        <div class="funnel-fill" style="width:${pct}%;background:${stageColors[d.stage]};">${d.count}件</div>
      </div>
      <div class="funnel-meta">${fmtM(d.amt)}</div>
    </div>`;
  }).join('');

  // 期間内案件テーブル
  const periodSales = {};
  monthRange.forEach(mk => {
    const md = db.monthly[mk] || {};
    opps.forEach(o => { periodSales[o.id] = (periodSales[o.id] || 0) + (md[o.id]?.sales || 0); });
  });
  const periodOpps = [...opps].sort((a,b) => (periodSales[b.id]||0) - (periodSales[a.id]||0)).slice(0, 8);
  document.getElementById('dash-opp-tbody').innerHTML = periodOpps.map(o => `
    <tr>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
        <a href="#" style="color:var(--accent);text-decoration:none;font-weight:500;" onclick="showOppDetail('${o.id}');return false;">${o.name}</a>
      </td>
      <td style="font-size:12px;">${o.customer}</td>
      <td>${stageBadge(o.stage)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:5px;">
          <div class="progress-bar"><div class="progress-fill" style="width:${o.prob}%;background:${o.prob>=70?'var(--green)':o.prob>=40?'var(--amber)':'var(--red)'};"></div></div>
          <span style="font-size:12px;">${o.prob}%</span>
        </div>
      </td>
      <td class="fw-500">${fmt(o.amount)}</td>
      <td>${recogBadge(o.recog)}</td>
      <td class="text-right ${periodSales[o.id]>0?'text-green fw-500':''}">${fmt(periodSales[o.id]||0)}</td>
      <td style="font-size:12px;color:var(--text-secondary);">${o.owner || '—'}</td>
    </tr>`).join('');
  renderContractDelay();
}

// ============================================================
// RENDER: LEADS
// ============================================================
