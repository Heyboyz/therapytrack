const LOCAL_DATA_KEY='therapytrack_data';
const LOCAL_THER_KEY='therapytrack_therapists';
const GAS_URL='https://script.google.com/macros/s/AKfycbyZUChUcr33Ridb-YW6GW9XEAW8fGcDw-pgY14sDHhVglvdWnC-RIxAPbJHk8-kyLw7/exec';
const MONTH_NAMES=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const DAY_FULL=['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const DAY_NAMES=['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
const WORK_DAYS=[2,3,4,5,6];
const COLORS=[['#6c63ff','#8b5cf6'],['#00d4aa','#00a87a'],['#ff6584','#e6476a'],['#f5c842','#e5b032'],['#38bdf8','#0ea5e9'],['#fb923c','#ea580c'],['#a78bfa','#7c3aed'],['#34d399','#059669']];

// Libur Nasional & Cuti Bersama 2026 (dari Kalender Operasional)
const HOLIDAYS=new Set([
  // Januari
  '2026-01-01', // Tahun Baru Masehi
  '2026-01-27', // Isra Mi'raj
  '2026-01-29', // Tahun Baru Imlek
  // Maret
  '2026-03-28', // Hari Raya Nyepi
  // April
  '2026-04-03', // Wafat Yesus Kristus
  '2026-04-20', // Idul Fitri 1447 H
  '2026-04-21', // Idul Fitri 1447 H (hari ke-2)
  '2026-04-22', // Cuti Bersama Idul Fitri
  '2026-04-23', // Cuti Bersama Idul Fitri
  '2026-04-24', // Cuti Bersama Idul Fitri
  // Mei
  '2026-05-01', // Hari Buruh Internasional
  '2026-05-14', // Kenaikan Yesus Kristus
  '2026-05-16', // Hari Waisak 2570 BE
  '2026-05-27', // Hari Raya Idul Adha 1447 H
  '2026-05-28', // Cuti Bersama Idul Adha
  // Juni
  '2026-06-16', // Tahun Baru Islam 1448 H
  // Agustus
  '2026-08-18', // Cuti Bersama Kemerdekaan RI
  '2026-08-25', // Maulid Nabi Muhammad SAW
  // Desember
  '2026-12-25', // Hari Raya Natal
  '2026-12-26', // Cuti Bersama Natal
]);

let currentYear, currentMonth, data={}, therapists=[];
const gasUrl=GAS_URL;

function toKey(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function isHoliday(d){return HOLIDAYS.has(toKey(d));}
function isWork(d){return WORK_DAYS.includes(d.getDay()) && !isHoliday(d);}

// Periode: tgl 21 bulan lalu s/d tgl 20 bulan ini
function getPeriodDates(year, month){
  const dates=[];
  const pm=month===0?11:month-1;
  const py=month===0?year-1:year;
  const daysInPrev=new Date(py,pm+1,0).getDate();
  for(let d=21;d<=daysInPrev;d++) dates.push(new Date(py,pm,d));
  for(let d=1;d<=20;d++) dates.push(new Date(year,month,d));
  return dates;
}

function periodLabel(year,month){
  const pm=month===0?11:month-1;
  const py=month===0?year-1:year;
  return `21 ${MONTH_NAMES[pm]} ${py} – 20 ${MONTH_NAMES[month]} ${year}`;
}
function avatarStyle(i){const c=COLORS[i%COLORS.length];return `background:linear-gradient(135deg,${c[0]},${c[1]});color:white`;}
function avatarColor(i){return COLORS[i%COLORS.length][0];}
function initials(n){return n.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);}

async function gasGet(params){
  if(!gasUrl) throw new Error('No GAS URL');
  const u=new URL(gasUrl);
  Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,v));
  const r=await fetch(u.toString(),{redirect:'follow'});
  const j=await r.json();
  if(!j.success) throw new Error(j.data?.error||'GAS error');
  return j.data;
}

async function loadFromGAS(){
  const [d,t]=await Promise.all([gasGet({action:'getAllData'}),gasGet({action:'getTherapists'})]);
  data=d||{};
  therapists=t||[];
  cacheLocal();
}

