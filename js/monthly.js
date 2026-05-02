// ============================================================

// ============================================================
// グローバル定数（全関数より先に定義）
// ============================================================
const OWNER_COLORS = ['#185FA5','#1D9E75','#534AB7','#BA7517','#E24B4A','#888780','#D4537E','#639922','#378ADD'];
const SEG_COLORS   = {'SIMPRESEARCH':'#185FA5','アカデミックサービス':'#1D9E75','その他':'#BA7517','CoNaxs':'#534AB7','DRiFOs':'#888780'};

// ソート状態: master.js の renderMonthly() から参照されるため
// dashboard.js より先にロードされた場合でも undefined にならないよう宣言
// （dashboard.js で同名変数が let で宣言されるので、そちらを正として var で保険宣言）
if(typeof monthlySortKey === 'undefined') var monthlySortKey = '';
if(typeof monthlySortDir === 'undefined') var monthlySortDir = 1;

// ============================================================
// ダッシュボード 期間切り替え
// ============================================================
let dashMode  = 'fy';
// 現在の日付から FY を自動判定（10月始まり）
let dashFY = (()=>{
  const n = new Date();
  const y = n.getFullYear(), m = n.getMonth() + 1; // 1-12
  const fy = m >= 10 ? y + 1 : y; // 10月以降は翌年度
  return 'fy' + String(fy).slice(2);
})();
// 現在の四半期を自動判定（FY内の月順: Q1=10-12, Q2=1-3, Q3=4-6, Q4=7-9）
let dashQ = (()=>{
  const m = new Date().getMonth() + 1; // 1-12
  if(m >= 10) return 'Q1';
  if(m <= 3)  return 'Q2';
  if(m <= 6)  return 'Q3';
  return 'Q4';
})();
let dashMonth = (()=>{ const n=new Date(); return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0'); })();

// FY年度レンジ（動的生成：FY24〜FY30まで自動対応）
const FY_RANGES = (() => {
  const ranges = {};
  for(let fy = 24; fy <= 30; fy++) {
    const key = 'fy' + fy;
    const startYear = 1999 + fy; // fy25 → 2024
    ranges[key] = {
      start: startYear + '-10',
      end:   (startYear + 1) + '-09',
    };
  }
  return ranges;
})();
const Q_OFFSET = {Q1:[0,1,2], Q2:[3,4,5], Q3:[6,7,8], Q4:[9,10,11]};

function addMonths(ym, n) {
  let [y,m] = ym.split('-').map(Number);
  m += n;
  while(m > 12){m -= 12; y++;}
  while(m < 1) {m += 12; y--;}
  return y + '-' + String(m).padStart(2,'0');
}

// BUG-14対策: 日付付き(YYYY-MM-DD)に対する安全な月加算。
//   JSの new Date().setMonth() は 1/31 + 1ヶ月 → 3/3 のような暗黙オーバーフロー変換を行う。
//   このヘルパは加算後の月の末日を上限としてクランプし、2/29 + 1ヶ月 → 3/29 などの直感的な結果を返す。
//   "YYYY-MM-DD" 形式の文字列を入出力とする。
function addMonthsSafe(dateStr, n) {
  if(!dateStr) return dateStr;
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(!m) return dateStr;
  let y = parseInt(m[1]), mo = parseInt(m[2]) + n, d = parseInt(m[3]);
  while(mo > 12){ mo -= 12; y++; }
  while(mo < 1) { mo += 12; y--; }
  // 加算後の月の末日を取得し、元日が末日を超える場合はクランプ
  const lastDay = new Date(y, mo, 0).getDate();
  if(d > lastDay) d = lastDay;
  return y + '-' + String(mo).padStart(2,'0') + '-' + String(d).padStart(2,'0');
}

function getMonthRange() {
  const msr = db.monthlySummary || {};
  if(dashMode === 'fy') {
    const {start, end} = FY_RANGES[dashFY] || FY_RANGES.fy25;
    const keys = []; let k = start;
    while(k <= end){ keys.push(k); k = addMonths(k, 1); }
    return keys;
  }
  if(dashMode === 'quarter') {
    const {start} = FY_RANGES[dashFY] || FY_RANGES.fy25;
    return (Q_OFFSET[dashQ] || Q_OFFSET.Q1).map(n => addMonths(start, n));
  }
  return [dashMonth];
}

function getPeriodLabel() {
  if(dashMode === 'fy') {
    const r = FY_RANGES[dashFY] || FY_RANGES.fy25;
    return dashFY.toUpperCase() + '（' + r.start + '〜' + r.end + '）';
  }
  if(dashMode === 'quarter') {
    const {start} = FY_RANGES[dashFY] || FY_RANGES.fy25;
    const offsets = Q_OFFSET[dashQ] || Q_OFFSET.Q1;
    return dashFY.toUpperCase() + ' ' + dashQ + '（' + addMonths(start, offsets[0]) + '〜' + addMonths(start, offsets[2]) + '）';
  }
  return monthLabel(dashMonth);
}

function getPrevMonthRange() {
  if(dashMode === 'fy') {
    const fyKeys = Object.keys(FY_RANGES).sort();
    const idx = fyKeys.indexOf(dashFY);
    if(idx <= 0) return [];
    const prevFY = fyKeys[idx-1];
    const {start, end} = FY_RANGES[prevFY];
    const keys = []; let k = start;
    while(k <= end){ keys.push(k); k = addMonths(k,1); }
    return keys;
  }
  if(dashMode === 'quarter') {
    const qs = ['Q1','Q2','Q3','Q4'];
    const qi = qs.indexOf(dashQ);
    const prevQ = qi > 0 ? qs[qi-1] : 'Q4';
    const fyKeys = Object.keys(FY_RANGES).sort();
    const fyIdx = fyKeys.indexOf(dashFY);
    const prevFY = qi > 0 ? dashFY : (fyIdx > 0 ? fyKeys[fyIdx-1] : dashFY);
    const {start} = FY_RANGES[prevFY] || FY_RANGES.fy25;
    return (Q_OFFSET[prevQ] || Q_OFFSET.Q4).map(n => addMonths(start, n));
  }
  return [addMonths(dashMonth, -1)];
}

function setDashMode(mode, el) {
  dashMode = mode;
  document.querySelectorAll('.dash-period-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('ctrl-fy').style.display      = mode === 'fy'      ? 'flex' : 'none';
  document.getElementById('ctrl-quarter').style.display = mode === 'quarter' ? 'flex' : 'none';
  document.getElementById('ctrl-month').style.display   = mode === 'month'   ? 'flex' : 'none';
  renderDashboard();
}

function setDashQ(q, el) {
  dashQ = q;
  document.querySelectorAll('.dash-q-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  renderDashboard();
}

function shiftDashMonth(delta) {
  dashMonth = addMonths(dashMonth, delta);
  const sel = document.getElementById('dash-month-sel');
  if(sel) sel.value = dashMonth;
  renderDashboard();
}

function initDashMonthSel() {
  // dashMonth をデータ最新月に合わせる（currentMonthは今月のまま）
  const msrKeys = Object.keys(db.monthlySummary||{}).sort();
  // dashMonth もデータ最新月に同期
  if(msrKeys.length > 0 && !(dashMonth in (db.monthlySummary||{}))) {
    dashMonth = msrKeys[msrKeys.length-1];
  }
  // 月次ピッカー初期化
  const msr = db.monthlySummary || {};
  const months = [...new Set([...Object.keys(msr), ...Object.keys(db.monthly || {})])].sort().reverse();
  const sel = document.getElementById('dash-month-sel');
  if(sel) {
    sel.innerHTML = months.map(m => `<option value="${_ha(m)}" ${m === dashMonth ? 'selected' : ''}>${_h(monthLabel(m))}</option>`).join('');
    sel.onchange = () => { dashMonth = sel.value; renderDashboard(); };
  }

  // FYセレクトに現在のdashFYをセット
  const fySel  = document.getElementById('dash-fy-sel');
  const fyQSel = document.getElementById('dash-fy-q-sel');
  if(fySel)  fySel.value  = dashFY;
  if(fyQSel) fyQSel.value = dashFY;

  // 四半期ボタンに現在のdashQをセット
  document.querySelectorAll('.dash-q-btn').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.trim() === dashQ);
  });
}

// ============================================================
// 一括選択・削除
// ============================================================
let selectedOpps  = new Set();
let selectedLeads = new Set();

function onOppChk(el, id) {
  const row = document.getElementById('opp-row-' + id);
  if(el.checked){ selectedOpps.add(id); if(row) row.classList.add('selected'); }
  else           { selectedOpps.delete(id); if(row) row.classList.remove('selected'); }
  updateOppBulkBar();
  const all = document.querySelectorAll('#opp-tbody input.row-chk');
  const hd  = document.getElementById('opp-select-all');
  if(hd){ hd.checked = all.length > 0 && [...all].every(c=>c.checked); hd.indeterminate = selectedOpps.size > 0 && selectedOpps.size < all.length; }
}

function toggleAllOpps(el) {
  document.querySelectorAll('#opp-tbody input.row-chk').forEach(c => {
    c.checked = el.checked;
    const row = document.getElementById('opp-row-' + c.dataset.id);
    if(el.checked){ selectedOpps.add(c.dataset.id); if(row) row.classList.add('selected'); }
    else           { selectedOpps.delete(c.dataset.id); if(row) row.classList.remove('selected'); }
  });
  updateOppBulkBar();
}

function updateOppBulkBar() {
  const bar = document.getElementById('opp-bulk-bar');
  const cnt = document.getElementById('opp-bulk-count');
  if(!bar) return;
  if(selectedOpps.size > 0){ bar.classList.add('show'); cnt.textContent = selectedOpps.size + '件選択中'; }
  else bar.classList.remove('show');
}

function clearOppSelection() {
  selectedOpps.clear();
  document.querySelectorAll('#opp-tbody input.row-chk').forEach(c => c.checked = false);
  document.querySelectorAll('#opp-tbody tr.selected').forEach(r => r.classList.remove('selected'));
  const hd = document.getElementById('opp-select-all');
  if(hd){ hd.checked = false; hd.indeterminate = false; }
  document.getElementById('opp-bulk-bar')?.classList.remove('show');
}

function bulkDeleteOpps() {
  if(!selectedOpps.size) return;
  if(!confirm(selectedOpps.size + '件の案件を削除します。よろしいですか？')) return;
  const count = selectedOpps.size;
  selectedOpps.forEach(id => _purgeOpp(id));
  save();
  clearOppSelection();
  renderOpportunities();
  renderDashboard();
  updateAlertBadge();
  toast(count + '件を削除しました', 'success');
}

function onLeadChk(el, id) {
  const row = document.getElementById('lead-row-' + id);
  if(el.checked){ selectedLeads.add(id); if(row) row.classList.add('selected'); }
  else           { selectedLeads.delete(id); if(row) row.classList.remove('selected'); }
  updateLeadBulkBar();
  const all = document.querySelectorAll('#leads-tbody input.row-chk');
  const hd  = document.getElementById('lead-select-all');
  if(hd){ hd.checked = all.length > 0 && [...all].every(c=>c.checked); hd.indeterminate = selectedLeads.size > 0 && selectedLeads.size < all.length; }
}

function toggleAllLeads(el) {
  document.querySelectorAll('#leads-tbody input.row-chk').forEach(c => {
    c.checked = el.checked;
    const row = document.getElementById('lead-row-' + c.dataset.id);
    if(el.checked){ selectedLeads.add(c.dataset.id); if(row) row.classList.add('selected'); }
    else           { selectedLeads.delete(c.dataset.id); if(row) row.classList.remove('selected'); }
  });
  updateLeadBulkBar();
}

function updateLeadBulkBar() {
  const bar = document.getElementById('lead-bulk-bar');
  const cnt = document.getElementById('lead-bulk-count');
  if(!bar) return;
  if(selectedLeads.size > 0){ bar.classList.add('show'); cnt.textContent = selectedLeads.size + '件選択中'; }
  else bar.classList.remove('show');
}

function clearLeadSelection() {
  selectedLeads.clear();
  document.querySelectorAll('#leads-tbody input.row-chk').forEach(c => c.checked = false);
  document.querySelectorAll('#leads-tbody tr.selected').forEach(r => r.classList.remove('selected'));
  const hd = document.getElementById('lead-select-all');
  if(hd){ hd.checked = false; hd.indeterminate = false; }
  document.getElementById('lead-bulk-bar')?.classList.remove('show');
}

function bulkDeleteLeads() {
  if(!selectedLeads.size) return;
  if(!confirm(selectedLeads.size + '件のリードを削除します。よろしいですか？')) return;
  const count = selectedLeads.size;
  db.leads = db.leads.filter(l => !selectedLeads.has(l.id));
  save();
  clearLeadSelection();
  renderLeads();
  toast(count + '件を削除しました', 'success');
}

const STORE_KEY = 'sales_mgmt_v10';
let currentDetailOppId = '';

const DEFAULT_DATA = {"opportunities": [], "monthly": {}, "monthlyLocked": {}, "customers": [], "users": [{"id": "U-001", "name": "管理者", "email": "atakahashi@4din.com", "role": "管理者", "dept": "", "active": true}], "orgs": [{"id": "ORG-001", "name": "営業部", "manager": "", "budget": 0}], "alerts": [], "leads": [], "monthlySummary": {}, "customerMonthlySales": {}, "monthlyBudget": {}, "pdfFiles": {}};
let db = (() => {
  // OneDriveを唯一のデータソースとするため、localStorageは使わない
  // 起動時は空（DEFAULT_DATA）で初期化し、initOneDriveSyncで上書きする
  const base = JSON.parse(JSON.stringify(DEFAULT_DATA));
  if(!Array.isArray(base.activities)) base.activities = [];
  if(!Array.isArray(base.tasks))      base.tasks      = [];
  if(!base.pdfFiles) base.pdfFiles = {};
  if(!Array.isArray(base.alerts))     base.alerts     = [];
  return base;
})();
// 共通の基準月（月次管理／入金管理／キャッシュフロー予測の3画面で共有）
// デフォルト: 当月。setCurrentMonth() を介して変更すると、全画面が連動して再描画される
let currentMonth = (()=>{ const n=new Date(); return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0'); })();
let reportMonth = currentMonth; // 分析レポートの参照月（currentMonth で初期化）
// 互換性のため currentPaymentMonth は残すが、currentMonth と同じ値を指すよう Object.defineProperty で同期
// （古いコードからの参照を壊さないため。新規コードは currentMonth を使用すること）
Object.defineProperty(window, 'currentPaymentMonth', {
  get() { return currentMonth; },
  set(v) { if(v) currentMonth = v; },
  configurable: true,
});

// ============================================================
// 共通: 基準月の変更 → 3画面（月次/入金/CF）連動再描画
// ============================================================
// 月次管理 / 入金管理 / キャッシュフロー予測 の3画面で月セレクタを操作したとき、
// この関数を経由することで他画面の表示状態も同期される。
// - currentMonth を更新
// - 各画面の月ピッカー value / 月ラベルを同期
// - 現在表示中のページを再描画
function setCurrentMonth(ym) {
  if(!ym || !/^\d{4}-\d{2}$/.test(ym)) return;
  if(ym === currentMonth) return; // 変化なし
  currentMonth = ym;
  syncMonthPickers();
  // 現在表示中のページのみ再描画（refreshCurrentPage は core.js で定義）
  if(typeof refreshCurrentPage === 'function') refreshCurrentPage();
  else {
    // 互換fallback: 個別に呼び出し
    const page = document.querySelector('.nav-item.active')?.dataset?.page;
    if(page === 'monthly')  renderMonthly?.();
    if(page === 'payment')  renderPayment?.();
    if(page === 'cashflow') renderCashflow?.();
  }
}

// 3画面それぞれの月ピッカー・ラベルを currentMonth に同期させる
function syncMonthPickers() {
  const [y, m] = currentMonth.split('-');
  const labelText = `${y}年${parseInt(m)}月`;

  // 月次管理
  const mLbl = document.getElementById('monthly-month-label');
  if(mLbl) mLbl.textContent = labelText;
  const mPickerHidden = document.getElementById('monthly-month-picker-hidden');
  if(mPickerHidden) mPickerHidden.value = currentMonth;
  const mPicker = document.getElementById('monthly-month-picker');
  if(mPicker) mPicker.value = currentMonth;

  // 入金管理
  const pLbl = document.getElementById('payment-month-label');
  if(pLbl) pLbl.textContent = labelText;
  const pPickerHidden = document.getElementById('payment-month-picker-hidden');
  if(pPickerHidden) pPickerHidden.value = currentMonth;

  // キャッシュフロー予測
  const cfLbl = document.getElementById('cf-month-label');
  if(cfLbl) cfLbl.textContent = labelText;
  const cfPickerHidden = document.getElementById('cf-month-picker-hidden');
  if(cfPickerHidden) cfPickerHidden.value = currentMonth;
}
let charts = {};

// ═══════════════════════════════════════════════════════════════
// 保存システム: File System Access API（Chrome専用）
// ─ 初回のみファイル選択 → 以降は自動上書き保存
// ─ ファイルハンドルは IndexedDB に永続保存
// ═══════════════════════════════════════════════════════════════
const IDB_NAME  = 'salesAppDB';
const IDB_STORE = 'store';
const IDB_HNDL  = 'fileHandle';

// ── IndexedDB ヘルパー ──
function _idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(IDB_NAME, 3);
    r.onupgradeneeded = e => {
      const d = e.target.result;
      if(!d.objectStoreNames.contains(IDB_STORE))
        d.createObjectStore(IDB_STORE);
    };
    r.onsuccess = e => res(e.target.result);
    r.onerror   = e => rej(e.target.error);
  });
}
async function _idbSet(key, val) {
  const conn = await _idbOpen();
  return new Promise((res, rej) => {
    const tx = conn.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(val, key);
    tx.oncomplete = () => { conn.close(); res(); };
    tx.onerror    = e => { conn.close(); rej(e.target.error); };
  });
}
async function _idbGet(key) {
  const conn = await _idbOpen();
  return new Promise((res, rej) => {
    const tx = conn.transaction(IDB_STORE, 'readonly');
    const r  = tx.objectStore(IDB_STORE).get(key);
    r.onsuccess = () => { conn.close(); res(r.result ?? null); };
    r.onerror   = e => { conn.close(); rej(e.target.error); };
  });
}

