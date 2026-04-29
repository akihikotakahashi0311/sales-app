// CSV EXPORT
// ============================================================


function exportCSV(type) {
  let csv='', filename='';
  if(type==='opportunities') {
    csv = '案件ID,案件名,顧客,担当者,フェーズ,確度(%),契約総額(万円),加重額(万円),計上方式,開始日,終了日\n';
    csv += db.opportunities.map(o=>`${o.id},"${o.name}","${o.customer}","${o.owner}",${o.stage},${o.prob},${o.amount},${Math.round(o.amount*o.prob/100)},${o.recog},${o.start},${o.end}`).join('\n');
    filename = `案件一覧_${currentMonth}.csv`;
  } else if(type==='customers') {
    csv = '顧客名,業種,セグメント,担当営業,売上合計(万円),請求合計(万円),入金合計(万円),未回収(万円)\n';
    const byC={};
    db.opportunities.forEach(o=>{
      if(!byC[o.customer]) byC[o.customer]={sales:0,billing:0,cash:0};
      const m=db.monthly[currentMonth]?.[o.id]||{};
      byC[o.customer].sales+=m.sales||0;byC[o.customer].billing+=m.billing||0;byC[o.customer].cash+=m.cash||0;
    });
    csv += db.customers.map(c=>{
      const d=byC[c.name]||{sales:0,billing:0,cash:0};
      return `"${c.name}",${c.industry},${c.segment},"${c.owner}",${d.sales},${d.billing},${d.cash},${d.billing-d.cash}`;
    }).join('\n');
    filename = `顧客分析_${currentMonth}.csv`;
  }
  downloadCSV(csv, filename);
}

function exportMonthlyCSV() {
  let csv = '案件ID,案件名,計上方式,売上計上額(万円),請求額(万円),入金額(万円),当月進捗率,累計進捗率,未回収(万円)\n';
  csv += db.opportunities.map(o=>{
    const m=getMonthly(o.id);
    return `${o.id},"${o.name}",${o.recog},${m.sales},${m.billing},${m.cash},${m.progress.toFixed(1)},${m.cumProgress.toFixed(1)},${m.billing-m.cash}`;
  }).join('\n');
  downloadCSV(csv, `月次データ_${currentMonth}.csv`);
}

function dismissAlert(id) {
  const a = db.alerts.find(x=>x.id===id);
  if(a) { a.dismissed = true; save(); renderAlerts(); updateAlertBadge(); toast('対応済にしました'); }
}


function dismissAllAlerts() {
  // renderAlerts と同じフィルターを適用して対象を決定
  const q            = (document.getElementById('alert-search')?.value||'').toLowerCase();
  const typeFilter   = document.getElementById('alert-type-filter')?.value||'';
  const statusFilter = document.getElementById('alert-status-filter')?.value||'active';

  const targets = db.alerts.filter(a => {
    if(a.dismissed) return false;                        // 対応済は除外
    if(statusFilter === 'dismissed') return false;        // 対応済フィルター中は0件
    if(typeFilter && a.type !== typeFilter) return false;
    if(q && !a.title.toLowerCase().includes(q) && !(a.detail||'').toLowerCase().includes(q)) return false;
    if(a.oppId && viewScope === 'own' && currentUser) {
      const opp = db.opportunities.find(o => o.id === a.oppId);
      if(opp && opp.owner !== currentUser.name) return false;
    }
    return true;
  });

  if(targets.length === 0) { toast('表示中の未対応アラートがありません', 'error'); return; }
  if(!confirm(targets.length + '件のアラートを対応済にしますか？')) return;
  const ids = new Set(targets.map(a => a.id));
  db.alerts.forEach(a => { if(ids.has(a.id)) a.dismissed = true; });
  save(); renderAlerts(); updateAlertBadge();
  toast(targets.length + '件を対応済にしました', 'success');
}

// ============================================================
// 契約書アップロード時: 契約日入力ポップアップ
// ============================================================
let _contractDateOppId = null;

