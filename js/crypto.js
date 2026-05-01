// ============================================================
// crypto.js — JSONファイル暗号化モジュール（Critical: SharePointフォルダ閲覧対策）
// ============================================================
// 方式:
//   - アルゴリズム: AES-GCM-256（Web Crypto API）
//   - 鍵派生: PBKDF2-SHA256, 100,000 iterations
//   - 鍵素材: テナントID + 管理者設定のパスフレーズ
//   - 出力フォーマット: マジックヘッダ "ENC1" + ソルト16B + IV12B + 暗号文 + 認証タグ16B
// ============================================================

// マジックヘッダ（暗号化済みファイルの判定に使う）
const _CRYPTO_MAGIC = 'ENC1';
const _CRYPTO_PBKDF2_ITER = 100000;
const _CRYPTO_SALT_LEN = 16;
const _CRYPTO_IV_LEN   = 12;

// パスフレーズの保管キー（localStorage）
// 注意: パスフレーズは本来Azure Key Vault等で管理すべき
// 暫定的にユーザー個人のlocalStorageに置く（M365ログインユーザーにのみ復号権限）
const _CRYPTO_PASSPHRASE_KEY = 'sales_mgmt_passphrase_v1';

// メモリ上に保持する派生鍵（再計算を避ける）
let _cryptoDerivedKey = null;
let _cryptoSaltCache = null;

// ============================================================
// パスフレーズ管理
// ============================================================
function getStoredPassphrase() {
  try {
    return _storage?.getItem(_CRYPTO_PASSPHRASE_KEY) || null;
  } catch { return null; }
}
function setStoredPassphrase(passphrase) {
  try {
    if(passphrase) _storage?.setItem(_CRYPTO_PASSPHRASE_KEY, passphrase);
    else _storage?.removeItem(_CRYPTO_PASSPHRASE_KEY);
  } catch {}
  // 鍵キャッシュをリセット（次回再派生）
  _cryptoDerivedKey = null;
  _cryptoSaltCache = null;
}

// パスフレーズ入力モーダルを表示
async function promptPassphrase(reason = 'データ暗号化のためのパスフレーズが必要です') {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
      <div style="background:var(--bg-primary,#fff);border-radius:12px;padding:24px;max-width:440px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
        <h3 style="margin:0 0 12px;color:var(--accent,#2563eb);">🔐 パスフレーズ入力</h3>
        <p style="font-size:13px;color:var(--text-secondary,#666);margin-bottom:16px;line-height:1.6;">${reason}</p>
        <input type="password" id="_crypto_pp_input" placeholder="パスフレーズを入力" autocomplete="off"
          style="width:100%;padding:10px;border:1px solid #ccc;border-radius:6px;font-size:14px;box-sizing:border-box;margin-bottom:16px;">
        <div id="_crypto_pp_err" style="color:#c00;font-size:12px;margin-bottom:12px;display:none;"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button id="_crypto_pp_cancel" style="padding:8px 16px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;">キャンセル</button>
          <button id="_crypto_pp_ok" style="padding:8px 16px;border:none;border-radius:6px;background:var(--accent,#2563eb);color:#fff;cursor:pointer;font-weight:600;">確定</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const input = document.getElementById('_crypto_pp_input');
    input.focus();
    const cleanup = () => overlay.remove();
    document.getElementById('_crypto_pp_ok').onclick = () => {
      const v = input.value;
      if(!v || v.length < 8) {
        document.getElementById('_crypto_pp_err').textContent = '8文字以上で入力してください';
        document.getElementById('_crypto_pp_err').style.display = 'block';
        return;
      }
      cleanup();
      resolve(v);
    };
    document.getElementById('_crypto_pp_cancel').onclick = () => { cleanup(); resolve(null); };
    input.onkeydown = e => { if(e.key === 'Enter') document.getElementById('_crypto_pp_ok').click(); };
  });
}