// ── 保存インジケーター ──

// ── HTML 生成（db を DEFAULT_DATA として埋め込む）──
function _buildHtml() {
  const src = document.documentElement.outerHTML;
  const M   = 'const DEFAULT_DATA = ';
  const si  = src.indexOf(M);
  if(si < 0) return null;
  let depth = 0, i = si + M.length;
  while(i < src.length) {
    const c = src[i];
    if(c==='{' || c==='[') depth++;
    else if(c==='}' || c===']') { depth--; if(depth===0){i++;break;} }
    i++;
  }
  while(i < src.length && (src[i]===' '||src[i]===';')) i++;
  return src.slice(0, si) + M + JSON.stringify(db) + ';' + src.slice(i);
}

// ── ファイルハンドル管理 ──
// ローカル保存機能削除済み





// ── メイン save() ──
async function save() {
  // OneDriveに保存（全員書き込み可）
  if(_odSyncEnabled) {
    saveToOneDrive().catch(e => {
      console.warn('[save] OneDrive保存失敗:', e.message);
      toast('⚠️ OneDrive保存に失敗しました。接続を確認してください。', 'error');
    });
  } else {
    toast('⚠️ OneDriveに接続されていません。データは保存されていません。', 'error');
  }
  // データ変更後に現在のページを常に最新状態へ再描画
  refreshCurrentPage();
}






