function renderMaster() {
  // ★ Critical-3対策: 関数レベルでアクセス制御（直接呼ばれた場合のガード）
  if(typeof canAccessMaster === 'function' && !canAccessMaster()) {
    const tbody1 = document.getElementById('users-tbody');
    const tbody2 = document.getElementById('org-tbody');
    const tbody3 = document.getElementById('cust-master-tbody');
    const empty = '<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--text-muted);">マスタ管理画面はマネージャー以上の権限が必要です</td></tr>';
    if(tbody1) tbody1.innerHTML = empty;
    if(tbody2) tbody2.innerHTML = empty;
    if(tbody3) tbody3.innerHTML = empty;
    return;
  }

  const _isAdmin   = (typeof isAdminUser === 'function') ? isAdminUser() : false;
  const _isManager = (typeof isManagerUser === 'function') ? isManagerUser() : false;

  // ユーザー一覧（管理者のみ閲覧・編集可、それ以外は空表示）
  const usersTbody = document.getElementById('users-tbody');
  if(usersTbody) {
    if(_isAdmin) {
      usersTbody.innerHTML = db.users.map(u=>`
    <tr>
      <td class="fw-500">${_h(u.name)}</td>
      <td style="font-size:12px;color:var(--text-secondary);">${_h(u.email)}</td>
      <td>${roleBadge(u.role)}</td>
      <td>${_h(u.dept)}</td>
      <td><span class="badge ${u.active?'badge-green':'badge-red'}">${u.active?'有効':'無効'}</span></td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-sm" onclick="editUser('${_hj(u.id)}')">編集</button>
          <button class="btn btn-sm btn-danger" onclick="deleteUserById('${_hj(u.id)}')">削除</button>
        </div>
      </td>
    </tr>`).join('');
    } else {
      usersTbody.innerHTML = '<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--text-muted);">ユーザー管理は管理者のみ閲覧できます</td></tr>';
    }
  }

  // 組織一覧（管理者のみ）
  const orgTbody = document.getElementById('org-tbody');
  if(orgTbody) {
    if(_isAdmin) {
      orgTbody.innerHTML = db.orgs.map(o=>`
    <tr>
      <td class="fw-500">${_h(o.name)}</td>
      <td>${_h(o.manager)}</td>
      <td>${db.users.filter(u=>u.dept===o.name).length}名</td>
      <td class="text-right">${(Number(o.budget)||0).toLocaleString()}</td>
      <td><div style="display:flex;gap:4px;"><button class="btn btn-sm" onclick="editOrg('${_hj(o.id)}')">編集</button><button class="btn btn-sm btn-danger" onclick="deleteOrgById('${_hj(o.id)}')">削除</button></div></td>
    </tr>`).join('');
    } else {
      orgTbody.innerHTML = '<tr><td colspan="5" style="padding:24px;text-align:center;color:var(--text-muted);">組織管理は管理者のみ閲覧できます</td></tr>';
    }
  }

  // 顧客マスタ（マネージャー以上は編集可、それ以外は閲覧のみ）
  const custTbody = document.getElementById('cust-master-tbody');
  if(custTbody) {
    custTbody.innerHTML = db.customers.map(c=>`
    <tr>
      <td class="fw-500">${_h(c.name)}</td>
      <td><span class="badge badge-gray">${_h(c.industry)}</span></td>
      <td>${_h(c.segment)}</td>
      <td>${_h(c.owner)}</td>
      <td>${_isManager ? `<button class="btn btn-sm btn-danger" onclick="deleteCustomer('${_hj(c.id)}')">削除</button>` : '<span style="color:var(--text-muted);font-size:11px;">閲覧のみ</span>'}</td>
    </tr>`).join('');
  }
}


// ============================================================
// マスタ管理: 削除操作（権限チェック付き）
// ============================================================

// ユーザー削除（管理者のみ実行可、自分自身は削除不可）
function deleteUserById(userId) {
  if(typeof requireAdmin === 'function' && !requireAdmin('ユーザーの削除')) return;
  const target = db.users.find(u => u.id === userId);
  if(!target) { toast('対象ユーザーが見つかりません', 'error'); return; }

  // 自己削除の防止
  if(currentUser && (target.id === currentUser.id || target.email === currentUser.email)) {
    toast('自分自身は削除できません', 'error'); return;
  }

  // 最後の管理者を削除する場合は警告
  const adminCount = db.users.filter(u =>
    u.id !== userId && (u.role === '管理者' || u.role === 'システム管理者' || u.dept === '管理部')
  ).length;
  const isTargetAdmin = target.role === '管理者' || target.role === 'システム管理者' || target.dept === '管理部';
  if(isTargetAdmin && adminCount === 0) {
    toast('最後の管理者ユーザーは削除できません', 'error'); return;
  }

  if(!confirm(`ユーザー「${target.name}」を削除しますか？\n\nメール: ${target.email}\nロール: ${target.role}\n\nこの操作は取り消せません。`)) return;

  db.users = db.users.filter(x => x.id !== userId);
  save();
  renderMaster();
  toast(`ユーザー「${target.name}」を削除しました`, 'success');
}

// 組織削除（管理者のみ実行可、所属メンバーがある場合は警告）
function deleteOrgById(orgId) {
  if(typeof requireAdmin === 'function' && !requireAdmin('組織の削除')) return;
  const target = db.orgs.find(o => o.id === orgId);
  if(!target) { toast('対象組織が見つかりません', 'error'); return; }

  const memberCount = db.users.filter(u => u.dept === target.name).length;
  let msg = `組織「${target.name}」を削除しますか？`;
  if(memberCount > 0) {
    msg += `\n\n⚠️ この組織には ${memberCount} 名のユーザーが所属しています。\n削除後、これらのユーザーの所属部門が空になります。`;
  }
  msg += '\n\nこの操作は取り消せません。';
  if(!confirm(msg)) return;

  db.orgs = db.orgs.filter(x => x.id !== orgId);
  save();
  renderMaster();
  toast(`組織「${target.name}」を削除しました`, 'success');
}

