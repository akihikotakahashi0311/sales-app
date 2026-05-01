const MAX_AUTO_BACKUPS = 5;
// BUG-16関連: 自動バックアップのlocalStorageキー（未定義により "undefined" キーになる不具合の修正）
const BACKUP_KEY = 'sales_auto_backups';
let _importData = null;

// ============================================================
// 権限判定（Critical-1〜5対策の一部）
// ============================================================
// ロール定義の不整合を解消し、判定を1箇所に集約。
// UIのselect要素に存在する選択肢:
//   営業担当者 / マネージャー / 経理・管理部 / 経営層 / システム管理者
// 加えて初期データで定義された "管理者" も互換性のためサポート。
// ============================================================

// 管理者権限（マスタ管理 / 月次確定 / バックアップ / セキュリティ / ユーザー削除）
function isAdminUser(user) {
  user = user || (typeof currentUser !== 'undefined' ? currentUser : null);
  if(!user) return false;
  return user.role === '管理者'
      || user.role === 'システム管理者'
      || user.dept === '管理部';
}

// マネージャー権限（チームスコープでの閲覧編集）
function isManagerUser(user) {
  user = user || (typeof currentUser !== 'undefined' ? currentUser : null);
  if(!user) return false;
  return user.role === 'マネージャー' || isAdminUser(user);
}

// 経理権限（キャッシュフロー予測・会計データ閲覧）
function isFinanceUser(user) {
  user = user || (typeof currentUser !== 'undefined' ? currentUser : null);
  if(!user) return false;
  return user.role === '経理・管理部'
      || user.role === '経営層'
      || isAdminUser(user);
}

// マスタ画面アクセス権限
// 顧客マスタ・フェーズ設定: マネージャー以上が閲覧可能
// それ以外（ユーザー/組織/バックアップ/セキュリティ）: 管理者のみ
function canAccessMaster(user) {
  return isManagerUser(user) || isFinanceUser(user);
}

// マスタの個別操作権限
function canEditUsers(user)    { return isAdminUser(user); }
function canEditOrgs(user)     { return isAdminUser(user); }
function canEditCustomers(user){ return isManagerUser(user); }
function canManageBackup(user) { return isAdminUser(user); }

// 権限がない場合の標準ガード（呼び出し側で使う）
function requireAdmin(action = 'この操作') {
  if(!isAdminUser()) {
    if(typeof toast === 'function') {
      toast(`${action}は管理者のみ実行できます`, 'error');
    }
    return false;
  }
  return true;
}
function requireManager(action = 'この操作') {
  if(!isManagerUser()) {
    if(typeof toast === 'function') {
      toast(`${action}はマネージャー以上のみ実行できます`, 'error');
    }
    return false;
  }
  return true;
}

// ─ エクスポート
function exportBackup(mode) {
  if(!requireAdmin('バックアップのエクスポート')) return;
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
  if(!requireAdmin('バックアップのインポート')) return;
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

      // BUG-8対策: 各項目にユーザー入力(data.mode等)が混じる可能性があるためエスケープ
      document.getElementById('backup-import-info').innerHTML =
        info.map(t => `<div style="margin-bottom:4px;">• ${_h(t)}</div>`).join('');
      document.getElementById('backup-import-preview').style.display = '';
    } catch(err) {
      toast('JSONファイルの解析に失敗しました: ' + err.message, 'error');
      _importData = null;
    }
  };
  reader.readAsText(file);
}

// ─ インポート確定
// BUG-17対策: 復元時のスキーマ検証 & 権限昇格防止
//   1. 現在のログインユーザーが管理者(isAdminUser)でなければ復元自体を拒否
//   2. import元 db.users / db.orgs / db.lockedMonths は通常の復元では上書きせず、
//      管理者が明示的にチェックを入れた場合のみ上書き（UI追加までは保守的にスキップ）
//   3. インポートデータのスキーマ妥当性を検証（配列・オブジェクト・必須フィールド）
//   4. 上書き前に現状を自動バックアップ（既存挙動維持）

