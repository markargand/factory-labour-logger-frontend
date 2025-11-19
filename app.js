// app.js — Known-good minimal full UI (no builds, React UMD)
// This version keeps your key features but avoids super-deep nesting that can cause typo errors.
// If you still see "Loading…", open DevTools > Console for any red errors and tell me the first one.

const { useEffect, useMemo, useState } = React;

// ---------- Utilities ----------
function uid(){ return Math.random().toString(36).slice(2) + Date.now().toString(36); }
const LS_KEY = "factory-labour-logger-v3";

function toMinutes(hhmm){ const [h,m]=(hhmm||"00:00").split(":").map(Number); return h*60+m; }
function fromMinutes(mins){ const h=String(Math.floor(mins/60)).padStart(2,"0"); const m=String(Math.round(mins%60)).padStart(2,"0"); return `${h}:${m}`; }
function roundToIncrement(mins, inc){ const i=Math.max(1,inc|0); return Math.round(mins / i) * i; }
function isoWeekId(d){
  const date=new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate()+4-(date.getUTCDay()||7));
  const yearStart=new Date(Date.UTC(date.getUTCFullYear(),0,1));
  const weekNo=Math.ceil(((date-yearStart)/86400000+1)/7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2,"0")}`;
}

// ---------- Small helpers ----------
function FieldLabel(text){ return React.createElement("label",{className:"block text-sm font-medium mb-1"}, text); }

function QuickAdd({ onAdd, label="Add", placeholder="" }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  if(!open){
    return React.createElement("div",{className:"mt-2"},
      React.createElement("button",{className:"text-xs text-slate-700 underline",onClick:()=>setOpen(true)}, `+ ${label}`)
    );
  }
  return React.createElement("div",{className:"mt-2 flex gap-2"},
    React.createElement("input",{type:"text",className:"flex-1 rounded-xl border-slate-300 focus:ring-2 focus:ring-slate-400",placeholder,value:val,onChange:e=>setVal(e.target.value)}),
    React.createElement("button",{className:"px-3 rounded-xl border border-slate-300 hover:bg-slate-50",onClick:()=>{ const n=val.trim(); if(n) onAdd(n); setVal(""); setOpen(false); }},"Add"),
    React.createElement("button",{className:"px-3 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50",onClick:()=>setOpen(false)},"Cancel")
  );
}

function QuickAddProject({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  if(!open){
    return React.createElement("div",{className:"mt-2"},
      React.createElement("button",{className:"text-xs text-slate-700 underline",onClick:()=>setOpen(true)}, "+ Add project")
    );
  }
  return React.createElement("div",{className:"mt-2 grid grid-cols-5 gap-2"},
    React.createElement("input",{className:"col-span-2 rounded-xl border-slate-300 focus:ring-2 focus:ring-slate-400",placeholder:"Code (e.g. PRJ-1234)",value:code,onChange:e=>setCode(e.target.value)}),
    React.createElement("input",{className:"col-span-3 rounded-xl border-slate-300 focus:ring-2 focus:ring-slate-400",placeholder:"Name",value:name,onChange:e=>setName(e.target.value)}),
    React.createElement("div",{className:"col-span-5 flex gap-2"},
      React.createElement("button",{className:"px-3 rounded-xl border border-slate-300 hover:bg-slate-50",onClick:()=>{ const c=code.trim(), n=name.trim(); if(c&&n) onAdd(c,n); setCode(""); setName(""); setOpen(false); }},"Add"),
      React.createElement("button",{className:"px-3 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50",onClick:()=>setOpen(false)},"Cancel")
    )
  );
}

// ---------- Main App ----------
function App(){
  // Auth
  const [auth, setAuth] = useState({ user:null, token:null });
  const [showLogin, setShowLogin] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPass, setLoginPass] = useState("");

  // Seed data
  const defaultEmployees = [
    { id: "e1", name: "Alice", badge: "BADGE-ALICE", pin: "1111" },
    { id: "e2", name: "Brian", badge: "BADGE-BRIAN", pin: "2222" },
    { id: "e3", name: "Caroline", badge: "BADGE-CARO", pin: "3333" }
  ];
  const defaultProjects = [
    { id: "p1", code: "PRJ-1001", name: "Stainless Tanks" },
    { id: "p2", code: "PRJ-1002", name: "Conveyor Retrofit" },
    { id: "p3", code: "PRJ-1003", name: "Boiler Housing" }
  ];

  // App state
  const [employees, setEmployees] = useState(defaultEmployees);
  const [projects, setProjects] = useState(defaultProjects);
  const [entries, setEntries] = useState([]);

  // Settings
  const [roundingMin, setRoundingMin] = useState(15);
  const [otDailyThreshold, setOtDailyThreshold] = useState(8);
  const [apiBase, setApiBase] = useState("https://factory-labour-logger-backend.onrender.com");
  const [syncMsg, setSyncMsg] = useState("");

// --- Cloud API helpers ---
async function apiGET(path){
  const res = await fetch(apiBase.replace(/\/+$/,'') + path);
  if(!res.ok) throw new Error(await res.text());
  return res.json();
}

async function apiPOST(path, data){
  const res = await fetch(apiBase.replace(/\/+$/,'') + path, {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify(data)
  });
  if(!res.ok) throw new Error(await res.text());
}

// --- Map frontend <-> backend shapes ---
function toServerEntry(e){
  return {
    id: e.id,
    employee_id: e.employeeId,
    project_id: e.projectId,
    date: e.date,
    start: e.start,
    end: e.end,
    break_min: Number(e.breakMin ?? 0),
    work_type: e.workType ?? "",
    notes: e.notes ?? "",
    hours: Number(e.hours ?? 0),
    rounded_from_min: Number(e.roundedFromMin ?? Math.round((Number(e.hours || 0) * 60))),
    rounding_min: Number(e.roundingMin ?? 15),
    status: e.status ?? "pending",
    locked: !!e.locked,
    created_at: e.createdAt ?? new Date().toISOString(),
  };
}

function fromServerEntry(e){
  return {
    id: e.id,
    employeeId: e.employee_id,
    projectId: e.project_id,
    date: e.date,
    start: e.start,
    end: e.end,
    breakMin: e.break_min,
    workType: e.work_type,
    notes: e.notes,
    hours: e.hours,
    roundedFromMin: e.rounded_from_min,
    roundingMin: e.rounding_min,
    status: e.status,
    locked: e.locked,
    createdAt: e.created_at,
  };
}
  
  // Kiosk
  const [kiosk, setKiosk] = useState(false);
  const [kioskPin, setKioskPin] = useState("");
  const [kioskEmployeeId, setKioskEmployeeId] = useState("");
  const [kioskProjectId, setKioskProjectId] = useState("");
  const [kioskRunning, setKioskRunning] = useState(null);

  // Form
  const [employeeId, setEmployeeId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [barcode, setBarcode] = useState("");
  const [date, setDate] = useState(()=> new Date().toISOString().slice(0,10));
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("16:30");
  const [breakMin, setBreakMin] = useState(30);
  const [workType, setWorkType] = useState("Fabrication");
  const [notes, setNotes] = useState("");
  const [manualHours, setManualHours] = useState("");
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");

  // Filters & reports
  const [search, setSearch] = useState("");
  const [filterProject, setFilterProject] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [weekIso, setWeekIso] = useState(()=> isoWeekId(new Date()));
  const [reportWeek, setReportWeek] = useState(()=> isoWeekId(new Date()));

  // Load/save localStorage
  useEffect(() => {
    try{
      const raw=localStorage.getItem(LS_KEY);
      if(raw){
        const p=JSON.parse(raw);
        if(p.employees) setEmployees(p.employees);
        if(p.projects) setProjects(p.projects);
        if(p.entries) setEntries(p.entries);
        if(p.settings){ setRoundingMin(p.settings.roundingMin??15); setOtDailyThreshold(p.settings.otDailyThreshold??8); }
        if(p.apiBase) setApiBase(p.apiBase);
      }
    }catch(e){ console.error("localStorage parse failed", e); }
  },[]);
  useEffect(()=>{
    localStorage.setItem(LS_KEY, JSON.stringify({employees,projects,entries,settings:{roundingMin,otDailyThreshold},apiBase}));
  },[employees,projects,entries,roundingMin,otDailyThreshold,apiBase]);

  const employeeById = useMemo(()=> Object.fromEntries(employees.map(e=>[e.id,e])), [employees]);
  const projectById = useMemo(()=> Object.fromEntries(projects.map(p=>[p.id,p])), [projects]);

  function computeRawMinutes(dateStr,startStr,endStr,breakMinutes){
    if(!dateStr||!startStr||!endStr) return 0;
    const diff = toMinutes(endStr)-toMinutes(startStr)-(Number.isFinite(+breakMinutes)?breakMinutes:0);
    return Math.max(0,diff);
  }
  const computed = useMemo(()=>{
    const rawMins = manualHours!==""? Math.max(0,Math.round(parseFloat(manualHours)*60)) : computeRawMinutes(date,start,end,Number(breakMin));
    const roundedMins = roundToIncrement(rawMins, Math.max(1, roundingMin));
    return { rawMins, roundedMins, hours: +(roundedMins/60).toFixed(2) };
  },[date,start,end,breakMin,manualHours,roundingMin]);

  function resetForm(){
    setProjectId("");
    setBarcode("");
    setWorkType("Fabrication");
    setNotes("");
    setManualHours("");
    setBreakMin(30);
    setStart("08:00");
    setEnd("16:30");
    setError("");
    setOkMsg("");
  }
  function addEmployee(name){
    const n=name?.trim(); if(!n) return;
    if(employees.some(e=>e.name.toLowerCase()===n.toLowerCase())) return;
    setEmployees([...employees,{id:uid(),name:n}]);
  }
  function addProject(code,name){
    const c=code?.trim(), n=name?.trim(); if(!c||!n) return;
    if(projects.some(p=>p.code.toLowerCase()===c.toLowerCase())) return;
    setProjects([...projects,{id:uid(),code:c,name:n}]);
  }

  function parseCsvRow(row){
    const out=[]; let cur="",q=false;
    for(let i=0;i<row.length;i++){
      const ch=row[i];
      if(ch==='"'){ if(q && row[i+1]==='"'){ cur+='"'; i++; } else { q=!q; } }
      else if(ch==="," && !q){ out.push(cur); cur=""; }
      else { cur+=ch; }
    }
    out.push(cur);
    return out;
  }
  function importProjectsCsv(file){
    const r=new FileReader();
    r.onload=()=>{
      const text=r.result?.toString()||"";
      const rows=text.split(/\r?\n/).filter(Boolean);
      const [h,...data]=rows;
      const headers=h.split(",").map(s=>s.trim().toLowerCase());
      const ci=headers.indexOf("code"), ni=headers.indexOf("name");
      if(ci===-1||ni===-1){ alert("CSV must have headers: code,name"); return; }
      const add=[];
      for(const row of data){
        const cols=parseCsvRow(row);
        const code=(cols[ci]||"").trim();
        const name=(cols[ni]||"").trim();
        if(!code||!name) continue;
        if(!projects.some(p=>p.code.toLowerCase()===code.toLowerCase())) add.push({id:uid(),code,name});
      }
      if(add.length) setProjects(prev=>[...prev,...add]);
      alert(`Imported ${add.length} new projects`);
    };
    r.readAsText(file);
  }

  function handleBarcodeEnter(e){
    if(e.key==="Enter"){
      const code=barcode.trim();
      const p=projects.find(p=>p.code.toLowerCase()===code.toLowerCase());
      if(p){ setProjectId(p.id); setOkMsg(`Project set: ${p.code}`); }
      else setError(`No project with code ${code}`);
      setBarcode("");
    }
  }

  function addEntry(){
    setError(""); setOkMsg("");
    if(!employeeId) return setError("Select an employee");
    if(!projectId) return setError("Select a project");
    if(!date) return setError("Pick a date");
    const hrs=computed.hours;
    if(!Number.isFinite(hrs)||hrs<=0) return setError("Hours must be > 0");
    if(manualHours===""){
      if(toMinutes(end)<=toMinutes(start)) return setError("End time must be after start time");
      if(breakMin<0||breakMin>240) return setError("Break minutes should be between 0 and 240");
    }
    const entry={
      id:uid(), employeeId, projectId, date, start, end,
      breakMin:Number(breakMin)||0, workType, notes:notes.trim(),
      hours:+hrs.toFixed(2), roundedFromMin:computed.rawMins, roundingMin,
      status:"pending", locked:false, createdAt:new Date().toISOString()
    };
    setEntries(prev=>[entry,...prev]); setOkMsg("Entry added"); resetForm();
  }
  function deleteEntry(id){
    const e=entries.find(x=>x.id===id);
    if(e?.locked) return alert("Approved entries are locked.");
    setEntries(prev=>prev.filter(e=>e.id!==id));
  }
  function setStatus(id,status){
    setEntries(prev=> prev.map(e=> e.id===id ? {...e,status,locked:(status==="approved") ? true : e.locked} : e ));
  }

  const visibleEntries = useMemo(()=>{
    return entries.filter(e=>{
      if(filterProject && e.projectId!==filterProject) return false;
      if(fromDate && e.date<fromDate) return false;
      if(toDate && e.date>toDate) return false;
      if(search){
        const q=search.toLowerCase();
        const emp=(employeeById[e.employeeId]?.name||"").toLowerCase();
        const proj=(projectById[e.projectId]?.name||"").toLowerCase();
        const code=(projectById[e.projectId]?.code||"").toLowerCase();
        const note=(e.notes||"").toLowerCase();
        const type=(e.workType||"").toLowerCase();
        if(!( `${emp} ${proj} ${code} ${note} ${type} ${e.status}`.includes(q))) return false;
      }
      return true;
    });
  },[entries,filterProject,fromDate,toDate,search,employeeById,projectById]);

  const withOt = useMemo(()=>{
    const by=new Map();
    for(const e of visibleEntries){
      const k=`${e.employeeId}|${e.date}`;
      if(!by.has(k)) by.set(k,[]);
      by.get(k).push(e);
    }
    const res=new Map();
    for(const arr of by.values()){
      arr.sort((a,b)=> toMinutes(a.start)-toMinutes(b.start));
      let cum=0;
      for(const e of arr){
        const hrs=e.hours||0;
        const base=Math.max(0, Math.min(otDailyThreshold - cum, hrs));
        const ot=Math.max(0, hrs - base);
        res.set(e.id,{base,ot});
        cum+=hrs;
      }
    }
    return res;
  },[visibleEntries,otDailyThreshold]);

  const totals = useMemo(()=>{
    let totalHours=0,totalBase=0,totalOt=0;
    const byProject={}, byEmployee={};
    for(const e of visibleEntries){
      const hrs=e.hours||0; totalHours+=hrs;
      const alloc=withOt.get(e.id)||{base:hrs,ot:0};
      totalBase+=alloc.base; totalOt+=alloc.ot;
      byProject[e.projectId]=(byProject[e.projectId]||0)+hrs;
      byEmployee[e.employeeId]=(byEmployee[e.employeeId]||0)+hrs;
    }
    return { totalHours,totalBase,totalOt, byProject,byEmployee };
  },[visibleEntries,withOt]);

  const report = useMemo(()=>{
    const target=reportWeek;
    const rows=entries.filter(e=> isoWeekId(new Date(e.date))===target);
    const byEmp=new Map(), byProj=new Map();
    for(const e of rows){
      const alloc=withOt.get(e.id)||{base:e.hours||0,ot:0};
      const emp=employeeById[e.employeeId]?.name||"";
      const proj=projectById[e.projectId]?.code||"";
      const er=byEmp.get(emp)||{hours:0,base:0,ot:0};
      er.hours+=(e.hours||0); er.base+=alloc.base; er.ot+=alloc.ot; byEmp.set(emp,er);
      const pr=byProj.get(proj)||{hours:0,base:0,ot:0};
      pr.hours+=(e.hours||0); pr.base+=alloc.base; pr.ot+=alloc.ot; byProj.set(proj,pr);
    }
    return { byEmp: Array.from(byEmp,([k,v])=>({key:k,...v})), byProj: Array.from(byProj,([k,v])=>({key:k,...v})) };
  },[entries,reportWeek,withOt,employeeById,projectById]);

  function csvEscape(v){ if(v===undefined||v===null) return ""; const s=String(v); if(s.includes(",")||s.includes("\n")||s.includes('"')) return '"'+s.replaceAll('"','""')+'"'; return s; }
  function toCSV(rows){
    const header=['Date','Employee','Project Code','Project Name','Work Type','Start','End','Break (min)','Hours','Base','OT','Status','Notes'];
    const lines=rows.map(r=>{
      const alloc=withOt.get(r.id)||{base:r.hours||0,ot:0};
      return [
        r.date, employeeById[r.employeeId]?.name||'', projectById[r.projectId]?.code||'', projectById[r.projectId]?.name||'',
        r.workType, r.start, r.end, r.breakMin, r.hours??0, alloc.base, alloc.ot, r.status, (r.notes||'').replaceAll('\n',' ')
      ];
    });
    return header.join(',')+'\n'+lines.map(row=>row.map(csvEscape).join(',')).join('\n');
  }
  function downloadCSV(){
    const csv=toCSV(visibleEntries);
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download=`labour-hours-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  async function exportXLSX(){
    try{
      const XLSX = await import("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm");
      const wb=XLSX.utils.book_new();
      const s1=XLSX.utils.json_to_sheet(report.byEmp.map(r=>({Employee:r.key,Hours:+r.hours.toFixed(2),Base:+r.base.toFixed(2),OT:+r.ot.toFixed(2)})));
      const s2=XLSX.utils.json_to_sheet(report.byProj.map(r=>({Project:r.key,Hours:+r.hours.toFixed(2),Base:+r.base.toFixed(2),OT:+r.ot.toFixed(2)})));
      XLSX.utils.book_append_sheet(wb,s1,"By Employee");
      XLSX.utils.book_append_sheet(wb,s2,"By Project");
      const today=new Date().toISOString().slice(0,10);
      XLSX.writeFile(wb,`labour-report-${reportWeek}-${today}.xlsx`);
    }catch(e){ alert("XLSX export failed: "+e.message); }
  }
  async function exportPDF(){
    try{
      const { jsPDF } = await import("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.es.min.js");
      await import("https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js");
      const doc=new jsPDF();
      doc.setFontSize(14); doc.text(`Labour Report — Week ${reportWeek}`,14,16);
      doc.setFontSize(10); doc.text(`Generated: ${new Date().toLocaleString()}`,14,22);
      doc.autoTable({ head:[["Employee","Hours","Base","OT"]], body: report.byEmp.map(r=>[r.key,r.hours.toFixed(2),r.base.toFixed(2),r.ot.toFixed(2)]), startY:28 });
      const y=doc.lastAutoTable.finalY+8;
      doc.autoTable({ head:[["Project","Hours","Base","OT"]], body: report.byProj.map(r=>[r.key,r.hours.toFixed(2),r.base.toFixed(2),r.ot.toFixed(2)]), startY:y });
      const today=new Date().toISOString().slice(0,10);
      doc.save(`labour-report-${reportWeek}-${today}.pdf`);
    }catch(e){ alert("PDF export failed: "+e.message); }
  }

  async function login(){
    setSyncMsg("");
    try{
      const body=new URLSearchParams();
      body.set("username",loginEmail);
      body.set("password",loginPass);
      const r=await fetch(apiBase.replace(/\/+$/,"")+"/auth/login",{method:"POST", body});
      if(!r.ok) throw new Error((await r.text())||"Login error");
      const data=await r.json();
      setAuth({user:data.user, token:data.token});
      setShowLogin(false);
      setSyncMsg("Signed in ✔");
    }catch(e){ setSyncMsg("Login failed: "+e.message); }
  }
  function logout(){ setAuth({user:null,token:null}); }
  function syncNow(){
    if(!apiBase){ setSyncMsg("Add API base URL first"); return; }
    setSyncMsg("Syncing... (demo)"); setTimeout(()=> setSyncMsg("Synced ✔"), 600);
  }
  function approveWeek(){
    const target=weekIso;
    setEntries(prev=> prev.map(e=> isoWeekId(new Date(e.date))===target ? {...e,status:"approved",locked:true} : e));
  }
  function rejectWeek(){
    const target=weekIso;
    setEntries(prev=> prev.map(e=> isoWeekId(new Date(e.date))===target ? {...e,status:"rejected",locked:false} : e));
  }

  // ---------- UI ----------
  // Header
  const header = React.createElement("header",{className:"sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-200"},
    React.createElement("div",{className:"max-w-6xl mx-auto px-4 py-4 flex items-center justify-between"},
      React.createElement("h1",{className:"text-2xl font-bold"},"Factory Labour Logger"),
      React.createElement("div",{className:"flex items-center gap-3"},
        React.createElement("div",{className:"hidden md:block text-sm text-slate-600"}, auth.user? `${auth.user.name} • ${auth.user.role}` : "Not signed in"),
        !auth.user
          ? React.createElement("button",{className:"px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50",onClick:()=>setShowLogin(true)},"Sign in")
          : React.createElement("button",{className:"px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50",onClick:logout},"Sign out")
      )
    )
  );

  // Login modal
  const loginModal = !showLogin ? null : React.createElement("div",{className:"fixed inset-0 bg-black/30 flex items-center justify-center p-4"},
    React.createElement("div",{className:"bg-white rounded-2xl shadow p-4 md:p-6 w-full max-w-sm"},
      React.createElement("h2",{className:"text-lg font-semibold mb-3"},"Sign in"),
      React.createElement("div",{className:"space-y-2"},
        React.createElement("input",{className:"w-full rounded-xl border-slate-300 focus:ring-2 focus:ring-slate-400",placeholder:"email",value:loginEmail,onChange:e=>setLoginEmail(e.target.value)}),
        React.createElement("input",{type:"password",className:"w-full rounded-xl border-slate-300 focus:ring-2 focus:ring-slate-400",placeholder:"password",value:loginPass,onChange:e=>setLoginPass(e.target.value)}),
        React.createElement("div",{className:"flex gap-2 justify-end pt-2"},
          React.createElement("button",{className:"px-3 py-1.5 rounded-lg border border-slate-300",onClick:()=>setShowLogin(false)},"Cancel"),
          React.createElement("button",{className:"px-3 py-1.5 rounded-lg bg-slate-900 text-white",onClick:login},"Sign in")
        ),
        syncMsg && React.createElement("div",{className:"text-xs text-slate-600"},syncMsg)
      )
    )
  );

