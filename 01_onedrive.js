
// ============================================================
// localStorage shim（file:// プロトコル対応）
// ============================================================
const _storage = (() => {
  const mem = {};
  try {
    localStorage.setItem('__test__', '1');
    localStorage.removeItem('__test__');
    return localStorage;
  } catch(e) {
    console.warn('localStorage unavailable, using in-memory storage');
    return {
      getItem:    k => mem[k] ?? null,
      setItem:    (k, v) => { mem[k] = String(v); },
      removeItem: k => { delete mem[k]; },
      clear:      () => { Object.keys(mem).forEach(k => delete mem[k]); },
    };
  }
})();

// ============================================================
// OneDrive 連携（Microsoft Graph API + MSAL）
// ============================================================
// ★ 設定: Azure ADアプリ登録で取得した値を設定してください
// ★ Azure ADアプリ登録で取得した値を設定してください
const MSAL_CONFIG = {
  clientId: 'c98afa31-285b-4f61-a5b5-da96776e8b77',
  tenantId: 'b433f565-3dce-40a8-a0ac-713d8a2fd456',
  redirectUri: window.location.origin + window.location.pathname,
};

const ONEDRIVE_SHARED_URL = '';
const ONEDRIVE_OWNER_UPN = 'atakahashi@4din.com';
// ログインユーザーがOneDriveオーナーかどうか判定
function _isOdOwner() {
  if(!_currentAccount || !ONEDRIVE_OWNER_UPN) return true; // 未ログイン時は制限しない
  const loginEmail = (_currentAccount.username || _currentAccount.email || '').toLowerCase();
  return loginEmail === ONEDRIVE_OWNER_UPN.toLowerCase();
}
const ONEDRIVE_FILE_PATH = '営業管理/sales_data.json';

// 実際に使用するGraph APIエンドポイント（方式Bがデフォルト）
function getGraphEndpoint() {
  // SharePointチームサイト（cctjapancojp / 4DINALL / 共有資料）
  const SHAREPOINT_DRIVE_ID = 'b!Yf0QIkoJpEe7mHomV2mvmlIARdLARQxGipXNt59TpYUH60DFtQoVSaNFze9_h2n7';
  return `https://graph.microsoft.com/v1.0/drives/${SHAREPOINT_DRIVE_ID}/root:/sales_data.json:`;
}

let _msalApp = null;
let _graphToken = null;
let _odSyncEnabled = false;
let _currentAccount = null;

// MSAL初期化
async function initMsal() {
  // MSALのロードを最大3秒待つ
  if(typeof msal === 'undefined') {
    await new Promise(resolve => {
      let tries = 0;
      const check = setInterval(() => {
        tries++;
        if(typeof msal !== 'undefined') { clearInterval(check); resolve(); }
        if(tries > 30) { clearInterval(check); resolve(); }
      }, 100);
    });
  }
  if(typeof msal === 'undefined') {
    console.warn('[OneDrive] MSAL not loaded - file://プロトコルではOneDrive同期は利用できません');
    console.warn('[OneDrive] SharePointまたはhttps://からアクセスしてください');
    return false;
  }
  if(MSAL_CONFIG.clientId === 'YOUR_CLIENT_ID') {
    console.info('[OneDrive] ClientID未設定 - OneDrive同期は無効');
    // 設定ガイドを表示
    showOneDriveSetupGuide();
    return false;
  }
  try {
    _msalApp = new msal.PublicClientApplication({
      auth: {
        clientId: MSAL_CONFIG.clientId,
        authority: `https://login.microsoftonline.com/${MSAL_CONFIG.tenantId}`,
        redirectUri: MSAL_CONFIG.redirectUri || window.location.origin + window.location.pathname,
        navigateToLoginRequestUrl: false,
      },
      cache: { cacheLocation: 'localStorage', storeAuthStateInCookie: false },
    });
    await _msalApp.initialize();
    // リダイレクト結果を処理
    const result = await _msalApp.handleRedirectPromise();
    if(result) _currentAccount = result.account;
    return true;
  } catch(e) {
    console.warn('[OneDrive] MSAL初期化エラー:', e.message);
    return false;
  }
}