function openContractDatePopup(oppId) {
  _contractDateOppId = oppId;
  const today = new Date().toISOString().split('T')[0];

  // モーダルを開いてデータを復元
  const modalEl = document.getElementById('modal-contract-date-popup');
  if(!modalEl) { console.error('modal-contract-date-popup not found'); return; }

  // 契約日のデフォルトを今日に設定
  const dateEl = document.getElementById('popup-contract-date');
  if(dateEl && !dateEl.value) dateEl.value = today;

  // opp の既存データを復元
  initContractDatePopup(oppId);

  modalEl.classList.add('open');
}

// 契約時必要事項ポップアップ: 請求タイプ変更
function onPopupBillingTypeChange() {
  const type      = document.getElementById('popup-billing-type')?.value || '';
  const dateGroup = document.getElementById('popup-billing-date-group');
  const dateLabel = document.getElementById('popup-billing-date-label');
  const dateHint  = document.getElementById('popup-billing-date-hint');
  const nextGroup = document.getElementById('popup-next-billing-date-group');
  // 月次請求の場合: 契約終了日を必須に
  const endBadge  = document.getElementById('popup-end-required-badge');
  const optBadge  = document.getElementById('popup-end-optional-badge');

  if(type === 'monthly') {
    if(dateGroup) dateGroup.style.display = 'none';
    if(nextGroup) nextGroup.style.display = 'none';
    if(dateHint)  dateHint.textContent = '月次請求のため毎月末に自動設定されます';
    // 月次売上計上のため契約終了日を必須表示
    if(endBadge) endBadge.style.display = '';
    if(optBadge) optBadge.style.display = 'none';
  } else if(type === 'milestone') {
    if(dateGroup) dateGroup.style.display = '';
    if(dateLabel) dateLabel.textContent = '初回請求予定日';
    if(nextGroup) nextGroup.style.display = '';
    if(dateHint)  dateHint.textContent = '請求書発行後、次回請求予定日を更新してください';
    if(endBadge) endBadge.style.display = 'none';
    if(optBadge) optBadge.style.display = '';
  } else if(type === 'lump') {
    if(dateGroup) dateGroup.style.display = '';
    if(dateLabel) dateLabel.textContent = '請求予定日';
    if(nextGroup) nextGroup.style.display = 'none';
    if(dateHint)  dateHint.textContent = '';
    if(endBadge) endBadge.style.display = 'none';
    if(optBadge) optBadge.style.display = '';
  } else {
    if(dateGroup) dateGroup.style.display = '';
    if(dateLabel) dateLabel.textContent = '請求予定日';
    if(nextGroup) nextGroup.style.display = 'none';
    if(dateHint)  dateHint.textContent = '';
    if(endBadge) endBadge.style.display = 'none';
    if(optBadge) optBadge.style.display = '';
  }
  calcPopupPaymentDueDate();
}

// 契約時ポップアップ: 入金予定日自動計算
function calcPopupPaymentDueDate() {
  const type        = document.getElementById('popup-billing-type')?.value || '';
  const siteVal     = parseInt(document.getElementById('popup-billing-site')?.value || '0') || 0;
  const billingDate = document.getElementById('popup-billing-date')?.value || '';
  const payDueEl    = document.getElementById('popup-payment-due');
  if(!payDueEl) return;
  let baseDate = '';
  if(type === 'monthly') {
    const now = new Date();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    baseDate = monthEnd.toISOString().split('T')[0];
  } else if(billingDate) {
    baseDate = billingDate;
  }
  if(!baseDate) { payDueEl.value = ''; return; }
  if(siteVal > 0) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + siteVal);
    payDueEl.value = d.toISOString().split('T')[0];
  } else {
    payDueEl.value = nextMonthEndBizDay(baseDate);
  }
}