// インポートデータのスキーマ検証（不正なら配列/エラーメッセージを返す）
function _validateImportSchema(data) {
  const errors = [];
  if(!data || typeof data !== 'object') {
    errors.push('JSONルートがオブジェクトではありません');
    return errors;
  }
  // 配列必須フィールド
  const arrayKeys = ['opportunities','customers','users','orgs','alerts','leads','lockedMonths','pdfDeletionQueue'];
  arrayKeys.forEach(k => {
    if(k in data && !Array.isArray(data[k])) {
      errors.push(`${k} は配列である必要があります`);
    }
  });
  // オブジェクト必須フィールド
  const objKeys = ['monthly','pdfFiles','pdfRefs','settings','monthlySummary'];
  objKeys.forEach(k => {
    if(k in data && (typeof data[k] !== 'object' || Array.isArray(data[k]))) {
      errors.push(`${k} はオブジェクトである必要があります`);
    }
  });
  // ユーザー要素の最低限の妥当性
  if(Array.isArray(data.users)) {
    data.users.forEach((u, i) => {
      if(!u || typeof u !== 'object') {
        errors.push(`users[${i}] が不正な形式です`);
        return;
      }
      // role が想定外の値ならエラー
      const ALLOWED_ROLES = ['営業担当者','マネージャー','経理・管理部','経営層','システム管理者','管理者'];
      if(u.role && !ALLOWED_ROLES.includes(u.role)) {
        errors.push(`users[${i}].role が不正な値です: ${u.role}`);
      }
    });
  }
  return errors;
}

