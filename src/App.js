import { useState, useEffect, useCallback, useRef } from "react";
import { signInAnonymously } from "firebase/auth";
import { auth } from "./lib/firebase";
import {
  fetchReports, addReport, confirmReport, noreportReport,
  resolveReport, reactivateReport, toggleSoccorsi, addNote, sendNoteToTelegram
} from "./lib/db";
import { useGPS } from "./hooks/useGPS";
import { useNotifications } from "./hooks/useNotifications";

// ── Costanti ──────────────────────────────────────────────────
const ALERTS = [
  { id:"incidente", emoji:"🚨", label:"INCIDENTE", color:"#E53935", glow:"#ff6b6b" },
  { id:"traffico",  emoji:"🚦", label:"TRAFFICO",  color:"#FB8C00", glow:"#ffb347" },
  { id:"animali",   emoji:"🦌", label:"ANIMALI",   color:"#43A047", glow:"#69d97d" },
  { id:"lavori",    emoji:"🚧", label:"LAVORI",    color:"#F9A825", glow:"#ffe066" },
  { id:"nebbia",    emoji:"🌫️", label:"NEBBIA",    color:"#78909C", glow:"#b0bec5" },
  { id:"veicolo",   emoji:"🚗", label:"FERMO",     color:"#8E24AA", glow:"#ce93d8" },
  { id:"altro",     emoji:"❓", label:"ALTRO",     color:"#0288D1", glow:"#4fc3f7" },
];

function hexToRgb(h){const r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16);return`${r},${g},${b}`;}
function dirLabel(d){return d==="FI"?"→ Firenze":"→ Siena";}
function badge(n){
  if(n>=5)return{label:"✅ VERIFICATA",color:"#E53935",bg:"rgba(229,57,53,0.15)"};
  if(n>=2)return{label:"🟠 PROBABILE", color:"#FB8C00",bg:"rgba(251,140,0,0.12)"};
  return       {label:"🟡 NON VERIF.",color:"#555",   bg:"rgba(255,255,255,0.05)"};
}
function dirSeverity(reps){
  if(reps.some(r=>r.label==="INCIDENTE"))return{color:"#E53935",icon:"🚨"};
  if(reps.some(r=>r.label==="TRAFFICO")) return{color:"#FB8C00",icon:"🚦"};
  if(reps.length>0)                      return{color:"#F9A825",icon:"⚠️"};
  return                                        {color:"#43A047",icon:"✅"};
}
function resolvedMinsAgo(ts){
  if(!ts) return 0;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return Math.round((Date.now()-d.getTime())/60000);
}

