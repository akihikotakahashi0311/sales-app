function renderMaster() {
  document.getElementById('users-tbody').innerHTML = db.users.map(u=>`
    <tr>
      <td class="fw-500">${u.name}</td>
      <td style="font-size:12px;color:var(--text-secondary);">${u.email}</td>
      <td>${roleBadge(u.role)}</td>
      <td>${u.dept}</td>
      <td><span class="badge ${u.active?'badge-green':'badge-red'}">${u.active?'有効':'無効'}</span></td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-sm" onclick="editUser('${u.id}')">編集</button>
          <button class="btn btn-sm btn-danger" onclick="if(confirm('削除しますか？')){db.users=db.users.filter(x=>x.id!=='${u.id}');save();renderMaster();}">削除</button>
        </div>
      </td>
    </tr>`).join('');
  document.getElementById('org-tbody').innerHTML = db.orgs.map(o=>`
    <tr>
      <td class="fw-500">${o.name}</td>
      <td>${o.manager}</td>
      <td>${db.users.filter(u=>u.dept===o.name).length}名</td>
      <td class="text-right">${o.budget.toLocaleString()}</td>
      <td><div style="display:flex;gap:4px;"><button class="btn btn-sm" onclick="editOrg('${o.id}')">編集</button><button class="btn btn-sm btn-danger" onclick="if(confirm('削除しますか？')){db.orgs=db.orgs.filter(x=>x.id!=='${o.id}');save();renderMaster();}">削除</button></div></td>
    </tr>`).join('');
  document.getElementById('cust-master-tbody').innerHTML = db.customers.map(c=>`
    <tr>
      <td class="fw-500">${c.name}</td>
      <td><span class="badge badge-gray">${c.industry}</span></td>
      <td>${c.segment}</td>
      <td>${c.owner}</td>
      <td><button class="btn btn-sm btn-danger" onclick="deleteCustomer('${c.id}')">削除</button></td>
    </tr>`).join('');
}


function switchMasterTab(el, tabId) {
  el.parentElement.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  ['master-users','master-org','master-customers','master-phases','master-backup'].forEach(id=>{
    const d=document.getElementById(id);
    if(d) d.style.display=id===tabId?'block':'none';
  });
  if(tabId === 'master-backup') renderBackupHistory();
}

// ============================================================
// CSV EXPORT
// ============================================================


function exportCSV(type) {
  let csv='', filename='';
  if(type==='opportunities') {
    csv = '案件ID,案件名,顧客,担当者,フェーズ,確度(%),契約総額(万円),加重額(万円),計上方式,開始日,終了日\n';
    csv += db.opportunities.map(o=>`${o.id},"${o.name}","${o.customer}","${o.owner}",${o.stage},${o.prob},${o.amount},${Math.round(o.amount*o.prob/100)},${o.recog},${o.start},${o.end}`).join('\n');
    filename = `案件一覧_${currentMonth}.csv`;
  } else if(type==='customers') {
    csv = '顧客名,業種,セグメント,担当営業,売上合計(万円),請求合計(万円),入金合計(万円),未回収(万円)\n';
    const byC={};
    db.opportunities.forEach(o=>{
      if(!byC[o.customer]) byC[o.customer]={sales:0,billing:0,cash:0};
      const m=db.monthly[currentMonth]?.[o.id]||{};
      byC[o.customer].sales+=m.sales||0;byC[o.customer].billing+=m.billing||0;byC[o.customer].cash+=m.cash||0;
    });
    csv += db.customers.map(c=>{
      const d=byC[c.name]||{sales:0,billing:0,cash:0};
      return `"${c.name}",${c.industry},${c.segment},"${c.owner}",${d.sales},${d.billing},${d.cash},${d.billing-d.cash}`;
    }).join('\n');
    filename = `顧客分析_${currentMonth}.csv`;
  }
  downloadCSV(csv, filename);
}

function exportMonthlyCSV() {
  let csv = '案件ID,案件名,計上方式,売上計上額(万円),請求額(万円),入金額(万円),当月進捗率,累計進捗率,未回収(万円)\n';
  csv += db.opportunities.map(o=>{
    const m=getMonthly(o.id);
    return `${o.id},"${o.name}",${o.recog},${m.sales},${m.billing},${m.cash},${m.progress.toFixed(1)},${m.cumProgress.toFixed(1)},${m.billing-m.cash}`;
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
