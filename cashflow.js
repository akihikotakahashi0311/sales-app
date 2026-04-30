let activeSegFilter = '';

function renderSegmentTab() {
  const monthData = db.monthly[reportMonth] || {};
  const msr = db.monthlySummary || {};
  const segData = {};
  db.opportunities.forEach(o => {
    const seg = o.dept || 'その他';
    if(!segData[seg]) segData[seg] = {sales:0,billing:0,amount:0,count:0,won:0,weighted:0};
    const m = monthData[o.id] || {};
    segData[seg].sales    += m.sales    || 0;
    segData[seg].billing  += m.billing  || 0;
    segData[seg].amount   += o.amount;
    segData[seg].count    += 1;
    segData[seg].weighted += o.amount * o.prob / 100;
    if(o.stage==='受注') segData[seg].won++;
  });
  const segs      = Object.keys(segData).sort((a,b)=>{
    let va,vb;
    switch(segSortKey){
      case 'name':     va=a; vb=b; return segSortDir*(va<vb?-1:va>vb?1:0);
      case 'count':    return segSortDir*(segData[b].count-segData[a].count);
      case 'amount':   return segSortDir*(segData[b].amount-segData[a].amount);
      case 'billing':  return segSortDir*(segData[b].billing-segData[a].billing);
      case 'weighted': return segSortDir*(segData[b].weighted-segData[a].weighted);
      case 'won':      return segSortDir*(segData[b].won-segData[a].won);
      default:         return segSortDir*(segData[b].sales-segData[a].sales);
    }
  });
  const segColors = segs.map((_,i)=>OWNER_COLORS_EXT[i%OWNER_COLORS_EXT.length]);
  const totalSales = segs.reduce((s,k)=>s+segData[k].sales,0);
  const topSeg = segs[0]||'—';

  document.getElementById('seg-metrics').innerHTML = `
    <div class="metric-card blue"><div class="metric-label">セグメント数</div><div class="metric-value">${segs.length}</div></div>
    <div class="metric-card green"><div class="metric-label">最大売上</div><div class="metric-value" style="font-size:15px;">${topSeg}</div><div class="metric-change neutral">${fmt(segData[topSeg]?.sales||0)}</div></div>
    <div class="metric-card purple"><div class="metric-label">当月売上合計</div><div class="metric-value">${fmtM(totalSales)}</div></div>
    <div class="metric-card amber"><div class="metric-label">全案件数</div><div class="metric-value">${db.opportunities.length}件</div></div>
  `;

  destroyChart('chartSegSales');
  const elSS = document.getElementById('chartSegSales');
  if(elSS && segs.length) charts.chartSegSales = new Chart(elSS, {
    type:'bar', data:{labels:segs, datasets:[{label:'売上', data:segs.map(s=>segData[s].sales), backgroundColor:segColors, borderRadius:4}]},
    options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',
      plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>'¥'+ctx.parsed.x.toLocaleString()+'万'}}},
      scales:{x:{beginAtZero:true,ticks:{callback:v=>'¥'+v+'万',font:{size:10}}},y:{ticks:{font:{size:11}},grid:{display:false}}}
    }
  });

  destroyChart('chartSegCount');
  const elSC = document.getElementById('chartSegCount');
  if(elSC && segs.length) charts.chartSegCount = new Chart(elSC, {
    type:'doughnut', data:{labels:segs, datasets:[{data:segs.map(s=>segData[s].count), backgroundColor:segColors, borderWidth:0, hoverOffset:4}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'60%',
      plugins:{legend:{position:'right',labels:{font:{size:11},boxWidth:12}},
               tooltip:{callbacks:{label:ctx=>ctx.label+': '+ctx.parsed+'件'}}}
    }
  });

  document.getElementById('seg-detail-tbody').innerHTML = segs.map(s => {
    const d = segData[s];
    return `<tr>
      <td class="fw-500">${s}</td>
      <td class="text-right">${d.count}</td>
      <td class="text-right">${fmtM(d.amount)}</td>
      <td class="text-right ${d.sales>0?'text-green':''}">${fmt(d.sales)}</td>
      <td class="text-right">${fmt(d.billing)}</td>
      <td class="text-right">${fmt(Math.round(d.weighted))}</td>
      <td class="text-right">${d.won}</td>
    </tr>`;
  }).join('');

  const btnEl = document.getElementById('seg-filter-btns');
  if(btnEl) btnEl.innerHTML = ['全セグメント',...segs.slice(0,8)].map(s => {
    const active = (!activeSegFilter&&s==='全セグメント')||activeSegFilter===s;
    return `<button class="btn btn-sm" style="${active?'background:var(--accent);color:white;border-color:var(--accent);font-size:11px;':'font-size:11px;'}" onclick="activeSegFilter='${s==='全セグメント'?'':s}';renderSegTrend();">${s}</button>`;
  }).join('');
  renderSegTrend();
}

