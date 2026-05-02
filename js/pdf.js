
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

  // ============================================================
  // 入金管理の月割り基準: 入金予定日(paymentDate)の年月
  // ----------------------------------------------------------
  // 仕様:
  // - paymentDate が設定されていれば、その年月で振り分け
  // - 未設定の場合は nextMonthEndBizDay(billingDate || ym+'-01') で
  //   補完した値を「実効的な入金予定日」として年月判定
  // - 入金済(cash>=billing)も同様に paymentDate(or 補完値)基準
  //   ※ 現スキーマでは paymentDate が「予定日 兼 実入金日」
  //
  // 対象月: currentPaymentMonth(=currentMonth) の単月
  // ============================================================
  const targetYm = currentPaymentMonth;

  // 「実効的な入金予定月」を算出するヘルパー
  // - paymentDate があれば paymentDate.slice(0,7)
  // - なければ請求日(billingDate)の翌月末営業日 → その年月
  // - billingDate もなければ ym+'-01' の翌月末営業日 → その年月
  function _effectivePaymentYm(m, ym, billingDateFromInv) {
    if(m.paymentDate && /^\d{4}-\d{2}/.test(m.paymentDate)) {
      return m.paymentDate.slice(0, 7);
    }
    const bDate = m.billingDate || billingDateFromInv || (ym + '-01');
    const eff = nextMonthEndBizDay(bDate);
    return (eff && /^\d{4}-\d{2}/.test(eff)) ? eff.slice(0, 7) : ym;
  }

  // 行データを生成: 全月を走査し、実効入金予定月が targetYm のもののみ採用
  const rows = [];
  Object.keys(db.monthly || {}).forEach(ym => {
    const monthData = db.monthly[ym] || {};
    db.opportunities.forEach(o => {
      if(!matchesScope(o)) return;
      // 入金管理は「受注済み案件のみ」を対象とする（HTML注釈と仕様一致）
      // ・リード/提案中/見積提出/交渉中: まだ受注前 → 入金管理の対象外
      // ・失注: 案件が消滅 → 入金管理の対象外
      // 例外的に過去 monthly に billing/cash データが残っていても表示しない
      if(o.stage !== '受注') return;
      const m = monthData[o.id] || {};
      const billing = m.billing || 0;
      const cash    = m.cash    || 0;
      const sales   = m.sales   || 0;
      if(sales === 0 && billing === 0 && cash === 0) return;  // データなし行は除外

      // ステータス判定: 共通関数 getInvoiceStatus() を使用（6段階）
      // code: 'idle' | 'unbilled' | 'unbilled_unpaid' | 'billed_unpaid' | 'partial' | 'paid'
      const statusInfo = getInvoiceStatus(o.id, ym);
      const status = statusInfo.code;
      // 'idle'(未着手) は入金管理の表示対象外
      if(status === 'idle') return;

      // 請求書PDFの保存日を請求日として取得
      const invFiles = getPdfFiles(o.id, 'invoice');
      // ファイル名に年月が含まれるものを優先、なければ最新の保存日
      let billingDateFromInv = '';
      if(invFiles.length > 0) {
        const ymKey = ym.replace('-','');  // '202510'
        const matched = invFiles.find(f => f.name && f.name.includes(ymKey));
        const target  = matched || invFiles[invFiles.length - 1];
        if(target?.date) billingDateFromInv = target.date.split('T')[0];
      }

      // 入金予定月を判定 → 表示中月と一致する行のみ採用
      const payYm = _effectivePaymentYm(m, ym, billingDateFromInv);
      if(payYm !== targetYm) return;

      // ステータスフィルタ・検索フィルタは月マッチ後に適用
      // フィルタ値: HTMLの option value は新コード（unbilled / unbilled_unpaid /
      //   billed_unpaid / partial / paid）に統一済み（Step 5）。
      //   旧値（unpaid / billed / done）が万一残っていた場合の後方互換マップも保持。
      if(statusFilter) {
        const LEGACY_MAP = {
          unpaid:  ['unbilled', 'unbilled_unpaid'],   // 旧「請求予定」
          billed:  ['billed_unpaid'],                  // 旧「請求済・未入金」
          done:    ['paid'],                           // 旧「入金済」
        };
        const allowed = LEGACY_MAP[statusFilter] || [statusFilter];
        if(!allowed.includes(status)) return;
      }
      if(q && !o.name.toLowerCase().includes(q) && !(o.customer||'').toLowerCase().includes(q)) return;

      // 表示用の入金予定日: 値が無ければ補完値を入れる(input value 表示用)
      const displayPayDate = m.paymentDate
        || nextMonthEndBizDay(m.billingDate || billingDateFromInv || (ym + '-01'));

      rows.push({
        ym, o, billing, cash, sales,
        uncollected: billing - cash,
        status,
        billingDate: m.billingDate || billingDateFromInv,
        paymentDate: m.paymentDate || '',          // 生値(空文字許容)
        displayPayDate,                            // 表示用(常に値あり)
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
  // 未入金件数 = 「請求済・未入金」のみ（一部入金は除く）
  const billedCount      = rows.filter(r => r.status === 'billed_unpaid').length;
  document.getElementById('payment-summary').innerHTML = `
    <div class="metric-card blue"><div class="metric-label">請求総額</div><div class="metric-value">${fmt(totalBilling)}</div></div>
    <div class="metric-card green"><div class="metric-label">入金済</div><div class="metric-value">${fmt(totalCash)}</div></div>
    <div class="metric-card red"><div class="metric-label">未回収額</div><div class="metric-value">${fmt(totalUncollected)}</div></div>
    <div class="metric-card amber"><div class="metric-label">未入金件数</div><div class="metric-value">${billedCount}件</div></div>
  `;

  // ステータスバッジ: 共通関数 getInvoiceStatus() の badgeHtml を使用（6段階）
  // 月次管理画面と完全に同じバッジが表示される
  const statusBadge = code => {
    // rows[].status は code 文字列なので、対応する badgeHtml を返す
    // 一意な対応のため、行データの ym/oppId から再判定するのではなく
    // code → badgeHtml のマップを生成する
    const map = {
      paid:            '<span class="badge badge-green">入金済</span>',
      partial:         '<span class="badge badge-amber">一部入金</span>',
      billed_unpaid:   '<span class="badge badge-red">請求済・未入金</span>',
      unbilled_unpaid: '<span class="badge badge-amber" title="請求額は登録されていますが、請求書PDFが発行・保存されていません">未請求・未入金</span>',
      unbilled:        '<span class="badge badge-amber" title="売上計上済みですが、請求額が未入力です">未請求</span>',
      idle:            '<span class="badge badge-gray">未着手</span>',
    };
    return map[code] || '';
  };

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
    const allDone = custRows.every(r => r.status === 'paid');
    // 顧客ヘッダー行
    // P1-1対策: 顧客名は他ユーザーが入力する値のため、XSS防止に _h() でエスケープ
    const headerRow = `
      <tr class="payment-group-header" onclick="togglePaymentGroup('${groupId}')" style="cursor:pointer;background:var(--bg-secondary);border-top:2px solid var(--border-medium);">
        <td colspan="2" style="padding:8px 10px;font-weight:700;font-size:13px;">
          <span id="${groupId}-icon" style="margin-right:6px;font-size:11px;">▼</span>${_h(cust)}
        </td>
        <td style="padding:8px 10px;font-size:11px;color:var(--text-muted);">${custRows.length}件</td>
        <td style="padding:8px 10px;text-align:right;font-weight:600;">${fmt(sumBilling)}<div style="font-size:10px;color:var(--text-muted);font-weight:400;">税込${fmt(Math.round(sumBilling*1.1*10000)/10000)}</div></td>
        <td style="padding:8px 10px;text-align:right;font-weight:600;color:var(--green);">${fmt(sumCash)}<div style="font-size:10px;color:var(--text-muted);font-weight:400;">税込${fmt(Math.round(sumCash*1.1*10000)/10000)}</div></td>
        <td style="padding:8px 10px;text-align:right;font-weight:700;color:${sumUncollected>0?'var(--red-dark)':'var(--text-muted)'};">¥${sumUncollected.toLocaleString()}万<div style="font-size:10px;color:var(--text-muted);font-weight:400;">税込¥${Math.round(sumUncollected*1.1*10)/10}万</div></td>
        <td colspan="5" style="padding:8px 10px;text-align:center;">${allDone?'<span class="badge badge-green">完了</span>':''}</td>
      </tr>`;
    // 案件詳細行
    // P1-1対策: ユーザー入力値（owner / name / id / ym）を XSS防止のため _h() / _hj() でエスケープ
    const detailRows = custRows.map(r => `
      <tr class="payment-group-row" data-group="${groupId}" style="${r.status==='paid'?'opacity:0.6':''}background:var(--bg-primary);">
        <td style="padding:5px 8px 5px 28px;white-space:nowrap;font-size:11px;">${monthLabel(r.ym)}</td>
        <td style="padding:5px 8px;font-size:11px;color:var(--text-muted);">${_h(r.o.owner||'—')}</td>
        <td style="padding:5px 8px;"><a href="#" style="color:var(--accent);text-decoration:none;font-size:11px;" onclick="showOppDetail('${_hj(r.o.id)}');return false;">${_h(r.o.name)}</a></td>
        <td style="padding:5px 8px;text-align:right;font-size:12px;">${fmt(r.billing)}<div style="font-size:10px;color:var(--text-muted);">税込${fmt(Math.round(r.billing*1.1*10000)/10000)}</div></td>
        <td style="padding:5px 8px;text-align:right;font-size:12px;color:var(--green);">${fmt(r.cash)}<div style="font-size:10px;color:var(--text-muted);">税込${fmt(Math.round(r.cash*1.1*10000)/10000)}</div></td>
        <td style="padding:5px 8px;text-align:right;font-size:12px;color:${r.uncollected>0?'var(--red-dark)':'var(--text-muted)'};">${fmt(r.uncollected)}<div style="font-size:10px;color:var(--text-muted);">税込${fmt(Math.round(r.uncollected*1.1*10000)/10000)}</div></td>
        <td style="padding:5px 8px;text-align:center;">${statusBadge(r.status)}</td>
        <td style="padding:5px 8px;text-align:center;font-size:11px;">${r.billingDate||'—'}</td>
        <td style="padding:5px 8px;text-align:center;">
          <input type="date" value="${r.displayPayDate || ''}" style="font-size:11px;border:1px solid var(--border-medium);border-radius:4px;padding:2px 4px;width:110px;"
            onchange="updatePaymentDate('${_hj(r.o.id)}','${_hj(r.ym)}',this.value)">
        </td>
        <td style="padding:5px 8px;text-align:center;">
          ${r.status!=='paid' ? `<button class="btn btn-sm" style="font-size:11px;padding:2px 8px;background:var(--green);color:#fff;border:none;"
            onclick="markAsPaid('${_hj(r.o.id)}','${_hj(r.ym)}')">入金確認</button>` : ''}
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
  toast('入金予定日を更新しました', 'success');
  // 入金予定日基準で月割りしているため、変更後は表示中月と不一致になる可能性 → 再描画
  renderPayment();
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
// キャッシュフロー予測
// ============================================================
// ルール: 請求予定日の翌月最終営業日に請求予定額が入金されるものとする
// ============================================================