function resetData() {
  if(!confirm('案件管理v2.xlsx の初期データに戻します。手動入力したデータは失われます。よろしいですか？')) return;
  _storage.removeItem(STORE_KEY);
  db = JSON.parse(JSON.stringify(DEFAULT_DATA));
  save();
  location.reload();
}

// ============================================================
// NAVIGATION
// ============================================================
const PAGE_TITLES = {dashboard:'ダッシュボード', leads:'リード管理', opportunities:'案件管理', monthly:'月次管理', payment:'入金管理', cashflow:'キャッシュフロー予測', reports:'分析・レポート', alerts:'アラート', master:'マスタ管理'};

// ============================================================
// 現在表示中のページを再描画する共通関数
// save() / loadFromOneDrive() 完了時に呼ばれ、画面を常に最新状態に保つ
// ============================================================
function refreshCurrentPage() {
  const page = document.querySelector('.nav-item.active')?.dataset?.page || 'dashboard';
  switch(page) {
    case 'dashboard':     renderDashboard();     break;
    case 'leads':         renderLeads();         break;
    case 'opportunities': renderOpportunities(); break;
    case 'monthly':       renderMonthly();       break;
    case 'reports':       renderReports();       break;
    case 'alerts':        renderAlerts();        break;
    case 'payment':       renderPayment();       break;
    case 'cashflow':      renderCashflow();      break;
    case 'master':        renderMaster();        break;
  }
  updateAlertBadge();
}

