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

  // ── 当該月の請求書PDFが保存されているか判定するヘルパー ──
  // 判定基準（いずれか1つでも満たせば「発行済」）：
  //   1. monthly[ym][oppId].billingDate に当月日付が記録されている
  //      （案件保存時に自動セットされるため、最も確実な判定基準）
  //   2. 案件のinvoiceフォルダに当月年月(YYYYMM)を含むファイル名のPDFが存在
  //   3. 案件のinvoiceフォルダ内のいずれかのファイルが当月内に保存されている
  function hasInvoiceIssuedForMonth(oppId, ym) {
    if(typeof getPdfFiles !== 'function') return true; // PDF管理機能無効時は従来通り
    // 1) 月次データのbillingDate
    const md = (db.monthly||{})[ym] || {};
    const m  = md[oppId] || {};
    if(m.billingDate) {
      const bdYm = String(m.billingDate).slice(0, 7);
      if(bdYm === ym) return true;
    }
    // 2) ファイル名に YYYYMM が含まれる請求書PDF
    const files = getPdfFiles(oppId, 'invoice') || [];
    const ymKey = ym.replace('-', '');
    if(files.some(f => f && f.name && f.name.includes(ymKey))) return true;
    // 3) 当月内に保存(date)された請求書PDF
    if(files.some(f => f && f.date && String(f.date).slice(0, 7) === ym)) return true;
    return false;
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
    // 当月分の請求書PDFが発行・保存されているか
    const invIssued = hasInvoiceIssuedForMonth(o.id, currentMonth);
    let statusBadge = '';
    if(m.sales > 0 && m.billing === 0) {
      statusBadge = '<span class="badge badge-amber">未請求</span>';
    } else if(m.billing > 0 && !invIssued) {
      // 請求額が入力されていても請求書PDFが未保存なら「未請求」扱い
      statusBadge = '<span class="badge badge-amber" title="請求額は登録されていますが、請求書PDFが発行・保存されていません">未請求</span>';
    } else if(m.billing > 0 && m.cash === 0) {
      statusBadge = '<span class="badge badge-red">未入金</span>';
    } else if(m.cash > 0 && m.cash >= m.billing) {
      statusBadge = '<span class="badge badge-green">入金済</span>';
    } else if(m.billing > 0) {
      statusBadge = '<span class="badge badge-amber">一部入金</span>';
    } else {
      statusBadge = '<span class="badge badge-gray">未着手</span>';
    }
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
      <td style="font-size:12px;"><a href="#" style="color:var(--accent);text-decoration:none;" onclick="showOppDetail('${o.id}');return false;">${o.name}</a>${teamsIconHtml(o)}</td>
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
      <td style="white-space:nowrap;">
        <div style="display:flex;gap:4px;">
        <button class="btn btn-sm" style="font-size:11px;padding:2px 8px;"
          onclick="generateInvoice('${o.id}','${currentMonth}')">請求書作成</button>
        <button class="btn btn-sm" style="font-size:11px;padding:2px 8px;background:var(--green);color:#fff;border-color:var(--green);"
          onclick="generateDelivery('${o.id}','${currentMonth}')">納品書作成</button>
        </div>
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
// RENDER: REPORTS