// 契約時ポップアップを開く際にopp既存データを復元
function initContractDatePopup(oppId) {
  const opp = db.opportunities.find(o => o.id === oppId);
  // 契約日
  const cdEl = document.getElementById('popup-contract-date');
  const ceEl = document.getElementById('popup-contract-end');
  if(cdEl) cdEl.value = opp?.contractDate || '';
  if(ceEl) ceEl.value = opp?.contractEnd  || opp?.end || '';
  // 売上回収時期
  const btEl  = document.getElementById('popup-billing-type');
  const bsEl  = document.getElementById('popup-billing-site');
  const bdEl  = document.getElementById('popup-billing-date');
  const nbEl  = document.getElementById('popup-next-billing-date');
  const pdEl  = document.getElementById('popup-payment-due');
  const bmEl  = document.getElementById('popup-billing-memo');
  if(btEl)  btEl.value  = opp?.billingType     || '';
  if(bsEl)  bsEl.value  = opp?.billingSite      || '';
  if(bdEl)  bdEl.value  = opp?.billingDate      || '';
  if(nbEl)  nbEl.value  = opp?.nextBillingDate  || '';
  if(pdEl)  pdEl.value  = opp?.paymentDue       || '';
  if(bmEl)  bmEl.value  = opp?.billingMemo      || '';
  // エラークリア
  ['popup-contract-error','popup-end-error','popup-billing-type-error'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.textContent = '';
  });
  // UIを更新
  onPopupBillingTypeChange();
}

function saveContractDatePopup() {
  const contractDate  = document.getElementById('popup-contract-date').value;
  const contractEnd   = document.getElementById('popup-contract-end').value;
  const billingType   = document.getElementById('popup-billing-type')?.value || '';
  const billingSite   = parseInt(document.getElementById('popup-billing-site')?.value || '0') || 0;
  const billingDate   = document.getElementById('popup-billing-date')?.value || '';
  const nextBilDate   = document.getElementById('popup-next-billing-date')?.value || '';
  const paymentDue    = document.getElementById('popup-payment-due')?.value || '';
  const billingMemo   = document.getElementById('popup-billing-memo')?.value.trim() || '';
  const errEl         = document.getElementById('popup-contract-error');
  const endErrEl      = document.getElementById('popup-end-error');
  const btErrEl       = document.getElementById('popup-billing-type-error');

  // バリデーション
  let hasError = false;
  if(!contractDate) {
    errEl.textContent = '契約日は必須です';
    hasError = true;
  } else { errEl.textContent = ''; }
  if(billingType === 'monthly' && !contractEnd) {
    endErrEl.textContent = '月次売上計上の場合、契約終了日は必須です';
    hasError = true;
  } else { endErrEl.textContent = ''; }
  if(!billingType) {
    btErrEl.textContent = '請求タイプは必須です';
    hasError = true;
  } else { btErrEl.textContent = ''; }
  if(hasError) return;

  const oppId = _contractDateOppId;
  console.log('[Contract Save] oppId:', oppId, '_contractDateOppId:', _contractDateOppId);
  if(oppId && oppId !== '__new__') {
    // 既存案件に書き込む
    const idx = db.opportunities.findIndex(o => o.id === oppId);
    if(idx >= 0) {
      db.opportunities[idx].contractDate    = contractDate;
      db.opportunities[idx].contractEnd     = contractEnd;
      // 売上回収時期
      db.opportunities[idx].billingType     = billingType;
      db.opportunities[idx].billingSite     = billingSite;
      db.opportunities[idx].billingDate     = billingDate;
      db.opportunities[idx].nextBillingDate = nextBilDate;
      db.opportunities[idx].paymentDue      = paymentDue;
      db.opportunities[idx].billingMemo     = billingMemo;
      // 契約書アップロード → 受注に変更
      const wasWon = db.opportunities[idx].stage === '受注';
      db.opportunities[idx].stage = '受注';
      db.opportunities[idx].prob  = 100;
      db.opportunities[idx].lastUpdated = new Date().toISOString().split('T')[0];
      save();
      closeModal('contract-date-popup');
      toast(wasWon ? '契約日を保存しました' : '🎉 受注登録しました！', 'success');
      // 請求予定日が確定した場合、当該月の請求額を自動更新
      const _savedOpp = db.opportunities[idx];
      if(_savedOpp && _savedOpp.billingDate) autoSetBillingFromOpp(_savedOpp);
      if(currentDetailOppId === oppId) showOppDetail(oppId);
      renderOpportunities();
      renderDashboard();
      // クラッカー表示（新規受注のみ・600ms後）
      if(!wasWon) setTimeout(() => showCrackerAnimation(), 600);
    }
  } else {
    window._pendingContractDate    = contractDate;
    window._pendingContractEnd     = contractEnd;
    window._pendingBillingType     = billingType;
    window._pendingBillingSite     = billingSite;
    window._pendingBillingDate     = billingDate;
    window._pendingNextBilDate     = nextBilDate;
    window._pendingPaymentDue      = paymentDue;
    window._pendingBillingMemo     = billingMemo;
    toast('契約時必要事項を設定しました（案件保存時に反映されます）', 'success');
    closeModal('contract-date-popup');
  }
}