function renderSegTrend() {
  const msr = db.monthlySummary || {};
  const monthKeys = Object.keys(msr).sort();
  const labels = monthKeys.map(k=>{const[y,m]=k.split('-');return y.slice(2)+'/'+parseInt(m);});
  const segsAll = [...new Set(db.opportunities.map(o=>o.dept||'その他'))];
  const targetSegs = activeSegFilter ? [activeSegFilter] : segsAll.slice(0,5);
  const datasets = targetSegs.map((seg,i) => ({
    label:seg,
    data:monthKeys.map(mk=>{
      const md=db.monthly[mk]||{};
      return db.opportunities.filter(o=>(o.dept||'その他')===seg).reduce((s,o)=>s+(md[o.id]?.sales||0),0);
    }),
    borderColor:OWNER_COLORS_EXT[i%OWNER_COLORS_EXT.length],
    borderWidth:2, tension:0.3, pointRadius:2, fill:false
  }));
  destroyChart('chartSegTrend');
  const el = document.getElementById('chartSegTrend');
  if(!el) return;
  charts.chartSegTrend = new Chart(el, {
    type:'line', data:{labels, datasets},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{position:'top',labels:{font:{size:10},boxWidth:12}},
               tooltip:{callbacks:{label:ctx=>'¥'+ctx.parsed.y.toLocaleString()+'万'}}},
      scales:{
        y:{beginAtZero:true,ticks:{callback:v=>'¥'+v+'万',font:{size:10},maxTicksLimit:5},grid:{color:'rgba(0,0,0,0.04)'}},
        x:{ticks:{font:{size:9},maxRotation:45},grid:{display:false}}
      }
    }
  });
  const btnEl = document.getElementById('seg-filter-btns');
  if(btnEl) btnEl.innerHTML = ['全セグメント',...segsAll.slice(0,8)].map(s=>{
    const active = (!activeSegFilter&&s==='全セグメント')||activeSegFilter===s;
    return `<button class="btn btn-sm" style="${active?'background:var(--accent);color:white;border-color:var(--accent);font-size:11px;':'font-size:11px;'}" onclick="activeSegFilter='${s==='全セグメント'?'':s}';renderSegTrend();">${s}</button>`;
  }).join('');
}