// Settings & Cloud
const settings = React.createElement("section",{className:"bg-white rounded-2xl shadow p-4 md:p-6"},
  React.createElement("h2",{className:"text-lg font-semibold mb-4"},"Policies, Cloud & Modes"),
  React.createElement("div",{className:"grid md:grid-cols-8 gap-3 items-end"},
    React.createElement("div",null,
      FieldLabel("Rounding (minutes)"),
      React.createElement("input",{type:"number",min:1,className:"w-full rounded-xl border-slate-300 focus:ring-2 focus:ring-slate-400",value:roundingMin,onChange:e=>setRoundingMin(Math.max(1,Number(e.target.value)))})),
    React.createElement("div",null,
      FieldLabel("Daily OT threshold (hours)"),
      React.createElement("input",{type:"number",min:0,step:"0.25",className:"w-full rounded-xl border-slate-300 focus:ring-2 focus:ring-slate-400",value:otDailyThreshold,onChange:e=>setOtDailyThreshold(Math.max(0,Number(e.target.value)))})),
    React.createElement("div",{className:"md:col-span-3"},
      FieldLabel("API base URL"),
      React.createElement("input",{type:"text",className:"w-full rounded-xl border-slate-300 focus:ring-2 focus:ring-slate-400",value:apiBase,onChange:e=>setApiBase(e.target.value)})),
    React.createElement("div",{className:"flex items-end gap-2 flex-wrap"},
      // Existing buttons
      React.createElement("button",{onClick:syncNow,className:"px-3 py-2 rounded-xl border border-slate-300 hover:bg-slate-50"},"Sync now"),
      React.createElement("button",{onClick:()=>setKiosk(v=>!v),className:"px-3 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800"}, kiosk ? "Exit kiosk" : "Enter kiosk"),

      // NEW: Save to cloud
      React.createElement("button",{
        className:"px-3 py-2 rounded-xl border border-slate-300 hover:bg-slate-50",
        onClick: async ()=>{
          try{
            const payload = entries.map(toServerEntry);
            await apiPOST('/entries/', payload);
            setSyncMsg('Saved to cloud ✔');
          }catch(e){
            setSyncMsg('Save failed: ' + e.message);
          }
        }
      },"Save to cloud"),

      // NEW: Load from cloud
      React.createElement("button",{
        className:"px-3 py-2 rounded-xl border border-slate-300 hover:bg-slate-50",
        onClick: async ()=>{
          try{
            const data = await apiGET('/entries/');
            const mapped = Array.isArray(data) ? data.map(fromServerEntry) : [];
            setEntries(mapped);
            setSyncMsg('Loaded from cloud ✔');
          }catch(e){
            setSyncMsg('Load failed: ' + e.message);
          }
        }
      },"Load from cloud")
    )
  ),
  syncMsg && React.createElement("div",{className:"text-xs text-slate-600 mt-2"}, syncMsg)
);

  // Kiosk
  const kioskSection = !kiosk ? null : React.createElement("section",{className:"bg-white rounded-2xl shadow p-4 md:p-6"},
    React.createElement("h2",{className:"text-lg font-semibold mb-4"},"Kiosk Mode"),
    React.createElement("div",{className:"grid md:grid-cols-3 gap-3 items-end"},
      React.createElement("div",null,
        FieldLabel("Employee PIN / Badge / Name"),
        React.createElement("input",{className:"w-full rounded-xl border-slate-300 focus:ring-2 focus:ring-slate-400 text-2xl",value:kioskPin,onChange:e=>setKioskPin(e.target.value),placeholder:"Scan badge or type"}),
        React.createElement("button",{className:"mt-2 px-3 py-2 rounded-xl border border-slate-300 hover:bg-slate-50",onClick:()=>{
          const v=kioskPin.trim().toLowerCase();
          const emp=employees.find(e=>
            e.name.toLowerCase()===v || e.id.toLowerCase()===v || (e.badge||"").toLowerCase()===v || (e.pin||"").toLowerCase()===v
          );
          if(emp) setKioskEmployeeId(emp.id); else alert("No matching employee");
        }},"Select employee"),
        kioskEmployeeId && React.createElement("div",{className:"text-sm text-slate-600 mt-1"},
          "Selected: ", React.createElement("span",{className:"font-semibold"}, employeeById[kioskEmployeeId]?.name))
      ),
      React.createElement("div",null,
        FieldLabel("Project (scan or pick)"),
        React.createElement("select",{className:"w-full rounded-xl border-slate-300 focus:ring-2 focus:ring-slate-400 text-lg",value:kioskProjectId,onChange:e=>setKioskProjectId(e.target.value)},
          React.createElement("option",{value:""},"Select..."),
          projects.map(p=> React.createElement("option",{key:p.id,value:p.id}, `${p.code} — ${p.name}`))
        )
      ),
      React.createElement("div",{className:"flex gap-2 items-end"},
        !kioskRunning
          ? React.createElement("button",{className:"w-full px-4 py-6 rounded-2xl bg-emerald-600 text-white text-xl",onClick:()=>setKioskRunning({startISO:new Date().toISOString()})},"Start")
          : React.createElement("button",{className:"w-full px-4 py-6 rounded-2xl bg-red-600 text-white text-xl",onClick:()=>{
              const startISO=kioskRunning.startISO;
              const startDt=new Date(startISO), endDt=new Date();
              const mins=Math.max(0,Math.round((endDt-startDt)/60000));
              const rounded= roundToIncrement(Math.max(0, mins-(Number(breakMin)||0)), Math.max(1, roundingMin));
              const hrs= +(rounded/60).toFixed(2);
              const entry={ id:uid(), employeeId:kioskEmployeeId, projectId:kioskProjectId, date:new Date().toISOString().slice(0,10),
                start: fromMinutes(toMinutes(`${String(startDt.getHours()).padStart(2,"0")}:${String(startDt.getMinutes()).padStart(2,"0")}`)),
                end: fromMinutes(toMinutes(`${String(endDt.getHours()).padStart(2,"0")}:${String(endDt.getMinutes()).padStart(2,"0")}`)),
                breakMin:Number(breakMin)||0, workType:"Kiosk", notes:"", hours:hrs, roundedFromMin:mins, roundingMin, status:"pending", locked:false, createdAt:new Date().toISOString()
              };
              setEntries(prev=>[entry,...prev]); setKioskRunning(null);
            }},"Stop")
      )
    ),
    kioskRunning && React.createElement("div",{className:"mt-3 text-sm text-slate-600"},"Running since: ", new Date(kioskRunning.startISO).toLocaleTimeString())
  );

  // Log Hours
  const logHours = React.createElement("section",{className:"bg-white rounded-2xl shadow p-4 md:p-6"},
    React.createElement("h2",{className:"text-lg font-semibold mb-4"},"Log Hours"),
    error && React.createElement("div",{className:"mb-3 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700"}, error),
    okMsg && React.createElement("div",{className:"mb-3 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800"}, okMsg),
    React.createElement("div",{className:"grid md:grid-cols-4 gap-3"},
      React.createElement("div",null, FieldLabel("Employee"),
        React.createElement("select",{className:"w-full rounded-xl border-slate-300 focus:ring-2 focus:ring-slate-400",value:employeeId,onChange:e=>setEmployeeId(e.target.value)},
          React.createElement("option",{value:""},"Select..."),
          employees.map(e=> React.createElement("option",{key:e.id,value:e.id}, e.name))
        ),
        React.createElement(QuickAdd,{onAdd:addEmployee,label:"Add employee",placeholder:"e.g. David"})
      ),
      React.createElement("div",null, FieldLabel("Project"),
        React.createElement("select",{className:"w-full rounded-xl border-slate-300 focus:ring-2 focus:ring-slate-400",value:projectId,onChange:e=>setProjectId(e.target.value)},
          React.createElement("option",{value:""},"Select..."),
          projects.map(p=> React.createElement("option",{key:p.id,value:p.id}, `${p.code} — ${p.name}`))
        ),
        React.createElement(QuickAddProject,{onAdd:addProject}),
        React.createElement("div",{className:"mt-2"}, React.createElement("label",{className:"block text-xs text-slate-600"},"Barcode scan (project code) — scan then press Enter"),
          React.createElement("input",{type:"text",className:"w-full rounded-xl border-slate-300 focus:ring-2 focus:ring-slate-400",value:barcode,onKeyDown:handleBarcodeEnter,onChange:e=>setBarcode(e.target.value),placeholder:"e.g. PRJ-1002"}))
      ),
      React.createElement("div",null, FieldLabel("Date"),
        React.createElement("input",{type:"date",className:"w-full rounded-xl border-slate-300 focus:ring-2 focus:ring-slate-400",value:date,onChange:e=>setDate(e.target.value)})),
      React.createElement("div",null, FieldLabel("Work Type"),
        React.createElement("input",{type:"text",className:"w-full rounded-xl border-slate-300 focus:ring-2 focus:ring-slate-400",value:workType,onChange:e=>setWorkType(e.target.value),placeholder:"e.g. Fabrication, Assembly, QA"})),
      React.createElement("div",null, FieldLabel("Start"),
        React.createElement("input",{type:"time",className:"w-full rounded-xl border-slate-300 focus:ring-2 focus:ring-slate-400",value:start,onChange:e=>setStart(e.target.value)})),
      React.createElement("div",null, FieldLabel("End"),
        React.createElement("input",{type:"time",className:"w-full rounded-xl border-slate-300 focus:ring-2 focus:ring-slate-400",value:end,onChange:e=>setEnd(e.target.value)})),
      React.createElement("div",null, FieldLabel("Break (minutes)"),
        React.createElement("input",{type:"number",min:0,max:240,className:"w-full rounded-xl border-slate-300 focus:ring-2 focus:ring-slate-400",value:breakMin,onChange:e=>setBreakMin(Number(e.target.value))})),
      React.createElement("div",null, FieldLabel("Manual Hours (optional)"),
        React.createElement("input",{type:"number",step:"0.01",className:"w-full rounded-xl border-slate-300 focus:ring-2 focus:ring-slate-400",value:manualHours,onChange:e=>setManualHours(e.target.value),placeholder:"Override computed hours"}),
        React.createElement("div",{className:"text-xs text-slate-500 mt-1"},"Computed (rounded): ",
          React.createElement("span",{className:"font-semibold"}, (+(computed.hours||0)).toFixed(2) ), " h"
        )
      )
    ),
    React.createElement("div",{className:"mt-4 flex items-center justify-between"},
      React.createElement("div",{className:"text-sm text-slate-600"},"Rounded from ", Math.max(0, computed.rawMins), " mins → ",
        React.createElement("span",{className:"font-semibold"}, (+(computed.hours||0)).toFixed(2), " h")
      ),
      React.createElement("div",{className:"flex gap-2"},
        React.createElement("button",{onClick:addEntry,className:"px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800"},"Add Entry"),
        React.createElement("button",{onClick:()=>resetForm(),className:"px-4 py-2 rounded-xl border border-slate-300 hover:bg-slate-50"},"Reset")
      )
    )
  );

  // Filters & Summary
  const summary = React.createElement("section",{className:"bg-white rounded-2xl shadow p-4 md:p-6"},
    React.createElement("div",{className:"grid md:grid-cols-6 gap-3 items-end"},
      React.createElement("div",{className:"md:col-span-2"}, FieldLabel("Search"),
        React.createElement("input",{type:"text",placeholder:"Name, project, code, notes, type...",className:"w-full rounded-xl border-slate-300 focus:ring-2 focus:ring-slate-400",value:search,onChange:e=>setSearch(e.target.value)})),
      React.createElement("div",null, FieldLabel("Project"),
        React.createElement("select",{className:"w-full rounded-xl border-slate-300 focus:ring-2 focus:ring-slate-400",value:filterProject,onChange:e=>setFilterProject(e.target.value)},
          React.createElement("option",{value:""},"All projects"),
          projects.map(p=> React.createElement("option",{key:p.id,value:p.id}, `${p.code} — ${p.name}`))
        )),
      React.createElement("div",null, FieldLabel("From"),
        React.createElement("input",{type:"date",className:"w-full rounded-xl border-slate-300 focus:ring-2 focus:ring-slate-400",value:fromDate,onChange:e=>setFromDate(e.target.value)})),
      React.createElement("div",null, FieldLabel("To"),
        React.createElement("input",{type:"date",className:"w-full rounded-xl border-slate-300 focus:ring-2 focus:ring-slate-400",value:toDate,onChange:e=>setToDate(e.target.value)})),
      React.createElement("div",null, FieldLabel("Import projects (CSV)"),
        React.createElement("input",{type:"file",accept:".csv",className:"w-full rounded-xl border-slate-300 focus:ring-2 focus:ring-slate-400",onChange:e=> e.target.files?.[0] && importProjectsCsv(e.target.files[0])}))
    ),
    React.createElement("div",{className:"mt-4 flex items-center justify-between flex-wrap gap-2"},
      React.createElement("div",{className:"text-sm"},"Total (filtered): ",
        React.createElement("span",{className:"font-semibold"}, totals.totalHours.toFixed(2)), " h • Base: ",
        React.createElement("span",{className:"font-semibold"}, totals.totalBase.toFixed(2)), " • OT: ",
        React.createElement("span",{className:"font-semibold"}, totals.totalOt.toFixed(2))
      ),
      React.createElement("div",{className:"flex gap-2"},
        React.createElement("button",{onClick:downloadCSV,className:"px-4 py-2 rounded-xl border border-slate-300 hover:bg-slate-50"},"Export CSV"),
        React.createElement("button",{onClick:exportXLSX,className:"px-4 py-2 rounded-xl border border-slate-300 hover:bg-slate-50"},"Export XLSX"),
        React.createElement("button",{onClick:exportPDF,className:"px-4 py-2 rounded-xl border border-slate-300 hover:bg-slate-50"},"Export PDF")
      )
    )
  );

  // Approvals
  const approvals = React.createElement("section",{className:"bg-white rounded-2xl shadow p-4 md:p-6"},
    React.createElement("div",{className:"flex items-center justify-between mb-3"},
      React.createElement("h2",{className:"text-lg font-semibold"},"Supervisor — Weekly approvals"),
      React.createElement("div",{className:"flex items-center gap-2"},
        React.createElement("input",{type:"week",className:"rounded-xl border-slate-300 focus:ring-2 focus:ring-slate-400",value:weekIso,onChange:e=>setWeekIso(e.target.value)}),
        React.createElement("button",{onClick:approveWeek,className:"px-3 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800"},"Approve week"),
        React.createElement("button",{onClick:rejectWeek,className:"px-3 py-2 rounded-xl border border-slate-300 hover:bg-slate-50"},"Reject week")
      )
    ),
    React.createElement("p",{className:"text-sm text-slate-600"},"Approving a week locks its entries. Locked entries cannot be edited or deleted.")
  );

  // Reporting (simple tables)
  const reporting = React.createElement("section",{className:"bg-white rounded-2xl shadow p-4 md:p-6"},
    React.createElement("div",{className:"flex items-center justify-between mb-3"},
      React.createElement("h2",{className:"text-lg font-semibold"},"Reporting dashboard"),
      React.createElement("input",{type:"week",className:"rounded-xl border-slate-300 focus:ring-2 focus:ring-slate-400",value:reportWeek,onChange:e=>setReportWeek(e.target.value)})
    ),
    React.createElement("div",{className:"grid md:grid-cols-2 gap-4"},
      React.createElement("div",{className:"rounded-xl border border-slate-200 p-3"},
        React.createElement("h3",{className:"font-medium mb-2"},"By employee (week ", reportWeek, ")"),
        React.createElement("table",{className:"w-full text-sm"},
          React.createElement("thead",null, React.createElement("tr",{className:"text-left text-slate-600 border-b"},
            React.createElement("th",{className:"py-1"},"Employee"),
            React.createElement("th",{className:"py-1"},"Hours"),
            React.createElement("th",{className:"py-1"},"Base"),
            React.createElement("th",{className:"py-1"},"OT"))),
          React.createElement("tbody",null,
            (report.byEmp.length===0)
              ? React.createElement("tr",null, React.createElement("td",{colSpan:4,className:"py-3 text-slate-500"},"No data"))
              : report.byEmp.map(r=> React.createElement("tr",{key:r.key,className:"border-b last:border-b-0"},
                  React.createElement("td",{className:"py-1"},r.key),
                  React.createElement("td",{className:"py-1"},r.hours.toFixed(2)),
                  React.createElement("td",{className:"py-1"},r.base.toFixed(2)),
                  React.createElement("td",{className:"py-1"},r.ot.toFixed(2))
                ))
          )
        )
      ),
      React.createElement("div",{className:"rounded-xl border border-slate-200 p-3"},
        React.createElement("h3",{className:"font-medium mb-2"},"By project (week ", reportWeek, ")"),
        React.createElement("table",{className:"w-full text-sm"},
          React.createElement("thead",null, React.createElement("tr",{className:"text-left text-slate-600 border-b"},
            React.createElement("th",{className:"py-1"},"Project"),
            React.createElement("th",{className:"py-1"},"Hours"),
            React.createElement("th",{className:"py-1"},"Base"),
            React.createElement("th",{className:"py-1"},"OT"))),
          React.createElement("tbody",null,
            (report.byProj.length===0)
              ? React.createElement("tr",null, React.createElement("td",{colSpan:4,className:"py-3 text-slate-500"},"No data"))
              : report.byProj.map(r=> React.createElement("tr",{key:r.key,className:"border-b last:border-b-0"},
                  React.createElement("td",{className:"py-1"},r.key),
                  React.createElement("td",{className:"py-1"},r.hours.toFixed(2)),
                  React.createElement("td",{className:"py-1"},r.base.toFixed(2)),
                  React.createElement("td",{className:"py-1"},r.ot.toFixed(2))
                ))
          )
        )
      )
    )
  );

  // Entries table
  const entriesTable = React.createElement("section",{className:"bg-white rounded-2xl shadow p-4 md:p-6"},
    React.createElement("h2",{className:"text-lg font-semibold mb-4"},"Entries"),
    React.createElement("div",{className:"overflow-x-auto"},
      React.createElement("table",{className:"min-w-full text-sm"},
        React.createElement("thead",null, React.createElement("tr",{className:"text-left text-slate-600 border-b"},
          React.createElement("th",{className:"py-2 pr-3"},"Date"),
          React.createElement("th",{className:"py-2 pr-3"},"Employee"),
          React.createElement("th",{className:"py-2 pr-3"},"Project"),
          React.createElement("th",{className:"py-2 pr-3"},"Type"),
          React.createElement("th",{className:"py-2 pr-3"},"Start"),
          React.createElement("th",{className:"py-2 pr-3"},"End"),
          React.createElement("th",{className:"py-2 pr-3"},"Break"),
          React.createElement("th",{className:"py-2 pr-3"},"Hours"),
          React.createElement("th",{className:"py-2 pr-3"},"Base"),
          React.createElement("th",{className:"py-2 pr-3"},"OT"),
          React.createElement("th",{className:"py-2 pr-3"},"Status"),
          React.createElement("th",{className:"py-2 pr-3"},"Notes"),
          React.createElement("th",{className:"py-2 pr-3 text-right"},"Actions")
        )),
        React.createElement("tbody",null,
          (visibleEntries.length===0)
            ? React.createElement("tr",null, React.createElement("td",{colSpan:13,className:"py-6 text-center text-slate-500"},"No entries yet. Use the form above to add your first one."))
            : visibleEntries.map(e=>{
                const alloc=withOt.get(e.id)||{base:e.hours||0,ot:0};
                const projCode=projectById[e.projectId]?.code;
                return React.createElement("tr",{key:e.id,className:"border-b last:border-b-0"},
                  React.createElement("td",{className:"py-2 pr-3 whitespace-nowrap"}, e.date),
                  React.createElement("td",{className:"py-2 pr-3 whitespace-nowrap"}, employeeById[e.employeeId]?.name),
                  React.createElement("td",{className:"py-2 pr-3 whitespace-nowrap"}, projCode),
                  React.createElement("td",{className:"py-2 pr-3 whitespace-nowrap"}, e.workType),
                  React.createElement("td",{className:"py-2 pr-3 whitespace-nowrap"}, e.start),
                  React.createElement("td",{className:"py-2 pr-3 whitespace-nowrap"}, e.end),
                  React.createElement("td",{className:"py-2 pr-3 whitespace-nowrap"}, e.breakMin+"m"),
                  React.createElement("td",{className:"py-2 pr-3 whitespace-nowrap font-semibold"}, (e.hours||0).toFixed(2)),
                  React.createElement("td",{className:"py-2 pr-3 whitespace-nowrap"}, alloc.base.toFixed(2)),
                  React.createElement("td",{className:"py-2 pr-3 whitespace-nowrap"}, alloc.ot.toFixed(2)),
                  React.createElement("td",{className:"py-2 pr-3 whitespace-nowrap"},
                    React.createElement("span",{
                      className:`px-2 py-0.5 rounded-lg text-xs ${
                        e.status==="approved" ? "bg-emerald-100 text-emerald-800"
                        : e.status==="rejected" ? "bg-red-100 text-red-800"
                        : "bg-slate-100 text-slate-700"
                      }`
                    }, e.status),
                    e.locked ? React.createElement("span",{className:"ml-2 text-xs text-slate-500"},"(locked)") : null
                  ),
                  React.createElement("td",{className:"py-2 pr-3"}, e.notes),
                  React.createElement("td",{className:"py-2 pr-0 text-right"},
                    React.createElement("div",{className:"flex gap-2 justify-end"},
                      React.createElement("button",{onClick:()=>setStatus(e.id,"approved"),className:"px-2 py-1 rounded-lg border border-emerald-300 text-emerald-800 hover:bg-emerald-50",disabled:e.locked},"Approve"),
                      React.createElement("button",{onClick:()=>setStatus(e.id,"rejected"),className:"px-2 py-1 rounded-lg border border-amber-300 text-amber-800 hover:bg-amber-50",disabled:e.locked && e.status==="approved"},"Reject"),
                      React.createElement("button",{onClick:()=>deleteEntry(e.id),className:"px-2 py-1 rounded-lg border border-red-300 text-red-700 hover:bg-red-50",disabled:e.locked},"Delete")
                    )
                  )
                );
              })
        )
      )
    )
  );