// ページごとのグローバル検索 placeholder と対象 input ID
const GLOBAL_SEARCH_CONFIG = {
  leads:         { placeholder: '企業名・担当者で検索', targetId: 'lead-search' },
  opportunities: { placeholder: '案件名・顧客で検索',   targetId: 'opp-search'  },
  monthly:       { placeholder: '案件名・顧客で絞り込み', targetId: 'monthly-search' },
  alerts:        { placeholder: 'アラートを検索',       targetId: 'alert-search' },
  payment:       { placeholder: '顧客・案件名検索',      targetId: 'payment-search' },
  cashflow:      { placeholder: '案件名・顧客で検索',    targetId: 'cf-search' },
  reports:       { placeholder: '顧客名で検索',          targetId: 'customer-search' },
};

// ページごとの検索条件を保持するストア（タブ移動しても維持）
// ※ onGlobalSearch より前に定義する必要がある（即時保存で参照するため）
const _searchState = {};

function onGlobalSearch(val) {
  // 現在表示中のページの検索 input に同期して再描画
  const page = document.querySelector('.nav-item.active')?.dataset?.page || '';

  // ★ タイピングのたびに即時保存（タブ移動しても確実に維持）
  if(page) _searchState[page] = val;

  // reports ページは「顧客別」タブが選択中のときのみ customer-search に同期
  if(page === 'reports') {
    const repCust = document.getElementById('rep-customer');
    if(repCust && repCust.style.display !== 'none') {
      const target = document.getElementById('customer-search');
      if(target) { target.value = val; target.dispatchEvent(new Event('input')); }
    }
    return;
  }
  const cfg = GLOBAL_SEARCH_CONFIG[page];
  if(!cfg) return;
  const target = document.getElementById(cfg.targetId);
  if(target) {
    target.value = val;
    target.dispatchEvent(new Event('input'));
  }
}