// ============================================================
// 入金管理
// ============================================================
let paymentSortKey = 'month';
let paymentSortDir = 1;  // 1=降順（新しい/大きい順）, -1=昇順

function initPaymentMonthSel() {
  // 月ラベルを更新
  const lbl = document.getElementById('payment-month-label');
  if(lbl) {
    const [y, m] = currentPaymentMonth.split('-');
    lbl.textContent = `${y}年${parseInt(m)}月`;
  }
  // ピッカーの値を同期
  const picker = document.getElementById('payment-month-picker-hidden');
  if(picker) picker.value = currentPaymentMonth;
}

function sortPayment(key) {
  if(paymentSortKey === key) {
    paymentSortDir *= -1;
  } else {
    paymentSortKey = key;
    // 年月・数値系はデフォルト降順、文字列系は昇順
    paymentSortDir = (key === 'month' || key === 'billing' || key === 'cash' || key === 'uncollected') ? 1 : -1;
  }
  renderPayment();
}

function renderPayment() {
  initPaymentMonthSel();
  const statusFilter = document.getElementById('payment-status-filter')?.value || '';
  const q           = (document.getElementById('payment-search')?.value || '').toLowerCase();

  // 対象月リスト: currentPaymentMonth の単月表示
  const months = [currentPaymentMonth];

  // 行データを生成
  const rows = [];
  months.forEach(ym => {
    const monthData = db.monthly[ym] || {};
    db.opportunities.forEach(o => {
      if(!matchesScope(o)) return;
      const m = monthData[o.id] || {};
      const billing     = m.billing || 0;
      const cash        = m.cash    || 0;
      const sales       = m.sales   || 0;
      if(sales === 0 && billing === 0 && cash === 0) return;  // データなし行は除外

      // ステータス判定
      let status = 'none';
      if(billing === 0 && sales > 0) status = 'unpaid';
      else if(billing > 0 && cash === 0) status = 'billed';
      else if(billing > 0 && cash > 0 && cash < billing) status = 'partial';
      else if(billing > 0 && cash >= billing) status = 'done';
      else return;

      if(statusFilter && status !== statusFilter) return;
      if(q && !o.name.toLowerCase().includes(q) && !(o.customer||'').toLowerCase().includes(q)) return;

      // 請求書PDFの保存日を請求日として取得
      const invFiles = getPdfFiles(o.id, 'invoice');
      // ファイル名に年月が含まれるものを優先、なければ最新の保存日
      let billingDateFromInv = '';
      if(invFiles.length > 0) {
        // ym（例: '2025-10'）に対応する請求書を探す
        const ymKey = ym.replace('-','');  // '202510'
        const matched = invFiles.find(f => f.name && f.name.includes(ymKey));
        const target  = matched || invFiles[invFiles.length - 1];
        if(target?.date) billingDateFromInv = target.date.split('T')[0];
      }
      rows.push({
        ym, o, billing, cash, sales,
        uncollected: billing - cash,
        status,
        billingDate: m.billingDate || billingDateFromInv,
        paymentDate: m.paymentDate || '',
        memo:        m.paymentMemo || '',
      });
    });
  });

  // ソート
  rows.sort((a, b) => {
    let va, vb;
    switch(paymentSortKey) {
      // dir=1:降順(新/大), dir=-1:昇順(古/小)
      case 'month':       return paymentSortDir === 1 ? b.ym.localeCompare(a.ym) : a.ym.localeCompare(b.ym);
      case 'customer':    return paymentSortDir === 1 ? (b.o.customer||'').localeCompare(a.o.customer||'') : (a.o.customer||'').localeCompare(b.o.customer||'');
      case 'name':        return paymentSortDir === 1 ? b.o.name.localeCompare(a.o.name) : a.o.name.localeCompare(b.o.name);
      case 'billing':     return paymentSortDir === 1 ? b.billing - a.billing : a.billing - b.billing;
      case 'cash':        return paymentSortDir === 1 ? b.cash - a.cash : a.cash - b.cash;
      case 'uncollected': return paymentSortDir === 1 ? b.uncollected - a.uncollected : a.uncollected - b.uncollected;
      default:            return b.ym.localeCompare(a.ym);
    }
  });

  // サマリー
  const totalBilling     = rows.reduce((s, r) => s + r.billing, 0);
  const totalCash        = rows.reduce((s, r) => s + r.cash, 0);
  const totalUncollected = rows.reduce((s, r) => s + r.uncollected, 0);
  const billedCount      = rows.filter(r => r.status === 'billed').length;
  document.getElementById('payment-summary').innerHTML = `
    <div class="metric-card blue"><div class="metric-label">請求総額</div><div class="metric-value">${fmt(totalBilling)}</div></div>
    <div class="metric-card green"><div class="metric-label">入金済</div><div class="metric-value">${fmt(totalCash)}</div></div>
    <div class="metric-card red"><div class="metric-label">未回収額</div><div class="metric-value">${fmt(totalUncollected)}</div></div>
    <div class="metric-card amber"><div class="metric-label">未入金件数</div><div class="metric-value">${billedCount}件</div></div>
  `;

  // ステータスバッジ
  const statusBadge = s => ({
    unpaid:  '<span class="badge badge-amber">未請求</span>',
    billed:  '<span class="badge badge-red">未入金</span>',
    partial: '<span class="badge badge-amber">一部入金</span>',
    done:    '<span class="badge badge-green">入金済</span>',
  }[s] || '');

  // テーブル描画
  // 顧客でグループ化
  const _custGroups = {};
  rows.forEach(r => {
    const cust = r.o.customer || '—';
    if(!_custGroups[cust]) _custGroups[cust] = [];
    _custGroups[cust].push(r);
  });
  // 顧客名をソート（未回収額降順）
  const _custNames = Object.keys(_custGroups).sort((a, b) => {
    const sumA = _custGroups[a].reduce((s, r) => s + r.uncollected, 0);
    const sumB = _custGroups[b].reduce((s, r) => s + r.uncollected, 0);
    return sumB - sumA;
  });
  const _html = _custNames.map(cust => {
    const custRows = _custGroups[cust];
    const sumBilling    = custRows.reduce((s, r) => s + r.billing, 0);
    const sumCash       = custRows.reduce((s, r) => s + r.cash, 0);
    const sumUncollected = custRows.reduce((s, r) => s + r.uncollected, 0);
    const groupId = 'pg-' + cust.replace(/[^a-zA-Z0-9]/g, '_');
    const allDone = custRows.every(r => r.status === 'done');
    // 顧客ヘッダー行
    const headerRow = `
      <tr class="payment-group-header" onclick="togglePaymentGroup('${groupId}')" style="cursor:pointer;background:var(--bg-secondary);border-top:2px solid var(--border-medium);">
        <td colspan="2" style="padding:8px 10px;font-weight:700;font-size:13px;">
          <span id="${groupId}-icon" style="margin-right:6px;font-size:11px;">▼</span>${cust}
        </td>
        <td style="padding:8px 10px;font-size:11px;color:var(--text-muted);">${custRows.length}件</td>
        <td style="padding:8px 10px;text-align:right;font-weight:600;">${fmt(sumBilling)}<div style="font-size:10px;color:var(--text-muted);font-weight:400;">税込${fmt(Math.round(sumBilling*1.1*10000)/10000)}</div></td>
        <td style="padding:8px 10px;text-align:right;font-weight:600;color:var(--green);">${fmt(sumCash)}<div style="font-size:10px;color:var(--text-muted);font-weight:400;">税込${fmt(Math.round(sumCash*1.1*10000)/10000)}</div></td>
        <td style="padding:8px 10px;text-align:right;font-weight:700;color:${sumUncollected>0?'var(--red-dark)':'var(--text-muted)'};">¥${sumUncollected.toLocaleString()}万<div style="font-size:10px;color:var(--text-muted);font-weight:400;">税込¥${Math.round(sumUncollected*1.1*10)/10}万</div></td>
        <td colspan="5" style="padding:8px 10px;text-align:center;">${allDone?'<span class="badge badge-green">完了</span>':''}</td>
      </tr>`;
    // 案件詳細行
    const detailRows = custRows.map(r => `
      <tr class="payment-group-row" data-group="${groupId}" style="${r.status==='done'?'opacity:0.6':''}background:var(--bg-primary);">
        <td style="padding:5px 8px 5px 28px;white-space:nowrap;font-size:11px;">${monthLabel(r.ym)}</td>
        <td style="padding:5px 8px;font-size:11px;color:var(--text-muted);">${r.o.owner||'—'}</td>
        <td style="padding:5px 8px;"><a href="#" style="color:var(--accent);text-decoration:none;font-size:11px;" onclick="showOppDetail('${r.o.id}');return false;">${r.o.name}</a></td>
        <td style="padding:5px 8px;text-align:right;font-size:12px;">${fmt(r.billing)}<div style="font-size:10px;color:var(--text-muted);">税込${fmt(Math.round(r.billing*1.1*10000)/10000)}</div></td>
        <td style="padding:5px 8px;text-align:right;font-size:12px;color:var(--green);">${fmt(r.cash)}<div style="font-size:10px;color:var(--text-muted);">税込${fmt(Math.round(r.cash*1.1*10000)/10000)}</div></td>
        <td style="padding:5px 8px;text-align:right;font-size:12px;color:${r.uncollected>0?'var(--red-dark)':'var(--text-muted)'};">${fmt(r.uncollected)}<div style="font-size:10px;color:var(--text-muted);">税込${fmt(Math.round(r.uncollected*1.1*10000)/10000)}</div></td>
        <td style="padding:5px 8px;text-align:center;">${statusBadge(r.status)}</td>
        <td style="padding:5px 8px;text-align:center;font-size:11px;">${r.billingDate||'—'}</td>
        <td style="padding:5px 8px;text-align:center;">
          <input type="date" value="${r.paymentDate || nextMonthEndBizDay(r.billingDate || r.ym + '-01')}" style="font-size:11px;border:1px solid var(--border-medium);border-radius:4px;padding:2px 4px;width:110px;"
            onchange="updatePaymentDate('${r.o.id}','${r.ym}',this.value)">
        </td>
        <td style="padding:5px 8px;text-align:center;">
          ${r.status!=='done' ? `<button class="btn btn-sm" style="font-size:11px;padding:2px 8px;background:var(--green);color:#fff;border:none;"
            onclick="markAsPaid('${r.o.id}','${r.ym}')">入金確認</button>` : ''}
        </td>
        <td></td>
      </tr>`).join('');
    return headerRow + detailRows;
  }).join('');
  document.getElementById('payment-tbody').innerHTML = _html || '<tr><td colspan="11" style="text-align:center;padding:24px;color:var(--text-muted);">データがありません</td></tr>';
}