const notesSection = React.createElement("details",{className:"bg-white rounded-2xl shadow p-4 md:p-6"},
  React.createElement("summary",{className:"cursor-pointer font-medium"},"Implementation notes & next steps"),
  React.createElement("ul",{className:"list-disc pl-6 mt-3 space-y-1 text-sm text-slate-700"},
    React.createElement("li",null,"Rounding applies after breaks, to nearest increment."),
    React.createElement("li",null,"Daily OT allocation per employee per day."),
    React.createElement("li",null,"Approving a week locks entries; locked entries can’t be edited/deleted."),
    React.createElement("li",null,"Import projects CSV headers: code,name."),
    React.createElement("li",null,"Login uses your backend /auth/login (temporary)."),
    React.createElement("li",null,"Next: move data to Neon + real JWT auth; supervisor notifications.")
  )
);


  // Main wrapper
const main = React.createElement("main",{className:"max-w-6xl mx-auto px-4 py-6 space-y-6"},
  settings, kioskSection, logHours, summary, approvals, reporting, entriesTable, notesSection
);

  const footer = React.createElement("footer",{className:"max-w-6xl mx-auto px-4 py-8 text-center text-xs text-slate-500"},
    "Built as a starting point. Let's tailor it to your factory flow."
  );

  return React.createElement("div",{className:"min-h-screen"}, header, loginModal, main, footer);
}

// ---------- Mount ----------
console.log("app.js is running");
const rootEl = document.getElementById("root");
if (rootEl) {
  const app = React.createElement(App);
  ReactDOM.createRoot(rootEl).render(app);
}
const boot = document.getElementById("boot");
if (boot) boot.remove();
