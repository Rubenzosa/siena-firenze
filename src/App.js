import { useState, useEffect } from "react";
import { signInAnonymously } from "firebase/auth";
import { auth } from "./lib/firebase";
import {
  subscribeReports, addReport, confirmReport, noreportReport,
  resolveReport, reactivateReport, toggleSoccorsi, addNote, sendNoteToTelegram
} from "./lib/db";
import { useGPS } from "./hooks/useGPS";
import { useNotifications } from "./hooks/useNotifications";
import {
  Activity, Navigation, ShieldAlert, Construction, Car, AlertTriangle,
  ChevronRight, Clock, MapPin, Plus, X, Moon, Sun, Wind, HelpCircle, Truck,
  Bell, Compass, FileText, CheckCircle, ThumbsUp, Map, ArrowLeftRight,
  Send, RefreshCw, HeartPulse, Check
} from "lucide-react";

// ── Costanti ──────────────────────────────────────────────────
const ALERTS = [
  { id:"incidente", emoji:"🚨", label:"INCIDENTE", Icon:ShieldAlert,   color:"#ef4444", glow:"#fca5a5", grad:["#ef4444","#dc2626"] },
  { id:"traffico",  emoji:"🚦", label:"TRAFFICO",  Icon:Car,           color:"#f97316", glow:"#fdba74", grad:["#f97316","#ea580c"] },
  { id:"animali",   emoji:"🦌", label:"ANIMALI",   Icon:AlertTriangle, color:"#22c55e", glow:"#86efac", grad:["#22c55e","#16a34a"] },
  { id:"lavori",    emoji:"🚧", label:"LAVORI",    Icon:Construction,  color:"#eab308", glow:"#fde047", grad:["#eab308","#ca8a04"] },
  { id:"nebbia",    emoji:"🌫️", label:"NEBBIA",    Icon:Wind,          color:"#78909C", glow:"#b0bec5", grad:["#78909C","#607D8B"] },
  { id:"veicolo",   emoji:"🚗", label:"FERMO",     Icon:Truck,         color:"#a855f7", glow:"#d8b4fe", grad:["#a855f7","#9333ea"] },
  { id:"altro",     emoji:"❓", label:"ALTRO",     Icon:HelpCircle,    color:"#0ea5e9", glow:"#7dd3fc", grad:["#0ea5e9","#0284c7"] },
];

// ── Theme ─────────────────────────────────────────────────────
const LIGHT = {
  bg:"#f8fafc", bgCard:"#ffffff", bgMuted:"#f1f5f9",
  border:"#e2e8f0", borderLight:"#f1f5f9",
  text:"#0f172a", textSub:"#64748b", textFaint:"#94a3b8",
  accent:"#2563eb", accentLight:"rgba(37,99,235,0.08)",
  navBg:"rgba(255,255,255,0.92)", headerBg:"rgba(255,255,255,0.82)",
  isDark:false,
};
const DARK = {
  bg:"#020617", bgCard:"#0f172a", bgMuted:"#1e293b",
  border:"#1e293b", borderLight:"#1e293b",
  text:"#f8fafc", textSub:"#94a3b8", textFaint:"#475569",
  accent:"#3b82f6", accentLight:"rgba(59,130,246,0.1)",
  navBg:"rgba(2,6,23,0.95)", headerBg:"rgba(15,23,42,0.85)",
  isDark:true,
};

// ── Utils ─────────────────────────────────────────────────────
function hexToRgb(h){const r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16);return`${r},${g},${b}`;}
function dirLabel(d){return d==="FI"?"→ Firenze":"→ Siena";}
function badge(n){
  if(n>=5)return{label:"VERIFICATA", color:"#ef4444",bg:"rgba(239,68,68,0.12)"};
  if(n>=2)return{label:"PROBABILE",  color:"#f97316",bg:"rgba(249,115,22,0.12)"};
  return       {label:"NON VERIF.", color:"#94a3b8",bg:"rgba(148,163,184,0.12)"};
}
function dirSeverity(reps){
  if(reps.some(r=>r.label==="INCIDENTE"))return{color:"#ef4444"};
  if(reps.some(r=>r.label==="TRAFFICO")) return{color:"#f97316"};
  if(reps.length>0)                      return{color:"#eab308"};
  return                                        {color:"#22c55e"};
}
function resolvedMinsAgo(ts){
  if(!ts)return 0;
  const d=ts.toDate?ts.toDate():new Date(ts);
  return Math.round((Date.now()-d.getTime())/60000);
}
function timeAgo(ts){
  if(!ts)return"";
  try{
    const d=ts.toDate?ts.toDate():new Date(ts);
    const m=Math.round((Date.now()-d.getTime())/60000);
    if(m<1)return"ora";if(m<60)return`${m} min fa`;return`${Math.round(m/60)}h fa`;
  }catch{return"";}
}
function sevColor(label){
  if(label==="INCIDENTE")return{bg:"rgba(239,68,68,0.1)",fg:"#ef4444"};
  if(label==="TRAFFICO") return{bg:"rgba(249,115,22,0.1)",fg:"#f97316"};
  return                       {bg:"rgba(59,130,246,0.1)", fg:"#3b82f6"};
}

// ── Icon helpers ──────────────────────────────────────────────
function ReportIcon({label,size=26,color}){
  const a=ALERTS.find(x=>x.label===label);
  const I=a?.Icon;
  return I?<I size={size} color={color||"currentColor"}/>:<span style={{fontSize:size*.8}}>{a?.emoji||"❓"}</span>;
}