function loadLocal(){
  try{ data=JSON.parse(localStorage.getItem(LOCAL_DATA_KEY))||{}; }catch{data={};}
  try{ therapists=JSON.parse(localStorage.getItem(LOCAL_THER_KEY))||['Andi','Budi','Citra','Dewi']; }catch{therapists=['Andi','Budi','Citra','Dewi'];}
}

function cacheLocal(){
  localStorage.setItem(LOCAL_DATA_KEY,JSON.stringify(data));
  localStorage.setItem(LOCAL_THER_KEY,JSON.stringify(therapists));
}

function setSyncUI(state,label){
  const b=document.getElementById('syncBadge');
  const l=document.getElementById('syncLabel');
  b.className='sync-badge '+(state||'');
  l.textContent=label;
}

async function init(){
  const now=new Date();
  currentYear=now.getFullYear(); currentMonth=now.getMonth();
  document.getElementById('currentDateBadge').textContent=`${DAY_FULL[now.getDay()]}, ${now.getDate()} ${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
  setupEventListeners();
  setSyncUI('syncing','Memuat...');
  try{
    await loadFromGAS();
    setSyncUI('connected','Terhubung');
  }catch(e){
    loadLocal();
    setSyncUI('','Offline');
    showToast('Gagal konek Sheets, pakai data lokal','error');
  }
  hideOverlay();
  renderAll();
  setupDailyPicker(now);
}

function hideOverlay(){
  const o=document.getElementById('loadingOverlay');
  o.classList.add('hidden');
  setTimeout(()=>o.remove(),400);
}

function renderAll(){
  renderMonthLabel(); renderStats(); renderMonthlyTable(); renderCalendar();
}

function renderMonthLabel(){
  document.getElementById('monthLabel').textContent=`${MONTH_NAMES[currentMonth]} ${currentYear}`;
  document.getElementById('recapMonthLabel').textContent=`${MONTH_NAMES[currentMonth]} ${currentYear}`;
  // Show period subtitle in month-sub
  const sub=document.querySelector('.month-sub');
  if(sub) sub.textContent=`Periode: ${periodLabel(currentYear,currentMonth)}`;
}

function renderStats(){
  const dates=getPeriodDates(currentYear,currentMonth);
  let totalWorkdays=0,totalPatients=0;
  const tracked=new Set();
  const totals={};
  therapists.forEach(t=>totals[t]=0);
  dates.forEach(dt=>{
    if(isWork(dt)) totalWorkdays++;
    const k=toKey(dt);
    const rec=data[k]||{};
    Object.entries(rec).forEach(([n,c])=>{if(therapists.includes(n)){totals[n]=(totals[n]||0)+c;totalPatients+=c;if(c>0)tracked.add(k);}});
  });

  document.getElementById('statsSection').innerHTML=`
    <div class="stat-card"><div class="stat-icon purple"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div><div><div class="stat-value">${totalPatients}</div><div class="stat-label">Total Pasien Bulan Ini</div></div></div>
    <div class="stat-card"><div class="stat-icon teal"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div><div><div class="stat-value">${tracked.size} <span style="font-size:1rem;color:var(--text3)">/ ${totalWorkdays}</span></div><div class="stat-label">Hari Kerja Tercatat</div></div></div>

    <div class="stat-card"><div class="stat-icon pink"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></div><div><div class="stat-value">${therapists.length}</div><div class="stat-label">Terapis Aktif</div></div></div>`;
}

function setupDailyPicker(date){
  const p=document.getElementById('dailyDatePicker');
  p.value=toKey(date);
  renderDailyInput(date);
  p.onchange=()=>renderDailyInput(new Date(p.value+'T00:00:00'));
}

function renderDailyInput(date){
  const key=toKey(date);
  const badge=document.getElementById('dayStatusBadge');
  const area=document.getElementById('dailyInputArea');
  const work=isWork(date);
  const natHol=isHoliday(date);
  if(!work){
    badge.className='day-status-badge holiday';
    const reason=natHol?'Libur Nasional / Cuti Bersama':(WORK_DAYS.includes(date.getDay())?'Libur':'Jadwal: Selasa–Sabtu');
    badge.textContent=`${DAY_FULL[date.getDay()]} — ${reason}`;
    area.innerHTML=`<div class="holiday-notice"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><h3>Hari Libur</h3><p>${reason}</p></div>`;
    return;
  }
  badge.className='day-status-badge workday';
  badge.textContent=`${DAY_FULL[date.getDay()]} — Hari Kerja`;
  const rec=data[key]||{};
  if(!therapists.length){area.innerHTML=`<div class="empty-state"><h3>Belum ada terapis</h3><p>Tambahkan terapis melalui menu Terapis</p></div>`;return;}
  area.innerHTML=`<div class="therapist-input-grid">${therapists.map((name,i)=>{
    const count=rec[name]||0;
    const saved=rec[name]!==undefined;
    return `<div class="therapist-input-card">
      <div class="therapist-card-header">
        <div class="therapist-avatar" style="${avatarStyle(i)}">${initials(name)}</div>
        <div><div class="therapist-name">${name}</div><div class="therapist-role">Terapis</div></div>
      </div>
      <div class="patient-counter">
        <button class="counter-btn minus" onclick="changeCount('${key}','${name}',-1,${i})">−</button>
        <div class="counter-display">
          <input class="counter-manual" type="number" min="0" max="99" id="inp-${i}" value="${count}" oninput="markUnsaved(${i})"/>
          <div class="counter-label">pasien</div>
        </div>
        <button class="counter-btn plus" onclick="changeCount('${key}','${name}',1,${i})">+</button>
      </div>
      <button class="save-btn ${saved?'saved':''}" id="sbtn-${i}" onclick="saveEntry('${key}','${name}',${i})">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        ${saved?'Tersimpan':'Simpan'}
      </button>
    </div>`;
  }).join('')}</div>`;
}

function changeCount(key,name,delta,i){
  const inp=document.getElementById(`inp-${i}`);
  inp.value=Math.max(0,(parseInt(inp.value)||0)+delta);
  markUnsaved(i);
}
function markUnsaved(i){
  const b=document.getElementById(`sbtn-${i}`);
  if(b){b.className='save-btn';b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>Simpan';}
}

async function saveEntry(key,name,i){
  const btn=document.getElementById(`sbtn-${i}`);
  const count=Math.max(0,parseInt(document.getElementById(`inp-${i}`).value)||0);
  if(!data[key]) data[key]={};
  data[key][name]=count;
  btn.textContent='Menyimpan...'; btn.disabled=true;
  if(gasUrl){
    try{ await gasGet({action:'saveEntry',date:key,therapist:name,count}); }
    catch(e){ showToast('Gagal simpan ke Sheets: '+e.message,'error'); }
  }
  cacheLocal();
  btn.disabled=false; btn.className='save-btn saved';
  btn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>Tersimpan';
  showToast(`${name}: ${count} pasien tersimpan`,'success');
  renderStats(); renderMonthlyTable(); renderCalendar();
}

function renderMonthlyTable(){
  const dates=getPeriodDates(currentYear,currentMonth);
  const totals={},workdays={};
  therapists.forEach(t=>{totals[t]=0;workdays[t]=0;});
  const rows=[];
  dates.forEach(dt=>{
    if(!isWork(dt)) return;
    const k=toKey(dt);
    const rec=data[k]||{};
    const entry={d:dt.getDate(),mo:dt.getMonth(),yr:dt.getFullYear(),day:DAY_FULL[dt.getDay()],counts:{}};
    therapists.forEach(t=>{entry.counts[t]=rec[t]||0;if(rec[t]){totals[t]+=rec[t];workdays[t]++;}});
    rows.push(entry);
  });
  if(!therapists.length){document.getElementById('monthlyTable').innerHTML='<div class="empty-state"><h3>Belum ada terapis</h3></div>';return;}
  const grand=therapists.reduce((s,t)=>s+totals[t],0);
  const pLabel=periodLabel(currentYear,currentMonth);
  document.getElementById('monthlyTable').innerHTML=`<div class="table-wrapper"><table class="data-table">
    <thead><tr><th colspan="${therapists.length+2}" style="color:var(--secondary);font-size:.8rem;text-transform:none">📅 Periode: ${pLabel}</th></tr><tr><th>Tanggal</th>${therapists.map((t,i)=>`<th style="color:${avatarColor(i)}">${t}</th>`).join('')}<th>Total</th></tr></thead>
    <tbody>
      ${rows.map(r=>`<tr><td><strong>${r.d}</strong><span style="color:var(--text3);font-size:.72rem;margin-left:4px">${MONTH_NAMES[r.mo].slice(0,3)}</span> <span style="color:var(--text3);font-size:.78rem">${r.day}</span></td>${therapists.map(t=>`<td>${r.counts[t]>0?`<span class="badge-count">${r.counts[t]}</span>`:'<span style="color:var(--text3)">—</span>'}</td>`).join('')}<td><span class="badge-count">${therapists.reduce((s,t)=>s+r.counts[t],0)}</span></td></tr>`).join('')}
      <tr><td style="color:var(--text3);font-size:.78rem">Hari aktif</td>${therapists.map(t=>`<td><span class="badge-workdays">${workdays[t]} hr</span></td>`).join('')}<td>—</td></tr>
      <tr class="total-row"><td>TOTAL</td>${therapists.map(t=>`<td><span class="badge-count">${totals[t]}</span></td>`).join('')}<td><span class="badge-count">${grand}</span></td></tr>
    </tbody>
  </table></div>`;
}

function renderCalendar(){
  const first=new Date(currentYear,currentMonth,1).getDay();
  const daysInMonth=new Date(currentYear,currentMonth+1,0).getDate();
  const today=toKey(new Date());
  const periodSet=new Set(getPeriodDates(currentYear,currentMonth).map(d=>toKey(d)));
  let cells='';
  for(let i=0;i<first;i++) cells+=`<div class="cal-cell empty-cell"></div>`;
  for(let d=1;d<=daysInMonth;d++){
    const dt=new Date(currentYear,currentMonth,d);
    const k=toKey(dt);
    const work=isWork(dt);
    const natHol=isHoliday(dt);
    const inPeriod=periodSet.has(k);
    const isToday=k===today;
    const rec=data[k]||{};
    const total=therapists.reduce((s,t)=>s+(rec[t]||0),0);
    const dots=work&&total>0?therapists.filter(t=>rec[t]>0).slice(0,3).map(t=>`<div class="cal-therapist-dot">${t}: ${rec[t]}</div>`).join(''):'';
    const extra=natHol?`<div style="font-size:.58rem;color:#ff6584;margin-top:1px">🎌 Libur</div>`:
      (!inPeriod?`<div style="font-size:.58rem;color:var(--text3);margin-top:1px">luar periode</div>`:'');
    cells+=`<div class="cal-cell ${work?'workday-cell':'holiday-cell'} ${isToday?'today-cell':''} ${!inPeriod?'out-period-cell':''}">
      <div class="cal-date">${d}</div>
      ${extra}
      ${work&&total>0?`<div class="cal-total">${total}</div><div class="cal-total-label">pasien</div>`:''}
      <div class="cal-therapists">${dots}</div>
    </div>`;
  }
  document.getElementById('calendarGrid').innerHTML=`
    <div class="calendar-header-row">${DAY_NAMES.map((n,i)=>`<div class="cal-day-name ${WORK_DAYS.includes(i)?'workday':''}">${n}</div>`).join('')}</div>
    <div class="calendar-grid-body">${cells}</div>`;
}

function renderTherapistList(){
  const el=document.getElementById('therapistList');
  if(!therapists.length){el.innerHTML='<div class="empty-state" style="padding:16px"><p>Belum ada terapis.</p></div>';return;}
  el.innerHTML=therapists.map((t,i)=>`<div class="therapist-list-item">
    <div class="therapist-avatar" style="${avatarStyle(i)};width:34px;height:34px;font-size:.8rem;border-radius:8px">${initials(t)}</div>
    <span class="therapist-name-text">${t}</span>
    <button class="therapist-delete-btn" onclick="deleteTherapist(${i})">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
    </button>
  </div>`).join('');
}

async function addTherapist(){
  const inp=document.getElementById('newTherapistName');
  const name=inp.value.trim();
  if(!name){showToast('Masukkan nama terapis','error');return;}
  if(therapists.includes(name)){showToast('Nama sudah ada','error');return;}
  therapists.push(name);
  if(gasUrl){ try{ await gasGet({action:'saveTherapists',list:JSON.stringify(therapists)}); }catch(e){ showToast('Gagal sync ke Sheets','error'); } }
  cacheLocal(); inp.value=''; renderTherapistList(); renderAll(); showToast(`"${name}" ditambahkan`,'success');
}

async function deleteTherapist(i){
  if(!confirm(`Hapus "${therapists[i]}"?`)) return;
  const name=therapists[i];
  therapists.splice(i,1);
  if(gasUrl){ try{ await gasGet({action:'saveTherapists',list:JSON.stringify(therapists)}); }catch(e){ showToast('Gagal sync ke Sheets','error'); } }
  cacheLocal(); renderTherapistList(); renderAll(); showToast(`"${name}" dihapus`,'success');
}

async function syncNow(){
  if(!gasUrl){showToast('Belum terhubung ke Spreadsheet','error');return;}
  const btn=document.getElementById('btnSync');
  btn.classList.add('spinning'); setSyncUI('syncing','Sinkronisasi...');
  try{
    await loadFromGAS();
    setSyncUI('connected','Terhubung');
    renderAll(); renderDailyInput(new Date(document.getElementById('dailyDatePicker').value+'T00:00:00'));
    showToast('Data berhasil disinkronkan','success');
  }catch(e){
    setSyncUI('','Offline'); showToast('Gagal sinkronisasi: '+e.message,'error');
  }
  btn.classList.remove('spinning');
}


function exportCSV(){
  const dates=getPeriodDates(currentYear,currentMonth);
  const rows=[['Periode',periodLabel(currentYear,currentMonth)],[''],['Tanggal','Hari',...therapists,'Total']];
  dates.forEach(dt=>{
    if(!isWork(dt)) return;
    const rec=data[toKey(dt)]||{};
    const counts=therapists.map(t=>rec[t]||0);
    rows.push([`${dt.getDate()}/${dt.getMonth()+1}/${dt.getFullYear()}`,DAY_FULL[dt.getDay()],...counts,counts.reduce((a,b)=>a+b,0)]);
  });
  const totals={};
  therapists.forEach(t=>{ totals[t]=dates.reduce((s,dt)=>{const r=data[toKey(dt)]||{};return s+(r[t]||0);},0); });
  const tvals=therapists.map(t=>totals[t]);
  rows.push(['TOTAL','',...tvals,tvals.reduce((a,b)=>a+b,0)]);
  const csv=rows.map(r=>r.map(c=>`"${c}"`).join(',')).join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'}));
  a.download=`rekap_${MONTH_NAMES[currentMonth]}_${currentYear}.csv`;
  a.click(); showToast('CSV diunduh','success');
}

function showToast(msg,type=''){
  const t=document.getElementById('toast');
  t.textContent=msg; t.className=`toast ${type} show`;
  clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('show'),3000);
}
function openModal(id){document.getElementById(id).classList.add('open');}
function closeModal(id){document.getElementById(id).classList.remove('open');}

function setupEventListeners(){
  document.getElementById('btnPrevMonth').onclick=()=>{currentMonth--;if(currentMonth<0){currentMonth=11;currentYear--;}renderAll();};
  document.getElementById('btnNextMonth').onclick=()=>{currentMonth++;if(currentMonth>11){currentMonth=0;currentYear++;}renderAll();};
  document.querySelectorAll('.tab-btn').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel'+btn.dataset.tab.charAt(0).toUpperCase()+btn.dataset.tab.slice(1)).classList.add('active');
  }));
  document.getElementById('btnManageTherapists').onclick=()=>{renderTherapistList();openModal('modalTherapists');};
  document.getElementById('modalClose').onclick=()=>closeModal('modalTherapists');
  document.getElementById('modalTherapists').onclick=e=>{if(e.target.id==='modalTherapists')closeModal('modalTherapists');};
  document.getElementById('btnAddTherapist').onclick=addTherapist;
  document.getElementById('newTherapistName').onkeydown=e=>{if(e.key==='Enter')addTherapist();};
  document.getElementById('btnSync').onclick=syncNow;
  document.getElementById('btnExportCSV').onclick=exportCSV;
}

document.addEventListener('DOMContentLoaded',init);