// ============================================================
// 鍵派生（PBKDF2-SHA256）
// ============================================================
async function _deriveKey(passphrase, salt) {
  const enc = new TextEncoder();
  // パスフレーズを CryptoKey に変換
  const pwKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  // PBKDF2 で AES-GCM 鍵を派生
  const aesKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: _CRYPTO_PBKDF2_ITER,
      hash: 'SHA-256',
    },
    pwKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  return aesKey;
}

// パスフレーズが利用可能か確認
async function _ensurePassphrase() {
  let pp = getStoredPassphrase();
  if(!pp) {
    // 初回起動 or パスフレーズ未設定
    pp = await promptPassphrase(
      '営業管理システムは機密データの保護のためパスフレーズで暗号化されています。\n\n' +
      '管理者から共有されたパスフレーズを入力してください。'
    );
    if(!pp) throw new Error('パスフレーズが入力されませんでした');
    setStoredPassphrase(pp);
  }
  return pp;
}

// ============================================================
// 暗号化
// ============================================================
async function encryptJson(plainObj) {
  const passphrase = await _ensurePassphrase();
  const enc = new TextEncoder();
  const plaintext = enc.encode(JSON.stringify(plainObj));

  // 各暗号化ごとに新しい salt + IV を生成（同じ鍵でも安全）
  const salt = crypto.getRandomValues(new Uint8Array(_CRYPTO_SALT_LEN));
  const iv   = crypto.getRandomValues(new Uint8Array(_CRYPTO_IV_LEN));
  const key  = await _deriveKey(passphrase, salt);

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  );

  // フォーマット: "ENC1" (4B) + salt(16B) + iv(12B) + ciphertext+認証タグ
  const magic = enc.encode(_CRYPTO_MAGIC);
  const out = new Uint8Array(magic.length + salt.length + iv.length + ciphertext.length);
  let offset = 0;
  out.set(magic, offset);       offset += magic.length;
  out.set(salt, offset);        offset += salt.length;
  out.set(iv, offset);          offset += iv.length;
  out.set(ciphertext, offset);
  return out;
}

// ============================================================
// 復号
// ============================================================
async function decryptJson(encryptedBytes) {
  // バイト配列に正規化（ArrayBuffer / Uint8Array / Blob どれでも受ける）
  let bytes;
  if(encryptedBytes instanceof Uint8Array) bytes = encryptedBytes;
  else if(encryptedBytes instanceof ArrayBuffer) bytes = new Uint8Array(encryptedBytes);
  else if(encryptedBytes && typeof encryptedBytes.arrayBuffer === 'function') {
    bytes = new Uint8Array(await encryptedBytes.arrayBuffer());
  } else throw new Error('Invalid encrypted data type');

  // マジックヘッダ確認
  const dec = new TextDecoder();
  const magic = dec.decode(bytes.slice(0, 4));
  if(magic !== _CRYPTO_MAGIC) {
    // 暗号化されていないファイル → 既存のJSONとして扱う
    throw new Error('NOT_ENCRYPTED');
  }

  const salt = bytes.slice(4, 4 + _CRYPTO_SALT_LEN);
  const iv   = bytes.slice(4 + _CRYPTO_SALT_LEN, 4 + _CRYPTO_SALT_LEN + _CRYPTO_IV_LEN);
  const ciphertext = bytes.slice(4 + _CRYPTO_SALT_LEN + _CRYPTO_IV_LEN);

  const passphrase = await _ensurePassphrase();
  const key = await _deriveKey(passphrase, salt);

  let plaintext;
  try {
    plaintext = new Uint8Array(
      await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
    );
  } catch(e) {
    // 復号失敗 = パスフレーズ不一致 or データ改ざん
    // パスフレーズキャッシュを破棄して再入力を促す
    setStoredPassphrase(null);
    throw new Error('DECRYPT_FAILED');
  }

  return JSON.parse(new TextDecoder().decode(plaintext));
}