// ─────────────────────────────────────────────────────────────
export default function App(){
  useEffect(()=>{signInAnonymously(auth).catch(console.error);},[]);

  const[darkMode,setDarkMode]=useState(false);
  const th=darkMode?DARK:LIGHT;

  const[reports,setReports]=useState([]);
  useEffect(()=>{const u=subscribeReports(setReports);return u;},[]);

  const[confirmedIds,setConfirmedIds]=useState(()=>{try{return JSON.parse(localStorage.getItem("confirmedIds")||"[]");}catch{return[];}});
  const[noVotedIds,setNoVotedIds]   =useState(()=>{try{return JSON.parse(localStorage.getItem("noVotedIds")||"[]");}  catch{return[];}});
  function hasConfirmed(id){return confirmedIds.includes(id);}
  function markConfirmed(id){const u=[...confirmedIds,id];setConfirmedIds(u);try{localStorage.setItem("confirmedIds",JSON.stringify(u));}catch{}}
  function hasNoVoted(id){return noVotedIds.includes(id);}
  function markNoVoted(id){const u=[...noVotedIds,id];setNoVotedIds(u);try{localStorage.setItem("noVotedIds",JSON.stringify(u));}catch{}}

  const{position,loading:gpsLoading,snapshotNow}=useGPS();
  const[frozenPosition,setFrozenPosition]=useState(null);
  const{permission,notifEnabled,requestPermission,disableNotifications,incomingAlert,setIncomingAlert}=useNotifications();

  const[screen,setScreen]          =useState("home");
  const[step,setStep]              =useState(0);
  const[homeDir,setHomeDir]        =useState("FI");
  const[myDir,setMyDir]            =useState(null);
  const[selAlert,setSelAlert]      =useState(null);
  const[corsia,setCorsia]          =useState(null);
  const[altroText,setAltroText]    =useState("");
  const[notaText,setNotaText]      =useState("");
  const[sending,setSending]        =useState(false);
  const[pulse,setPulse]            =useState(false);
  const[dupModal,setDupModal]      =useState(null);
  const[resolveId,setResolveId]    =useState(null);
  const[addNoteId,setAddNoteId]    =useState(null);
  const[addNoteText,setAddNoteText]=useState("");
  const[mapReport,setMapReport]    =useState(null);
  const[showNotify,setShowNotify]  =useState(false);
  const[inViaggio,setInViaggio]    =useState(false);

  useEffect(()=>{const t=setInterval(()=>setPulse(p=>!p),2000);return()=>clearInterval(t);},[]);

  const dirProblema=myDir&&corsia?(corsia==="propria"?myDir:(myDir==="FI"?"SI":"FI")):null;
  const activeReports  =reports.filter(r=>!r.resolved);
  const resolvedReports=reports.filter(r=>r.resolved);
  const repFI=activeReports.filter(r=>r.dirProblema==="FI");
  const repSI=activeReports.filter(r=>r.dirProblema==="SI");
  const homeReps=homeDir==="FI"?repFI:repSI;
  const homeSev=dirSeverity(homeReps);

  const statusOk=homeReps.length===0;
  const statusTitle=statusOk?"Strada Libera":homeReps.some(r=>r.label==="INCIDENTE")?"Incidente":"Attenzione";
  const statusDesc=statusOk
    ?"Nessun imprevisto rilevato sulla tua corsia."
    :homeReps.map(r=>`${r.label} · ${r.kmLabel}`).join(" — ");

  function reset(){setStep(0);setMyDir(null);setSelAlert(null);setCorsia(null);setAltroText("");setNotaText("");setSending(false);setFrozenPosition(null);}
  function goHome(){setScreen("home");reset();}
  const activePos=frozenPosition||position;

  function checkDuplicates(corsiaVal){
    if(!activePos){setStep(3);return;}
    const dp=corsiaVal==="propria"?myDir:(myDir==="FI"?"SI":"FI");
    const dup=activeReports.find(r=>r.dirProblema===dp&&Math.abs(r.km-activePos.km)<2);
    if(dup)setDupModal(dup);else setStep(3);
  }

  async function handleSend(){
    if(!activePos){alert("GPS non disponibile.");return;}
    try{
      const lastSent=parseInt(localStorage.getItem("lastSentAt")||"0");
      const elapsed=Date.now()-lastSent;
      const LIM=2*60*1000;
      if(elapsed<LIM){const r=Math.ceil((LIM-elapsed)/60000);alert(`Attendi ancora ${r} minuto${r>1?"i":""}.`);return;}
    }catch{}
    setSending(true);
    try{
      await addReport({emoji:selAlert.emoji,label:selAlert.id==="altro"?(altroText||"ALTRO"):selAlert.label,dirProblema,corsia,km:activePos.km,kmLabel:activePos.kmLabel,locInfo:activePos.locInfo||null,lat:activePos.lat,lng:activePos.lng,note:notaText||null,color:selAlert.color});
      try{localStorage.setItem("lastSentAt",Date.now().toString());}catch{}
      setScreen("sent");setTimeout(goHome,2600);
    }catch(e){console.error(e);alert("Errore nell'invio. Riprova.");}
    finally{setSending(false);}
  }

  function handleNoreport(id,noCount){
    if(hasNoVoted(id)||hasConfirmed(id))return;
    const nc=(noCount||0)+1;
    setReports(p=>p.map(r=>r.id===id?{...r,noCount:nc,...(nc>=5?{resolved:true,resolvedAt:{toDate:()=>new Date()}}:{})}:r));
    noreportReport(id,noCount).catch(console.error);markNoVoted(id);
  }
  async function handleConfirmDup(dup){
    setReports(p=>p.map(r=>r.id===dup.id?{...r,confirmed:r.confirmed+1}:r));
    confirmReport(dup.id,dup.confirmed).catch(console.error);markConfirmed(dup.id);
    setDupModal(null);setScreen("sent");setTimeout(goHome,2400);
  }
  function handleConfirm(id,confirmed){
    if(hasConfirmed(id))return;
    setReports(p=>p.map(r=>r.id===id?{...r,confirmed:r.confirmed+1}:r));
    confirmReport(id,confirmed).catch(console.error);markConfirmed(id);
  }
  function handleResolve(id){
    setReports(p=>p.map(r=>r.id===id?{...r,resolved:true,resolvedAt:{toDate:()=>new Date()}}:r));
    resolveReport(id).catch(console.error);setResolveId(null);
  }
  function handleReactivate(id){
    setReports(p=>p.map(r=>r.id===id?{...r,resolved:false,resolvedAt:null}:r));
    reactivateReport(id).catch(console.error);
  }
  function handleToggleSoccorsi(id,current){
    setReports(p=>p.map(r=>r.id===id?{...r,soccorsi:!current}:r));
    toggleSoccorsi(id,current).catch(console.error);
  }
  async function handleAddNote(id,note){
    setReports(p=>p.map(r=>r.id===id?{...r,note}:r));
    await addNote(id,note);await sendNoteToTelegram(id,note);
    setAddNoteId(null);setAddNoteText("");
  }

  async function startFlow(){
    try{const s=await snapshotNow();setFrozenPosition(s);}catch{setFrozenPosition(position);}
    setMyDir(homeDir);setScreen("flow");setStep(1);
  }

  const isFlow=screen==="flow";
  const FONT='-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif';

  return(
    <div style={{height:"100dvh",background:th.bg,fontFamily:FONT,color:th.text,display:"flex",flexDirection:"column",maxWidth:430,margin:"0 auto",position:"relative",overflow:"hidden",transition:"background .3s,color .3s"}}>

      <style>{`
        @keyframes ping2{0%{transform:scale(1);opacity:.7}80%,100%{transform:scale(2.2);opacity:0}}
        @keyframes pop{0%{transform:scale(.3);opacity:0}70%{transform:scale(1.15)}100%{transform:scale(1);opacity:1}}
        @keyframes beat{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}
        @keyframes slideD{0%{transform:translateX(-50%) translateY(-110%);opacity:0}100%{transform:translateX(-50%) translateY(0);opacity:1}}
        @keyframes pulseG{0%,100%{opacity:.35}50%{opacity:.55}}
      `}</style>

      {/* PROXIMITY TOAST */}
      {incomingAlert&&(
        <div style={{position:"fixed",top:0,left:"50%",transform:"translateX(-50%)",zIndex:100,width:"calc(100% - 24px)",maxWidth:406,margin:"12px auto",borderRadius:16,background:darkMode?"linear-gradient(135deg,#1a0a00,#2d1000)":"#fff7f7",border:"2px solid #ef4444",padding:"14px 16px",boxShadow:"0 8px 40px rgba(239,68,68,.5)",display:"flex",alignItems:"center",gap:12,animation:"slideD .4s ease"}}>
          <ShieldAlert size={26} color="#ef4444"/>
          <div style={{flex:1}}>
            <div style={{fontSize:14,fontWeight:800,color:"#ef4444"}}>{incomingAlert.title||"IMPREVISTO VICINO"}</div>
            <div style={{fontSize:13,color:th.textSub}}>{incomingAlert.body}</div>
          </div>
          <button onClick={()=>setIncomingAlert(null)} style={{background:"transparent",border:"none",color:th.textFaint,cursor:"pointer",display:"flex",alignItems:"center"}}><X size={16}/></button>
        </div>
      )}

      {/* ── HEADER ── */}
      <header style={{position:"sticky",top:0,zIndex:20,background:th.headerBg,backdropFilter:"blur(14px)",WebkitBackdropFilter:"blur(14px)",borderBottom:`1px solid ${th.border}`,padding:"16px 24px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          {/* Logo */}
          <div style={{width:40,height:40,background:"#2563eb",borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 14px rgba(37,99,235,.35)",color:"#fff",flexShrink:0,animation:"beat 2s ease-in-out infinite"}}>
            <Activity size={22}/>
          </div>
          <div>
            <div style={{fontSize:20,fontWeight:900,letterSpacing:"-0.3px",lineHeight:1.1}}>
              SIFI <span style={{color:th.accent}}>LIVE</span>
            </div>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.18em",color:th.textSub,textTransform:"uppercase"}}>Real-time Monitor</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={()=>setShowNotify(true)} style={{padding:8,borderRadius:12,border:`1px solid ${th.border}`,background:th.bgMuted,cursor:"pointer",color:(permission==="granted"&&notifEnabled)?th.accent:th.textFaint,display:"flex",alignItems:"center",transition:"color .2s"}}>
            <Bell size={18}/>
          </button>
          <button onClick={()=>setDarkMode(d=>!d)} style={{padding:"8px 10px",borderRadius:12,border:`1px solid ${th.border}`,background:th.bgMuted,cursor:"pointer",lineHeight:1,color:th.textSub,display:"flex",alignItems:"center"}}>
            {darkMode?<Sun size={18}/>:<Moon size={18}/>}
          </button>
        </div>
      </header>

      {/* ── MAIN ── */}
      <main style={{flex:1,overflowY:"auto",position:"relative",zIndex:2,paddingBottom:104}}>

        {/* ══ HOME ══ */}
        {screen==="home"&&(
          <div style={{padding:"24px 24px 0",display:"flex",flexDirection:"column",gap:32}}>

            {/* Direction toggle */}
            <div style={{padding:4,borderRadius:16,display:"flex",alignItems:"center",border:`1px solid ${th.border}`,background:th.bgCard,boxShadow:darkMode?"none":"0 1px 4px rgba(0,0,0,.06)"}}>
              {[["FI","VERSO FIRENZE"],["SI","VERSO SIENA"]].map(([d,l])=>(
                <button key={d} onClick={()=>setHomeDir(d)} style={{flex:1,padding:"12px 16px",borderRadius:12,fontSize:12,fontWeight:800,letterSpacing:".04em",border:"none",cursor:"pointer",transition:"all .2s",background:homeDir===d?"#2563eb":"transparent",color:homeDir===d?"#fff":th.textSub}}>
                  {l}
                </button>
              ))}
            </div>

            {/* Status card */}
            <div style={{position:"relative",overflow:"hidden",borderRadius:40,padding:32,background:"linear-gradient(135deg,#2563eb,#1d4ed8)",color:"#fff",boxShadow:"0 20px 50px -10px rgba(37,99,235,.4)"}}>
              <div style={{position:"relative",zIndex:1}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
                  <div style={{padding:12,borderRadius:16,background:"rgba(255,255,255,.18)"}}>
                    <Navigation size={26}/>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8,background:"rgba(34,197,94,.18)",backdropFilter:"blur(8px)",padding:"6px 12px",borderRadius:999,border:"1px solid rgba(34,197,94,.3)"}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:"#22c55e",animation:"ping2 1.4s ease-out infinite"}}/>
                    <span style={{fontSize:10,fontWeight:900,letterSpacing:".1em",textTransform:"uppercase"}}>Live Updates</span>
                  </div>
                </div>
                <div style={{fontSize:30,fontWeight:700,marginBottom:8,letterSpacing:"-.5px"}}>{statusTitle}</div>
                <div style={{fontSize:14,color:"#dbeafe",fontWeight:500,lineHeight:1.5}}>{statusDesc}</div>
              </div>
              {/* Decorative circle */}
              <div style={{position:"absolute",right:-40,bottom:-40,width:192,height:192,borderRadius:"50%",border:"20px solid rgba(255,255,255,.06)"}}/>
            </div>

            {/* Feed recente */}
            <div style={{display:"flex",flexDirection:"column",gap:16,paddingBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
                <h3 style={{fontSize:18,fontWeight:900,letterSpacing:"-.3px",textTransform:"uppercase",margin:0}}>Segnalazioni Vicine</h3>
                <button onClick={()=>setScreen("feed")} style={{fontSize:10,fontWeight:700,color:th.accent,textTransform:"uppercase",letterSpacing:".08em",background:"transparent",border:"none",cursor:"pointer",padding:0}}>VEDI TUTTO</button>
              </div>

              {homeReps.length===0&&(
                <div style={{textAlign:"center",padding:"32px 0",color:th.textFaint,fontSize:15}}>
                  Nessun imprevisto
                </div>
              )}

              {homeReps.map(r=>{
                const sc=sevColor(r.label);
                const ta=timeAgo(r.createdAt);
                return(
                  <div key={r.id} onClick={()=>setMapReport(r)} style={{padding:16,borderRadius:24,display:"flex",alignItems:"center",gap:20,border:`1px solid ${th.borderLight}`,background:th.bgCard,boxShadow:darkMode?"none":"0 2px 12px rgba(0,0,0,.06)",cursor:"pointer",transition:"transform .15s",active:{transform:"scale(.97)"}}}>
                    <div style={{width:56,height:56,borderRadius:16,background:sc.bg,color:sc.fg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <ReportIcon label={r.label} size={26}/>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                        <span style={{fontSize:10,padding:"2px 8px",borderRadius:6,background:th.bgMuted,color:th.textSub,fontWeight:700}}>Dir. {r.dirProblema}</span>
                        {ta&&<span style={{fontSize:11,color:th.textFaint,fontWeight:500}}>{ta}</span>}
                      </div>
                      <div style={{fontSize:15,fontWeight:700,letterSpacing:"-.2px",lineHeight:1.3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {r.kmLabel}{r.locInfo?` · ${r.locInfo}`:""}
                      </div>
                      <div style={{fontSize:12,color:sc.fg,fontWeight:600,marginTop:2}}>{r.label}</div>
                    </div>
                    <span style={{color:th.textFaint,flexShrink:0}}><ChevronRight size={18} strokeWidth={2.5}/></span>
                  </div>
                );
              })}

              {/* Mostra anche segnalazioni dell'altra direzione se presenti */}
              {(homeDir==="FI"?repSI:repFI).length>0&&(
                <button onClick={()=>setHomeDir(homeDir==="FI"?"SI":"FI")} style={{padding:"12px",borderRadius:16,border:`1px dashed ${th.border}`,background:"transparent",color:th.textSub,fontSize:13,fontWeight:600,cursor:"pointer",letterSpacing:".02em"}}>
                  {(homeDir==="FI"?repSI:repFI).length} segnalazion{(homeDir==="FI"?repSI:repFI).length===1?"e":"i"} nella direzione opposta →
                </button>
              )}
            </div>
          </div>
        )}

        {/* ══ FLOW ══ */}
        {screen==="flow"&&(
          <div style={{padding:32}}>
            {/* STEP 0: direzione (solo via back da step 1) */}
            {step===0&&(
              <>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:40}}>
                  <div>
                    <div style={{fontSize:36,fontWeight:900,fontStyle:"italic",letterSpacing:"-1px",lineHeight:1.1}}>VERSO<br/>DOVE?</div>
                    <div style={{height:6,width:48,background:th.accent,borderRadius:4,marginTop:8}}/>
                  </div>
                  <button onClick={goHome} style={{padding:12,borderRadius:16,background:th.bgMuted,border:"none",cursor:"pointer",color:th.text,display:"flex"}}><X size={26} strokeWidth={2.5}/></button>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  {[["FI","→ FIRENZE"],["SI","→ SIENA"]].map(([d,l])=>(
                    <button key={d} onClick={()=>{setMyDir(d);setStep(1);}} style={{padding:"22px 20px",borderRadius:16,border:`2px solid ${myDir===d?th.accent:th.border}`,background:myDir===d?th.accentLight:th.bgCard,color:myDir===d?th.accent:th.textSub,fontSize:20,fontWeight:800,letterSpacing:".08em",cursor:"pointer",transition:"all .2s",textAlign:"left"}}>
                      {l}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* STEP 1: COSA VEDI? */}
            {step===1&&(
              <>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:40}}>
                  <div>
                    <div style={{fontSize:36,fontWeight:900,fontStyle:"italic",letterSpacing:"-1px",lineHeight:1.1}}>COSA<br/>VEDI?</div>
                    <div style={{height:6,width:48,background:th.accent,borderRadius:4,marginTop:8}}/>
                  </div>
                  <button onClick={goHome} style={{padding:12,borderRadius:16,background:th.bgMuted,border:"none",cursor:"pointer",color:th.text,display:"flex"}}><X size={26} strokeWidth={2.5}/></button>
                </div>

                {/* Direzione pill (small, editable) */}
                <div style={{display:"inline-flex",alignItems:"center",gap:8,padding:"6px 12px",borderRadius:999,background:th.accentLight,border:`1px solid ${th.accent}33`,marginBottom:24,cursor:"pointer"}} onClick={()=>setStep(0)}>
                  <span style={{fontSize:12,fontWeight:700,color:th.accent}}>{myDir==="FI"?"→ FIRENZE":"→ SIENA"}</span>
                  <span style={{fontSize:11,color:th.accent}}>↕</span>
                </div>

                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24}}>
                  {ALERTS.map(a=>(
                    <button key={a.id} onClick={()=>{setSelAlert(a);if(a.id!=="altro")setStep(2);}} style={{position:"relative",overflow:"hidden",aspectRatio:"4/5",borderRadius:40,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",border:`2px solid ${selAlert?.id===a.id?a.color:(th.isDark?"#1e293b":"#f8fafc")}`,background:th.bgCard,boxShadow:th.isDark?"none":"0 25px 50px -12px rgba(203,213,225,0.6)",cursor:"pointer",transition:"transform .15s,box-shadow .15s",padding:16}}>
                      <div style={{marginBottom:16,padding:20,borderRadius:24,background:`linear-gradient(135deg,${a.grad[0]},${a.grad[1]})`,color:"#fff",lineHeight:1,boxShadow:`0 8px 24px ${a.grad[0]}44`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                        <a.Icon size={40}/>
                      </div>
                      <span style={{fontSize:13,fontWeight:900,textTransform:"uppercase",letterSpacing:".1em",color:th.text}}>{a.label}</span>
                    </button>
                  ))}
                </div>

                {selAlert?.id==="altro"&&(
                  <div style={{marginTop:16}}>
                    <input placeholder="Descrivi (opzionale)..." value={altroText} onChange={e=>setAltroText(e.target.value)}
                      style={{width:"100%",padding:14,borderRadius:12,border:`1px solid ${th.border}`,background:th.bgCard,color:th.text,fontSize:15,fontFamily:FONT,boxSizing:"border-box",outline:"none",marginBottom:12}}/>
                    <Btn th={th} onClick={()=>setStep(2)}>AVANTI →</Btn>
                  </div>
                )}

                <div style={{marginTop:32,textAlign:"center",fontSize:10,fontWeight:700,color:th.textFaint,textTransform:"uppercase",letterSpacing:".25em"}}>
                  {position?"Posizione GPS agganciata correttamente":"In attesa GPS..."}
                </div>
              </>
            )}

            {/* STEP 2: corsia */}
            {step===2&&selAlert&&(
              <>
                <Back th={th} onClick={()=>setStep(1)}/>
                <Label th={th}>Dove si trova il problema?</Label>
                <Sub th={th}>Stai andando <strong style={{color:th.text}}>{dirLabel(myDir)}</strong>.</Sub>
                <div style={{display:"flex",flexDirection:"column",gap:12,marginTop:20}}>
                  <CorsiaBtn th={th} selected={corsia==="propria"} color="#ef4444"
                    onClick={()=>{setCorsia("propria");checkDuplicates("propria");}}
                    Icon={Car} title="SULLA MIA CORSIA" sub={`Problema direzione ${dirLabel(myDir)}`}/>
                  <CorsiaBtn th={th} selected={corsia==="opposta"} color="#f97316"
                    onClick={()=>{setCorsia("opposta");checkDuplicates("opposta");}}
                    Icon={ArrowLeftRight} title="CORSIA OPPOSTA" sub={`Problema direzione ${dirLabel(myDir==="FI"?"SI":"FI")}`}/>
                </div>
              </>
            )}

            {/* STEP 3: dettagli */}
            {step===3&&(
              <>
                <Back th={th} onClick={()=>setStep(2)}/>
                <Label th={th}>Dettagli aggiuntivi</Label>
                <Sub th={th}>Opzionale. Solo informazioni <strong style={{color:th.text}}>certe</strong>.</Sub>
                <div style={{display:"flex",alignItems:"center",gap:10,margin:"16px 0",padding:"12px 14px",borderRadius:12,background:"rgba(34,197,94,.08)",border:"1px solid rgba(34,197,94,.25)"}}>
                  <MapPin size={18} color="#16a34a"/>
                  <div>
                    <div style={{fontSize:13,fontWeight:700,color:"#16a34a",display:"flex",alignItems:"center",gap:5}}><Check size={13}/> Posizione registrata al tap</div>
                    <div style={{fontSize:12,color:th.textSub}}>
                      {activePos?`${activePos.kmLabel} · ${dirLabel(dirProblema)}`:"Rilevamento..."}
                      {activePos?.locInfo&&<div style={{marginTop:2,color:th.textFaint,fontSize:11}}>{activePos.locInfo}</div>}
                    </div>
                  </div>
                </div>
                <textarea placeholder="Es: Camion di traverso, coda 1km... (opzionale)" value={notaText} onChange={e=>setNotaText(e.target.value)} rows={3}
                  style={{width:"100%",padding:14,borderRadius:12,border:`1px solid ${th.border}`,background:th.bgCard,color:th.text,fontSize:14,fontFamily:FONT,boxSizing:"border-box",resize:"none",outline:"none",marginBottom:16}}/>
                <Btn th={th} onClick={()=>setStep(4)}>{notaText?"AVANTI CON NOTA →":"SALTA →"}</Btn>
              </>
            )}

            {/* STEP 4: riepilogo */}
            {step===4&&selAlert&&(
              <>
                <Back th={th} onClick={()=>setStep(3)}/>
                <Label th={th}>Riepilogo</Label>
                <div style={{borderRadius:20,padding:20,marginBottom:20,background:`rgba(${hexToRgb(selAlert.color)},.08)`,border:`2px solid ${selAlert.color}33`}}>
                  <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:14}}>
                    <div style={{color:selAlert.color}}><selAlert.Icon size={40}/></div>
                    <div>
                      <div style={{fontSize:20,fontWeight:900,color:selAlert.color,letterSpacing:1}}>{selAlert.id==="altro"?(altroText||"ALTRO"):selAlert.label}</div>
                      <div style={{fontSize:13,color:th.textSub,marginTop:2,display:"flex",alignItems:"center",gap:4}}>{corsia==="propria"?<><Car size={12}/> Mia corsia</>:<><ArrowLeftRight size={12}/> Corsia opposta</>}</div>
                    </div>
                  </div>
                  {[
                    [<Compass size={13}/>,       "Direzione", dirLabel(dirProblema)],
                    [<MapPin size={13}/>,         "Posizione", activePos?`${activePos.kmLabel}${activePos.locInfo?` · ${activePos.locInfo}`:""} (al tap)`:"..."],
                    [<AlertTriangle size={13}/>,  "Precisione","±300 m"],
                    [<Send size={13}/>,           "Telegram",  "Pin + messaggio al gruppo"],
                    [<Bell size={13}/>,           "Push",      "Notifica a tutti gli utenti"],
                  ].map(([ic,lb,vl])=>(
                    <IR key={lb} th={th} icon={ic} label={lb} value={vl}/>
                  ))}
                  {notaText&&<IR th={th} icon={<FileText size={13}/>} label="Nota" value={notaText}/>}
                </div>
                <button onClick={handleSend} disabled={sending||!activePos} style={{width:"100%",padding:"20px 0",borderRadius:16,border:"none",background:(sending||!activePos)?th.bgMuted:`linear-gradient(135deg,${selAlert.color},${selAlert.grad?selAlert.grad[1]:selAlert.color})`,color:"#fff",fontSize:18,fontWeight:900,letterSpacing:2,cursor:(sending||!activePos)?"not-allowed":"pointer",boxShadow:(sending||!activePos)?"none":`0 6px 24px ${selAlert.glow}44`,transition:"all .3s",textTransform:"uppercase"}}>
                  {sending?"Invio...":!activePos?"Attendi GPS...":"SEGNALA ORA"}
                </button>
                <div style={{textAlign:"center",marginTop:10,fontSize:10,color:th.textFaint,letterSpacing:2}}>NESSUN DATO PERSONALE INVIATO</div>
              </>
            )}
          </div>
        )}

        {/* ══ FEED (Timeline) ══ */}
        {screen==="feed"&&(
          <div style={{padding:"20px 16px"}}>
            <div style={{fontSize:11,color:th.textSub,letterSpacing:".3em",textTransform:"uppercase",marginBottom:16,fontWeight:600}}>
              Live · {activeReports.length} attive
            </div>
            {activeReports.length===0&&resolvedReports.length===0&&(
              <div style={{textAlign:"center",color:th.textFaint,marginTop:60,fontSize:16}}>Nessun imprevisto</div>
            )}
            {activeReports.map(r=>(
              <ReportCard key={r.id} th={th} r={r}
                onConfirm={()=>handleConfirm(r.id,r.confirmed)}
                alreadyConfirmed={hasConfirmed(r.id)}
                onResolve={()=>setResolveId(r.id)}
                onMap={()=>setMapReport(r)}
                onAddNote={()=>setAddNoteId(r.id)}
                onToggleSoccorsi={()=>handleToggleSoccorsi(r.id,r.soccorsi)}/>
            ))}
            {resolvedReports.length>0&&(
              <>
                <div style={{height:1,background:th.border,margin:"20px 0 16px"}}/>
                <div style={{fontSize:10,color:th.textFaint,letterSpacing:".3em",textTransform:"uppercase",marginBottom:14,fontWeight:600}}>Risolte · rimangono 1h</div>
                {resolvedReports.map(r=>(
                  <div key={r.id} style={{borderRadius:16,padding:14,marginBottom:10,opacity:.4,background:th.bgCard,border:`1px solid ${th.border}`,filter:"grayscale(40%)"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                      <ReportIcon label={r.label} size={26}/>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <span style={{fontSize:14,fontWeight:800,color:th.textSub,textDecoration:"line-through"}}>{r.label}</span>
                          <span style={{fontSize:10,padding:"2px 8px",borderRadius:20,background:"rgba(34,197,94,.15)",color:"#16a34a",fontWeight:700}}>RISOLTO</span>
                        </div>
                        <div style={{fontSize:11,color:th.textSub}}>{r.kmLabel} · {dirLabel(r.dirProblema)} · chiuso {resolvedMinsAgo(r.resolvedAt)} min fa</div>
                      </div>
                    </div>
                    <button onClick={()=>handleReactivate(r.id)} style={{width:"100%",padding:"9px 0",borderRadius:10,border:`1px solid ${th.border}`,background:"transparent",color:th.textSub,fontSize:12,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><RefreshCw size={12}/> RIATTIVA</button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </main>

      {/* ══ SENT overlay ══ */}
      {screen==="sent"&&(
        <div style={{position:"fixed",inset:0,zIndex:50,display:"flex",alignItems:"center",justifyContent:"center",padding:32,background:"rgba(2,6,23,.65)",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)"}}>
          <div style={{width:"100%",maxWidth:300,borderRadius:48,padding:40,textAlign:"center",background:darkMode?"#0f172a":"#fff",boxShadow:"0 30px 80px rgba(0,0,0,.3)"}}>
            <div style={{position:"relative",width:96,height:96,margin:"0 auto 24px"}}>
              <div style={{position:"absolute",inset:0,borderRadius:"50%",background:"#22c55e",opacity:.18,animation:"ping2 1.2s ease-out infinite"}}/>
              <div style={{position:"relative",width:96,height:96,borderRadius:"50%",background:"linear-gradient(135deg,#22c55e,#16a34a)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 8px 32px rgba(34,197,94,.45)",animation:"pop .4s ease"}}>
                <svg width="46" height="46" fill="none" viewBox="0 0 24 24" stroke="#fff"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>
              </div>
            </div>
            <div style={{fontSize:30,fontWeight:900,fontStyle:"italic",marginBottom:8,letterSpacing:"-.5px"}}>RICEVUTO!</div>
            <div style={{fontSize:14,color:th.textSub,fontWeight:500,lineHeight:1.6}}>Segnalazione inviata con successo.<br/>Guida con prudenza.</div>
          </div>
        </div>
      )}

      {/* ── BOTTOM NAV ── */}
      <nav style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,height:96,display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0 40px",background:th.navBg,backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",borderTop:`1px solid ${th.border}`,zIndex:40,boxSizing:"border-box"}}>

        {/* Timeline */}
        <button onClick={()=>{setScreen("home");reset();}} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,background:"transparent",border:"none",cursor:"pointer",color:(screen==="home"||screen==="feed")?th.accent:th.textFaint,padding:0}}>
          <div style={{padding:8,borderRadius:12,background:(screen==="home"||screen==="feed")?(th.isDark?"rgba(59,130,246,0.1)":"#eff6ff"):"transparent",transition:"background .2s"}}>
            <Clock size={24} strokeWidth={2.5} color={(screen==="home"||screen==="feed")?th.accent:th.textFaint}/>
          </div>
          <span style={{fontSize:10,fontWeight:900,letterSpacing:".1em",textTransform:"uppercase"}}>Timeline</span>
        </button>

        {/* FAB */}
        <div style={{position:"relative",top:-32}}>
          <div style={{position:"absolute",inset:0,borderRadius:"50%",background:"#2563eb",filter:"blur(20px)",opacity:isFlow?0:.4,animation:"pulseG 2.5s ease-in-out infinite",transition:"opacity .3s"}}/>
          <button onClick={()=>{isFlow?goHome():startFlow();}} style={{position:"relative",width:80,height:80,borderRadius:32,background:isFlow?"#0f172a":"linear-gradient(135deg,#2563eb,#1d4ed8)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transform:isFlow?"rotate(45deg)":"none",boxShadow:isFlow?"none":"0 8px 30px rgba(37,99,235,.45)",transition:"all .3s",color:"#fff"}}>
            <Plus size={38} strokeWidth={2.5}/>
          </button>
        </div>

        {/* Mappa */}
        <button onClick={()=>{if(activeReports.length>0)setMapReport(activeReports[0]);}} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,background:"transparent",border:"none",cursor:activeReports.length>0?"pointer":"default",color:th.textFaint,padding:0,opacity:activeReports.length>0?1:.4}}>
          <div style={{padding:8,borderRadius:12}}>
            <MapPin size={24} strokeWidth={2.5} color={th.textFaint}/>
          </div>
          <span style={{fontSize:10,fontWeight:900,letterSpacing:".1em",textTransform:"uppercase"}}>Mappa</span>
        </button>
      </nav>

      {/* ── MODALS ── */}

      {showNotify&&(
        <Modal th={th} onClose={()=>setShowNotify(false)}>
          <div style={{marginBottom:8,color:th.accent,display:"flex",justifyContent:"center"}}><Bell size={28}/></div>
          <div style={{fontSize:18,fontWeight:900,marginBottom:4}}>Notifiche</div>
          <div style={{fontSize:13,color:th.textSub,marginBottom:20}}>Ricevi avvisi sugli imprevisti</div>
          <div style={{borderRadius:14,padding:16,marginBottom:12,background:permission==="granted"?"rgba(34,197,94,.08)":th.bgMuted,border:`1px solid ${permission==="granted"?"rgba(34,197,94,.3)":th.border}`,textAlign:"left"}}>
            <div style={{fontSize:14,fontWeight:700,color:permission==="granted"?"#16a34a":th.textSub,marginBottom:4,display:"flex",alignItems:"center",gap:6}}><Bell size={14}/> Notifiche push</div>
            <div style={{fontSize:12,color:th.textSub,marginBottom:12,lineHeight:1.6}}>Ricevi una notifica ogni volta che viene segnalato un imprevisto sulla SS674.</div>
            {permission==="granted"
              ?notifEnabled
                ?<><div style={{fontSize:13,color:"#16a34a",fontWeight:700,marginBottom:10,display:"flex",alignItems:"center",gap:4}}><Check size={13}/> Notifiche attive</div>
                  <button onClick={disableNotifications} style={{width:"100%",padding:12,borderRadius:10,border:"1px solid #ef444433",background:"rgba(239,68,68,.06)",color:"#ef4444",fontSize:14,fontWeight:700,cursor:"pointer"}}>DISABILITA</button></>
                :<><div style={{fontSize:13,color:th.textSub,fontWeight:700,marginBottom:10}}>Disabilitate</div>
                  <button onClick={()=>{requestPermission();setShowNotify(false);}} style={{width:"100%",padding:12,borderRadius:10,border:"none",background:`linear-gradient(135deg,${th.accent},#1d4ed8)`,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer"}}>RIABILITA</button></>
              :<button onClick={()=>{requestPermission();setShowNotify(false);}} style={{width:"100%",padding:12,borderRadius:10,border:"none",background:`linear-gradient(135deg,${th.accent},#1d4ed8)`,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer"}}>ATTIVA NOTIFICHE</button>
            }
          </div>
          <div style={{borderRadius:14,padding:16,marginBottom:20,background:inViaggio?th.accentLight:th.bgMuted,border:`1px solid ${inViaggio?th.accent+"44":th.border}`,textAlign:"left"}}>
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10}}>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:700,color:inViaggio?th.text:th.textSub,marginBottom:3,display:"flex",alignItems:"center",gap:6}}><Car size={14}/> Sono in viaggio</div>
                <div style={{fontSize:12,color:th.textSub,lineHeight:1.5}}>Priorità massima alle notifiche per 2h.</div>
              </div>
              <Toggle on={inViaggio} onChange={()=>setInViaggio(v=>!v)} accent={th.accent}/>
            </div>
          </div>
          <button onClick={()=>setShowNotify(false)} style={{width:"100%",padding:13,borderRadius:12,border:"none",background:th.bgMuted,color:th.textSub,fontSize:14,fontWeight:600,cursor:"pointer"}}>Chiudi</button>
        </Modal>
      )}

      {dupModal&&(
        <Modal th={th} onClose={()=>setDupModal(null)}>
          <div style={{marginBottom:10,display:"flex",justifyContent:"center"}}><AlertTriangle size={36} color="#f97316"/></div>
          <div style={{fontSize:17,fontWeight:900,marginBottom:6}}>Segnalazione già presente!</div>
          <div style={{fontSize:13,color:th.textSub,lineHeight:1.7,marginBottom:16}}>
            <strong style={{color:dupModal.color}}>{dupModal.label}</strong> già segnalato vicino a te.<br/>Vuoi confermarla invece di crearne una nuova?
          </div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>{setDupModal(null);setStep(3);}} style={{flex:1,padding:12,borderRadius:12,border:`1px solid ${th.border}`,background:th.bgMuted,color:th.textSub,fontSize:13,fontWeight:600,cursor:"pointer"}}>Segnala comunque</button>
            <button onClick={()=>handleConfirmDup(dupModal)} style={{flex:1,padding:12,borderRadius:12,border:"none",background:"#16a34a",color:"#fff",fontSize:13,fontWeight:800,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><ThumbsUp size={13}/> CONFERMO</button>
          </div>
        </Modal>
      )}

      {resolveId&&(
        <Modal th={th} onClose={()=>setResolveId(null)}>
          <div style={{marginBottom:10,display:"flex",justifyContent:"center"}}><CheckCircle size={36} color="#22c55e"/></div>
          <div style={{fontSize:17,fontWeight:900,marginBottom:6}}>Confermi RISOLTO?</div>
          <div style={{fontSize:13,color:th.textSub,marginBottom:20,lineHeight:1.6}}>La segnalazione rimarrà visibile come risolta per 1 ora, poi sparirà.</div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>setResolveId(null)} style={{flex:1,padding:13,borderRadius:12,border:`1px solid ${th.border}`,background:th.bgMuted,color:th.textSub,fontSize:14,fontWeight:600,cursor:"pointer"}}>Annulla</button>
            <button onClick={()=>handleResolve(resolveId)} style={{flex:1,padding:13,borderRadius:12,border:"none",background:"#16a34a",color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer"}}>SÌ, RISOLTO</button>
          </div>
        </Modal>
      )}

      {addNoteId&&(
        <Modal th={th} onClose={()=>{setAddNoteId(null);setAddNoteText("");}}>
          <div style={{fontSize:17,fontWeight:900,marginBottom:6,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><FileText size={17}/> Aggiungi dettagli</div>
          <div style={{fontSize:13,color:th.textSub,marginBottom:14,lineHeight:1.6}}>Solo informazioni <strong style={{color:th.text}}>certe</strong>.</div>
          <textarea placeholder="Es: Traffico sciolto, corsia sinistra libera..." value={addNoteText} onChange={e=>setAddNoteText(e.target.value)} rows={3}
            style={{width:"100%",padding:12,borderRadius:12,border:`1px solid ${th.border}`,background:th.bgCard,color:th.text,fontSize:14,fontFamily:FONT,boxSizing:"border-box",resize:"none",outline:"none",marginBottom:14}}/>
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>{setAddNoteId(null);setAddNoteText("");}} style={{flex:1,padding:12,borderRadius:12,border:`1px solid ${th.border}`,background:th.bgMuted,color:th.textSub,fontSize:13,fontWeight:600,cursor:"pointer"}}>Annulla</button>
            <button onClick={()=>handleAddNote(addNoteId,addNoteText)} disabled={!addNoteText} style={{flex:1,padding:12,borderRadius:12,border:"none",background:addNoteText?`linear-gradient(135deg,${th.accent},#1d4ed8)`:th.border,color:"#fff",fontSize:13,fontWeight:800,cursor:addNoteText?"pointer":"not-allowed"}}>INVIA</button>
          </div>
        </Modal>
      )}

      {mapReport&&(
        <Modal th={th} onClose={()=>setMapReport(null)}>
          <div style={{fontSize:15,fontWeight:900,marginBottom:2,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><MapPin size={15}/> {mapReport.label}</div>
          <div style={{fontSize:12,color:th.textSub,marginBottom:14}}>{mapReport.kmLabel} · {dirLabel(mapReport.dirProblema)}</div>
          <div style={{width:"100%",height:150,borderRadius:14,marginBottom:14,background:"linear-gradient(135deg,#1a2535,#0d1b2a)",border:"1px solid #1e3a5f",position:"relative",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{position:"absolute",width:"100%",height:22,background:"#141824",top:"44%"}}/>
            <div style={{position:"relative",zIndex:2,display:"flex",flexDirection:"column",alignItems:"center"}}>
              <div style={{width:36,height:36,borderRadius:"50% 50% 50% 0",transform:"rotate(-45deg)",background:mapReport.color,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 4px 16px ${mapReport.color}80`}}>
                <span style={{transform:"rotate(45deg)",display:"flex"}}><ReportIcon label={mapReport.label} size={14}/></span>
              </div>
              <div style={{width:2,height:10,background:mapReport.color,marginTop:2}}/>
            </div>
          </div>
          <a href={`https://maps.google.com/?q=${mapReport.lat||43.4},${mapReport.lng||11.2}`} target="_blank" rel="noopener noreferrer"
            style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,width:"100%",padding:13,borderRadius:12,background:`linear-gradient(135deg,${th.accent},#1d4ed8)`,color:"#fff",fontSize:14,fontWeight:700,textDecoration:"none",textAlign:"center",marginBottom:10,boxSizing:"border-box",letterSpacing:.5}}>
            <Map size={15}/> APRI IN GOOGLE MAPS
          </a>
          <button onClick={()=>setMapReport(null)} style={{width:"100%",padding:10,borderRadius:12,border:`1px solid ${th.border}`,background:"transparent",color:th.textSub,fontSize:13,cursor:"pointer"}}>Chiudi</button>
        </Modal>
      )}
    </div>
  );
}

// ── ReportCard ────────────────────────────────────────────────
function ReportCard({th,r,onConfirm,alreadyConfirmed,onResolve,onMap,onAddNote,onToggleSoccorsi}){
  const b=badge(r.confirmed);
  const sc=sevColor(r.label);
  const FONT='-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
  return(
    <div style={{borderRadius:20,padding:16,marginBottom:14,background:th.bgCard,border:`1px solid ${th.border}`,boxShadow:th.isDark?"none":"0 2px 14px rgba(0,0,0,.06)"}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:14,marginBottom:12}}>
        <div style={{width:52,height:52,borderRadius:14,flexShrink:0,background:sc.bg,color:sc.fg,display:"flex",alignItems:"center",justifyContent:"center"}}><ReportIcon label={r.label} size={24}/></div>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:4}}>
            <span style={{fontSize:16,fontWeight:900,color:r.color,letterSpacing:.5}}>{r.label}</span>
            <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,background:b.bg,color:b.color}}>{b.label}</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4,marginTop:2}}>
            <div style={{display:"flex",alignItems:"center",gap:5,fontSize:12,color:th.textSub}}><Compass size={12}/> {dirLabel(r.dirProblema)} · {r.kmLabel}</div>
            <div style={{display:"flex",alignItems:"center",gap:5,fontSize:12,color:th.textSub}}>{r.corsia==="propria"?<Car size={12}/>:<ArrowLeftRight size={12}/>} {r.corsia==="propria"?"Corsia principale":"Corsia opposta"}</div>
          </div>
        </div>
      </div>
      <button onClick={onToggleSoccorsi} style={{width:"100%",padding:"10px 14px",marginBottom:10,borderRadius:12,border:`1px solid ${r.soccorsi?"rgba(34,197,94,.4)":th.border}`,background:r.soccorsi?"rgba(34,197,94,.08)":"transparent",display:"flex",alignItems:"center",gap:10,cursor:"pointer",transition:"all .2s"}}>
        <div style={{color:r.soccorsi?"#16a34a":th.textFaint,display:"flex"}}>{r.soccorsi?<HeartPulse size={20}/>:<HeartPulse size={20}/>}</div>
        <div style={{textAlign:"left",flex:1}}>
          <div style={{fontSize:13,fontWeight:700,color:r.soccorsi?"#16a34a":th.textSub}}>{r.soccorsi?"SOCCORSI ALLERTATI":"Segnala soccorsi allertati"}</div>
          <div style={{fontSize:11,color:th.textFaint,marginTop:1}}>{r.soccorsi?"Non richiamare il 112 — già avvisato":"Tocca se hai già chiamato i soccorsi"}</div>
        </div>
        {r.soccorsi&&<Check size={16} color="#16a34a"/>}
      </button>
      {r.note&&<div style={{display:"flex",alignItems:"flex-start",gap:8,padding:"9px 12px",marginBottom:10,borderRadius:10,background:th.bgMuted,borderLeft:`3px solid ${r.color}77`,fontSize:13,color:th.textSub,lineHeight:1.5}}><FileText size={14} style={{flexShrink:0,marginTop:1}}/> {r.note}</div>}
      <button onClick={onMap} style={{width:"100%",padding:"9px 0",marginBottom:10,borderRadius:10,border:`1px solid ${th.accent}22`,background:th.accentLight,color:th.accent,fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><Map size={14}/> VEDI SU MAPPA</button>
      <div style={{display:"flex",gap:8}}>
        <button onClick={alreadyConfirmed?undefined:onConfirm} disabled={alreadyConfirmed} style={{flex:1,padding:"9px 0",borderRadius:10,border:"1px solid",borderColor:alreadyConfirmed?th.border:"rgba(34,197,94,.3)",background:alreadyConfirmed?"transparent":"rgba(34,197,94,.08)",color:alreadyConfirmed?th.textFaint:"#16a34a",fontSize:12,fontWeight:800,cursor:alreadyConfirmed?"not-allowed":"pointer",letterSpacing:.5,display:"flex",alignItems:"center",justifyContent:"center",gap:4}}><ThumbsUp size={11}/> {alreadyConfirmed?"CONF.":"CONFERMO"} ({r.confirmed})</button>
        <button onClick={onAddNote} style={{flex:1,padding:"9px 0",borderRadius:10,border:`1px solid ${th.border}`,background:"transparent",color:th.textSub,fontSize:12,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:4}}><FileText size={11}/> NOTA</button>
        <button onClick={onResolve} style={{flex:1,padding:"9px 0",borderRadius:10,border:`1px solid ${th.border}`,background:"transparent",color:th.textSub,fontSize:12,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:4}}><CheckCircle size={11}/> RISOLTO</button>
      </div>
    </div>
  );
}

// ── Micro components ──────────────────────────────────────────
const FONT_S='-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
function Toggle({on,onChange,accent}){return(
  <div onClick={onChange} style={{flexShrink:0,width:46,height:26,borderRadius:13,background:on?accent:"#cbd5e1",cursor:"pointer",position:"relative",transition:"background .2s"}}>
    <div style={{position:"absolute",top:3,left:on?22:3,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .2s",boxShadow:"0 1px 4px rgba(0,0,0,.25)"}}/>
  </div>
);}
const Label=({th,children})=>(
  <div style={{fontSize:11,color:th.textSub,letterSpacing:".3em",textTransform:"uppercase",marginBottom:10,fontWeight:600}}>{children}</div>
);
const Sub=({th,children})=>(
  <div style={{fontSize:13,color:th.textSub,lineHeight:1.6,marginBottom:4}}>{children}</div>
);
const Back=({th,onClick})=>(
  <button onClick={onClick} style={{background:"transparent",border:"none",color:th.textSub,fontSize:13,cursor:"pointer",marginBottom:20,letterSpacing:.5,padding:0,fontFamily:FONT_S}}>← Indietro</button>
);
const Btn=({th,onClick,children})=>(
  <button onClick={onClick} style={{width:"100%",padding:"16px 0",borderRadius:14,border:"none",background:`linear-gradient(135deg,${th.accent},#1d4ed8)`,color:"#fff",fontSize:16,fontWeight:800,letterSpacing:2,cursor:"pointer",boxShadow:`0 4px 18px ${th.accent}44`,textTransform:"uppercase",fontFamily:FONT_S}}>{children}</button>
);
const CorsiaBtn=({th,selected,onClick,Icon,title,sub,color})=>(
  <button onClick={onClick} style={{width:"100%",padding:"18px 18px",borderRadius:14,border:"2px solid",borderColor:selected?color:th.border,background:selected?`rgba(${hexToRgb(color)},.1)`:th.bgCard,cursor:"pointer",transition:"all .18s",boxShadow:selected?`0 0 18px ${color}25`:"none",display:"flex",alignItems:"center",gap:16,textAlign:"left",fontFamily:FONT_S}}>
    <span style={{color:selected?color:th.textFaint,display:"flex"}}><Icon size={24}/></span>
    <div>
      <div style={{fontSize:15,fontWeight:800,color:selected?color:th.textSub,letterSpacing:1}}>{title}</div>
      <div style={{fontSize:12,color:th.textFaint,marginTop:2}}>{sub}</div>
    </div>
  </button>
);
const IR=({th,icon,label,value})=>(
  <div style={{display:"flex",gap:10,marginBottom:8,alignItems:"flex-start"}}>
    <span style={{color:th.textFaint,display:"flex",flexShrink:0,marginTop:1}}>{icon}</span>
    <div><span style={{fontSize:10,color:th.textSub,letterSpacing:".15em",textTransform:"uppercase"}}>{label}: </span><span style={{fontSize:13,color:th.textSub}}>{value}</span></div>
  </div>
);
const Modal=({th,children,onClose})=>(
  <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:50,background:"rgba(0,0,0,.65)",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
    <div onClick={e=>e.stopPropagation()} style={{background:th.bgCard,borderRadius:24,padding:"28px 22px",width:"100%",maxWidth:380,border:`1px solid ${th.border}`,boxShadow:"0 20px 60px rgba(0,0,0,.4)",textAlign:"center"}}>{children}</div>
  </div>
);