function navigate(page) {
  // ★ Critical-3対策: マスタ画面のアクセス制御
  if(page === 'master' && currentUser) {
    if(typeof canAccessMaster === 'function' && !canAccessMaster()) {
      if(typeof toast === 'function') {
        toast('マスタ管理画面はマネージャー以上の権限が必要です', 'error');
      }
      return;
    }
  }
  // キャッシュフロー予測: 経理・管理部 / 管理者 / 管理部所属のみアクセス可
  if(page === 'cashflow' && currentUser) {
    const canCF = (typeof isFinanceUser === 'function')
      ? isFinanceUser()
      : (currentUser.role === '管理者' || currentUser.role === '経理・管理部' || currentUser.dept === '管理部');
    if(!canCF) {
      toast('キャッシュフロー予測は管理部のみ閲覧可能です', 'error');
      return;
    }
  }
  // 離れる前に現在ページの検索値を保存
  // ※ onGlobalSearch でも即時保存しているが、念のため離脱時にも上書き保存
  const prevPage = document.querySelector('.nav-item.active')?.dataset?.page;
  if(prevPage) {
    const gIn = document.getElementById('global-search-input');
    // グローバル検索窓の現在値を最優先で保存（_searchState は onGlobalSearch で更新済みのはずだが）
    if(gIn && GLOBAL_SEARCH_CONFIG[prevPage]) {
      _searchState[prevPage] = gIn.value;
    }
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelector(`.nav-item[data-page="${page}"]`).classList.add('active');
  document.getElementById('page-title').textContent = PAGE_TITLES[page];
  // モバイルではページ遷移後にサイドバーを閉じる
  if(window.innerWidth <= 768) closeSidebar();

  // グローバル検索窓: 保存済みの値を復元（なければ空）
  const gInput = document.getElementById('global-search-input');
  const cfg = GLOBAL_SEARCH_CONFIG[page];
  const savedVal = _searchState[page] || '';
  if(gInput) {
    gInput.value = savedVal;
    gInput.placeholder = cfg ? cfg.placeholder : '検索...';
  }
  // ページ固有の検索 input にも復元（描画前に値だけセット。フィルタは render 関数が読み取る）
  if(cfg) {
    const target = document.getElementById(cfg.targetId);
    if(target) target.value = savedVal;
  }
  // 検索窓の表示/非表示（検索対応ページのみ表示）
  const bar = document.getElementById('global-search-bar');
  if(bar) bar.style.display = cfg ? 'flex' : 'none';

  if(page === 'dashboard') renderDashboard();
  else if(page === 'leads') renderLeads();
  else if(page === 'opportunities') renderOpportunities();
  else if(page === 'monthly') renderMonthly();
  else if(page === 'reports') renderReports();
  else if(page === 'alerts')  renderAlerts();
  else if(page === 'payment') renderPayment();
  else if(page === 'cashflow') renderCashflow();
  else if(page === 'master')  renderMaster();
  updateAlertBadge();
}

document.querySelectorAll('.nav-item[data-page]').forEach(el => {
  el.addEventListener('click', () => navigate(el.dataset.page));
});

// ============================================================
// HELPERS
// ============================================================
function fmt(n) {
  if(n === null || n === undefined || isNaN(n)) return '¥0万';
  // 小数4桁まで表示（末尾ゼロは削除）
  const rounded = Math.round(n * 10000) / 10000;
  const str = rounded % 1 === 0 ? rounded.toLocaleString() : rounded.toLocaleString(undefined, {minimumFractionDigits:1, maximumFractionDigits:4});
  return '¥' + str + '万';
}
function fmtM(n) { return '¥' + (n/100).toFixed(1) + 'M'; }
// 金額を小数4桁まで表示（末尾ゼロ削除）
function fmtVal(n) {
  if(!n && n !== 0) return '';
  const r = Math.round(n * 10000) / 10000;
  return r % 1 === 0 ? r.toLocaleString() : r.toLocaleString(undefined, {minimumFractionDigits:1, maximumFractionDigits:4});
}
function pct(n) { return Math.round(n) + '%'; }

function stageBadge(s) {
  const m = {リード:'badge-gray', 提案中:'badge-blue', 見積提出:'badge-amber', 交渉中:'badge-purple', 受注:'badge-green', 失注:'badge-red'};
  return `<span class="badge ${m[s]||'badge-gray'}">${s}</span>`;
}
function recogBadge(r) {
  const m = {'進行基準':'badge-purple','一括計上':'badge-blue','検収基準':'badge-amber','月額按分':'badge-green','手動計上':'badge-gray'};
  return `<span class="badge ${m[r]||'badge-gray'}">${r}</span>`;
}
function roleBadge(r) {
  const m = {'営業担当者':'badge-blue','マネージャー':'badge-purple','経理・管理部':'badge-amber','経営層':'badge-gray','システム管理者':'badge-red'};
  return `<span class="badge ${m[r]||'badge-gray'}">${r}</span>`;
}
function leadStatusBadge(s) {
  const m = {新規:'badge-gray', 接触済:'badge-blue', 育成中:'badge-amber', 案件化:'badge-green', 失効:'badge-red'};
  return `<span class="badge ${m[s]||'badge-gray'}">${s}</span>`;
}

function getMonthly(oppId) {
  if(!db.monthly[currentMonth]) db.monthly[currentMonth] = {};
  if(!db.monthly[currentMonth][oppId]) {
    db.monthly[currentMonth][oppId] = {sales:0, billing:0, cash:0, progress:0, cumProgress:0, locked:false, updatedBy:''};
  }
  return db.monthly[currentMonth][oppId];
}

function isMonthLocked(ym) { return !!db.monthlyLocked[ym || currentMonth]; }

function monthLabel(key) {
  const [y, m] = key.split('-');
  return `${y}年${parseInt(m)}月`;
}

// 翌月末営業日を計算（土日は前の金曜日に戻す）
function nextMonthEndBizDay(baseDate) {
  // baseDate: 'YYYY-MM-DD' または Date
  const d = baseDate ? new Date(baseDate) : new Date();
  // 翌月を計算（月末: 翌々月の1日の前日）
  const y = d.getFullYear();
  const m = d.getMonth(); // 0-indexed
  // 翌月末 = 翌々月の1日の0時 - 1日
  const lastDay = new Date(y, m + 2, 0); // 翌月の末日
  // 土日なら前の金曜日
  const dow = lastDay.getDay();
  if(dow === 0) lastDay.setDate(lastDay.getDate() - 2); // 日曜→金曜
  else if(dow === 6) lastDay.setDate(lastDay.getDate() - 1); // 土曜→金曜
  return lastDay.toISOString().split('T')[0];
}

function prevMonthKey(key) {
  const [y, m] = key.split('-').map(Number);
  return m === 1 ? `${y-1}-12` : `${y}-${String(m-1).padStart(2,'0')}`;
}

function nextMonthKey(key) {
  const [y, m] = key.split('-').map(Number);
  return m === 12 ? `${y+1}-01` : `${y}-${String(m+1).padStart(2,'0')}`;
}

// BUG-5対策: 同一ms内の複数uid呼び出しによるID衝突を防止する。
//   従来: Date.now() のみで生成 → バルクインポート/ループで衝突可能
//   対策: タイムスタンプ + 6桁ランダム + 内部カウンター で衝突確率を実質ゼロに
let _uidCounter = 0;
function uid(prefix) {
  _uidCounter = (_uidCounter + 1) & 0xffff;
  const ts   = Date.now().toString(36).toUpperCase();
  const rnd  = Math.floor(Math.random() * 0xffffff).toString(36).toUpperCase().padStart(4, '0');
  const cnt  = _uidCounter.toString(36).toUpperCase().padStart(2, '0');
  return prefix + '-' + ts + rnd + cnt;
}

// 案件ID: 6桁の数字（既存の最大値+1）
// BUG-5対策: バルクインポート時の連続発行で同じ maxId が返ることがあったため、
//   既に発行済みのIDを記録するSetで二重発行を防止する。
//   (db.opportunities への追加が反映される前に複数uidOpp()を呼ぶケースに対応)
const _issuedOppIds = new Set();
function uidOpp() {
  const existing = db.opportunities.map(o => parseInt(o.id) || 0);
  let candidate = (existing.length > 0 ? Math.max(...existing) : 100000) + 1;
  // 既存ID + すでに発行済みIDと衝突しないものを採番
  while(existing.includes(candidate) || _issuedOppIds.has(candidate)) {
    candidate++;
  }
  _issuedOppIds.add(candidate);
  // メモリリーク防止: Set のサイズが大きくなりすぎたらクリア（保存後はdb側で管理されるため）
  if(_issuedOppIds.size > 1000) _issuedOppIds.clear();
  return String(candidate);
}

function destroyChart(id) { if(charts[id]) { charts[id].destroy(); delete charts[id]; } }

// ============================================================
// TOAST
// ============================================================
let toastTimer;
function toast(msg, type='') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.background = type === 'error' ? 'var(--red)' : type === 'success' ? 'var(--green)' : 'var(--text-primary)';
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ============================================================
// MODAL
// ============================================================
function openModal(id) {
  if(id === 'customer') populateCustModal();
  if(id === 'org') populateOrgModal();
  if(id === 'lead') resetLeadModal();
  document.getElementById('modal-' + id).classList.add('open');
}

// リード登録モーダルを新規登録状態にリセット
function resetLeadModal() {
  document.getElementById('lead-modal-title').textContent = 'リード登録';
  document.getElementById('lead-edit-id').value = '';
  const fields = ['f-lead-company','f-lead-name','f-lead-tel','f-lead-email',
                  'f-lead-source','f-lead-status','f-lead-memo'];
  fields.forEach(id => {
    const el = document.getElementById(id);
    if(el) el.value = el.tagName === 'SELECT' ? el.options[0]?.value || '' : '';
  });
}
function closeModal(id) { document.getElementById('modal-' + id).classList.remove('open'); }

document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => { if(e.target === el) el.classList.remove('open'); });
});

