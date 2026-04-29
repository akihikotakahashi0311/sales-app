// LEAD CRUD
// ============================================================
function saveLead() {
  const company = document.getElementById('f-lead-company').value.trim();
  if(!company) { toast('企業名を入力してください', 'error'); return; }
  const editId = document.getElementById('lead-edit-id').value;
  const lead = {
    id: editId || uid('L'),
    company,
    name: document.getElementById('f-lead-name').value,
    tel: document.getElementById('f-lead-tel').value,
    email: document.getElementById('f-lead-email').value,
    source: document.getElementById('f-lead-source').value,
    status: document.getElementById('f-lead-status').value,
    memo: document.getElementById('f-lead-memo').value,
    date: new Date().toISOString().split('T')[0]
  };
  if(editId) {
    const idx = db.leads.findIndex(l=>l.id===editId);
    if(idx>=0) db.leads[idx] = lead;
  } else {
    db.leads.push(lead);
  }
  save();
  closeModal('lead');
  toast(editId?'リードを更新しました':'リードを登録しました', 'success');
  renderLeads();
}

function editLead(id) {
  const l = db.leads.find(x=>x.id===id);
  if(!l) return;
  document.getElementById('lead-modal-title').textContent = 'リード編集';
  document.getElementById('lead-edit-id').value = l.id;
  document.getElementById('f-lead-company').value = l.company;
  document.getElementById('f-lead-name').value = l.name;
  document.getElementById('f-lead-tel').value = l.tel||'';
  document.getElementById('f-lead-email').value = l.email||'';
  document.getElementById('f-lead-source').value = l.source;
  document.getElementById('f-lead-status').value = l.status;
  document.getElementById('f-lead-memo').value = l.memo||'';
  openModal('lead');
}

function convertLead(id) {
  const l = db.leads.find(x=>x.id===id);
  if(!l) return;
  // 案件登録完了後に削除するためIDを保持
  window._convertingLeadId = id;
  populateOppModal();
  document.getElementById('f-opp-name').value     = l.company + ' — 案件';
  document.getElementById('f-opp-customer').value = l.company || '';
  openModal('opp');
  toast('案件化モーダルを開きました。登録するとリードのステータスが案件化に変わります。');
}

function deleteLead(id) {
  if(!confirm('このリードを削除しますか？')) return;
  db.leads = db.leads.filter(l=>l.id!==id);
  save();
  renderLeads();
  toast('リードを削除しました');
}

// ============================================================
// CUSTOMER / USER / ORG CRUD
// ============================================================
function saveCustomer() {
  const name = document.getElementById('f-cust-name').value.trim();
  if(!name) return;
  db.customers.push({id:uid('C'), name, industry:document.getElementById('f-cust-industry').value, segment:document.getElementById('f-cust-segment').value, owner:document.getElementById('f-cust-owner').value});
  save(); closeModal('customer'); renderMaster(); toast('顧客を登録しました', 'success');
}

function deleteCustomer(id) {
  if(!confirm('削除しますか？')) return;
  db.customers = db.customers.filter(c=>c.id!==id);
  save(); renderMaster();
}

function saveUser() {
  const name  = document.getElementById('f-user-name').value.trim();
  const email = document.getElementById('f-user-email').value.trim();
  if(!name || !email) { toast('名前とメールは必須です', 'error'); return; }
  const editId = document.getElementById('f-user-id').value.trim();
  const active = document.getElementById('f-user-active').value === 'true';
  const userData = {
    id:    editId || uid('U'),
    name,
    email,
    role:  document.getElementById('f-user-role').value,
    dept:  document.getElementById('f-user-dept').value,
    active
  };
  if(editId) {
    const idx = db.users.findIndex(u => u.id === editId);
    if(idx >= 0) {
      const oldName = db.users[idx].name;
      db.users.splice(idx, 1, userData);
      // 担当者名が変わった場合、案件・リードを一括更新
      if(oldName !== name) {
        let updated = 0;
        db.opportunities.forEach(o => { if(o.owner === oldName) { o.owner = name; updated++; } });
        db.leads.forEach(l => { if(l.owner === oldName) { l.owner = name; } });
        if(updated > 0) toast(`ユーザーを更新しました（案件${updated}件の担当者名を更新）`, 'success');
        else toast('ユーザーを更新しました', 'success');
      } else {
        toast('ユーザーを更新しました', 'success');
      }
    } else {
      // IDが見つからない場合は新規追加（フォールバック）
      db.users.push(userData);
      toast('ユーザーを更新しました', 'success');
    }
  } else {
    db.users.push(userData);
    toast('ユーザーを登録しました', 'success');
  }
  save();
  closeModal('user');
  renderMaster();
}

function saveOrg() {
  const name    = document.getElementById('f-org-name').value.trim();
  if(!name) return;
  const editId  = document.getElementById('f-org-id')?.value || '';
  const manager = document.getElementById('f-org-manager').value;
  const budget  = parseFloat(document.getElementById('f-org-budget').value) || 0;
  if(editId) {
    const idx = db.orgs.findIndex(o => o.id === editId);
    if(idx >= 0) db.orgs.splice(idx, 1, {id:editId, name, manager, budget});
    toast('部門を更新しました', 'success');
  } else {
    db.orgs.push({id:uid('ORG'), name, manager, budget});
    toast('部門を登録しました', 'success');
  }
  save(); closeModal('org'); renderMaster();
}

// ============================================================
