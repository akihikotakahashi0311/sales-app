const MAX_AUTO_BACKUPS = 5;
let _importData = null;

// ─ エクスポート
function exportBackup(mode) {
  if(!currentUser || (currentUser.role !== '管理者' && currentUser.dept !== '管理部')) {
    toast('この操作は管理者のみ利用できます', 'error'); return;
  }
  const now    = new Date();
  const pad    = n => String(n).padStart(2, '0');
  const stamp  = now.getFullYear() + pad(now.getMonth()+1) + pad(now.getDate()) +
                 '_' + pad(now.getHours()) + pad(now.getMinutes());

  let data, filename;
  if(mode === 'opportunities') {
    data     = { opportunities: db.opportunities, customers: db.customers, exportedAt: now.toISOString(), mode };
    filename = `sales_opportunities_${stamp}.json`;
  } else if(mode === 'monthly') {
    data     = { monthly: db.monthly, monthlySummary: db.monthlySummary, exportedAt: now.toISOString(), mode };
    filename = `sales_monthly_${stamp}.json`;
  } else {
    data     = { ...db, exportedAt: now.toISOString(), mode: 'full', storeKey: STORE_KEY };
    filename = `sales_backup_${stamp}.json`;
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);

  const infoEl = document.getElementById('backup-export-info');
  if(infoEl) {
    const size = (JSON.stringify(data).length / 1024).toFixed(1);
    infoEl.textContent = `✓ ${filename}（${size} KB）をダウンロードしました`;
    infoEl.style.color = 'var(--green)';
    setTimeout(() => { infoEl.textContent = ''; }, 4000);
  }
  toast(`${filename} をエクスポートしました`, 'success');
}

// ─ インポート（ファイル選択）
function importBackup(input) {
  if(!currentUser || (currentUser.role !== '管理者' && currentUser.dept !== '管理部')) {
    toast('この操作は管理者のみ利用できます', 'error'); return;
  }
  const file = input.files[0];
  if(!file) return;

  document.getElementById('backup-import-filename').textContent = file.name;

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      _importData = data;

      const info = [];
      if(data.opportunities) info.push(`案件: ${data.opportunities.length}件`);
      if(data.customers)     info.push(`顧客: ${data.customers.length}件`);
      if(data.users)         info.push(`ユーザー: ${data.users.length}件`);
      if(data.monthly)       info.push(`月次データ: ${Object.keys(data.monthly).length}ヶ月`);
      if(data.leads)         info.push(`リード: ${data.leads.length}件`);
      if(data.exportedAt)    info.push(`エクスポート日時: ${new Date(data.exportedAt).toLocaleString('ja-JP')}`);
      info.push(`モード: ${data.mode || 'full'}`);

      document.getElementById('backup-import-info').innerHTML =
        info.map(t => `<div style="margin-bottom:4px;">• ${t}</div>`).join('');
      document.getElementById('backup-import-preview').style.display = '';
    } catch(err) {
      toast('JSONファイルの解析に失敗しました: ' + err.message, 'error');
      _importData = null;
    }
  };
  reader.readAsText(file);
}

// ─ インポート確定
function confirmImport() {
  if(!_importData) return;
  if(!confirm('現在のデータをインポートデータで上書きします。よろしいですか？')) return;

  // 現在のデータを自動バックアップに保存してから上書き
  createAutoBackup(false);

  const mode = _importData.mode || 'full';
  if(mode === 'opportunities') {
    if(_importData.opportunities) db.opportunities = _importData.opportunities;
    if(_importData.customers)     db.customers     = _importData.customers;
  } else if(mode === 'monthly') {
    if(_importData.monthly)        db.monthly        = _importData.monthly;
    if(_importData.monthlySummary) db.monthlySummary = _importData.monthlySummary;
  } else {
    // full: 全フィールドを上書き（storeKey等のメタデータは除く）
    const skip = ['exportedAt', 'mode', 'storeKey'];
    Object.keys(_importData).forEach(k => {
      if(!skip.includes(k)) db[k] = _importData[k];
    });
  }

  save();
  cancelImport();
  toast('インポートが完了しました', 'success');
  // ページをリロードして全画面を更新
  setTimeout(() => location.reload(), 800);
}