function populateOppModal(opp=null) {
  // 顧客オートコンプリートリストを更新
  const custDl = document.getElementById('customer-list');
  if(custDl) custDl.innerHTML = db.customers.map(c => `<option value="${_ha(c.name)}">`).join('');
  const custSel = document.getElementById('f-opp-customer');
  custSel.value = ''; // 毎回クリア
  const ownerSel = document.getElementById('f-opp-owner');
  ownerSel.innerHTML = db.users.filter(u=>u.active).map(u => `<option value="${_ha(u.name)}">${_h(u.name)}</option>`).join('');
  // 新規登録時はログイン中ユーザーをデフォルト選択
  if(!opp && currentUser) ownerSel.value = currentUser.name;
  document.getElementById('opp-modal-title').textContent = opp ? '案件編集' : '新規案件登録';
  // PDF添付セクション初期化
  initPdfSection(opp?.id || null);
  // スケジュールデータ初期化
  scheduleData = {};
  if(opp && (opp.recog === '月額按分' || opp.recog === '進行基準')) {
    loadScheduleFromMonthly(opp.id, opp.start, opp.recog);
  }
  // 計上方式に応じてスケジュールセクション表示
  setTimeout(() => renderScheduleSection(), 0);
  document.getElementById('opp-edit-id').value = opp ? opp.id : '';
  document.getElementById('f-opp-name').value = opp ? opp.name : '';
  document.getElementById('f-opp-amount').value = opp ? opp.amount : '';
  document.getElementById('f-opp-prob').value = opp ? opp.prob :
    (STAGE_PROB[document.getElementById('f-opp-stage').value] ?? 50);
  document.getElementById('f-opp-memo').value = opp ? opp.memo : '';
  if(opp) {
    if(custSel) custSel.value = opp.customer || '';
    document.getElementById('f-opp-stage').value = opp.stage;
    document.getElementById('f-opp-recog').value = opp.recog;
    ownerSel.value = opp.owner;
    document.getElementById('f-opp-start').value = opp.start;
    document.getElementById('f-opp-end').value = opp.end;

    document.getElementById('f-opp-next-date').value     = opp.nextAction?.date     || '';
    document.getElementById('f-opp-next-action').value   = opp.nextAction?.action   || '';
    document.getElementById('f-opp-next-priority').value = opp.nextAction?.priority || 'normal';
  } else {
    // 新規登録：全フィールドを完全リセット
    document.getElementById('f-opp-name').value          = '';
    document.getElementById('f-opp-customer').value      = '';
    document.getElementById('f-opp-amount').value        = '';
    document.getElementById('f-opp-prob').value          = '50';
    document.getElementById('f-opp-stage').value         = '提案中';
    document.getElementById('f-opp-recog').value         = '月額按分';
    document.getElementById('f-opp-memo').value          = '';
    document.getElementById('f-opp-start').value         = '';
    document.getElementById('f-opp-end').value           = '';
    document.getElementById('f-opp-next-date').value     = '';
    document.getElementById('f-opp-next-action').value   = '';
    document.getElementById('f-opp-next-priority').value = 'normal';
    // 月次スケジュールもリセット
    scheduleData = {};
    setTimeout(() => renderScheduleSection(), 0);
  }
  // 売上回収時期フィールドを復元
  const _bt = document.getElementById('f-opp-billing-type');
  const _bs = document.getElementById('f-opp-billing-site');
  const _bd = document.getElementById('f-opp-billing-date');
  const _nb = document.getElementById('f-opp-next-billing-date');
  const _pd = document.getElementById('f-opp-payment-due');
  const _bm = document.getElementById('f-opp-billing-memo');
  if(_bt) _bt.value = opp?.billingType     || '';
  if(_bs) _bs.value = opp?.billingSite      || '';
  if(_bd) _bd.value = opp?.billingDate      || '';
  if(_nb) _nb.value = opp?.nextBillingDate  || '';
  if(_pd) _pd.value = opp?.paymentDue       || '';
  if(_bm) _bm.value = opp?.billingMemo      || '';
  // Teamsチャネル URL
  const _tu = document.getElementById('f-opp-teams-url');
  if(_tu) {
    _tu.value = opp?.teamsUrl || '';
    if(typeof validateTeamsUrl === 'function') validateTeamsUrl(_tu);
  }
  // 請求タイプに応じてUIを更新
  onBillingTypeChange();
}