// M365ログイン
async function loginOneDrive() {
  // file:// プロトコルでは動作しない
  if(window.location.protocol === 'file:') {
    if(confirm('OneDrive連携はfile://プロトコルでは動作しません。\n\nSharePointにアップロードしたファイルをTeamsまたはhttps://から開いてください。\n\nこのままローカルで使用しますか？')) {
      toast('ローカルモードで動作中（データはこのブラウザにのみ保存）', 'success');
    }
    return false;
  }
  if(!_msalApp) {
    // initMsal が未完了の場合は再試行
    toast('OneDrive接続を初期化中...', 'success');
    const ok = await initMsal();
    if(!ok || !_msalApp) {
      toast('OneDrive連携の初期化に失敗しました。ページを再読み込みしてください。', 'error');
      console.error('[OneDrive] _msalApp still null after initMsal()');
      console.error('[OneDrive] msal loaded:', typeof msal !== "undefined");
      console.error('[OneDrive] clientId:', MSAL_CONFIG.clientId);
      return false;
    }
  }
  try {
    const result = await _msalApp.loginPopup({
      scopes: ['Files.ReadWrite.All', 'Sites.ReadWrite.All', 'User.Read'],
      prompt: 'select_account',
    });
    _currentAccount = result.account;
    _graphToken = await _getGraphToken();
    _odSyncEnabled = true;
    updateOneDriveUI();
    toast(`✅ ${_currentAccount.name} でOneDriveに接続しました`, 'success');
    // 最新データをOneDriveから読み込む
    await loadFromOneDrive();
    return true;
  } catch(e) {
    console.warn('[OneDrive] ログインエラー:', e.message);
    toast('OneDriveへのログインに失敗しました', 'error');
    return false;
  }
}

// ログアウト
async function logoutOneDrive() {
  if(!_msalApp || !_currentAccount) return;
  await _msalApp.logoutPopup({ account: _currentAccount });
  _currentAccount = null;
  _graphToken = null;
  _odSyncEnabled = false;
  updateOneDriveUI();
  toast('OneDriveから切断しました', 'success');
}

// Graph APIトークン取得
async function _getGraphToken() {
  if(!_msalApp || !_currentAccount) return null;
  try {
    const result = await _msalApp.acquireTokenSilent({
      scopes: ['Files.ReadWrite.All', 'Sites.ReadWrite.All', 'User.Read'],
      account: _currentAccount,
    });
    return result.accessToken;
  } catch(e) {
    // サイレント失敗時はポップアップで再取得
    const result = await _msalApp.acquireTokenPopup({
      scopes: ['Files.ReadWrite.All', 'Sites.ReadWrite.All', 'User.Read'],
    });
    return result.accessToken;
  }
}

// OneDriveからデータを読み込む
async function loadFromOneDrive() {
  if(!_odSyncEnabled) return false;
  try {
    _graphToken = await _getGraphToken();
    const res = await fetch(
      `${getGraphEndpoint()}/content`,
      { headers: { Authorization: `Bearer ${_graphToken}` } }
    );
    if(res.status === 404) {
      // OneDrive上にファイルがない → 初回：現在のdbをアップロード
      toast('OneDrive上にデータがありません。初期データをアップロードします...', 'success');
      await saveToOneDrive();
      return true;
    }
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const remoteDb = await res.json();
    // 常にOneDriveのデータを正として読み込む
    db = remoteDb;
    delete db._savedAt;
    if(!db.pdfFiles) db.pdfFiles = {};
    // 先にユーザーを確定させてから描画（描画がcurrentUserを参照するため）
    initUserSession();
    // 現在表示中のページを再描画（全ページ共通）
    refreshCurrentPage();
    // ユーザー選択の表示/非表示を更新
    _updateUserSelectorVisibility();
    toast('✅ OneDriveからデータを読み込みました', 'success');
    return true;
  } catch(e) {
    console.error('[OneDrive] 読み込みエラー:', e.message, e);
    if(e.message && e.message.includes('403')) {
      toast('⚠️ OneDriveへのアクセス権限がありません。管理者に問い合わせてください。', 'error');
    } else if(e.message && e.message.includes('401')) {
      toast('⚠️ 認証エラー。再度ログインしてください。', 'error');
    } else {
      toast('⚠️ OneDriveからの読み込みに失敗: ' + e.message, 'error');
    }
    return false;
  }
}