function cancelImport() {
  _importData = null;
  document.getElementById('backup-import-preview').style.display = 'none';
  document.getElementById('backup-import-filename').textContent = 'ファイル未選択';
}

// ─ 自動バックアップ
function createAutoBackup(showToast = true) {
  const backups = JSON.parse(_storage.getItem(BACKUP_KEY) || '[]');
  const now = new Date();
  backups.unshift({
    timestamp: now.toISOString(),
    label: now.toLocaleString('ja-JP'),
    data: JSON.parse(JSON.stringify(db)),
    size: JSON.stringify(db).length
  });
  // 最大5世代
  if(backups.length > MAX_AUTO_BACKUPS) backups.splice(MAX_AUTO_BACKUPS);
  _storage.setItem(BACKUP_KEY, JSON.stringify(backups));
  if(showToast) toast('バックアップを保存しました', 'success');
  renderBackupHistory();
}

// ─ 自動バックアップから復元
function restoreAutoBackup(index) {
  const backups = JSON.parse(_storage.getItem(BACKUP_KEY) || '[]');
  const bk = backups[index];
  if(!bk) return;
  if(!confirm(`${bk.label} のバックアップに戻しますか？\n現在のデータは失われます。`)) return;
  const skip = ['exportedAt', 'mode', 'storeKey'];
  Object.keys(bk.data).forEach(k => {
    if(!skip.includes(k)) db[k] = bk.data[k];
  });
  save();
  toast('バックアップから復元しました', 'success');
  setTimeout(() => location.reload(), 800);
}

// ─ 自動バックアップから個別エクスポート
function exportAutoBackup(index) {
  const backups = JSON.parse(_storage.getItem(BACKUP_KEY) || '[]');
  const bk = backups[index];
  if(!bk) return;
  const data = { ...bk.data, exportedAt: bk.timestamp, mode: 'full' };
  const stamp = bk.timestamp.replace(/[:.]/g, '-').slice(0, 19);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `sales_backup_${stamp}.json`;
  a.click(); URL.revokeObjectURL(url);
}