// ============================================================
// 担当者別分析
// ============================================================
function renderOwnerTab() {
  const monthData = db.monthly[reportMonth] || {};
  const owners = [...new Set(db.opportunities.map(o=>o.owner).filter(Boolean))];
  const ownerData = {};
  owners.forEach(ow=>{ownerData[ow]={sales:0,billing:0,amount:0,count:0,won:0,pipe:0};});
  db.opportunities.forEach(o=>{
    const ow = o.owner||'未設定';
    if(!ownerData[ow]) ownerData[ow]={sales:0,billing:0,amount:0,count:0,won:0,pipe:0};
    const m = monthData[o.id]||{};
    ownerData[ow].sales   += m.sales   ||0;
    ownerData[ow].billing += m.billing ||0;
    ownerData[ow].amount  += o.amount;
    ownerData[ow].count   += 1;
    ownerData[ow].pipe    += o.amount*o.prob/100;
    if(o.stage==='受注') ownerData[ow].won++;
  });
  const sorted  = owners.sort((a,b)=>ownerData[b].sales-ownerData[a].sales);
  const owColors = sorted.map((_,i)=>OWNER_COLORS_EXT[i%OWNER_COLORS_EXT.length]);

  document.getElementById('owner-metrics').innerHTML = sorted.slice(0,4).map((ow,i)=>{
    const cls=['blue','green','purple','amber'][i]||'gray';
    const d=ownerData[ow];
    return `<div class="metric-card ${cls}"><div class="metric-label">${ow}</div><div class="metric-value">${fmt(d.sales)}</div><div class="metric-change neutral">担当${d.count}件 / 受注${d.won}件</div></div>`;
  }).join('');

  destroyChart('chartOwnerSales');
  const elOS = document.getElementById('chartOwnerSales');
  if(elOS&&sorted.length) charts.chartOwnerSales = new Chart(elOS,{
    type:'bar',data:{labels:sorted,datasets:[{label:'売上',data:sorted.map(o=>ownerData[o].sales),backgroundColor:owColors,borderRadius:4}]},
    options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',
      plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>'¥'+ctx.parsed.x.toLocaleString()+'万'}}},
      scales:{x:{beginAtZero:true,ticks:{callback:v=>'¥'+v+'万',font:{size:10}}},y:{ticks:{font:{size:11}},grid:{display:false}}}
    }
  });

  destroyChart('chartOwnerPipe');
  const elOP = document.getElementById('chartOwnerPipe');
  if(elOP&&sorted.length) charts.chartOwnerPipe = new Chart(elOP,{
    type:'bar',data:{labels:sorted,datasets:[{label:'加重パイプライン',data:sorted.map(o=>Math.round(ownerData[o].pipe)),backgroundColor:owColors.map(c=>c+'99'),borderRadius:4}]},
    options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',
      plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>'¥'+ctx.parsed.x.toLocaleString()+'万'}}},
      scales:{x:{beginAtZero:true,ticks:{callback:v=>'¥'+v+'万',font:{size:10}}},y:{ticks:{font:{size:11}},grid:{display:false}}}
    }
  });

  const sel = document.getElementById('owner-filter');
  if(sel) sel.innerHTML = '<option value="">全担当者</option>'+owners.map(o=>`<option>${o}</option>`).join('');
  renderOwnerTable();
}

function renderOwnerTable() {
  const monthData = db.monthly[reportMonth]||{};
  const filter = document.getElementById('owner-filter')?.value||'';
  const opps   = filter ? db.opportunities.filter(o=>o.owner===filter) : db.opportunities;
  document.getElementById('owner-detail-tbody').innerHTML = [...opps]
    .sort((a,b)=>{
      const ma=monthData[a.id]||{}, mb=monthData[b.id]||{};
      let va,vb;
      switch(ownerSortKey){
        case 'name':    va=a.name;       vb=b.name;       return ownerSortDir*(va<vb?-1:va>vb?1:0);
        case 'customer':va=a.customer;   vb=b.customer;   return ownerSortDir*(va<vb?-1:va>vb?1:0);
        case 'owner':   va=a.owner||'';  vb=b.owner||'';  return ownerSortDir*(va<vb?-1:va>vb?1:0);
        case 'stage':   va=a.stage;      vb=b.stage;      return ownerSortDir*(va<vb?-1:va>vb?1:0);
        case 'amount':  va=a.amount;     vb=b.amount;     return ownerSortDir*(vb-va);
        case 'sales':   va=ma.sales||0;  vb=mb.sales||0;  return ownerSortDir*(vb-va);
        default:        return ownerSortDir*((mb.sales||0)-(ma.sales||0));
      }
    })
    .slice(0,80).map(o=>{
      const m=monthData[o.id]||{};
      return `<tr>
        <td style="font-size:12px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          <a href="#" onclick="showOppDetail('${o.id}');return false;" style="color:var(--accent);text-decoration:none;">${o.name}</a>
        </td>
        <td style="font-size:12px;">${o.customer}</td>
        <td><span class="badge badge-gray" style="font-size:10px;">${o.owner||'—'}</span></td>
        <td>${stageBadge(o.stage)}</td>
        <td class="text-right fw-500">${fmt(o.amount)}</td>
        <td class="text-right ${(m.sales||0)>0?'text-green':''}">${fmt(m.sales||0)}</td>
        <td>${recogBadge(o.recog)}</td>
      </tr>`;
    }).join('')||'<tr><td colspan="7" class="text-center" style="padding:20px;color:var(--text-muted);">データなし</td></tr>';
}

