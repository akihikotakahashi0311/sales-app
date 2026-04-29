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
  if(custDl) custDl.innerHTML = db.customers.map(c => `<option value="${c.name}">`).join('');
  const custSel = document.getElementById('f-opp-customer');
  custSel.value = ''; // 毎回クリア
  const ownerSel = document.getElementById('f-opp-owner');
  ownerSel.innerHTML = db.users.filter(u=>u.active).map(u => `<option>${u.name}</option>`).join('');
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
  // 請求タイプに応じてUIを更新
  onBillingTypeChange();
}

function populateCustModal() {
  document.getElementById('f-cust-owner').innerHTML = db.users.filter(u=>u.active).map(u=>`<option>${u.name}</option>`).join('');
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
  const u = db.users.find(x => x.id === id);
  if(!u) return;
  populateUserModal(u);
  openModal('user');
}
function populateOrgModal(org) {
  document.getElementById('f-org-manager').innerHTML = db.users.filter(u=>u.active).map(u=>`<option>${u.name}</option>`).join('');
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
  const org = db.orgs.find(o => o.id === id);
  if(!org) return;
  populateOrgModal(org);
  openModal('org');
}

// ============================================================