function switchMasterTab(el, tabId) {
  el.parentElement.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  ['master-users','master-org','master-customers','master-phases','master-backup','master-security'].forEach(id=>{
    const d=document.getElementById(id);
    if(d) d.style.display=id===tabId?'block':'none';
  });
  if(tabId === 'master-backup') renderBackupHistory();
  if(tabId === 'master-security') renderEncryptionStatus();
}

// ============================================================
// CSV EXPORT
// ============================================================

// NEW-1対策: CSVセル安全化
// 1) RFC 4180 準拠: 値が "/,/改行 を含む場合は " で囲み、内部の " を "" にエスケープ
// 2) CSVインジェクション対策: 先頭が =/+/-/@/\t/\r の場合、Excel/Google Sheets が
//    数式として実行する(例: =cmd|...!A1) ため、先頭にシングルクォートを挿入して無害化
//    参考: OWASP CSV Injection
function _csvCell(v) {
  if(v === null || v === undefined) return '';
  let s = String(v);
  // 数式化攻撃を防止 (先頭文字が危険なら ' を前置)
  if(/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  // " / , / 改行 を含む場合はクォート + 内部 " のエスケープ
  if(/[",\r\n]/.test(s)) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
// 行を組み立てるヘルパ
function _csvRow(arr) { return arr.map(_csvCell).join(','); }

function exportCSV(type) {
  let csv='', filename='';
  if(type==='opportunities') {
    csv = '案件ID,案件名,顧客,担当者,フェーズ,確度(%),契約総額(万円),加重額(万円),計上方式,開始日,終了日\n';
    csv += db.opportunities.map(o => _csvRow([
      o.id, o.name, o.customer, o.owner, o.stage, o.prob, o.amount,
      Math.round(o.amount*o.prob/100), o.recog, o.start, o.end
    ])).join('\n');
    filename = `案件一覧_${currentMonth}.csv`;
  } else if(type==='customers') {
    csv = '顧客名,業種,セグメント,担当営業,売上合計(万円),請求合計(万円),入金合計(万円),未回収(万円)\n';
    const byC={};
    db.opportunities.forEach(o=>{
      if(!byC[o.customer]) byC[o.customer]={sales:0,billing:0,cash:0};
      const m=db.monthly[currentMonth]?.[o.id]||{};
      byC[o.customer].sales+=m.sales||0;byC[o.customer].billing+=m.billing||0;byC[o.customer].cash+=m.cash||0;
    });
    csv += db.customers.map(c => {
      const d = byC[c.name] || {sales:0, billing:0, cash:0};
      return _csvRow([
        c.name, c.industry, c.segment, c.owner,
        d.sales, d.billing, d.cash, d.billing - d.cash
      ]);
    }).join('\n');
    filename = `顧客分析_${currentMonth}.csv`;
  }
  downloadCSV(csv, filename);
}

function exportMonthlyCSV() {
  let csv = '案件ID,案件名,計上方式,売上計上額(万円),請求額(万円),入金額(万円),当月進捗率,累計進捗率,未回収(万円)\n';
  csv += db.opportunities.map(o => {
    const m = getMonthly(o.id);
    return _csvRow([
      o.id, o.name, o.recog, m.sales, m.billing, m.cash,
      m.progress.toFixed(1), m.cumProgress.toFixed(1), m.billing - m.cash
    ]);
  }).join('\n');
  downloadCSV(csv, `月次データ_${currentMonth}.csv`);
}

function dismissAlert(id) {
  const a = db.alerts.find(x=>x.id===id);
  if(a) { a.dismissed = true; save(); renderAlerts(); updateAlertBadge(); toast('対応済にしました'); }
}


function dismissAllAlerts() {
  // renderAlerts と同じフィルターを適用して対象を決定
  const q            = (document.getElementById('alert-search')?.value||'').toLowerCase();
  const typeFilter   = document.getElementById('alert-type-filter')?.value||'';
  const statusFilter = document.getElementById('alert-status-filter')?.value||'active';

  const targets = db.alerts.filter(a => {
    if(a.dismissed) return false;                        // 対応済は除外
    if(statusFilter === 'dismissed') return false;        // 対応済フィルター中は0件
    if(typeFilter && a.type !== typeFilter) return false;
    if(q && !a.title.toLowerCase().includes(q) && !(a.detail||'').toLowerCase().includes(q)) return false;
    if(a.oppId && viewScope === 'own' && currentUser) {
      const opp = db.opportunities.find(o => o.id === a.oppId);
      if(opp && opp.owner !== currentUser.name) return false;
    }
    return true;
  });

  if(targets.length === 0) { toast('表示中の未対応アラートがありません', 'error'); return; }
  if(!confirm(targets.length + '件のアラートを対応済にしますか？')) return;
  const ids = new Set(targets.map(a => a.id));
  db.alerts.forEach(a => { if(ids.has(a.id)) a.dismissed = true; });
  save(); renderAlerts(); updateAlertBadge();
  toast(targets.length + '件を対応済にしました', 'success');
}

// ============================================================
// 契約書アップロード時: 契約日入力ポップアップ
// ============================================================
let _contractDateOppId = null;