// ─ 自動バックアップ履歴を描画
function renderBackupHistory() {
  const el = document.getElementById('backup-history-list');
  if(!el) return;
  const backups = JSON.parse(_storage.getItem(BACKUP_KEY) || '[]');
  if(!backups.length) {
    el.innerHTML = '<p style="font-size:12px;color:var(--text-muted);">バックアップ履歴はありません</p>';
    return;
  }
  el.innerHTML = backups.map((bk, i) => {
    const size = (bk.size / 1024).toFixed(1);
    const opps = bk.data?.opportunities?.length || 0;
    return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;
        border-bottom:1px solid var(--border-light);">
      <div style="flex:1;">
        <div style="font-size:13px;font-weight:500;">${bk.label}</div>
        <div style="font-size:11px;color:var(--text-muted);">案件 ${opps}件 ／ ${size} KB</div>
      </div>
      <button class="btn btn-sm" onclick="exportAutoBackup(${i})" title="ダウンロード">📤</button>
      <button class="btn btn-sm btn-primary" onclick="restoreAutoBackup(${i})">復元</button>
    </div>`;
  }).join('');
}



// ============================================================
// ユーザー選択 & 表示スコープ制御
// ============================================================
const USER_SESSION_KEY = 'sales_current_user';

// 現在のログインユーザー（name で管理）
let currentUser = null;  // { id, name, role, dept }
// 表示スコープ: 'own'=自分の案件のみ, 'all'=全件
let viewScope = 'own';

// ─ 初期化（DOMContentLoaded で呼ぶ）


// ── ログイン必須画面 ──
function showLoginRequired() {
  const existing = document.getElementById('login-required-overlay');
  if(existing) return; // 既に表示中

  // メインコンテンツを非表示
  document.querySelector('nav')  && (document.querySelector('nav').style.display  = 'none');
  document.querySelector('main') && (document.querySelector('main').style.display = 'none');
  document.getElementById('app') && (document.getElementById('app').style.display = 'none');

  const overlay = document.createElement('div');
  overlay.id = 'login-required-overlay';
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'background:var(--bg-primary, #f5f5f3)',
    'display:flex', 'flex-direction:column', 'align-items:center',
    'justify-content:center', 'z-index:99998',
    'font-family:system-ui,sans-serif', 'text-align:center', 'padding:32px'
  ].join(';');
  overlay.innerHTML = `
    <div style="max-width:380px;">
      <div style="font-size:64px;margin-bottom:24px;">☁️</div>
      <h1 style="font-size:22px;font-weight:700;color:var(--text-primary,#1a1a1a);margin:0 0 12px;">
        ログインが必要です
      </h1>
      <p style="font-size:14px;color:var(--text-secondary,#6b6a66);margin:0 0 32px;line-height:1.6;">
        このシステムを利用するには<br>Microsoft 365 アカウントでのログインが必要です。
      </p>
      <button onclick="document.getElementById('login-required-overlay').remove(); loginOneDrive();"
        style="padding:12px 32px;background:var(--accent,#2563eb);color:#fff;
          border:none;border-radius:8px;font-size:15px;font-weight:600;
          cursor:pointer;width:100%;">
        Microsoft 365 でログイン
      </button>
    </div>
  `;
  document.body.appendChild(overlay);
}

// ── アクセス拒否画面 ──
function showAccessDenied(email) {
  // ナビ・メインコンテンツを非表示にしてアクセス拒否画面を表示
  document.querySelector('nav')  && (document.querySelector('nav').style.display  = 'none');
  document.querySelector('main') && (document.querySelector('main').style.display = 'none');
  document.getElementById('app') && (document.getElementById('app').style.display = 'none');

  // 既存のオーバーレイがあれば削除
  const existing = document.getElementById('access-denied-overlay');
  if(existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'access-denied-overlay';
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'background:var(--bg-primary, #f5f5f3)',
    'display:flex', 'flex-direction:column', 'align-items:center',
    'justify-content:center', 'z-index:99999',
    'font-family:system-ui,sans-serif', 'text-align:center', 'padding:32px'
  ].join(';');
  overlay.innerHTML = `
    <div style="max-width:420px;">
      <div style="font-size:64px;margin-bottom:24px;">🔒</div>
      <h1 style="font-size:22px;font-weight:700;color:var(--text-primary,#1a1a1a);margin:0 0 12px;">
        アクセスが許可されていません
      </h1>
      <p style="font-size:14px;color:var(--text-secondary,#6b6a66);margin:0 0 8px;">
        ログインアカウント：
      </p>
      <p style="font-size:14px;font-weight:600;color:var(--accent,#2563eb);margin:0 0 24px;word-break:break-all;">
        ${email}
      </p>
      <p style="font-size:14px;color:var(--text-secondary,#6b6a66);margin:0 0 32px;line-height:1.6;">
        このアカウントはシステムに登録されていません。<br>
        管理者（atakahashi@4din.com）に連絡してアカウントの登録を依頼してください。
      </p>
      <button onclick="logoutOneDrive().then(()=>location.reload())"
        style="padding:10px 28px;background:var(--accent,#2563eb);color:#fff;
          border:none;border-radius:8px;font-size:14px;font-weight:600;
          cursor:pointer;">
        別のアカウントでログイン
      </button>
    </div>
  `;
  document.body.appendChild(overlay);
}

function initUserSession() {
  // M365ログイン済みの場合はメールアドレスで自動選択
  if(_currentAccount && _currentAccount.username) {
    const email = _currentAccount.username.toLowerCase();
    const found = (db.users||[]).find(u =>
      u.active !== false && u.email && u.email.toLowerCase() === email
    );
    if(found) {
      currentUser = found;
      _storage.setItem(USER_SESSION_KEY, JSON.stringify(found));
      updateUserUI();
      viewScope = (found.role === 'マネージャー' || found.role === '管理者') ? 'all' : 'own';
      updateScopeBtn();
      toast(`👤 ${found.name} としてログインしました`, 'success');
      return;
    }
    // メール未登録 → アクセス不可画面を表示
    showAccessDenied(email);
    return;
  }
  // M365未ログインの場合は保存済みセッションを使用
  const saved = _storage.getItem(USER_SESSION_KEY);
  if(saved) {
    try {
      const u = JSON.parse(saved);
      const found = (db.users||[]).find(x => x.id === u.id);
      if(found) {
        currentUser = found;
        updateUserUI();
        viewScope = (found.role === 'マネージャー' || found.role === '管理者') ? 'all' : 'own';
        updateScopeBtn();
        return;
      }
    } catch(e) {}
  }
  // 未選択ならセレクターを開く
  openUserSelector();
}

// ─ ユーザーセレクターを開く
function openUserSelector() {
  const overlay = document.getElementById('user-selector-overlay');
  const list    = document.getElementById('user-selector-list');
  if(!overlay || !list) return;

  const users = (db.users||[]).filter(u => u.active !== false);
  list.innerHTML = users.map(u => {
    const initials = u.name ? u.name.slice(0,1) : '?';
    const isSelected = currentUser?.id === u.id;
    return `<div class="user-list-item ${isSelected?'selected':''}"
      onclick="selectUser('${u.id}')" id="user-item-${u.id}">
      <div class="user-avatar">${initials}</div>
      <div>
        <div class="user-info-name">${u.name}</div>
        <div class="user-info-role">${u.role} ／ ${u.dept}</div>
      </div>
      ${isSelected ? '<span style="margin-left:auto;color:var(--accent);">✓</span>' : ''}
    </div>`;
  }).join('');

  overlay.classList.add('open');
}

// ─ ユーザーを仮選択
function selectUser(userId) {
  document.querySelectorAll('.user-list-item').forEach(el => el.classList.remove('selected'));
  const item = document.getElementById('user-item-' + userId);
  if(item) {
    item.classList.add('selected');
    // チェックマーク追加
    document.querySelectorAll('.user-list-item span[style*="accent"]').forEach(s=>s.remove());
    item.insertAdjacentHTML('beforeend', '<span style="margin-left:auto;color:var(--accent);">✓</span>');
  }
  // 一時選択
  currentUser = (db.users||[]).find(u => u.id === userId) || null;
}

// ─ 選択確定
function confirmUserSelect() {
  if(!currentUser) { toast('ユーザーを選択してください', 'error'); return; }
  _storage.setItem(USER_SESSION_KEY, JSON.stringify(currentUser));
  document.getElementById('user-selector-overlay').classList.remove('open');
  updateUserUI();
  // ロール判定
  viewScope = (currentUser.role === 'マネージャー' || currentUser.role === '管理者') ? 'all' : 'own';
  updateScopeBtn();
  refreshAllViews();
  toast(`${currentUser.name} としてログインしました`, 'success');
}

// ─ 表示スコープ切り替え
function toggleViewScope() {
  viewScope = viewScope === 'own' ? 'all' : 'own';
  updateScopeBtn();
  // 現在のページを再描画（案件ページ以外でも renderOpportunities を含む全ビューを更新）
  renderOpportunities();
  refreshAllViews();
}

function updateScopeBtn() {
  const btn = document.getElementById('view-scope-btn');
  if(!btn) return;
  if(viewScope === 'own') {
    btn.textContent = '自分の案件';
    btn.className = 'view-scope-btn own';
  } else {
    btn.textContent = '全件表示';
    btn.className = 'view-scope-btn all';
  }
}

// ─ トップバーのユーザー表示更新
function updateUserUI() {
  const avatarEl  = document.getElementById('current-user-avatar');
  const nameEl    = document.getElementById('current-user-name');
  const sidebarEl = document.getElementById('sidebar-user-name');
  if(!currentUser) return;
  if(avatarEl)  avatarEl.textContent  = currentUser.name ? currentUser.name.slice(0,1) : '?';
  if(nameEl)    nameEl.textContent    = currentUser.name || '未選択';
  if(sidebarEl) sidebarEl.textContent = currentUser.name || '未選択';
  // 月次確定ボタン・バックアップタブ: 管理者ロール または 管理部のみ表示
  const canAdmin = currentUser.role === '管理者' || currentUser.dept === '管理部';
  const lockBtn = document.getElementById('btn-monthly-lock');
  if(lockBtn) lockBtn.style.display = canAdmin ? '' : 'none';
  const backupTab = document.getElementById('tab-master-backup');
  if(backupTab) {
    backupTab.style.display = canAdmin ? '' : 'none';
    // バックアップタブが表示中なのに権限なし → 別タブへ切り替え
    if(!canAdmin && backupTab.classList.contains('active')) {
      const firstTab = document.querySelector('#page-master .tab:not(#tab-master-backup)');
      if(firstTab) firstTab.click();
    }
  }
  // キャッシュフロー予測: 経理・管理部 / 管理者 / 管理部所属のみ表示
  const canCashflow = currentUser.role === '管理者' || currentUser.role === '経理・管理部' || currentUser.dept === '管理部';
  const cfNav = document.querySelector('.nav-item[data-page="cashflow"]');
  if(cfNav) cfNav.style.display = canCashflow ? '' : 'none';
  // キャッシュフロー表示中なのに権限なし → ダッシュボードへ遷移
  if(!canCashflow) {
    const activePage = document.querySelector('.page.active');
    if(activePage && activePage.id === 'page-cashflow') navigate('dashboard');
  }
}

// ─ 全画面を現在ユーザー・スコープで再描画
function refreshAllViews() {
  const page = document.querySelector('.page.active')?.id?.replace('page-','');
  if(page === 'dashboard')          renderDashboard();
  else if(page === 'opportunities') renderOpportunities();
  else if(page === 'monthly')       renderMonthly();
  else if(page === 'payment')       renderPayment();
  else if(page === 'cashflow')      renderCashflow();
  else if(page === 'reports')       renderReports();
  else if(page === 'alerts')        renderAlerts();
  else                              renderDashboard();
}

// ─ スコープフィルター: opportunity に適用するか判定
function matchesScope(opp) {
  if(viewScope === 'all' || !currentUser) return true;
  const cn = currentUser.name;
  const oo = opp.owner || '';
  // 完全一致、または姓のみ一致（フルネーム移行期の互換）
  return oo === cn || oo === cn.charAt(0) || cn.startsWith(oo) || oo.startsWith(cn);
}


window.addEventListener('beforeunload', () => {
  // ページ離脱時に自動バックアップ
  try { createAutoBackup(false); } catch(e) {}
});

window.addEventListener('DOMContentLoaded', async () => {
  await window._appReady;
  // Startup: verify all modals exist
  ['modal-activity','modal-task'].forEach(id => {
    if(!document.getElementById(id))
      console.error('STARTUP: missing element id=' + id);
    else
      console.log('STARTUP: found ' + id);
  });
  initDashMonthSel();
  initReportMonthSel();
  // initUserSession はOneDrive読込後に自動実行
  initOneDriveSync();
  // 月次管理: 基準月ピッカーをcurrentMonthで初期化
  // 担当者フィルターの初期化
  buildOwnerList();
  autoGenerateAlerts();
  renderDashboard();
  updateAlertBadge();
  // グローバル検索窓: 初期ページ（ダッシュボード）では検索対象なし → 非表示
  const _gbar = document.getElementById('global-search-bar');
  if(_gbar) _gbar.style.display = 'none';

});

// ============================================================
// 活動記録・タスク管理
// ============================================================
function openActivityModal(oppId) {
  document.getElementById('f-act-id').value = '';
  document.getElementById('f-act-date').value = new Date().toISOString().slice(0,16);
  document.getElementById('f-act-type').value = '商談';
  document.getElementById('f-act-opp').value = '';
  document.getElementById('f-act-opp-id').value = oppId || '';
  document.getElementById('f-act-content').value = '';
  document.getElementById('f-act-next').value = '';
  // 担当者セレクト
  const ownerSel = document.getElementById('f-act-owner');
  if(ownerSel) {
    ownerSel.innerHTML = db.users.filter(u=>u.active)
      .map(u=>'<option value="'+u.name+'"'+(u.name===(currentUser?.name)?'selected':'')+'>'+u.name+'</option>').join('');
  }
  openModal('activity');
}

function saveActivity() {
  if(!validateRequiredFields([
    { id: 'f-act-date',    label: '日時' },
    { id: 'f-act-content', label: '内容' },
  ])) return;
  const id      = document.getElementById('f-act-id').value || uid('ACT');
  const date    = document.getElementById('f-act-date').value;
  const type    = document.getElementById('f-act-type').value;
  const oppId   = document.getElementById('f-act-opp-id').value;
  const owner   = document.getElementById('f-act-owner').value;
  const next    = document.getElementById('f-act-next').value.trim();
  const entry   = { id, date, type, oppId, owner, content, next, createdAt: new Date().toISOString() };
  if(!Array.isArray(db.activities)) db.activities = [];
  const idx = db.activities.findIndex(a => a.id === id);
  if(idx >= 0) db.activities[idx] = entry; else db.activities.push(entry);
  save();
  closeModal('activity');
  toast('活動記録を保存しました', 'success');
}

function openTaskModal(oppId) {
  document.getElementById('f-task-id').value = '';
  document.getElementById('f-task-title').value = '';
  document.getElementById('f-task-due').value = '';
  document.getElementById('f-task-priority').value = 'normal';
  document.getElementById('f-task-opp-id').value = oppId || '';
  document.getElementById('f-task-memo').value = '';
  // 担当者セレクト
  const ownerSel = document.getElementById('f-task-owner');
  if(ownerSel) {
    ownerSel.innerHTML = db.users.filter(u=>u.active)
      .map(u=>'<option value="'+u.name+'"'+(u.name===(currentUser?.name)?'selected':'')+'>'+u.name+'</option>').join('');
  }
  openModal('task');
}

function saveTask() {
  if(!validateRequiredFields([
    { id: 'f-task-title', label: 'タスク内容' },
    { id: 'f-task-due',   label: '期限' },
  ])) return;
  const id       = document.getElementById('f-task-id').value || uid('TASK');
  const due      = document.getElementById('f-task-due').value;
  const priority = document.getElementById('f-task-priority').value;
  const oppId    = document.getElementById('f-task-opp-id').value;
  const owner    = document.getElementById('f-task-owner').value;
  const memo     = document.getElementById('f-task-memo').value.trim();
  const entry    = { id, title, due, priority, oppId, owner, memo, done: false, createdAt: new Date().toISOString() };
  if(!Array.isArray(db.tasks)) db.tasks = [];
  const idx = db.tasks.findIndex(t => t.id === id);
  if(idx >= 0) db.tasks[idx] = entry; else db.tasks.push(entry);
  save();
  closeModal('task');
  toast('タスクを保存しました', 'success');
}


