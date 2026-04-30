function toggleSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const overlay  = document.getElementById('sidebar-overlay');
  const hamburger = document.getElementById('hamburger-btn');
  if(!sidebar) return;
  const isOpen = sidebar.classList.contains('open');
  sidebar.classList.toggle('open', !isOpen);
  overlay?.classList.toggle('show', !isOpen);
  hamburger?.classList.toggle('open', !isOpen);
}

function closeSidebar() {
  const sidebar   = document.getElementById('sidebar');
  const overlay   = document.getElementById('sidebar-overlay');
  const hamburger = document.getElementById('hamburger-btn');
  sidebar?.classList.remove('open');
  overlay?.classList.remove('show');
  hamburger?.classList.remove('open');
}


// ============================================================
// 月次管理 契約期間フィルター 基準月ピッカー制御
// ============================================================
function onPeriodFilterChange() {
  const mpf   = document.getElementById('monthly-period-filter')?.value;
  renderMonthly();
}


// ============================================================
// 顧客名 オートコンプリート（案件モーダル）
// ============================================================
let _acIndex = -1;

function onCustInput(el) {
  const q = el.value.toLowerCase();
  const dd = document.getElementById('cust-ac-dropdown');
  if(!dd) return;
  const matches = db.customers
    .filter(c => !q || c.name.toLowerCase().includes(q))
    .slice(0, 20);
  if(!matches.length) {
    dd.innerHTML = '<div class="ac-empty">該当なし</div>';
    dd.classList.add('open');
    _acIndex = -1;
    return;
  }
  dd.innerHTML = matches.map((c, i) => {
    const name = q ? c.name.replace(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'gi'),
      m => '<mark>' + m + '</mark>') : c.name;
    return `<div class="ac-item" data-name="${c.name}" data-idx="${i}"
      onmousedown="selectCust('${c.name.replace(/'/g, "\'")}')">${name}</div>`;
  }).join('');
  dd.classList.add('open');
  _acIndex = -1;
}

function onCustKeydown(e) {
  const dd = document.getElementById('cust-ac-dropdown');
  const items = dd?.querySelectorAll('.ac-item') || [];
  if(e.key === 'ArrowDown') {
    e.preventDefault();
    _acIndex = Math.min(_acIndex + 1, items.length - 1);
    items.forEach((el, i) => el.classList.toggle('active', i === _acIndex));
  } else if(e.key === 'ArrowUp') {
    e.preventDefault();
    _acIndex = Math.max(_acIndex - 1, 0);
    items.forEach((el, i) => el.classList.toggle('active', i === _acIndex));
  } else if(e.key === 'Enter') {
    e.preventDefault();
    if(_acIndex >= 0 && items[_acIndex]) {
      selectCust(items[_acIndex].dataset.name);
    }
  } else if(e.key === 'Escape') {
    closeCustDropdown();
  }
}

function selectCust(name) {
  const el = document.getElementById('f-opp-customer');
  if(el) el.value = name;
  closeCustDropdown();
}

function closeCustDropdown() {
  document.getElementById('cust-ac-dropdown')?.classList.remove('open');
  _acIndex = -1;
}



// ============================================================
// 汎用電卓コンポーネント
// ============================================================
let _calcExpr   = '';
let _calcCur    = '0';
let _calcOp     = null;
let _calcPrev   = null;
let _calcDone   = false;
let _calcTarget = null;   // 対象の input 要素
let _calcOnConf = null;   // 確定時コールバック
let _calcMax    = null;   // 最大値
let _calcStep   = null;   // 小数点以下桁数
