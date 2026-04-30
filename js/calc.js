
// 電卓を開く（汎用）
function openCalcFor(inputEl, opts = {}) {
  _calcTarget = inputEl;
  _calcOnConf = opts.onConfirm || null;
  _calcMax    = opts.max    != null ? opts.max    : null;
  _calcStep   = opts.step   != null ? opts.step   : 0.0001;

  const cur = parseFloat(inputEl.value) || 0;
  _calcCur   = cur ? String(cur) : '0';
  _calcExpr  = ''; _calcOp = null; _calcPrev = null; _calcDone = false;

  // 電卓ポップアップの位置を input の下に配置
  const popup = document.getElementById('g-calc-popup');
  if(!popup) return;
  const rect = inputEl.getBoundingClientRect();
  popup.style.position = 'fixed';
  popup.style.top  = (rect.bottom + 4) + 'px';
  popup.style.left = Math.min(rect.left, window.innerWidth - 240) + 'px';
  popup.style.width = Math.max(rect.width, 220) + 'px';

  // 単位ラベル
  const unitEl = document.getElementById('g-calc-unit');
  if(unitEl) unitEl.textContent = opts.unit || '';

  _calcUpdateDisplay();
  popup.classList.add('open');
  inputEl.dataset.calcOpen = '1';

  setTimeout(() => {
    document.addEventListener('click', _calcOutsideClick, {once: true});
  }, 0);
}

// f-opp-amount 専用（後方互換）
function openCalc() {
  const el = document.getElementById('f-opp-amount');
  if(el) openCalcFor(el, {unit: '万円'});
}

function _calcOutsideClick(e) {
  const popup = document.getElementById('g-calc-popup');
  if(!popup) return;
  if(!popup.contains(e.target) && e.target !== _calcTarget) {
    closeCalcPopup();
  } else if(popup.classList.contains('open')) {
    document.addEventListener('click', _calcOutsideClick, {once: true});
  }
}

function closeCalcPopup() {
  const popup = document.getElementById('g-calc-popup');
  popup?.classList.remove('open');
  if(_calcTarget) delete _calcTarget.dataset.calcOpen;
  document.removeEventListener('click', _calcOutsideClick);
}

function calcNum(n) {
  if(_calcDone) { _calcCur = '0'; _calcDone = false; }
  if(n === '.' && _calcCur.includes('.')) return;
  if(_calcCur === '0' && n !== '.') _calcCur = n;
  else _calcCur += n;
  _calcUpdateDisplay();
}

function calcOp(op) {
  if(_calcOp && !_calcDone) {
    _calcPrev = _calcCompute(_calcPrev, parseFloat(_calcCur), _calcOp);
  } else {
    _calcPrev = parseFloat(_calcCur);
  }
  _calcOp = op;
  _calcExpr = _calcPrev + ' ' + op;
  _calcDone = true;
  _calcUpdateDisplay();
}

function calcEqual() {
  if(!_calcOp) return;
  const result = _calcCompute(_calcPrev, parseFloat(_calcCur), _calcOp);
  _calcExpr = _calcPrev + ' ' + _calcOp + ' ' + _calcCur + ' =';
  _calcCur  = String(Math.round(result * 1000) / 1000);
  _calcOp = null; _calcPrev = null; _calcDone = true;
  _calcUpdateDisplay();
}

function _calcCompute(a, b, op) {
  switch(op) {
    case '+': return a + b;
    case '−': return a - b;
    case '×': return a * b;
    case '÷': return b !== 0 ? a / b : 0;
    case '%': return a * b / 100;
    default:  return b;
  }
}

function calcClear() {
  _calcExpr = ''; _calcCur = '0'; _calcOp = null; _calcPrev = null; _calcDone = false;
  _calcUpdateDisplay();
}

function calcDel() {
  if(_calcDone) { calcClear(); return; }
  _calcCur = _calcCur.length > 1 ? _calcCur.slice(0, -1) : '0';
  _calcUpdateDisplay();
}

function calcConfirm() {
  if(_calcOp) calcEqual();
  let val = parseFloat(_calcCur) || 0;
  if(_calcMax !== null) val = Math.min(val, _calcMax);
  // 小数4桁に丸める（金額は万円単位で小数4桁まで）
  val = Math.round(val * 10000) / 10000;
  if(_calcTarget) {
    _calcTarget.value = val;
    // input イベントを発火して連動する処理を呼ぶ
    _calcTarget.dispatchEvent(new Event('input', {bubbles: true}));
    _calcTarget.dispatchEvent(new Event('change', {bubbles: true}));
  }
  if(_calcOnConf) _calcOnConf(val);
  closeCalcPopup();
}

function _calcUpdateDisplay() {
  const exprEl = document.getElementById('g-calc-expr');
  const valEl  = document.getElementById('g-calc-val');
  if(exprEl) exprEl.textContent = _calcExpr;
  if(valEl) {
    const num = parseFloat(_calcCur) || 0;
    valEl.textContent = num.toLocaleString('ja-JP', {maximumFractionDigits: 3});
  }
}

// キーボードサポート
document.addEventListener('keydown', e => {
  const popup = document.getElementById('g-calc-popup');
  if(!popup?.classList.contains('open')) return;
  if(e.key === 'Enter')     { e.preventDefault(); calcConfirm(); }
  else if(e.key === 'Escape')   { closeCalcPopup(); }
  else if(e.key >= '0' && e.key <= '9') { e.preventDefault(); calcNum(e.key); }
  else if(e.key === '.')    { e.preventDefault(); calcNum('.'); }
  else if(e.key === '+')    { e.preventDefault(); calcOp('+'); }
  else if(e.key === '-')    { e.preventDefault(); calcOp('−'); }
  else if(e.key === '*')    { e.preventDefault(); calcOp('×'); }
  else if(e.key === '/')    { e.preventDefault(); calcOp('÷'); }
  else if(e.key === '=')    { e.preventDefault(); calcEqual(); }
  else if(e.key === 'Backspace') { e.preventDefault(); calcDel(); }
  else if(e.key === 'Delete')   { e.preventDefault(); calcClear(); }
});



// ============================================================
// バックアップ & インポート機能
// ============================================================
const BACKUP_KEY = 'sales_mgmt_auto_backup';