// ─────────────────────────────────────────────────────────────
export default function App() {
  // Auth anonima
  useEffect(()=>{ signInAnonymously(auth).catch(console.error); },[]);

  // Dati Firestore — polling ogni 30 secondi (ottimizza letture)
  const [reports, setReports] = useState([]);
  useEffect(()=>{
    fetchReports(setReports); // caricamento immediato
    const interval = setInterval(()=>fetchReports(setReports), 30000);
    return ()=>clearInterval(interval);
  },[]);

  // IDs segnalazioni già confermate da questo dispositivo (anti-spam)
  const [confirmedIds, setConfirmedIds] = useState(()=>{
    try { return JSON.parse(localStorage.getItem("confirmedIds")||"[]"); }
    catch { return []; }
  });
  const [noVotedIds, setNoVotedIds] = useState(()=>{
    try { return JSON.parse(localStorage.getItem("noVotedIds")||"[]"); }
    catch { return []; }
  });

  function hasConfirmed(id){ return confirmedIds.includes(id); }
  function markConfirmed(id){
    const updated = [...confirmedIds, id];
    setConfirmedIds(updated);
    try { localStorage.setItem("confirmedIds", JSON.stringify(updated)); } catch{}
  }
  function hasNoVoted(id){ return noVotedIds.includes(id); }
  function markNoVoted(id){
    const updated = [...noVotedIds, id];
    setNoVotedIds(updated);
    try { localStorage.setItem("noVotedIds", JSON.stringify(updated)); } catch{}
  }

  // GPS
  const { position, loading: gpsLoading, snapshotNow } = useGPS();
  // frozenPosition: posizione congelata al momento del tap "SEGNALA ORA"
  const [frozenPosition, setFrozenPosition] = useState(null);

  // Notifiche
  const { permission, notifEnabled, requestPermission, disableNotifications, incomingAlert, setIncomingAlert } = useNotifications();

  // UI state
  const [screen,setScreen]         = useState("home");
  const [step,setStep]             = useState(0);
  const [myDir,setMyDir]           = useState(null);
  const [selAlert,setSelAlert]     = useState(null);
  const [corsia,setCorsia]         = useState(null);
  const [altroText,setAltroText]   = useState("");
  const [notaText,setNotaText]     = useState("");
  const [sending,setSending]       = useState(false);
  const [pulse,setPulse]           = useState(false);
  const [dupModal,setDupModal]     = useState(null);
  const [resolveId,setResolveId]   = useState(null);
  const [addNoteId,setAddNoteId]   = useState(null);
  const [addNoteText,setAddNoteText]=useState("");
  const [mapReport,setMapReport]   = useState(null);
  const [showNotify,setShowNotify] = useState(false);
  const [inViaggio,setInViaggio]   = useState(false);
  const [expandDir,setExpandDir]   = useState(null);

  useEffect(()=>{const t=setInterval(()=>setPulse(p=>!p),2000);return()=>clearInterval(t);},[]);

  // Derived
  const dirProblema = myDir&&corsia?(corsia==="propria"?myDir:(myDir==="FI"?"SI":"FI")):null;
  const activeReports   = reports.filter(r=>!r.resolved);
  const resolvedReports = reports.filter(r=>r.resolved);
  const repFI = activeReports.filter(r=>r.dirProblema==="FI");
  const repSI = activeReports.filter(r=>r.dirProblema==="SI");
  const sevFI = dirSeverity(repFI);
  const sevSI = dirSeverity(repSI);

  // Segnalazioni vicine (entro 3km)
  const nearbyReports = position
    ? activeReports.filter(r=>Math.abs(r.km - position.km) < 3)
    : [];

  function reset(){
    setStep(0);setMyDir(null);setSelAlert(null);setCorsia(null);
    setAltroText("");setNotaText("");setSending(false);setFrozenPosition(null);
  }
  function goHome(){ setScreen("home"); reset(); }

  // Usa frozenPosition (snapshot al tap) se disponibile, altrimenti position live
  const activePos = frozenPosition || position;

  function checkDuplicates(corsiaVal){
    if(!activePos){ setStep(3); return; }
    const dp=corsiaVal==="propria"?myDir:(myDir==="FI"?"SI":"FI");
    const dup=activeReports.find(r=>r.dirProblema===dp&&Math.abs(r.km-activePos.km)<2);
    if(dup) setDupModal(dup); else setStep(3);
  }

  async function handleSend(){
    if(!activePos){ alert("GPS non disponibile. Attendi la posizione."); return; }
    // Anti-spam: max 1 segnalazione ogni 5 minuti per dispositivo
    try {
      const lastSent = parseInt(localStorage.getItem("lastSentAt")||"0");
      const elapsed  = Date.now() - lastSent;
      const LIMIT_MS = 2 * 60 * 1000;
      if(elapsed < LIMIT_MS){
        const remaining = Math.ceil((LIMIT_MS - elapsed) / 60000);
        alert(`Hai già segnalato di recente. Attendi ancora ${remaining} minuto${remaining>1?"i":""}.`);
        return;
      }
    } catch{}
    setSending(true);
    try {
      await addReport({
        emoji: selAlert.emoji,
        label: selAlert.id==="altro"?(altroText||"ALTRO"):selAlert.label,
        dirProblema,
        corsia,
        km:      activePos.km,
        kmLabel: activePos.kmLabel,
        locInfo: activePos.locInfo||null,
        lat:     activePos.lat,
        lng:     activePos.lng,
        note: notaText||null,
        color: selAlert.color,
      });
      try { localStorage.setItem("lastSentAt", Date.now().toString()); } catch{}
      setScreen("sent");
      setTimeout(goHome, 2600);
    } catch(e){
      console.error(e);
      alert("Errore nell'invio. Riprova.");
    } finally {
      setSending(false);
    }
  }

  function handleNoreport(id, noCount){
    if(hasNoVoted(id)||hasConfirmed(id)) return;
    const newCount = (noCount||0) + 1;
    setReports(p=>p.map(r=>r.id===id?{
      ...r,
      noCount: newCount,
      ...(newCount>=5?{resolved:true,resolvedAt:{toDate:()=>new Date()}}:{})
    }:r));
    noreportReport(id, noCount).catch(console.error);
    markNoVoted(id);
  }

  async function handleConfirmDup(dup){
    setReports(p=>p.map(r=>r.id===dup.id?{...r,confirmed:r.confirmed+1}:r));
    confirmReport(dup.id, dup.confirmed).catch(console.error);
    markConfirmed(dup.id);
    setDupModal(null); setScreen("sent"); setTimeout(goHome,2400);
  }

  // Azioni ottimistiche: aggiornano UI subito, poi sincronizzano Firestore
  function handleConfirm(id, confirmed){
    if(hasConfirmed(id)) return;
    setReports(p=>p.map(r=>r.id===id?{...r,confirmed:r.confirmed+1}:r));
    confirmReport(id, confirmed).catch(console.error);
    markConfirmed(id);
  }
  function handleResolve(id){
    setReports(p=>p.map(r=>r.id===id?{...r,resolved:true,resolvedAt:{toDate:()=>new Date()}}:r));
    resolveReport(id).catch(console.error);
    setResolveId(null);
  }
  function handleReactivate(id){
    setReports(p=>p.map(r=>r.id===id?{...r,resolved:false,resolvedAt:null}:r));
    reactivateReport(id).catch(console.error);
  }
  function handleToggleSoccorsi(id, current){
    setReports(p=>p.map(r=>r.id===id?{...r,soccorsi:!current}:r));
    toggleSoccorsi(id, current).catch(console.error);
  }
  async function handleAddNote(id, note){
    setReports(p=>p.map(r=>r.id===id?{...r,note}:r));
    await addNote(id, note);
    await sendNoteToTelegram(id, note);
    setAddNoteId(null); setAddNoteText("");
  }

  return(
    <div style={{
      height:"100dvh",background:"#080a0f",
      fontFamily:"'Barlow Condensed','Impact','Arial Narrow',sans-serif",
      color:"#f0f0f0",display:"flex",flexDirection:"column",
      maxWidth:430,margin:"0 auto",position:"relative",overflow:"hidden"}}>

      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,
        background:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.06) 2px,rgba(0,0,0,0.06) 4px)"}}/>

      {/* PROXIMITY TOAST */}
      {incomingAlert&&(
        <div style={{position:"fixed",top:0,left:"50%",transform:"translateX(-50%)",
          zIndex:100,width:"calc(100% - 24px)",maxWidth:406,margin:"12px auto",borderRadius:14,
          background:"linear-gradient(135deg,#1a0a00,#2d1000)",border:"2px solid #E53935",
          padding:"14px 16px",boxShadow:"0 8px 40px rgba(229,57,53,0.5)",
          display:"flex",alignItems:"center",gap:12,animation:"slideDown 0.4s ease"}}>
          <span style={{fontSize:32}}>🚨</span>
          <div style={{flex:1}}>
            <div style={{fontSize:14,fontWeight:900,color:"#E53935",letterSpacing:1}}>
              {incomingAlert.title||"⚠️ IMPREVISTO VICINO"}
            </div>
            <div style={{fontSize:13,color:"#ccc"}}>{incomingAlert.body}</div>
          </div>
          <button onClick={()=>setIncomingAlert(null)}
            style={{background:"transparent",border:"none",color:"#666",fontSize:20,cursor:"pointer"}}>✕</button>
        </div>
      )}

      {/* HEADER */}
      <div style={{position:"sticky",top:0,zIndex:20,background:"rgba(8,10,15,0.97)",
        backdropFilter:"blur(14px)",borderBottom:"2px solid #151820",
        padding:"12px 18px 10px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <div style={{fontSize:10,letterSpacing:5,color:"#444",textTransform:"uppercase"}}>RACCORDO AUTOSTRADALE 3</div>
          <div style={{fontSize:21,fontWeight:900,letterSpacing:1.5,lineHeight:1.1}}>
            SIENA <span style={{color:"#E53935"}}>↔</span> FIRENZE
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={()=>setShowNotify(true)}
            style={{background:"transparent",border:"1px solid",
              borderColor:(permission==="granted"&&notifEnabled)?"#E53935":"#1e2030",
              borderRadius:8,padding:"5px 10px",cursor:"pointer",
              color:(permission==="granted"&&notifEnabled)?"#E53935":"#444",
              fontSize:10,fontWeight:800,letterSpacing:1.5,lineHeight:1,
              boxShadow:(permission==="granted"&&notifEnabled)?"0 0 10px rgba(229,57,53,0.3)":"none"}}>
            {(permission==="granted"&&notifEnabled)?"NOTIF. ON":"NOTIF. OFF"}
          </button>
          {activeReports.length>0&&
            <div style={{background:"#E53935",borderRadius:20,padding:"3px 10px",fontSize:12,fontWeight:800}}>
              {activeReports.length} ATTIVE
            </div>}
          <div style={{width:9,height:9,borderRadius:"50%",background:pulse?"#43A047":"#1b5e20",
            boxShadow:pulse?"0 0 14px #43A047":"none",transition:"all 0.6s"}}/>
        </div>
      </div>

      {/* TABS */}
      <div style={{display:"flex",zIndex:5,borderBottom:"1px solid #151820"}}>
        {[["home","Home"],["feed",`Live (${activeReports.length})`]].map(([s,label])=>(
          <button key={s} onClick={()=>{setScreen(s);reset();}}
            style={{flex:1,padding:"11px 0",background:"transparent",border:"none",
              color:(screen===s||(["flow","sent"].includes(screen)&&s==="home"))?"#fff":"#444",
              fontSize:14,fontWeight:800,letterSpacing:1.5,cursor:"pointer",
              borderBottom:(screen===s||(["flow","sent"].includes(screen)&&s==="home"))?"2px solid #E53935":"2px solid transparent",
              transition:"all 0.2s"}}>{label}</button>
        ))}
      </div>

      <div style={{flex:1,padding:"18px 14px",position:"relative",zIndex:2,
        overflow:screen==="home"?"hidden":"auto",minHeight:0,display:"flex",flexDirection:"column"}}>

        {/* ══ HOME ══ */}
        {screen==="home"&&(
          <div style={{flex:1,display:"flex",flexDirection:"column",minHeight:0}}>

            {/* TOP: segnalazioni */}
            <div style={{flex:1,overflowY:"auto",minHeight:0,paddingBottom:8}}>
              <div style={{
                fontSize:11,color:"#555",letterSpacing:4,
                textTransform:"uppercase",marginBottom:14,marginTop:2,
              }}>Segnalazioni</div>

              <DirStrip label="→ FIRENZE" reports={repFI} sev={sevFI}
                expanded={expandDir==="FI"} onToggle={()=>setExpandDir(e=>e==="FI"?null:"FI")}
                onConfirm={(id,n)=>handleConfirm(id,n)}
                onNoreport={(id,n)=>handleNoreport(id,n)}
                hasConfirmed={hasConfirmed} hasNoVoted={hasNoVoted}
                onMap={setMapReport}/>

              <DirStrip label="→ SIENA" reports={repSI} sev={sevSI}
                expanded={expandDir==="SI"} onToggle={()=>setExpandDir(e=>e==="SI"?null:"SI")}
                onConfirm={(id,n)=>handleConfirm(id,n)}
                onNoreport={(id,n)=>handleNoreport(id,n)}
                hasConfirmed={hasConfirmed} hasNoVoted={hasNoVoted}
                onMap={setMapReport}/>
            </div>

            {/* BOTTOM: GPS + pulsante segnala */}
            <div style={{
              flexShrink:0,paddingTop:18,paddingBottom:4,
              borderTop:"1px solid #1a1a22",
            }}>
              <div style={{
                display:"flex",alignItems:"center",gap:8,marginBottom:14,
                padding:"7px 12px",borderRadius:20,
                background:"rgba(255,255,255,0.03)",border:"1px solid #1a1a22",
                width:"fit-content",
              }}>
                <div style={{
                  width:6,height:6,borderRadius:"50%",
                  background:gpsLoading?"#FB8C00":position?"#43A047":"#E53935",
                  boxShadow:position?"0 0 8px #43A047":"none",transition:"all 0.5s",
                }}/>
                <span style={{fontSize:11,color:"#555",letterSpacing:1}}>
                  {gpsLoading?"GPS in rilevamento..."
                    :position?`${position.kmLabel} · rilevata`
                    :"GPS non disponibile"}
                </span>
              </div>

              <BigBtn onClick={async()=>{
                try {
                  const snap = await snapshotNow();
                  setFrozenPosition(snap);
                } catch(e){ setFrozenPosition(position); }
                setScreen("flow"); setStep(0);
              }}>SEGNALA ORA</BigBtn>
            </div>

          </div>
        )}

        {/* ══ FLOW ══ */}
        {screen==="flow"&&(
          <div>
            <div style={{display:"flex",gap:5,marginBottom:22,alignItems:"center"}}>
              {[0,1,2,3,4].map(n=>(
                <div key={n} style={{flex:1,height:3,borderRadius:2,
                  background:step>n?"#E53935":step===n?"#E5393566":"#1e2030",transition:"background 0.3s"}}/>
              ))}
              <span style={{fontSize:11,color:"#444",marginLeft:5,whiteSpace:"nowrap"}}>{step+1}/5</span>
            </div>

            {step===0&&<>
              <T>Dove stai andando?</T>
              <div style={{display:"flex",gap:11,marginTop:4}}>
                {[["FI","→ FIRENZE"],["SI","→ SIENA"]].map(([d,l])=>(
                  <DirBtn key={d} selected={myDir===d} onClick={()=>{setMyDir(d);setStep(1);}} label={l}/>
                ))}
              </div>
            </>}

            {step===1&&<>
              <Back onClick={()=>setStep(0)}/>
              <T>Tipo di imprevisto</T>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:16}}>
                {ALERTS.map(a=>(
                  <AlertBtn key={a.id} a={a} selected={selAlert?.id===a.id}
                    onClick={()=>{setSelAlert(a);if(a.id!=="altro")setStep(2);}}/>
                ))}
              </div>
              {selAlert?.id==="altro"&&(
                <div>
                  <input placeholder="Descrivi (opzionale)..." value={altroText}
                    onChange={e=>setAltroText(e.target.value)}
                    style={{width:"100%",padding:"13px",borderRadius:10,border:"1px solid #252836",
                      background:"rgba(255,255,255,0.05)",color:"#fff",fontSize:15,
                      fontFamily:"inherit",boxSizing:"border-box",outline:"none",marginBottom:10}}/>
                  <Btn onClick={()=>setStep(2)}>AVANTI →</Btn>
                </div>
              )}
            </>}

            {step===2&&selAlert&&<>
              <Back onClick={()=>setStep(1)}/>
              <T>Dove si trova il problema?</T>
              <Sub>Stai andando <strong style={{color:"#fff"}}>{dirLabel(myDir)}</strong>.</Sub>
              <div style={{display:"flex",flexDirection:"column",gap:11,margin:"16px 0"}}>
                <CorsiaBtn selected={corsia==="propria"} color="#E53935"
                  onClick={()=>{setCorsia("propria");checkDuplicates("propria");}}
                  emoji="🚗" title="SULLA MIA CORSIA" sub={`Problema direzione ${dirLabel(myDir)}`}/>
                <CorsiaBtn selected={corsia==="opposta"} color="#FB8C00"
                  onClick={()=>{setCorsia("opposta");checkDuplicates("opposta");}}
                  emoji="🔄" title="CORSIA OPPOSTA" sub={`Problema direzione ${dirLabel(myDir==="FI"?"SI":"FI")}`}/>
              </div>
            </>}

            {step===3&&<>
              <Back onClick={()=>setStep(2)}/>
              <T>Dettagli aggiuntivi</T>
              <Sub>Opzionale. Solo informazioni <strong style={{color:"#ccc"}}>certe</strong>.</Sub>
              <div style={{display:"flex",alignItems:"center",gap:10,margin:"14px 0",
                padding:"12px 14px",borderRadius:10,
                background:"rgba(67,160,71,0.1)",border:"1px solid rgba(67,160,71,0.3)"}}>
                <span style={{fontSize:20}}>📍</span>
                <div>
                  <div style={{fontSize:13,fontWeight:800,color:"#66bb6a"}}>
                    Posizione registrata al tap ✓
                  </div>
                  <div style={{fontSize:12,color:"#555"}}>
                    {activePos?`${activePos.kmLabel} · ${dirLabel(dirProblema)}`:"Rilevamento in corso..."}
                    {activePos?.locInfo&&<div style={{marginTop:2,color:"#444",fontSize:11}}>{activePos.locInfo}</div>}
                  </div>
                </div>
              </div>
              <textarea placeholder="Es: Camion di traverso, coda 1km... (opzionale)"
                value={notaText} onChange={e=>setNotaText(e.target.value)} rows={3}
                style={{width:"100%",padding:"13px",borderRadius:10,border:"1px solid #252836",
                  background:"rgba(255,255,255,0.05)",color:"#fff",fontSize:14,
                  fontFamily:"inherit",boxSizing:"border-box",resize:"none",outline:"none",marginBottom:14}}/>
              <Btn onClick={()=>setStep(4)}>{notaText?"AVANTI CON NOTA →":"SALTA →"}</Btn>
            </>}

            {step===4&&selAlert&&<>
              <Back onClick={()=>setStep(3)}/>
              <T>Riepilogo</T>
              <div style={{borderRadius:16,padding:"18px",marginBottom:20,
                background:`rgba(${hexToRgb(selAlert.color)},0.1)`,
                border:`2px solid ${selAlert.color}44`}}>
                <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:14}}>
                  <span style={{fontSize:44}}>{selAlert.emoji}</span>
                  <div>
                    <div style={{fontSize:22,fontWeight:900,color:selAlert.color,letterSpacing:2}}>
                      {selAlert.id==="altro"?(altroText||"ALTRO"):selAlert.label}
                    </div>
                    <div style={{fontSize:13,color:"#777",marginTop:2}}>
                      {corsia==="propria"?"🚗 Mia corsia":"🔄 Corsia opposta"}
                    </div>
                  </div>
                </div>
                <IR icon="🧭" label="Direzione"  value={dirLabel(dirProblema)}/>
                <IR icon="📍" label="Posizione"  value={activePos?`${activePos.kmLabel}${activePos.locInfo?` · ${activePos.locInfo}`:""} (registrata al tap)`:"..."}/>
                <IR icon="⚠️" label="Precisione" value="Chilometraggio approssimativo ±300 m"/>
                <IR icon="📣" label="Telegram"   value="Pin + messaggio al gruppo"/>
                <IR icon="NOT" label="Push"        value="Notifica a tutti gli utenti"/>
                {notaText&&<IR icon="📝" label="Nota" value={notaText}/>}
              </div>
              <button onClick={handleSend} disabled={sending||!activePos}
                style={{width:"100%",padding:"20px 0",borderRadius:14,border:"none",
                  background:(sending||!activePos)?"#1a1e2a":`linear-gradient(135deg,${selAlert.color},${selAlert.color}bb)`,
                  color:"#fff",fontSize:20,fontWeight:900,letterSpacing:3,
                  cursor:(sending||!activePos)?"not-allowed":"pointer",
                  boxShadow:(sending||!activePos)?"none":`0 6px 28px ${selAlert.glow}50`,
                  transition:"all 0.3s",textTransform:"uppercase"}}>
                {sending?"⏳ Invio in corso...":!activePos?"⏳ Attendi GPS...":"🚀 SEGNALA ORA"}
              </button>
              <div style={{textAlign:"center",marginTop:10,fontSize:10,color:"#2a2e40",letterSpacing:2}}>
                NESSUN DATO PERSONALE INVIATO
              </div>
            </>}
          </div>
        )}

        {/* ══ SENT ══ */}
        {screen==="sent"&&(
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:300,textAlign:"center"}}>
            <div style={{fontSize:70,marginBottom:18,animation:"pop 0.4s ease"}}>✅</div>
            <div style={{fontSize:26,fontWeight:900,marginBottom:8}}>Segnalazione inviata!</div>
            <div style={{fontSize:14,color:"#666",lineHeight:1.9}}>
              📍 {activePos?.kmLabel}{activePos?.locInfo?` · ${activePos.locInfo}`:""} RA3 registrato<br/>
              📣 Gruppo Telegram avvisato<br/>
              🔔 Notifica push inviata
            </div>
          </div>
        )}

        {/* ══ FEED ══ */}
        {screen==="feed"&&(
          <div>
            {activeReports.length===0&&resolvedReports.length===0&&(
              <div style={{textAlign:"center",color:"#444",marginTop:70,fontSize:16}}>🟢 Nessun imprevisto segnalato</div>
            )}
            {activeReports.length>0&&<>
              <T>Segnalazioni attive</T>
              {activeReports.map(r=>(
                <ReportCard key={r.id} r={r}
                  onConfirm={()=>handleConfirm(r.id, r.confirmed)}
                  alreadyConfirmed={hasConfirmed(r.id)}
                  onResolve={()=>setResolveId(r.id)}
                  onMap={()=>setMapReport(r)}
                  onAddNote={()=>setAddNoteId(r.id)}
                  onToggleSoccorsi={()=>handleToggleSoccorsi(r.id, r.soccorsi)}
                />
              ))}
            </>}
            {resolvedReports.length>0&&<>
              <div style={{height:1,background:"#151820",margin:"20px 0 16px"}}/>
              <div style={{fontSize:11,color:"#333",letterSpacing:4,textTransform:"uppercase",marginBottom:14}}>Risolte · rimangono 1h</div>
              {resolvedReports.map(r=>(
                <div key={r.id} style={{borderRadius:14,padding:"14px",marginBottom:10,opacity:0.4,
                  background:"rgba(255,255,255,0.015)",border:"1px solid #1a1a22",filter:"grayscale(40%)"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                    <span style={{fontSize:26}}>{r.emoji}</span>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:15,fontWeight:800,color:"#555",textDecoration:"line-through"}}>{r.label}</span>
                        <span style={{fontSize:10,padding:"2px 8px",borderRadius:20,
                          background:"rgba(67,160,71,0.15)",color:"#43A047",fontWeight:800}}>✅ RISOLTO</span>
                      </div>
                      <div style={{fontSize:11,color:"#444"}}>
                        {r.kmLabel} · {dirLabel(r.dirProblema)} · chiuso {resolvedMinsAgo(r.resolvedAt)} min fa
                      </div>
                    </div>
                  </div>
                  <button onClick={()=>handleReactivate(r.id)}
                    style={{width:"100%",padding:"9px 0",borderRadius:8,border:"1px solid #333",
                      background:"rgba(255,255,255,0.04)",color:"#666",
                      fontSize:12,fontWeight:800,cursor:"pointer",letterSpacing:1}}>
                    🔄 RIATTIVA SEGNALAZIONE
                  </button>
                </div>
              ))}
            </>}
          </div>
        )}
      </div>

      {/* FOOTER */}
      <div style={{
        flexShrink:0,padding:"6px 12px",borderTop:"1px solid #111520",
        display:"flex",justifyContent:"center",alignItems:"center",
        fontSize:9,color:"#2a2e40",letterSpacing:1.5,whiteSpace:"nowrap",
        background:"rgba(8,10,15,0.97)",overflow:"hidden",
      }}>
        🔒 NESSUN DATO PERSONALE · GPS SOLO IN SEGNALAZIONE
      </div>
      <style>{`
        @keyframes pop{0%{transform:scale(0.3);opacity:0}70%{transform:scale(1.2)}100%{transform:scale(1);opacity:1}}
        @keyframes slideDown{0%{transform:translateX(-50%) translateY(-110%);opacity:0}100%{transform:translateX(-50%) translateY(0);opacity:1}}
      `}</style>

      {/* ── MODAL: Notifiche ── */}
      {showNotify&&(
        <Modal onClose={()=>setShowNotify(false)}>
          <div style={{fontSize:26,marginBottom:6}}>🔔</div>
          <div style={{fontSize:18,fontWeight:900,marginBottom:4}}>Notifiche</div>
          <div style={{fontSize:12,color:"#555",marginBottom:20}}>Ricevi avvisi sugli imprevisti</div>
          <div style={{borderRadius:12,padding:"16px",marginBottom:10,
            background:permission==="granted"?"rgba(67,160,71,0.1)":"rgba(255,255,255,0.04)",
            border:`1px solid ${permission==="granted"?"rgba(67,160,71,0.4)":"#1e2030"}`,textAlign:"left"}}>
            <div style={{fontSize:14,fontWeight:800,color:permission==="granted"?"#66bb6a":"#aaa",marginBottom:3}}>
              🔔 Notifiche push
            </div>
            <div style={{fontSize:12,color:"#555",marginBottom:12,lineHeight:1.6}}>
              Ricevi una notifica ogni volta che viene segnalato un imprevisto sulla SS2.
            </div>
            {permission==="granted"
              ? notifEnabled
                ? <div>
                    <div style={{fontSize:13,color:"#66bb6a",fontWeight:700,marginBottom:10}}>✅ Notifiche attive</div>
                    <button onClick={()=>disableNotifications()}
                      style={{width:"100%",padding:"12px",borderRadius:10,
                        border:"1px solid #E5393544",
                        background:"rgba(229,57,53,0.08)",color:"#E53935",
                        fontSize:14,fontWeight:800,cursor:"pointer"}}>
                      DISABILITA NOTIFICHE
                    </button>
                  </div>
                : <div>
                    <div style={{fontSize:13,color:"#555",fontWeight:700,marginBottom:10}}>Notifiche disabilitate</div>
                    <button onClick={()=>{requestPermission();setShowNotify(false);}}
                      style={{width:"100%",padding:"12px",borderRadius:10,border:"none",
                        background:"linear-gradient(135deg,#E53935,#b71c1c)",color:"#fff",
                        fontSize:14,fontWeight:800,cursor:"pointer"}}>
                      RIABILITA NOTIFICHE
                    </button>
                  </div>
              :<button onClick={()=>{requestPermission();setShowNotify(false);}}
                style={{width:"100%",padding:"12px",borderRadius:10,border:"none",
                  background:"linear-gradient(135deg,#E53935,#b71c1c)",color:"#fff",
                  fontSize:14,fontWeight:800,cursor:"pointer"}}>
                ATTIVA NOTIFICHE
              </button>
            }
          </div>
          <div style={{borderRadius:12,padding:"16px",marginBottom:18,
            background:inViaggio?"rgba(43,127,217,0.1)":"rgba(255,255,255,0.04)",
            border:`1px solid ${inViaggio?"#1565C055":"#1e2030"}`,textAlign:"left"}}>
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10}}>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:800,color:inViaggio?"#fff":"#aaa",marginBottom:3}}>🚗 Sono in viaggio</div>
                <div style={{fontSize:12,color:"#555",lineHeight:1.6}}>Modalità viaggio attiva per 2h. Priorità massima alle notifiche.</div>
              </div>
              <Toggle on={inViaggio} onChange={()=>setInViaggio(v=>!v)}/>
            </div>
          </div>
          <button onClick={()=>setShowNotify(false)}
            style={{width:"100%",padding:"13px",borderRadius:10,border:"none",
              background:"#1a1e2a",color:"#888",fontSize:14,fontWeight:700,cursor:"pointer"}}>Chiudi</button>
        </Modal>
      )}

      {/* ── MODAL: Duplicato ── */}
      {dupModal&&(
        <Modal onClose={()=>setDupModal(null)}>
          <div style={{fontSize:34,marginBottom:8}}>⚠️</div>
          <div style={{fontSize:17,fontWeight:900,marginBottom:6}}>Segnalazione già presente!</div>
          <div style={{fontSize:13,color:"#666",lineHeight:1.7,marginBottom:14}}>
            <strong style={{color:dupModal.color}}>{dupModal.label}</strong> già segnalato vicino a te.<br/>
            Vuoi confermarla invece di crearne una nuova?
          </div>
          <div style={{display:"flex",gap:9}}>
            <button onClick={()=>{setDupModal(null);setStep(3);}}
              style={{flex:1,padding:"12px",borderRadius:10,border:"1px solid #252836",background:"rgba(255,255,255,0.04)",color:"#888",fontSize:13,fontWeight:700,cursor:"pointer"}}>Segnala comunque</button>
            <button onClick={()=>handleConfirmDup(dupModal)}
              style={{flex:1,padding:"12px",borderRadius:10,border:"none",background:"#2e7d32",color:"#fff",fontSize:13,fontWeight:800,cursor:"pointer"}}>👍 CONFERMO</button>
          </div>
        </Modal>
      )}

      {/* ── MODAL: Risolto ── */}
      {resolveId&&(
        <Modal onClose={()=>setResolveId(null)}>
          <div style={{fontSize:34,marginBottom:8}}>✅</div>
          <div style={{fontSize:17,fontWeight:900,marginBottom:6}}>Confermi RISOLTO?</div>
          <div style={{fontSize:13,color:"#666",marginBottom:20,lineHeight:1.6}}>La segnalazione rimarrà visibile come risolta per 1 ora, poi sparirà.</div>
          <div style={{display:"flex",gap:9}}>
            <button onClick={()=>setResolveId(null)}
              style={{flex:1,padding:"13px",borderRadius:10,border:"1px solid #252836",background:"rgba(255,255,255,0.04)",color:"#888",fontSize:14,fontWeight:700,cursor:"pointer"}}>Annulla</button>
            <button onClick={()=>handleResolve(resolveId)}
              style={{flex:1,padding:"13px",borderRadius:10,border:"none",background:"#2e7d32",color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer"}}>SÌ, RISOLTO</button>
          </div>
        </Modal>
      )}

      {/* ── MODAL: Nota ── */}
      {addNoteId&&(
        <Modal onClose={()=>{setAddNoteId(null);setAddNoteText("");}}>
          <div style={{fontSize:17,fontWeight:900,marginBottom:6}}>📝 Aggiungi dettagli</div>
          <div style={{fontSize:13,color:"#666",marginBottom:14,lineHeight:1.6}}>Solo informazioni <strong style={{color:"#aaa"}}>certe</strong>.</div>
          <textarea placeholder="Es: Traffico sciolto, corsia sinistra libera..."
            value={addNoteText} onChange={e=>setAddNoteText(e.target.value)} rows={3}
            style={{width:"100%",padding:"12px",borderRadius:10,border:"1px solid #252836",
              background:"rgba(255,255,255,0.05)",color:"#fff",fontSize:14,
              fontFamily:"inherit",boxSizing:"border-box",resize:"none",outline:"none",marginBottom:14}}/>
          <div style={{display:"flex",gap:9}}>
            <button onClick={()=>{setAddNoteId(null);setAddNoteText("");}}
              style={{flex:1,padding:"12px",borderRadius:10,border:"1px solid #252836",background:"rgba(255,255,255,0.04)",color:"#888",fontSize:13,fontWeight:700,cursor:"pointer"}}>Annulla</button>
            <button onClick={()=>handleAddNote(addNoteId,addNoteText)} disabled={!addNoteText}
              style={{flex:1,padding:"12px",borderRadius:10,border:"none",background:addNoteText?"#0277BD":"#1e2030",color:"#fff",fontSize:13,fontWeight:800,cursor:addNoteText?"pointer":"not-allowed"}}>INVIA</button>
          </div>
        </Modal>
      )}

      {/* ── MODAL: Mappa ── */}
      {mapReport&&(
        <Modal onClose={()=>setMapReport(null)}>
          <div style={{fontSize:15,fontWeight:900,marginBottom:2}}>📍 {mapReport.label}</div>
          <div style={{fontSize:12,color:"#666",marginBottom:14}}>{mapReport.kmLabel} · {dirLabel(mapReport.dirProblema)}</div>
          <div style={{width:"100%",height:155,borderRadius:12,marginBottom:14,
            background:"linear-gradient(135deg,#1a2535,#0d1b2a)",border:"1px solid #1e3a5f",
            position:"relative",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{position:"absolute",width:"100%",height:24,background:"#141824",top:"45%"}}/>
            <div style={{position:"absolute",width:"100%",height:2,background:"#ffffff12",top:"50%"}}/>
            <div style={{position:"relative",zIndex:2,display:"flex",flexDirection:"column",alignItems:"center"}}>
              <div style={{width:38,height:38,borderRadius:"50% 50% 50% 0",transform:"rotate(-45deg)",
                background:mapReport.color,display:"flex",alignItems:"center",justifyContent:"center",
                boxShadow:`0 4px 18px ${mapReport.color}80`}}>
                <span style={{transform:"rotate(45deg)",fontSize:18}}>{mapReport.emoji}</span>
              </div>
              <div style={{width:2,height:11,background:mapReport.color,marginTop:2}}/>
            </div>
          </div>
          <a href={`https://maps.google.com/?q=${mapReport.lat||43.4},${mapReport.lng||11.2}`}
            target="_blank" rel="noopener noreferrer"
            style={{display:"block",width:"100%",padding:"13px",borderRadius:10,border:"none",
              background:"linear-gradient(135deg,#1565C0,#0d47a1)",
              color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer",marginBottom:9,
              letterSpacing:1,textDecoration:"none",textAlign:"center",boxSizing:"border-box"}}>
            🗺️ APRI IN GOOGLE MAPS
          </a>
          <button onClick={()=>setMapReport(null)}
            style={{width:"100%",padding:"10px",borderRadius:10,border:"1px solid #252836",background:"transparent",color:"#555",fontSize:13,cursor:"pointer"}}>Chiudi</button>
        </Modal>
      )}
    </div>
  );
}

// ── DirStrip ──────────────────────────────────────────────────
function DirStrip({label,reports,sev,expanded,onToggle,onConfirm,onNoreport,hasConfirmed,hasNoVoted,onMap}){
  const ok=reports.length===0;
  return(
    <div style={{borderRadius:14,marginBottom:10,overflow:"hidden",
      border:`1px solid ${ok?"#1a2a1a":sev.color+"44"}`,
      boxShadow:ok?"none":`0 2px 20px ${sev.color}18`}}>

      {/* Header — div informativo, NON pulsante */}
      <div
        onClick={!ok?onToggle:undefined}
        style={{
          width:"100%",padding:"15px 16px",
          background:ok?"rgba(67,160,71,0.06)":`rgba(${hexToRgb(sev.color)},0.09)`,
          cursor:ok?"default":"pointer",userSelect:"none",
          display:"flex",alignItems:"center",gap:12,
        }}>
        {/* Semaforo status */}
        <div style={{
          width:12,height:12,borderRadius:"50%",flexShrink:0,
          background:sev.color,
          boxShadow:ok?`0 0 6px ${sev.color}88`:`0 0 10px ${sev.color}`,
        }}/>
        <div style={{flex:1}}>
          {/* Direzione — stile cartello stradale */}
          <div style={{
            fontSize:16,fontWeight:900,color:"#fff",letterSpacing:3,
            textTransform:"uppercase",fontFamily:"'Barlow Condensed','Impact',sans-serif",
          }}>{label}</div>
          {ok
            ?<div style={{fontSize:11,color:"#3a6a3a",marginTop:2,letterSpacing:1}}>
               🟢 Nessun imprevisto
             </div>
            :<div style={{fontSize:12,color:"#ccc",marginTop:2,letterSpacing:0.5}}>
               {reports.map(r=>r.emoji).join(" ")} {reports.map(r=>r.label).join(" · ")}
             </div>}
        </div>
        {/* Badge conteggio + chevron solo se ci sono imprevisti */}
        {!ok&&(
          <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
            <div style={{
              background:sev.color,borderRadius:20,
              padding:"2px 9px",fontSize:12,fontWeight:800,color:"#fff",
              minWidth:22,textAlign:"center",
            }}>{reports.length}</div>
            <div style={{
              fontSize:12,color:"#666",
              transition:"transform 0.25s",
              transform:expanded?"rotate(180deg)":"rotate(0deg)",
            }}>▼</div>
          </div>
        )}
      </div>

      {/* Dettaglio espanso */}
      {expanded&&reports.length>0&&(
        <div style={{borderTop:`1px solid ${sev.color}22`,padding:"10px 12px",background:"rgba(0,0,0,0.25)"}}>
          {/* Banner CONFERMI */}
          <div style={{
            padding:"6px 10px",marginBottom:8,borderRadius:7,
            background:"rgba(67,160,71,0.08)",border:"1px solid rgba(67,160,71,0.18)",
            fontSize:10,color:"#4a9a5a",letterSpacing:2,fontWeight:800,textAlign:"center",
          }}>
            CONFERMI QUESTA SEGNALAZIONE?
          </div>
          {reports.map(r=>(
            <div key={r.id} style={{display:"flex",alignItems:"center",gap:10,
              padding:"10px",marginBottom:6,borderRadius:10,
              background:`rgba(${hexToRgb(r.color)},0.07)`,border:`1px solid ${r.color}22`}}>
              <div style={{
                width:8,height:8,borderRadius:"50%",flexShrink:0,
                background:r.color,boxShadow:`0 0 6px ${r.color}`,
              }}/>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                  <span style={{fontSize:14,fontWeight:800,color:r.color,letterSpacing:1}}>{r.label}</span>
                  {r.soccorsi&&<span style={{fontSize:10,color:"#66bb6a",background:"rgba(67,160,71,0.15)",padding:"1px 7px",borderRadius:10,fontWeight:700}}>soccorsi allertati</span>}
                </div>
                <div style={{fontSize:11,color:"#666",marginTop:2}}>
                  {r.kmLabel}{r.locInfo?` · ${r.locInfo}`:r.loc?` · ${r.loc}`:""}
                </div>
                {r.note&&<div style={{fontSize:11,color:"#888",marginTop:3,fontStyle:"italic"}}>"{r.note}"</div>}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:5,flexShrink:0}}>
                <div style={{display:"flex",gap:4}}>
                  <button
                    disabled={hasConfirmed(r.id)||hasNoVoted(r.id)}
                    onClick={()=>onConfirm(r.id,r.confirmed)}
                    style={{padding:"5px 9px",borderRadius:7,
                      border:`1px solid ${hasConfirmed(r.id)?"#2e7d3244":"#2e7d3266"}`,
                      background:hasConfirmed(r.id)?"rgba(67,160,71,0.25)":"rgba(67,160,71,0.15)",
                      color:hasConfirmed(r.id)?"#66bb6a":"#66bb6a",
                      fontSize:11,fontWeight:900,
                      cursor:hasConfirmed(r.id)||hasNoVoted(r.id)?"default":"pointer",
                      letterSpacing:1,opacity:hasNoVoted(r.id)?0.3:1}}>
                    SI
                  </button>
                  <button
                    disabled={hasNoVoted(r.id)||hasConfirmed(r.id)}
                    onClick={()=>onNoreport(r.id,r.noCount||0)}
                    style={{padding:"5px 9px",borderRadius:7,
                      border:`1px solid ${hasNoVoted(r.id)?"#E5393566":"#E5393544"}`,
                      background:hasNoVoted(r.id)?"rgba(229,57,53,0.2)":"rgba(229,57,53,0.1)",
                      color:"#E53935",fontSize:11,fontWeight:900,
                      cursor:hasNoVoted(r.id)||hasConfirmed(r.id)?"default":"pointer",
                      letterSpacing:1,opacity:hasConfirmed(r.id)?0.3:1}}>
                    NO
                  </button>
                </div>
                <button onClick={()=>onMap(r)}
                  style={{padding:"4px 8px",borderRadius:7,border:"1px solid #1e3a5f",
                    background:"rgba(2,88,161,0.12)",color:"#42a5f5",
                    fontSize:10,cursor:"pointer",letterSpacing:0.5}}>MAP</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ── ReportCard ────────────────────────────────────────────────
function ReportCard({r,onConfirm,alreadyConfirmed,onResolve,onMap,onAddNote,onToggleSoccorsi}){
  const b=badge(r.confirmed);
  return(
    <div style={{borderRadius:16,padding:"16px",marginBottom:14,
      background:"rgba(255,255,255,0.03)",border:`1px solid ${r.color}33`,
      boxShadow:`0 2px 18px ${r.color}10`}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:10}}>
        <span style={{fontSize:30,lineHeight:1}}>{r.emoji}</span>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap",marginBottom:3}}>
            <span style={{fontSize:17,fontWeight:900,color:r.color,letterSpacing:1.5}}>{r.label}</span>
            <span style={{fontSize:10,fontWeight:800,letterSpacing:1.5,padding:"2px 8px",
              borderRadius:20,background:b.bg,color:b.color}}>{b.label}</span>
          </div>
          <div style={{fontSize:12,color:"#666",lineHeight:1.8}}>
            🧭 {dirLabel(r.dirProblema)} · {r.kmLabel}<br/>
            {r.corsia==="propria"?"🚗 Corsia principale":"🔄 Corsia opposta"}
          </div>
        </div>
      </div>
      <button onClick={onToggleSoccorsi}
        style={{width:"100%",padding:"10px 14px",marginBottom:10,borderRadius:10,
          border:`1px solid ${r.soccorsi?"rgba(67,160,71,0.5)":"#252836"}`,
          background:r.soccorsi?"rgba(67,160,71,0.12)":"rgba(255,255,255,0.03)",
          display:"flex",alignItems:"center",gap:10,cursor:"pointer",transition:"all 0.2s"}}>
        <span style={{fontSize:20}}>{r.soccorsi?"🚑":"⬜"}</span>
        <div style={{textAlign:"left",flex:1}}>
          <div style={{fontSize:13,fontWeight:800,color:r.soccorsi?"#66bb6a":"#555",letterSpacing:1}}>
            {r.soccorsi?"SOCCORSI ALLERTATI":"Segnala soccorsi allertati"}
          </div>
          {r.soccorsi
            ?<div style={{fontSize:11,color:"#3a7a3a",marginTop:1}}>Non richiamare il 112 — già avvisato</div>
            :<div style={{fontSize:11,color:"#444",marginTop:1}}>Tocca se hai già chiamato i soccorsi</div>}
        </div>
        {r.soccorsi&&<span style={{fontSize:16,color:"#66bb6a"}}>✓</span>}
      </button>
      {r.note&&(
        <div style={{padding:"9px 12px",marginBottom:10,borderRadius:8,
          background:"rgba(255,255,255,0.04)",borderLeft:`3px solid ${r.color}88`,
          fontSize:13,color:"#aaa",lineHeight:1.5}}>📝 {r.note}</div>
      )}
      <button onClick={onMap}
        style={{width:"100%",padding:"9px 0",marginBottom:9,borderRadius:8,
          border:"1px solid #1e3a5f",background:"rgba(2,88,161,0.15)",color:"#42a5f5",
          fontSize:13,fontWeight:700,cursor:"pointer",letterSpacing:1}}>
        🗺️ VEDI SU MAPPA
      </button>
      <div style={{display:"flex",gap:7}}>
        <button onClick={alreadyConfirmed?undefined:onConfirm} disabled={alreadyConfirmed}
          style={{flex:1,padding:"9px 0",borderRadius:8,border:"1px solid",
            borderColor:alreadyConfirmed?"#1e2030":"#2e7d3244",
            background:alreadyConfirmed?"rgba(255,255,255,0.03)":"rgba(67,160,71,0.1)",
            color:alreadyConfirmed?"#333":"#66bb6a",
            fontSize:12,fontWeight:800,
            cursor:alreadyConfirmed?"not-allowed":"pointer",letterSpacing:1}}>
          {alreadyConfirmed?"✓ CONFERMATO":"👍 CONFERMO"} ({r.confirmed})
        </button>
        <button onClick={onAddNote}
          style={{flex:1,padding:"9px 0",borderRadius:8,border:"1px solid #37474f",
            background:"rgba(255,255,255,0.03)",color:"#78909C",
            fontSize:12,fontWeight:800,cursor:"pointer",letterSpacing:1}}>
          📝 NOTA
        </button>
        <button onClick={onResolve}
          style={{flex:1,padding:"9px 0",borderRadius:8,border:"1px solid #37474f",
            background:"rgba(255,255,255,0.03)",color:"#546e7a",
            fontSize:12,fontWeight:800,cursor:"pointer",letterSpacing:1}}>
          ✅ RISOLTO
        </button>
      </div>
    </div>
  );
}

function Toggle({on,onChange}){return(
  <div onClick={onChange} style={{flexShrink:0,width:46,height:26,borderRadius:13,
    background:on?"#E53935":"#252836",cursor:"pointer",position:"relative",transition:"background 0.2s",
    boxShadow:on?"0 0 10px rgba(229,57,53,0.3)":"none"}}>
    <div style={{position:"absolute",top:3,left:on?22:3,width:20,height:20,
      borderRadius:"50%",background:"#fff",transition:"left 0.2s",boxShadow:"0 1px 4px rgba(0,0,0,0.4)"}}/>
  </div>
);}
const T   =({children})=><div style={{fontSize:12,color:"#555",letterSpacing:4,textTransform:"uppercase",marginBottom:12}}>{children}</div>;
const Sub =({children})=><div style={{fontSize:13,color:"#555",lineHeight:1.6,marginBottom:4}}>{children}</div>;
const Back=({onClick})=><button onClick={onClick} style={{background:"transparent",border:"none",color:"#555",fontSize:13,cursor:"pointer",marginBottom:16,letterSpacing:1,padding:0}}>← Indietro</button>;
const Btn =({onClick,children})=>(
  <button onClick={onClick} style={{width:"100%",padding:"16px 0",borderRadius:13,border:"none",
    background:"linear-gradient(135deg,#E53935,#b71c1c)",color:"#fff",fontSize:17,fontWeight:900,
    letterSpacing:3,cursor:"pointer",boxShadow:"0 4px 22px rgba(229,57,53,0.4)",textTransform:"uppercase"}}>
    {children}
  </button>
);
const BigBtn=({onClick,children})=>(
  <button onClick={onClick} style={{width:"100%",padding:"20px 0",borderRadius:16,border:"none",
    background:"linear-gradient(135deg,#E53935,#b71c1c)",color:"#fff",fontSize:22,fontWeight:900,
    letterSpacing:3,cursor:"pointer",boxShadow:"0 6px 30px rgba(229,57,53,0.45)",textTransform:"uppercase"}}>
    {children}
  </button>
);
const DirBtn=({selected,onClick,label})=>(
  <button onClick={onClick} style={{flex:1,padding:"20px 0",border:"2px solid",
    borderColor:selected?"#E53935":"#181c28",borderRadius:13,
    background:selected?"rgba(229,57,53,0.15)":"rgba(255,255,255,0.025)",
    color:selected?"#fff":"#666",fontSize:18,fontWeight:900,letterSpacing:2,cursor:"pointer",
    transition:"all 0.2s",boxShadow:selected?"0 0 22px rgba(229,57,53,0.3)":"none"}}>
    {label}
  </button>
);
const AlertBtn=({a,selected,onClick})=>(
  <button onClick={onClick} style={{padding:"18px 8px",borderRadius:13,border:"2px solid",
    borderColor:selected?a.color:"#181c28",
    background:selected?`rgba(${hexToRgb(a.color)},0.16)`:"rgba(255,255,255,0.025)",
    cursor:"pointer",transition:"all 0.15s",
    boxShadow:selected?`0 0 20px ${a.glow}40`:"none",
    display:"flex",flexDirection:"column",alignItems:"center",gap:7}}>
    <span style={{fontSize:30}}>{a.emoji}</span>
    <span style={{fontSize:12,fontWeight:800,letterSpacing:2,color:selected?a.color:"#666"}}>{a.label}</span>
  </button>
);
const CorsiaBtn=({selected,onClick,emoji,title,sub,color})=>(
  <button onClick={onClick} style={{width:"100%",padding:"17px 16px",borderRadius:12,border:"2px solid",
    borderColor:selected?color:"#181c28",
    background:selected?`rgba(${hexToRgb(color)},0.14)`:"rgba(255,255,255,0.025)",
    cursor:"pointer",transition:"all 0.18s",
    boxShadow:selected?`0 0 20px ${color}33`:"none",
    display:"flex",alignItems:"center",gap:16,textAlign:"left"}}>
    <span style={{fontSize:28}}>{emoji}</span>
    <div>
      <div style={{fontSize:15,fontWeight:800,color:selected?color:"#777",letterSpacing:1.5}}>{title}</div>
      <div style={{fontSize:12,color:"#555",marginTop:2}}>{sub}</div>
    </div>
  </button>
);
const IR=({icon,label,value})=>(
  <div style={{display:"flex",gap:10,marginBottom:8,alignItems:"flex-start"}}>
    <span style={{fontSize:14}}>{icon}</span>
    <div>
      <span style={{fontSize:10,color:"#555",letterSpacing:2,textTransform:"uppercase"}}>{label}: </span>
      <span style={{fontSize:13,color:"#aaa"}}>{value}</span>
    </div>
  </div>
);
const Modal=({children,onClose})=>(
  <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:50,background:"rgba(0,0,0,0.78)",
    backdropFilter:"blur(9px)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
    <div onClick={e=>e.stopPropagation()} style={{background:"#0e1118",borderRadius:18,padding:"26px 20px",
      width:"100%",maxWidth:380,border:"1px solid #1e2030",
      boxShadow:"0 20px 60px rgba(0,0,0,0.6)",textAlign:"center"}}>
      {children}
    </div>
  </div>
);