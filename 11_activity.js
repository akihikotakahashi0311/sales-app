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
      .map(u=>'<option value="'+u.name+'"'+(u.name===(currentUser?.name)?'selected':'')+'>'+u.name+'</option>').join('');
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