function populateCustModal() {
  document.getElementById('f-cust-owner').innerHTML = db.users.filter(u=>u.active).map(u=>`<option value="${_ha(u.name)}">${_h(u.name)}</option>`).join('');
}
function populateUserModal(u = null) {
  document.getElementById('user-modal-title').textContent = u ? 'ユーザー編集' : 'ユーザー追加';
  document.getElementById('f-user-id').value    = u ? u.id : '';
  document.getElementById('f-user-name').value  = u ? u.name  : '';
  document.getElementById('f-user-email').value = u ? u.email : '';
  document.getElementById('f-user-role').value  = u ? u.role  : '営業担当者';
  document.getElementById('f-user-dept').value  = u ? u.dept  : '';
  document.getElementById('f-user-active').value = u ? String(u.active !== false) : 'true';
}

function editUser(id) {
  if(typeof requireAdmin === 'function' && !requireAdmin('ユーザー情報の編集')) return;
  const u = db.users.find(x => x.id === id);
  if(!u) return;
  populateUserModal(u);
  openModal('user');
}
function populateOrgModal(org) {
  document.getElementById('f-org-manager').innerHTML = db.users.filter(u=>u.active).map(u=>`<option value="${_ha(u.name)}">${_h(u.name)}</option>`).join('');
  if(org) {
    document.getElementById('org-modal-title').textContent = '部門編集';
    document.getElementById('f-org-id').value     = org.id;
    document.getElementById('f-org-name').value   = org.name;
    document.getElementById('f-org-manager').value = org.manager;
    document.getElementById('f-org-budget').value  = org.budget || '';
  } else {
    document.getElementById('org-modal-title').textContent = '部門追加';
    document.getElementById('f-org-id').value    = '';
    document.getElementById('f-org-name').value  = '';
    document.getElementById('f-org-budget').value = '';
  }
}

function editOrg(id) {
  if(typeof requireAdmin === 'function' && !requireAdmin('組織情報の編集')) return;
  const org = db.orgs.find(o => o.id === id);
  if(!org) return;
  populateOrgModal(org);
  openModal('org');
}

// ============================================================
// OPPORTUNITY CRUD