// 入金管理の顧客グループ展開/折りたたみ
function togglePaymentGroup(groupId) {
  const rows = document.querySelectorAll(`[data-group="${groupId}"]`);
  const icon = document.getElementById(`${groupId}-icon`);
  const isHidden = rows.length > 0 && rows[0].style.display === 'none';
  rows.forEach(r => r.style.display = isHidden ? '' : 'none');
  if(icon) icon.textContent = isHidden ? '▼' : '▶';
}

// 請求日を更新
function updateBillingDate(oppId, ym, date) {
  if(!db.monthly[ym]) db.monthly[ym] = {};
  if(!db.monthly[ym][oppId]) db.monthly[ym][oppId] = {sales:0,billing:0,cash:0,progress:0,cumProgress:0};
  const m = db.monthly[ym][oppId];
  m.billingDate = date;

  // 請求日確定時: 請求額が未入力の場合は案件の月次按分額を自動反映
  if(date && !(m.billing > 0)) {
    const opp = db.opportunities.find(o => o.id === oppId);
    if(opp && opp.amount > 0) {
      if(opp.billingType === 'monthly' && opp.start && opp.end) {
        // 月次按分: 契約期間の月数で割る
        const startYm = opp.start.slice(0,7);
        const endYm   = opp.end.slice(0,7);
        const totalMonths = monthsBetween(startYm, endYm) + 1;
        if(totalMonths > 0) {
          m.billing = Math.round((opp.amount / totalMonths) * 10000) / 10000;
        }
      } else if(opp.billingType === 'lump' || opp.billingType === 'milestone' || !opp.billingType) {
        // 一括/マイルストーン/未設定: 案件総額を請求額にセット
        m.billing = opp.amount;
      }
    }
  }

  // 入金予定日: 未設定の場合は翌月末営業日を自動計算
  if(date && !m.paymentDate) {
    m.paymentDate = nextMonthEndBizDay(date);
  }

  save();
  renderPayment();
  toast('請求日を更新しました', 'success');
}