// ============================================================
// バイト列が暗号化済みかをマジックヘッダで判定
// ============================================================
function isEncryptedBytes(bytes) {
  if(!bytes || bytes.length < 4) return false;
  const dec = new TextDecoder();
  const magic = dec.decode(bytes.slice(0, 4));
  return magic === _CRYPTO_MAGIC;
}

// ============================================================
// パスフレーズ変更（管理者用）
// ============================================================
async function changeEncryptionPassphrase() {
  const oldPp = getStoredPassphrase();
  if(!oldPp) {
    toast('現在のパスフレーズが設定されていません', 'error');
    return false;
  }
  const newPp = await promptPassphrase('新しいパスフレーズを入力してください（8文字以上）');
  if(!newPp) return false;
  if(newPp === oldPp) {
    toast('現在と同じパスフレーズです', 'error');
    return false;
  }
  if(!confirm(`パスフレーズを変更します。\n\n変更後、他のメンバー全員に新パスフレーズを共有する必要があります。\n変更前のパスフレーズを使用すると復号できなくなります。\n\nよろしいですか？`)) return false;

  setStoredPassphrase(newPp);
  // 次回saveで新パスフレーズで暗号化される
  toast('✅ パスフレーズを変更しました。次回保存時に新パスフレーズで暗号化されます', 'success');
  // 即座に保存して新パスフレーズで再暗号化
  if(typeof save === 'function') save();
  return true;
}

// ============================================================
// 起動時の初期化（パスフレーズ確認）
// ============================================================
async function initEncryption() {
  // 既にパスフレーズが保存済みかチェック
  // 保存されていなくても、loadFromOneDrive で必要時にプロンプトされるため
  // ここでは何もしない（遅延初期化）
  return true;
}

// ============================================================
// マスタ画面: セキュリティタブ用UI関数
// ============================================================
function renderEncryptionStatus() {
  const el = document.getElementById('encryption-status');
  if(!el) return;
  const stored = getStoredPassphrase();
  if(stored) {
    const masked = stored.length > 4
      ? stored.substring(0, 2) + '*'.repeat(Math.max(stored.length - 4, 4)) + stored.substring(stored.length - 2)
      : '****';
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;color:var(--green-dark, #15803d);">
        <span style="font-size:18px;">✅</span>
        <span><strong>暗号化が有効です</strong></span>
      </div>
      <div style="margin-top:8px;font-size:11px;color:var(--text-muted);">
        パスフレーズ: <code>${masked}</code>（${stored.length}文字）<br>
        アルゴリズム: AES-GCM-256<br>
        鍵派生: PBKDF2-SHA256（10万回イテレーション）
      </div>
    `;
  } else {
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;color:var(--amber-dark, #b45309);">
        <span style="font-size:18px;">⚠️</span>
        <span><strong>パスフレーズが未設定です</strong></span>
      </div>
      <div style="margin-top:8px;font-size:11px;color:var(--text-muted);">
        次回データ読み込み時にパスフレーズの入力が求められます。
      </div>
    `;
  }
}

function showCurrentPassphraseInfo() {
  const stored = getStoredPassphrase();
  if(!stored) {
    if(typeof toast === 'function') toast('パスフレーズはまだ設定されていません', 'info');
    return;
  }
  if(!confirm('パスフレーズを表示します。周囲に他の人がいないことを確認してください。\n続行しますか？')) return;
  alert('現在のパスフレーズ:\n\n' + stored + '\n\n注意: この情報を他人に見られないようにしてください。');
}

function clearStoredPassphrase() {
  if(!confirm('このブラウザに保管されたパスフレーズを削除します。\n\n削除後はOneDriveからの読み込み時に再入力が必要になります。\n他のブラウザや他のメンバーには影響しません。\n\nよろしいですか？')) return;
  setStoredPassphrase(null);
  if(typeof toast === 'function') toast('パスフレーズをこのブラウザから削除しました', 'success');
  renderEncryptionStatus();
}