function confirmImport() {
  if(!_importData) return;

  // BUG-17: 権限チェック - 管理者のみ復元を許可
  // (バックアップから誰でもユーザーマスタを上書きできると権限昇格が成立するため)
  if(typeof isAdminUser === 'function' && !isAdminUser()) {
    toast('⚠️ バックアップ復元は管理者権限が必要です', 'error');
    return;
  }

  // BUG-17: スキーマ検証
  const schemaErrors = _validateImportSchema(_importData);
  if(schemaErrors.length > 0) {
    console.warn('[Import] スキーマ検証エラー:', schemaErrors);
    toast('⚠️ インポートデータが不正です: ' + schemaErrors[0], 'error');
    return;
  }

  if(!confirm('現在のデータをインポートデータで上書きします。よろしいですか？')) return;

  // 現在のデータを自動バックアップに保存してから上書き
  createAutoBackup(false);

  const mode = _importData.mode || 'full';
  if(mode === 'opportunities') {
    // BUG-18対策: 部分復元時の孤児データ削除
    //   案件のみ復元すると、復元後に存在しない案件IDの月次データ・アラート・PDFが残り、
    //   UIで「存在しない案件の月次データ」として表示される問題がある。
    //   復元前に「現在の案件」のうち復元データに含まれないものを月次/アラート/PDFから削除する。
    if(_importData.opportunities) {
      const newIds = new Set(_importData.opportunities.map(o => o.id));
      const orphanIds = (db.opportunities || []).filter(o => !newIds.has(o.id)).map(o => o.id);
      if(orphanIds.length > 0) {
        console.info(`[Import] 孤児データを削除: ${orphanIds.length}件の旧案件IDを月次/アラート/PDFからクリーンアップ`);
        orphanIds.forEach(id => {
          // 月次データから削除
          Object.keys(db.monthly || {}).forEach(ym => {
            if(db.monthly[ym] && db.monthly[ym][id]) delete db.monthly[ym][id];
          });
          // アラートから削除
          if(Array.isArray(db.alerts)) {
            db.alerts = db.alerts.filter(a => a.oppId !== id);
          }
          // PDFファイル参照を削除（型は事前にPDF_TYPESがあれば使用、なければ全キー走査）
          if(db.pdfFiles) {
            Object.keys(db.pdfFiles).forEach(k => {
              if(k.startsWith(id + '_') || k.startsWith(id + ':')) delete db.pdfFiles[k];
            });
          }
          if(db.pdfRefs) {
            Object.keys(db.pdfRefs).forEach(k => {
              if(k.startsWith(id + '_') || k.startsWith(id + ':')) delete db.pdfRefs[k];
            });
          }
        });
      }
      db.opportunities = _importData.opportunities;
    }
    if(_importData.customers)     db.customers     = _importData.customers;
  } else if(mode === 'monthly') {
    if(_importData.monthly)        db.monthly        = _importData.monthly;
    if(_importData.monthlySummary) db.monthlySummary = _importData.monthlySummary;
  } else {
    // full: 全フィールドを上書き（storeKey等のメタデータは除く）
    // BUG-17: 権限管理に関わるフィールドはデフォルトで保護
    //   - users: ユーザー一覧（roleフィールドが含まれるため）
    //   - orgs: 組織マスタ（権限スコープに影響）
    //   現状のUIでは「ユーザーも復元する」チェックがないため、保守的にスキップする
    const skip = ['exportedAt', 'mode', 'storeKey'];
    const PROTECTED_KEYS = ['users','orgs'];
    const overwriteUsers = (typeof _importIncludeUsers !== 'undefined') ? !!_importIncludeUsers : false;
    Object.keys(_importData).forEach(k => {
      if(skip.includes(k)) return;
      if(PROTECTED_KEYS.includes(k) && !overwriteUsers) {
        console.info(`[Import] ${k} は保護されているためスキップ`);
        return;
      }
      db[k] = _importData[k];
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
// BUG-16: localStorage容量超過(QuotaExceededError)に対応
//   1. 通常保存 → 失敗時は古い世代を削減して再試行
//   2. それでもダメならPDFなど重いフィールドを除外して保存
//   3. 全て失敗したらユーザーに警告（無音failを防ぐ）
function createAutoBackup(showToast = true) {
  const now = new Date();
  const newEntry = {
    timestamp: now.toISOString(),
    label: now.toLocaleString('ja-JP'),
    data: JSON.parse(JSON.stringify(db)),
    size: JSON.stringify(db).length
  };
  let backups = JSON.parse(_storage.getItem(BACKUP_KEY) || '[]');
  backups.unshift(newEntry);
  // 最大5世代
  if(backups.length > MAX_AUTO_BACKUPS) backups.splice(MAX_AUTO_BACKUPS);

  // ステップ1: 通常保存
  if(_trySetBackups(backups)) {
    if(showToast) toast('バックアップを保存しました', 'success');
    renderBackupHistory();
    return true;
  }

  // ステップ2: 古い世代を1つずつ削減して再試行
  while(backups.length > 1) {
    backups.pop();
    if(_trySetBackups(backups)) {
      console.warn('[Backup] 容量制限により古い世代を削減して保存');
      if(showToast) toast('バックアップを保存しました（古い世代を整理）', 'success');
      renderBackupHistory();
      return true;
    }
  }

  // ステップ3: 最新分のみ + PDFを除外して再試行
  const slim = JSON.parse(JSON.stringify(newEntry));
  // 容量を圧迫しがちなフィールドを退避（pdfFiles=base64本体、pdfRefs=参照は軽いので残す）
  if(slim.data && slim.data.pdfFiles) slim.data.pdfFiles = {};
  slim.size = JSON.stringify(slim.data).length;
  if(_trySetBackups([slim])) {
    console.warn('[Backup] 容量制限によりPDF本体を除外して保存');
    if(showToast) toast('⚠️ 容量制限のためPDF本体を除外してバックアップしました', 'info');
    renderBackupHistory();
    return true;
  }

  // ステップ4: それでも失敗 → ユーザーに警告
  console.error('[Backup] localStorage容量超過によりバックアップ保存に失敗');
  toast('⚠️ ストレージ容量が不足し自動バックアップに失敗しました。手動でJSONエクスポートしてください', 'error');
  return false;
}

// localStorageへの安全な書き込み（QuotaExceededErrorをキャッチ）
function _trySetBackups(backups) {
  try {
    _storage.setItem(BACKUP_KEY, JSON.stringify(backups));
    return true;
  } catch(e) {
    // QuotaExceededError は環境により名前が異なる
    const isQuota = e && (
      e.name === 'QuotaExceededError' ||
      e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      e.code === 22 || e.code === 1014
    );
    if(!isQuota) {
      console.error('[Backup] 想定外のストレージエラー:', e);
    }
    return false;
  }
}

// ─ 自動バックアップから復元
// BUG-17対策: 管理者のみ復元可能、ユーザーマスタは保護
function restoreAutoBackup(index) {
  // 権限チェック
  if(typeof isAdminUser === 'function' && !isAdminUser()) {
    toast('⚠️ バックアップ復元は管理者権限が必要です', 'error');
    return;
  }
  const backups = JSON.parse(_storage.getItem(BACKUP_KEY) || '[]');
  const bk = backups[index];
  if(!bk) return;
  if(!confirm(`${bk.label} のバックアップに戻しますか？\n現在のデータは失われます。`)) return;

  // スキーマ検証
  const schemaErrors = _validateImportSchema(bk.data);
  if(schemaErrors.length > 0) {
    console.warn('[Restore] スキーマ検証エラー:', schemaErrors);
    toast('⚠️ バックアップデータが不正です: ' + schemaErrors[0], 'error');
    return;
  }

  const skip = ['exportedAt', 'mode', 'storeKey'];
  // 自動バックアップは「自分が作成したスナップショット」なのでusers/orgs上書きは許可するが、
  // それでも検証済みデータのみ反映
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
        <div style="font-size:13px;font-weight:500;">${_h(bk.label)}</div>
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
// デフォルトは全員「全件表示」。ユーザーが手動で「自分の案件」に切り替え可能。
let viewScope = 'all';

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
      // デフォルトは全員「全件表示」（ロールに関わらず）
      viewScope = 'all';
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
        // デフォルトは全員「全件表示」（ロールに関わらず）
        viewScope = 'all';
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
      onclick="selectUser('${_hj(u.id)}')" id="user-item-${_h(u.id)}">
      <div class="user-avatar">${_h(initials)}</div>
      <div>
        <div class="user-info-name">${_h(u.name)}</div>
        <div class="user-info-role">${_h(u.role)} ／ ${_h(u.dept)}</div>
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
  // デフォルトは全員「全件表示」（ロールに関わらず）
  viewScope = 'all';
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

  // 権限フラグの統一
  const _isAdmin     = isAdminUser();
  const _canMaster   = canAccessMaster();
  const _canCashflow = isFinanceUser();

  // 月次確定ボタン: 管理者のみ
  const lockBtn = document.getElementById('btn-monthly-lock');
  if(lockBtn) lockBtn.style.display = _isAdmin ? '' : 'none';

  // バックアップタブ: 管理者のみ
  const backupTab = document.getElementById('tab-master-backup');
  if(backupTab) {
    backupTab.style.display = _isAdmin ? '' : 'none';
    if(!_isAdmin && backupTab.classList.contains('active')) {
      const firstTab = document.querySelector('#page-master .tab:not(#tab-master-backup):not(#tab-master-security)');
      if(firstTab) firstTab.click();
    }
  }

  // セキュリティタブ: 管理者のみ
  const securityTab = document.getElementById('tab-master-security');
  if(securityTab) {
    securityTab.style.display = _isAdmin ? '' : 'none';
    if(!_isAdmin && securityTab.classList.contains('active')) {
      const firstTab = document.querySelector('#page-master .tab:not(#tab-master-backup):not(#tab-master-security)');
      if(firstTab) firstTab.click();
    }
  }

  // ★ Critical-3対策: マスタ画面ナビ自体を非表示（権限なしユーザーから）
  const masterNav = document.querySelector('.nav-item[data-page="master"]');
  if(masterNav) {
    masterNav.style.display = _canMaster ? '' : 'none';
    // 表示中のページがマスタなのに権限喪失した場合 → ダッシュボードへ
    if(!_canMaster) {
      const activePage = document.querySelector('.page.active');
      if(activePage && activePage.id === 'page-master') navigate('dashboard');
    }
  }

  // ユーザー/組織管理タブ: 管理者のみ（顧客・フェーズはマネージャー以上）
  const usersTab = document.querySelector('#page-master [onclick*="master-users"]');
  const orgsTab  = document.querySelector('#page-master [onclick*="master-org"]');
  if(usersTab) usersTab.style.display = _isAdmin ? '' : 'none';
  if(orgsTab)  orgsTab.style.display  = _isAdmin ? '' : 'none';
  // 表示中タブが管理者専用 + 非管理者 → 顧客マスタへ切替
  if(!_isAdmin) {
    ['users', 'org'].forEach(suffix => {
      const sec = document.getElementById('master-' + suffix);
      if(sec && sec.style.display !== 'none') {
        const custTab = document.querySelector('#page-master [onclick*="master-customers"]');
        if(custTab) custTab.click();
      }
    });
  }

  // キャッシュフロー予測: 経理権限以上のみ
  const cfNav = document.querySelector('.nav-item[data-page="cashflow"]');
  if(cfNav) cfNav.style.display = _canCashflow ? '' : 'none';
  if(!_canCashflow) {
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
      .map(u=>'<option value="'+_ha(u.name)+'"'+(u.name===(currentUser?.name)?'selected':'')+'>'+_h(u.name)+'</option>').join('');
  }
  openModal('activity');
}

function saveActivity() {
  const content = document.getElementById('f-act-content').value.trim();
  if(!content) { toast('内容を入力してください', 'error'); return; }
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
      .map(u=>'<option value="'+_ha(u.name)+'"'+(u.name===(currentUser?.name)?'selected':'')+'>'+_h(u.name)+'</option>').join('');
  }
  openModal('task');
}

function saveTask() {
  const title = document.getElementById('f-task-title').value.trim();
  if(!title) { toast('タイトルを入力してください', 'error'); return; }
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