// 入金日を更新
function updatePaymentDate(oppId, ym, date) {
  if(!db.monthly[ym]) db.monthly[ym] = {};
  if(!db.monthly[ym][oppId]) db.monthly[ym][oppId] = {sales:0,billing:0,cash:0,progress:0,cumProgress:0};
  db.monthly[ym][oppId].paymentDate = date;
  save();
  toast('入金日を更新しました', 'success');
}

// 入金確認（billing == cash にする）
function markAsPaid(oppId, ym) {
  const m = (db.monthly[ym]||{})[oppId]||{};
  if(!confirm(`${monthLabel(ym)} の入金を確認済みにしますか？\n請求額: ${fmt(m.billing||0)} → 入金額に設定されます`)) return;
  if(!db.monthly[ym]) db.monthly[ym] = {};
  if(!db.monthly[ym][oppId]) db.monthly[ym][oppId] = {sales:0,billing:0,cash:0,progress:0,cumProgress:0};
  db.monthly[ym][oppId].cash = db.monthly[ym][oppId].billing || 0;
  // 入金日デフォルト: 請求日の翌月末営業日（未設定なら今日）
  const _billingDate = db.monthly[ym][oppId].billingDate || '';
  db.monthly[ym][oppId].paymentDate = db.monthly[ym][oppId].paymentDate ||
    nextMonthEndBizDay(_billingDate || ym + '-01');
  save();
  toast('入金済にしました', 'success');
  renderPayment();
}