// OneDriveにデータを保存
async function saveToOneDrive() {
  if(!_odSyncEnabled) return false;
  try {
    _graphToken = await _getGraphToken();
    const now = new Date().toISOString();
    const payload = JSON.stringify({ ...db, _savedAt: now });
    const res = await fetch(
      `${getGraphEndpoint()}/content`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${_graphToken}`,
          'Content-Type': 'application/json',
        },
        body: payload,
      }
    );
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    _storage.setItem('sales_last_save', now);
    return true;
  } catch(e) {
    console.warn('[OneDrive] 保存エラー:', e.message);
    toast('⚠️ OneDrive保存に失敗しました（ローカルには保存済み）', 'error');
    return false;
  }
}

// M365ログインユーザーが管理者かどうかを判定してユーザー選択バッジを制御
function _updateUserSelectorVisibility() {
  const badge = document.getElementById('current-user-badge') || document.querySelector('.current-user-badge');
  if(!badge) return;

  // 未ログイン時は非表示
  if(!_odSyncEnabled || !_currentAccount) {
    badge.style.display = 'none';
    return;
  }

  // ログイン中のM365メールアドレスを取得
  const loginEmail = (_currentAccount.username || _currentAccount.email || '').toLowerCase();

  // dbのユーザーマスタから管理者ロールを持つユーザーを検索
  const users = (db && db.users) ? db.users : [];
  const matchedUser = users.find(u =>
    u.email && u.email.toLowerCase() === loginEmail
  );

  const isAdmin = matchedUser && (
    matchedUser.role === '管理者' ||
    matchedUser.role === 'システム管理者' ||
    matchedUser.role === 'マネージャー'
  );

  // バッジは常に表示（ユーザー名を見せる）
  badge.style.display = '';

  if(isAdmin) {
    // 管理者: クリックでユーザー切り替え可能
    badge.style.cursor = 'pointer';
    badge.style.opacity = '1';
    badge.onclick = openUserSelector;
    // 矢印アイコンを表示
    const arrow = badge.querySelector('svg');
    if(arrow) arrow.style.display = '';
  } else {
    // 非管理者: クリック不可、切り替え禁止
    badge.style.cursor = 'default';
    badge.style.opacity = '0.8';
    badge.onclick = null;
    // 矢印アイコンを非表示
    const arrow = badge.querySelector('svg');
    if(arrow) arrow.style.display = 'none';
  }
}

// OneDriveUIの状態更新
function updateOneDriveUI() {
  const btn  = document.getElementById('btn-onedrive');
  const badge = document.getElementById('onedrive-badge');
  if(!btn) return;
  if(window.location.protocol === 'file:') {
    btn.textContent = '⚠️ ローカル';
    btn.title = 'file://プロトコルではOneDrive同期不可。SharePointから開いてください。';
    btn.style.background = 'var(--amber, #f59e0b)';
    btn.style.color = '#fff';
    if(badge) badge.textContent = 'ローカルのみ';
    return;
  }
  if(_odSyncEnabled && _currentAccount) {
    btn.textContent = '☁️ 同期中';
    btn.className = 'btn btn-sm btn-onedrive connected';
    if(badge) badge.textContent = _currentAccount.name;
    // M365ログインユーザーが管理者かどうかを確認してユーザー選択を制御
    _updateUserSelectorVisibility();
  } else {
    btn.textContent = '☁️ OneDrive接続';
    btn.className = 'btn btn-sm btn-onedrive';
    if(badge) badge.textContent = '';
    // 未ログイン時はユーザー選択を非表示
    _updateUserSelectorVisibility();
  }
}

// OneDrive設定ガイドをトースト表示
function showOneDriveSetupGuide() {
  const guide = `
<div style="position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;" id="od-setup-overlay">
  <div style="background:var(--bg-primary);border-radius:12px;padding:24px;max-width:520px;width:90%;max-height:80vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
    <h3 style="margin:0 0 12px;color:var(--accent);">☁️ OneDrive連携の設定</h3>
    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">
      Teamsアプリとして使用するには、Azure ADへのアプリ登録が必要です。
    </p>
    <div style="background:var(--bg-secondary);border-radius:8px;padding:12px;font-size:12px;line-height:1.8;">
      <strong>1. Azureポータルでアプリを登録</strong><br>
      portal.azure.com → アプリの登録 → 新規登録<br>
      名前: 営業管理アプリ<br><br>
      <strong>2. APIのアクセス許可を追加</strong><br>
      Files.ReadWrite.All / Sites.ReadWrite.All / User.Read<br><br>
      <strong>3. index.html の設定値を更新</strong><br>
      clientId: （アプリID）<br>
      tenantId: （テナントID）<br>
      ONEDRIVE_OWNER_UPN: nootake@4din.com<br><br>
      <strong>4. 管理者のOneDriveに「営業管理」フォルダを作成</strong><br>
      sales_data.json が自動作成されます
    </div>
    <div style="margin-top:16px;text-align:right;">
      <button class="btn btn-primary" onclick="document.getElementById('od-setup-overlay').remove()">閉じる</button>
    </div>
  </div>
</div>`;
  document.body.insertAdjacentHTML('beforeend', guide);
}

// 起動時にMSAL初期化 + 既存アカウント確認
async function initOneDriveSync() {
  const ok = await initMsal();
  if(!ok) {
    // MSAL未初期化（file://等）の場合は警告表示のみ
    updateOneDriveUI();
    return;
  }
  // 既存のログイン状態を確認
  const accounts = _msalApp.getAllAccounts();
  if(accounts.length > 0) {
    _currentAccount = accounts[0];
    try {
      _graphToken = await _getGraphToken();
      _odSyncEnabled = true;
      updateOneDriveUI();
      // 起動時に必ずOneDriveからデータを読み込む
      await loadFromOneDrive();
    } catch(e) {
      console.warn('[OneDrive] 自動再接続失敗:', e.message);
      toast('⚠️ OneDriveへの自動接続に失敗しました。再度ログインしてください。', 'error');
      updateOneDriveUI();
    }
  } else {
    // 未ログイン：ログインを強制（ポップアップ）
    updateOneDriveUI();
    showLoginRequired();
    try {
      await loginOneDrive();
    } catch(e) {
      // ログインキャンセル時もログイン必須画面を維持
      showLoginRequired();
    }
  }
}
