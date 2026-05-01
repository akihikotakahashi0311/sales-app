// ============================================================
// BUG-8対策: HTMLエスケープのグローバルユーティリティ
// 全ファイル共通の XSS対策関数。ユーザー入力（案件名、顧客名、メモ等）を
// テンプレートリテラルやinnerHTMLに埋め込む際に必ず通すこと。
//   - escapeHtml(s)   : テキストノード相当のエスケープ
//   - escapeAttr(s)   : 属性値用（escapeHtmlと同等で扱う）
//   - escapeJsString(s): onclick="foo('...')"のような属性内JS文字列リテラル用
// ============================================================
function escapeHtml(s) {
  if(s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// 属性値専用（基本的にescapeHtmlと同じだが意味付けのため別名で公開）
function escapeAttr(s) { return escapeHtml(s); }
// onclick="foo('...')" のような属性内JS文字列リテラル用
//   1. シングルクオートを\'にエスケープ
//   2. バックスラッシュを\\
//   3. 改行/復帰を\n,\r
//   4. その後にHTMLエスケープを通すことで属性値としても安全になる
function escapeJsString(s) {
  if(s === null || s === undefined) return '';
  const escaped = String(s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/</g, '\\x3C')   // </script> 等の早期終了対策
    .replace(/>/g, '\\x3E');
  // HTML属性として埋め込む際の二重エスケープ
  return escaped.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// 短縮エイリアス（テンプレートリテラル内で使いやすい）
const _h = escapeHtml;
const _ha = escapeAttr;
const _hj = escapeJsString;

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
    // BUG-8対策: name はユーザー入力なので先にHTMLエスケープしてから <mark> を埋め込む
    // 検索クエリにも HTMLメタ文字が含まれる可能性があるため、エスケープ後の文字列に対してマッチング
    const safeName = _h(c.name);
    let display = safeName;
    if(q) {
      try {
        const safeQ = _h(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        display = safeName.replace(new RegExp(safeQ, 'gi'), m => '<mark>' + m + '</mark>');
      } catch(e) {
        display = safeName;
      }
    }
    return `<div class="ac-item" data-name="${_ha(c.name)}" data-idx="${i}"
      onmousedown="selectCust('${_hj(c.name)}')">${display}</div>`;
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
let _calcUnit   = '';     // 表示単位（万円 / % など）

// ─────────────────────────────────────────────
// openCalcFor(el, opts)
//   el   : クリックされた input 要素（位置決め＋初期値の取得元）
//   opts : { unit, step, max, onConfirm }
//     - unit      : '万円' / '%' など（表示用）
//     - step      : 小数点以下桁数の指標。0.0001 → 4桁、0.1 → 1桁、1 → 0桁
//     - max       : 最大値（％系は 100 など）。確定時にクランプ
//     - onConfirm : 確定時に呼ばれる関数。引数は数値（文字列でも parseFloat 可）
// ─────────────────────────────────────────────
function openCalcFor(el, opts) {
  if(!el) return;
  opts = opts || {};

  const popup = document.getElementById('g-calc-popup');
  if(!popup) return;

  // disabled 状態の input は開かない（ロック中の月など）
  if(el.disabled) return;

  _calcTarget = el;
  _calcOnConf = (typeof opts.onConfirm === 'function') ? opts.onConfirm : null;
  _calcUnit   = opts.unit || '';
  _calcMax    = (opts.max !== undefined && opts.max !== null) ? Number(opts.max) : null;
  _calcStep   = (opts.step !== undefined && opts.step !== null) ? Number(opts.step) : null;

  // 初期値: input の現在値（数値解釈）。空ならゼロ
  const raw = String(el.value ?? '').replace(/,/g, '').trim();
  const initNum = parseFloat(raw);
  _calcCur  = (isFinite(initNum) && raw !== '') ? String(initNum) : '0';
  _calcExpr = '';
  _calcOp   = null;
  _calcPrev = null;
  _calcDone = true; // 次の数字入力で _calcCur を上書きする

  // 単位表示
  const unitEl = document.getElementById('g-calc-unit');
  if(unitEl) unitEl.textContent = _calcUnit ? ('単位: ' + _calcUnit) : '';

  _calcRender();

  // 位置決め: クリックされたセルの直下、はみ出すなら左寄せ・上寄せに調整
  const rect = el.getBoundingClientRect();
  const popupW = 220;
  const popupH = 360; // ボタン込みのおおよその高さ
  const margin = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = rect.left;
  let top  = rect.bottom + 6;
  if(left + popupW + margin > vw) left = Math.max(margin, vw - popupW - margin);
  if(top  + popupH + margin > vh) top  = Math.max(margin, rect.top - popupH - 6);

  popup.style.left = left + 'px';
  popup.style.top  = top  + 'px';
  popup.classList.add('open');

  // 外側クリック / Esc で閉じる（多重バインド防止）
  setTimeout(() => {
    document.addEventListener('mousedown', _calcOnDocMouseDown, true);
    document.addEventListener('keydown',   _calcOnKeyDown,      true);
  }, 0);
}

function _calcClose() {
  const popup = document.getElementById('g-calc-popup');
  popup?.classList.remove('open');
  document.removeEventListener('mousedown', _calcOnDocMouseDown, true);
  document.removeEventListener('keydown',   _calcOnKeyDown,      true);
  _calcTarget = null;
  _calcOnConf = null;
}

function _calcOnDocMouseDown(e) {
  const popup = document.getElementById('g-calc-popup');
  if(!popup) return;
  if(popup.contains(e.target)) return;
  if(_calcTarget && _calcTarget === e.target) return;
  _calcClose();
}

function _calcOnKeyDown(e) {
  if(e.key === 'Escape') {
    e.preventDefault();
    _calcClose();
    return;
  }
  if(e.key === 'Enter') {
    e.preventDefault();
    calcConfirm();
    return;
  }
  if(e.key === 'Backspace') {
    e.preventDefault();
    calcDel();
    return;
  }
  if(/^[0-9]$/.test(e.key)) {
    e.preventDefault();
    calcNum(e.key);
    return;
  }
  if(e.key === '.') {
    e.preventDefault();
    calcNum('.');
    return;
  }
  if(e.key === '+') { e.preventDefault(); calcOp('+'); return; }
  if(e.key === '-') { e.preventDefault(); calcOp('−'); return; }
  if(e.key === '*') { e.preventDefault(); calcOp('×'); return; }
  if(e.key === '/') { e.preventDefault(); calcOp('÷'); return; }
  if(e.key === '%') { e.preventDefault(); calcOp('%'); return; }
  if(e.key === '=') { e.preventDefault(); calcEqual(); return; }
}

// 表示更新
function _calcRender() {
  const valEl  = document.getElementById('g-calc-val');
  const exprEl = document.getElementById('g-calc-expr');
  if(valEl)  valEl.textContent  = _calcFormatDisplay(_calcCur);
  if(exprEl) exprEl.textContent = _calcExpr || '';
}

function _calcFormatDisplay(s) {
  if(s === '' || s === '-' || s === '.') return s || '0';
  const n = Number(s);
  if(!isFinite(n)) return s;
  // 整数部はカンマ、小数部はそのまま
  const parts = String(s).split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.length > 1 ? (intPart + '.' + parts[1]) : intPart;
}

// 数字・小数点入力
function calcNum(n) {
  if(_calcDone) {
    _calcCur  = (n === '.') ? '0.' : n;
    _calcDone = false;
  } else {
    if(n === '.') {
      if(!_calcCur.includes('.')) _calcCur += '.';
    } else {
      _calcCur = (_calcCur === '0') ? n : (_calcCur + n);
    }
  }
  _calcRender();
}

// 演算子
function calcOp(op) {
  // % は単独で「現在値 ÷ 100」として処理
  if(op === '%') {
    const cur = parseFloat(_calcCur) || 0;
    _calcCur  = String(cur / 100);
    _calcDone = true;
    _calcRender();
    return;
  }

  // 直前に演算子が入っていて連続押し → 演算子を差し替えるだけ
  if(_calcOp !== null && _calcDone) {
    _calcOp = op;
    _calcExpr = (_calcPrev !== null ? _calcFormatDisplay(String(_calcPrev)) : '') + ' ' + op;
    _calcRender();
    return;
  }

  // 既に左辺と演算子があれば一旦計算してから演算子を更新
  if(_calcOp !== null && _calcPrev !== null) {
    const r = _calcApply(_calcPrev, parseFloat(_calcCur) || 0, _calcOp);
    _calcPrev = r;
    _calcCur  = String(r);
  } else {
    _calcPrev = parseFloat(_calcCur) || 0;
  }
  _calcOp   = op;
  _calcExpr = _calcFormatDisplay(String(_calcPrev)) + ' ' + op;
  _calcDone = true;
  _calcRender();
}

function _calcApply(a, b, op) {
  switch(op) {
    case '+': return a + b;
    case '−': return a - b;
    case '×': return a * b;
    case '÷': return b === 0 ? 0 : a / b;
    default:  return b;
  }
}

// =
function calcEqual() {
  if(_calcOp === null || _calcPrev === null) {
    _calcDone = true;
    _calcRender();
    return;
  }
  const r = _calcApply(_calcPrev, parseFloat(_calcCur) || 0, _calcOp);
  _calcExpr = _calcFormatDisplay(String(_calcPrev)) + ' ' + _calcOp + ' ' + _calcFormatDisplay(_calcCur) + ' =';
  _calcCur  = String(r);
  _calcOp   = null;
  _calcPrev = null;
  _calcDone = true;
  _calcRender();
}

// C: 全クリア
function calcClear() {
  _calcCur  = '0';
  _calcExpr = '';
  _calcOp   = null;
  _calcPrev = null;
  _calcDone = true;
  _calcRender();
}

// ⌫: 1文字削除
function calcDel() {
  if(_calcDone) {
    // 直前が確定状態ならクリアと同等
    _calcCur  = '0';
    _calcDone = true;
  } else if(_calcCur.length > 1) {
    _calcCur = _calcCur.slice(0, -1);
    if(_calcCur === '-' || _calcCur === '') _calcCur = '0';
  } else {
    _calcCur = '0';
  }
  _calcRender();
}

// ✓ 確定: 演算が残っていれば計算 → max/step を適用 → onConfirm 呼び出し
function calcConfirm() {
  // 演算が残っていれば先に閉じる
  if(_calcOp !== null && _calcPrev !== null) {
    const r = _calcApply(_calcPrev, parseFloat(_calcCur) || 0, _calcOp);
    _calcCur  = String(r);
    _calcOp   = null;
    _calcPrev = null;
  }

  let v = parseFloat(_calcCur);
  if(!isFinite(v)) v = 0;

  // max クランプ
  if(_calcMax !== null && v > _calcMax) v = _calcMax;
  // 負数は許容しない（万円・%・件数いずれも非負）
  if(v < 0) v = 0;

  // step に応じた丸め
  //   step = 0.0001 → 4桁、0.001 → 3桁、0.01 → 2桁、0.1 → 1桁、1 → 0桁
  let digits = 4;
  if(_calcStep !== null && _calcStep > 0) {
    const log = -Math.log10(_calcStep);
    digits = Math.max(0, Math.round(log));
  }
  const factor = Math.pow(10, digits);
  v = Math.round(v * factor) / factor;

  // 入力欄にも反映（即時フィードバック）
  if(_calcTarget) {
    _calcTarget.value = (digits > 0) ? v.toFixed(digits).replace(/\.?0+$/, '') : String(v);
    if(_calcTarget.value === '' || _calcTarget.value === '-') _calcTarget.value = '0';
  }

  // 呼び出し元コールバック
  const cb = _calcOnConf;
  _calcClose();
  if(cb) {
    try { cb(v); } catch(e) { console.error('[calc onConfirm error]', e); }
  }
}