// ============================================================
// 契約日差分分析（ダッシュボード）
// ============================================================
function renderContractDelay() {
  const el = document.getElementById('dash-contract-delay');
  if(!el) return;

  // plannedStart と contractDate の両方が設定されている案件を抽出
  const targets = db.opportunities.filter(o =>
    o.plannedStart && o.contractDate && matchesScope(o)
  );

  if(targets.length === 0) {
    el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">契約予定日と実際の契約日が両方入力された案件がありません</div>';
    return;
  }

  // 差分を計算（日数）
  const rows = targets.map(o => {
    const planned  = new Date(o.plannedStart);
    const actual   = new Date(o.contractDate);
    const diffDays = Math.round((actual - planned) / 86400000);
    return { o, planned, actual, diffDays };
  }).sort((a, b) => b.diffDays - a.diffDays);  // 遅延が大きい順

  const totalDelay = rows.reduce((s, r) => s + Math.max(0, r.diffDays), 0);
  const avgDelay   = rows.length > 0 ? (totalDelay / rows.length).toFixed(1) : 0;
  const delayed    = rows.filter(r => r.diffDays > 0).length;
  const onTime     = rows.filter(r => r.diffDays <= 0).length;

  // サマリー
  const summaryHtml = `
    <div style="display:flex;gap:12px;padding:14px 20px;flex-wrap:wrap;border-bottom:1px solid var(--border-light);">
      <div class="metric-card amber" style="min-width:120px;">
        <div class="metric-label">遅延件数</div>
        <div class="metric-value">${delayed}件</div>
      </div>
      <div class="metric-card green" style="min-width:120px;">
        <div class="metric-label">予定通り/前倒し</div>
        <div class="metric-value">${onTime}件</div>
      </div>
      <div class="metric-card red" style="min-width:120px;">
        <div class="metric-label">平均遅延日数</div>
        <div class="metric-value">${avgDelay}日</div>
      </div>
      <div class="metric-card gray" style="min-width:120px;">
        <div class="metric-label">分析対象</div>
        <div class="metric-value">${rows.length}件</div>
      </div>
    </div>`;

  // テーブル
  const tableHtml = `
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead>
        <tr style="background:var(--bg-secondary);">
          <th style="padding:8px;text-align:left;min-width:160px;">案件名</th>
          <th style="padding:8px;text-align:left;">顧客</th>
          <th style="padding:8px;text-align:left;">担当</th>
          <th style="padding:8px;text-align:center;">契約予定日</th>
          <th style="padding:8px;text-align:center;">実際の契約日</th>
          <th style="padding:8px;text-align:center;">差分（日）</th>
          <th style="padding:8px;text-align:center;">ステータス</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => {
          const badge = r.diffDays > 30  ? '<span class="badge badge-red">大幅遅延</span>'
                      : r.diffDays > 0   ? '<span class="badge badge-amber">遅延</span>'
                      : r.diffDays === 0  ? '<span class="badge badge-blue">予定通り</span>'
                      :                    '<span class="badge badge-green">前倒し</span>';
          const diffColor = r.diffDays > 0 ? 'color:var(--red-dark);font-weight:600;'
                          : r.diffDays < 0 ? 'color:var(--green);font-weight:600;' : '';
          return `<tr style="border-bottom:1px solid var(--border-light);">
            <td style="padding:7px 8px;">
              <a href="#" style="color:var(--accent);text-decoration:none;" onclick="showOppDetail('${r.o.id}');return false;">${r.o.name}</a>
            </td>
            <td style="padding:7px 8px;font-size:11px;">${r.o.customer||'—'}</td>
            <td style="padding:7px 8px;font-size:11px;">${r.o.owner||'—'}</td>
            <td style="padding:7px 8px;text-align:center;">${r.o.plannedStart}</td>
            <td style="padding:7px 8px;text-align:center;">${r.o.contractDate}</td>
            <td style="padding:7px 8px;text-align:center;${diffColor}">${r.diffDays > 0 ? '+' : ''}${r.diffDays}日</td>
            <td style="padding:7px 8px;text-align:center;">${badge}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;

  el.innerHTML = summaryHtml + tableHtml;
}

// ============================================================
// 契約書アップロード時の契約日入力ポップアップ
// ============================================================

// ============================================================
// RENDER: MASTER
// ============================================================

function downloadCSV(content, filename) {
  const bom = '\uFEFF';
  const blob = new Blob([bom + content], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  toast('CSVをダウンロードしました', 'success');
}

// ============================================================