// ============================================================
// 着地予測
// ============================================================
function renderLandingReport() {
  const fyCode = document.getElementById('landing-fy')?.value || dashFY || 'fy25';
  const {start,end} = FY_RANGES[fyCode] || FY_RANGES.fy25;
  const msr = db.monthlySummary||{};
  const allMonths  = Object.keys(msr).sort();
  const fyKeys     = allMonths.filter(k=>k>=start&&k<=end);
  const elapsed    = fyKeys.filter(k=>k<=reportMonth);
  const remaining  = fyKeys.filter(k=>k>reportMonth);
  const totalActual = elapsed.reduce((s,k)=>s+(msr[k]?.salesTotal||0),0);
  const stageF  = document.getElementById('landing-stage-filter')?.value||'';
  const opps    = db.opportunities.filter(o=>o.stage!=='失注'&&(!stageF||o.stage===stageF));
  const monthData = db.monthly[reportMonth]||{};
  const phaseAdj  = {'受注':1.0,'交渉中':0.75,'提案中':0.45,'リード':0.2,'失注':0};

  function calcRem(o) {
    const m = monthData[o.id]||{};
    if(o.recog==='進行基準') return Math.max(0,Math.round(o.amount*(100-(m.cumProgress||0))/100));
    if(o.recog==='月額按分'){
      let done=0;
      Object.keys(db.monthly).forEach(mk=>{done+=db.monthly[mk]?.[o.id]?.sales||0;});
      return Math.max(0,o.amount-done);
    }
    return (m.sales||0)>0?0:o.amount;
  }

  const avg3   = elapsed.slice(-3).reduce((s,k)=>s+(msr[k]?.salesTotal||0),0)/Math.max(elapsed.slice(-3).length,1);
  let m1proj=Math.round(avg3*remaining.length), m2proj=0, m3proj=0;
  opps.forEach(o=>{
    const rem=calcRem(o);
    m2proj+=rem*(o.prob/100)*(phaseAdj[o.stage]||0.5);
    m3proj+=o.recog==='進行基準'?rem*(o.prob/100):rem*(o.prob/100)*0.9;
  });
  m2proj=Math.round(m2proj); m3proj=Math.round(m3proj);
  const consensus=Math.round((totalActual+m1proj+totalActual+m2proj+totalActual+m3proj)/3);
  const simpleW=opps.reduce((s,o)=>s+o.amount*o.prob/100,0);
  const pocOpps=db.opportunities.filter(o=>o.recog==='進行基準'&&o.stage!=='失注');
  const pocWgtRem=pocOpps.reduce((s,o)=>s+calcRem(o)*(o.prob/100),0);

  document.getElementById('landing-metrics').innerHTML = `
    <div class="metric-card blue"><div class="metric-label">累計売上実績</div><div class="metric-value">¥${(totalActual/100).toFixed(1)}M</div><div class="metric-change neutral">${elapsed.length}ヶ月経過</div></div>
    <div class="metric-card green"><div class="metric-label">コンセンサス着地</div><div class="metric-value">¥${(consensus/100).toFixed(1)}M</div><div class="metric-change neutral">3モデル平均</div></div>
    <div class="metric-card purple"><div class="metric-label">PoC残余（加重）</div><div class="metric-value">${fmtM(Math.round(pocWgtRem))}</div><div class="metric-change neutral">進行基準${pocOpps.length}件</div></div>
    <div class="metric-card amber"><div class="metric-label">確度加重</div><div class="metric-value">¥${(simpleW/100).toFixed(1)}M</div></div>
  `;

  const models=[
    {label:'実績トレンド延長',total:totalActual+m1proj,proj:m1proj,desc:`直近3ヶ月平均×残${remaining.length}ヶ月`,color:'#185FA5'},
    {label:'確度加重（フェーズ補正）',total:totalActual+m2proj,proj:m2proj,desc:'フェーズ補正×確度×残余',color:'#1D9E75'},
    {label:'PoC積み上げ',total:totalActual+m3proj,proj:m3proj,desc:'進行基準残余精算+確度加重',color:'#534AB7'},
  ];
  const maxV=Math.max(...models.map(m=>m.total),consensus,1);
  document.getElementById('landing-model-bars').innerHTML=[...models,{label:'コンセンサス',total:consensus,proj:consensus-totalActual,color:'#BA7517'}].map(m=>{
    const pctT=Math.min(96,m.total/maxV*100), pctA=Math.min(96,totalActual/maxV*100);
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;">
      <div style="font-size:13px;font-weight:600;color:${m.color};">¥${(m.total/100).toFixed(1)}M</div>
      <div style="width:100%;flex:1;position:relative;background:var(--bg-secondary);border-radius:6px;overflow:hidden;min-height:80px;">
        <div style="position:absolute;bottom:0;left:0;right:0;height:${pctT}%;background:${m.color}22;"></div>
        <div style="position:absolute;bottom:0;left:0;right:0;height:${pctA}%;background:${m.color};"></div>
      </div>
      <div style="font-size:10px;color:var(--text-muted);text-align:center;line-height:1.3;">${m.label}</div>
    </div>`;
  }).join('');
  document.getElementById('landing-model-detail').innerHTML=models.map(m=>`
    <div style="padding:12px;background:var(--bg-secondary);border-radius:var(--radius-md);">
      <div style="font-size:11px;font-weight:600;color:${m.color};margin-bottom:4px;">${m.label}</div>
      <div style="font-size:20px;font-weight:600;margin-bottom:3px;">¥${(m.total/100).toFixed(1)}M</div>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;">${m.desc}</div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-secondary);">
        <span>実績 ¥${(totalActual/100).toFixed(1)}M</span>
        <span style="color:${m.color};">+¥${(m.proj/100).toFixed(1)}M</span>
      </div>
    </div>`).join('');

  let pd=0,pr=0,pw=0;
  document.getElementById('poc-detail-tbody').innerHTML=pocOpps.sort((a,b)=>calcRem(b)-calcRem(a)).map(o=>{
    const m=monthData[o.id]||{};
    const cum=m.cumProgress||0,done=Math.round(o.amount*cum/100),rem=calcRem(o),wgt=Math.round(rem*o.prob/100);
    pd+=done;pr+=rem;pw+=wgt;
    return `<tr>
      <td style="font-size:12px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${o.name}</td>
      <td class="text-right">${fmt(o.amount)}</td>
      <td class="text-right"><div style="display:flex;align-items:center;gap:5px;justify-content:flex-end;"><div class="progress-bar" style="width:48px;"><div class="progress-fill" style="width:${Math.min(100,cum)}%;background:var(--accent);"></div></div><span style="font-size:11px;">${cum.toFixed(1)}%</span></div></td>
      <td class="text-right">${fmt(done)}</td>
      <td class="text-right fw-500 text-accent">${fmt(rem)}</td>
      <td class="text-right">${fmt(wgt)}</td>
      <td style="font-size:11px;color:var(--text-muted);">${o.owner||'—'}</td>
    </tr>`;
  }).join('')||'<tr><td colspan="7" class="text-center" style="padding:16px;color:var(--text-muted);">進行基準案件なし</td></tr>';
  const pb=document.getElementById('poc-remaining-badge');
  if(pb) pb.textContent='残余合計 '+fmt(pr);
  const pdt=document.getElementById('poc-done-total'); if(pdt) pdt.textContent=fmt(pd);
  const prt=document.getElementById('poc-rem-total');  if(prt) prt.textContent=fmt(pr);
  const pwt=document.getElementById('poc-wgt-total');  if(pwt) pwt.textContent=fmt(pw);

  const totalW=opps.reduce((s,o)=>s+calcRem(o)*o.prob/100,0)||1;
  document.getElementById('landing-tbody').innerHTML=opps
    .sort((a,b)=>calcRem(b)*b.prob/100-calcRem(a)*a.prob/100).slice(0,80).map(o=>{
      const m=monthData[o.id]||{},rem=calcRem(o),wgt=Math.round(rem*o.prob/100);
      return `<tr>
        <td style="font-size:12px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          <a href="#" onclick="showOppDetail('${o.id}');return false;" style="color:var(--accent);text-decoration:none;">${o.name}</a>
        </td>
        <td>${stageBadge(o.stage)}</td>
        <td style="font-size:12px;">${o.prob}%</td>
        <td>${recogBadge(o.recog)}</td>
        <td class="text-right">${fmt(o.amount)}</td>
        <td class="text-right ${(m.sales||0)>0?'text-green':''}">${fmt(m.sales||0)}</td>
        <td class="text-right">${fmt(rem)}</td>
        <td class="text-right fw-500 text-accent">${fmt(wgt)}</td>
        <td style="font-size:11px;color:var(--text-muted);">${o.owner||'—'}</td>
      </tr>`;
    }).join('');
}

// ============================================================
// 過去月参照タブ
// ============================================================
function initHistoryTab() {
  const msr    = db.monthlySummary||{};
  const months = [...new Set([...Object.keys(msr),...Object.keys(db.monthly||{})])].sort().reverse();
  const sel    = document.getElementById('history-month-sel');
  if(!sel) return;
  sel.innerHTML = months.map(m=>`<option value="${m}">${monthLabel(m)}</option>`).join('');
  renderHistoryTab();
}

function renderHistoryTab() {
  const sel   = document.getElementById('history-month-sel');
  const month = sel?.value || reportMonth;
  const msr   = db.monthlySummary||{};
  const ms    = msr[month]||{};
  const md    = db.monthly?.[month]||{};
  const lockEl = document.getElementById('history-lock-status');
  if(lockEl) lockEl.innerHTML = db.monthlyLocked?.[month]
    ? '<span class="badge badge-red">締め済</span>'
    : '<span class="badge badge-gray">未締め</span>';

  let ts = ms.salesTotal   || Object.values(md).reduce((a,v)=>a+(v.sales||0),0);
  let tb = ms.billingTotal || Object.values(md).reduce((a,v)=>a+(v.billing||0),0);
  let tc = ms.cashTotal    || Object.values(md).reduce((a,v)=>a+(v.cash||0),0);

  document.getElementById('history-metrics').innerHTML = `
    <div class="metric-card blue"><div class="metric-label">売上計上額</div><div class="metric-value">${fmtM(ts)}</div></div>
    <div class="metric-card green"><div class="metric-label">請求額</div><div class="metric-value">${fmtM(tb)}</div></div>
    <div class="metric-card amber"><div class="metric-label">入金額</div><div class="metric-value">${fmtM(tc)}</div></div>
    <div class="metric-card red"><div class="metric-label">未回収</div><div class="metric-value">${fmtM(tb-tc)}</div></div>
  `;

  let rs=0,rb=0,rc=0;
  const rows = db.opportunities.filter(o=>{
    const m=md[o.id];
    return m&&(m.sales||m.billing||m.cash);
  }).sort((a,b)=>(md[b.id]?.sales||0)-(md[a.id]?.sales||0)).map(o=>{
    const m=md[o.id]||{};
    rs+=m.sales||0; rb+=m.billing||0; rc+=m.cash||0;
    const unc=(m.billing||0)-(m.cash||0);
    let status='';
    if(m.sales>0&&m.billing===0) status='<span class="badge badge-amber">未請求</span>';
    else if(m.billing>0&&m.cash===0) status='<span class="badge badge-red">未入金</span>';
    else if(m.cash>=m.billing&&m.cash>0) status='<span class="badge badge-green">入金済</span>';
    else if(m.billing>0) status='<span class="badge badge-amber">一部入金</span>';
    else status='<span class="badge badge-gray">—</span>';
    return `<tr>
      <td style="font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
        <a href="#" onclick="showOppDetail('${o.id}');return false;" style="color:var(--accent);text-decoration:none;">${o.name}</a>
      </td>
      <td>${recogBadge(o.recog)}</td>
      <td class="text-right">${fmt(m.sales||0)}</td>
      <td class="text-right">${fmt(m.billing||0)}</td>
      <td class="text-right">${fmt(m.cash||0)}</td>
      <td class="text-right ${unc>0?'text-red fw-500':''}">${fmt(unc)}</td>
      <td>${status}</td>
    </tr>`;
  });
  document.getElementById('history-tbody').innerHTML = rows.join('')||
    '<tr><td colspan="7" class="text-center" style="padding:20px;color:var(--text-muted);">この月のデータなし</td></tr>';
  document.getElementById('hist-s').textContent=fmt(rs);
  document.getElementById('hist-b').textContent=fmt(rb);
  document.getElementById('hist-c').textContent=fmt(rc);
  document.getElementById('hist-u').textContent=fmt(rb-rc);
}


