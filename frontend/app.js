'use strict';
// ChurnTrackAI UI: hash-routed single page, no build step. Public analyses are temporary (never stored server-side).
const {FEATURES,LABELS,ACTION_LABELS,QUADRANTS,NAMES,money,pct,approvePendingLocal,actionPackage,planCsv,filterCustomers,narrate,agentStates}=window.Core;
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dur=ms=>ms<1000?`${Math.round(ms)} ms`:`${(ms/1000).toFixed(1)} s`;
const pp=x=>(x*100).toLocaleString('es-PE',{maximumFractionDigits:1})+' pp';
const RANGES={antiguedad:[1,60,1],compras_mensuales:[1,15,1],monto_promedio:[100,4999,50],reclamos:[0,7,1],dias_ultima_compra:[1,120,1],pagos_atrasados:[0,5,1]};
const ICONS={
 plus:'<path d="M12 5v14M5 12h14"/>',agents:'<circle cx="12" cy="5" r="2.2"/><circle cx="5" cy="18" r="2.2"/><circle cx="19" cy="18" r="2.2"/><path d="M12 7.2v3.8M12 11l-5.4 5.2M12 11l5.4 5.2"/>',
 dashboard:'<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
 users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
 check:'<path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
 shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',sliders:'<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
 info:'<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
 upload:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',download:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
 file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',user:'<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
 database:'<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/>',
 layers:'<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',spark:'<path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z"/>',
 x:'<path d="M18 6 6 18M6 6l12 12"/>',play:'<path d="m7 4 13 8-13 8z"/>',alert:'<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
 help:'<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
 predictivo:'<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',retencion:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
 supervisor:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',estratega:'<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>',
 llm:'<path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z"/>',usuario:'<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'
};
const icon=(n,cls='')=>`<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]||''}</svg>`;
const AGENTS={
 predictivo:{does:'Calcula la probabilidad de abandono con la red neuronal y explica qué la empuja.',gives:'Riesgo y factores de cada cliente',llm:'Con LLM: interpreta el riesgo o pide validar datos.'},
 retencion:{does:'Elige una acción para cada cliente y simula cuánto bajaría su riesgo.',gives:'Una acción con su impacto estimado',llm:'Con LLM: elige la acción citando la evidencia.'},
 supervisor:{does:'Revisa cada propuesta: recalcula la simulación y la aprueba o pide revisión humana.',gives:'Propuestas aprobadas o marcadas',llm:'Con LLM: da una segunda opinión justificada.'},
 estratega:{does:'Resume la cartera para gerencia y comprueba cada cifra contra los datos.',gives:'La recomendación final',llm:'Con LLM: redacta el resumen; se rechaza si inventa cifras.'}
};
const ORDER=['predictivo','retencion','supervisor','estratega'];
const av=(k,sm)=>`<span class="av ${sm?'sm':''} ${k==='llm'?'llm':''}" style="--c:var(--a-${k})" title="${NAMES[k]||k}">${icon(k)}</span>`;
const S={config:null,metrics:null,run:null,source:'demo10',csv:null,single:null,llm:false,consent:false,filters:{query:'',risk:'',quadrant:'',sort:'revenue_at_risk'},page:0,planFilter:'pending',planLimit:40,sim:null,simFrom:null,busy:false,live:null};

async function api(path,opts={}){
 const res=await fetch(path,opts);
 let body=null;try{body=await res.json();}catch{}
 if(!res.ok)throw Error(errorText(body,res.status));
 return body;
}
function errorText(body,status){
 const d=body?.detail;
 return Array.isArray(d)?d.map(e=>`${(e.loc||[]).filter(x=>x!=='body').join(' › ')||'dato'}: ${e.msg}`).join(' · '):d||`Error ${status}`;
}
let noticeTimer;
function notice(msg,kind='info'){
 const n=$('notice');clearTimeout(noticeTimer);
 if(!msg){n.hidden=true;return;}
 n.className='notice '+kind;n.hidden=false;
 n.innerHTML=`${icon(kind==='error'?'alert':'info','s')}<span>${esc(msg)}</span><button aria-label="Cerrar aviso">${icon('x','s')}</button>`;
 n.querySelector('button').onclick=()=>notice('');
 if(kind!=='error')noticeTimer=setTimeout(()=>notice(''),9000);
}
function download(name,text,type){
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
const RISK={ALTO:'Riesgo alto',MEDIO:'Riesgo medio',BAJO:'Riesgo bajo'};
const riskBadge=r=>`<span class="badge ${r}">${{ALTO:'Alto',MEDIO:'Medio',BAJO:'Bajo'}[r]||esc(r)}</span>`;
const prioBadge=p=>`<span class="badge ${p}">${{URGENTE:'Urgente',ATENCION:'Atención',NORMAL:'Normal'}[p]}</span>`;
const srcBadge=s=>s==='llm'?`<span class="badge llm plain">${icon('spark','s')}LLM</span>`:'<span class="badge rules plain">Reglas</span>';
const quadBadge=q=>q?`<span class="badge q q-${q}">${QUADRANTS[q].label}</span>`:'';
const probBar=p=>`<div class="prob"><div class="bar-track"><div class="bar-fill ${p.risk}" style="width:${(p.probability*100).toFixed(1)}%"></div></div><span class="num">${pct(p.probability)}</span></div>`;
const recOf=id=>S.run?.recommendations.find(r=>r.cliente_id===id);
const predOf=id=>S.run?.predictions.find(p=>p.cliente_id===id);
const changed=r=>r&&r.source==='llm'&&r.rule_baseline&&r.rule_baseline!==r.action;
const supBadge=r=>{const s=r?.supervisor_review;return s?(s.action==='approve_plan'?`<span class="badge ok plain">${icon('check','s')}Aprobada</span>`:`<span class="badge warn plain">${icon('alert','s')}Revisar</span>`):'<span class="badge idle plain">Controles OK</span>';};
const actions=a=>Object.entries(a||{}).sort((x,y)=>y[1]-x[1]).map(([k,n])=>`${n} ${(ACTION_LABELS[k]||k).toLowerCase()}`).join(' · ');

/* ---------- Routing ---------- */
const TITLES={inicio:'Nuevo análisis',sala:'Agentes en acción',resumen:'Resultados',clientes:'Clientes',plan:'Tu decisión',agentes:'Auditoría técnica',simulador:'Simulador what-if',modelo:'Modelo y método'};
const VIEWS={inicio:viewStart,sala:viewRoom,resumen:viewSummary,clientes:viewCustomers,plan:viewPlan,agentes:viewAgents,simulador:viewSimulator,modelo:viewModel};
function route(){
 let name=(location.hash.replace(/^#\/?/,'')||'inicio').split('?')[0];
 if(!VIEWS[name])name='inicio';
 if(document.querySelector(`[data-route="${name}"]`)?.hasAttribute('data-needs-run')&&!S.run&&!(name==='sala'&&S.live)){location.hash='#/inicio';return;}
 document.querySelectorAll('.nav a').forEach(a=>{const on=a.dataset.route===name;a.classList.toggle('active',on);if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
 $('crumb').textContent=TITLES[name];document.title=`${TITLES[name]} · ChurnTrackAI`;
 $('sidebar').classList.remove('open');$('menu').setAttribute('aria-expanded','false');
 closeDrawer();hideTip();
 VIEWS[name]();
 $('view').focus({preventScroll:true});window.scrollTo(0,0);
}
function updateChrome(){
 const c=$('run-chip');
 if(S.run){const s=S.run.summary;c.hidden=false;c.innerHTML=`<span class="dot ${S.run.mode==='rules'?'off':'ok'}"></span>${s.customers} clientes · ${s.high} en riesgo alto · ${S.run.mode==='rules'?'reglas':'con LLM'}`;}
 else c.hidden=true;
 document.querySelectorAll('.nav a[data-needs-run]').forEach(a=>a.classList.toggle('disabled',!S.run&&!(a.dataset.route==='sala'&&S.live)));
 $('count-clientes').textContent=S.run?S.run.predictions.length:'';
 $('count-plan').textContent=S.run?(S.run.recommendations.filter(r=>r.decision==='pending').length||''):'';
}

/* ---------- Start ---------- */
const SOURCES=[
 ['demo10','layers','Cartera de prueba · 10 clientes','Lo que el LLM revisa por análisis: cada cliente pasa por los 4 agentes.','Recomendada'],
 ['demo300','database','Cartera grande · 300 clientes','Muestra la escala: la red analiza todos; el LLM revisa los 10 más riesgosos.'],
 ['csv','upload','Tu cartera (CSV)','Hasta 300 clientes con 6 indicadores.'],
 ['single','user','Un cliente','Ingresa sus indicadores a mano.']
];
function viewStart(){
 const cfg=S.config||{},llmOk=cfg.llm_configured,batch=cfg.max_llm_customers||10;
 $('view').innerHTML=`
 <div class="start">
  <div>
   <div class="lead"><div class="kicker">${icon('agents','s')}Sistema multiagente · Red neuronal + LLM</div>
    <h1>¿Qué clientes B2B están por irse y qué hacer con cada uno?</h1>
    <p>Elige una cartera y pulsa Iniciar. Cuatro agentes trabajan en cadena y al final tú decides qué propuestas aceptar.</p></div>
   <div class="step-h"><span class="n">1</span><h2>Elige los datos</h2></div>
   <div class="choices" role="radiogroup" aria-label="Fuente de datos">
    ${SOURCES.map(([k,ic,t,d,tag])=>`<button class="choice" role="radio" data-source="${k}" aria-checked="${S.source===k}"><span class="ic">${icon(ic)}</span><span><b>${t}${tag?` <span class="badge llm plain">${tag}</span>`:''}</b><small>${d}</small></span><span class="radio" aria-hidden="true"></span></button>`).join('')}
   </div>
   <div class="panel" id="source-panel"></div>
   <div class="step-h"><span class="n">2</span><h2>Activa el razonamiento con LLM</h2></div>
   <div class="toggle-row">
    <label class="switch"><input type="checkbox" id="use-llm" ${S.llm&&llmOk?'checked':''} ${llmOk?'':'disabled'}><span></span><span class="sr-only">Activar razonamiento con LLM</span></label>
    <div><b>Agentes con LLM</b> ${llmOk?`<span class="badge llm plain">${esc(cfg.llm_model)}</span>`:'<span class="badge idle plain">no configurado</span>'}
     <p class="muted small" style="margin-top:3px">Revisan con el LLM hasta ${batch} clientes. Solo se envían indicadores numéricos, nunca códigos de cliente.</p>
     <label class="consent" id="consent-row" ${S.llm&&llmOk?'':'hidden'}><input type="checkbox" id="consent" ${S.consent?'checked':''}> Autorizo enviar estos indicadores anónimos al proveedor LLM.</label>
    </div>
   </div>
   <div class="run-bar"><p class="muted small">El análisis es temporal: no se guarda en el servidor.</p><button class="btn cta lg" id="run-btn">${icon('play','s')}Iniciar agentes</button></div>
  </div>
  <aside class="card side-card"><h2>Qué hace cada agente</h2>
   <div class="flow">${ORDER.map((k,i)=>`<div class="flow-item">${av(k)}<div><b>${i+1}. ${NAMES[k]}</b><p>${AGENTS[k].does}</p><div class="gives">Entrega: ${AGENTS[k].gives}</div></div></div>`).join('')}
    <div class="flow-item">${av('usuario')}<div><b>5. Tú</b><p>Ves la recomendación final y aceptas o rechazas cada propuesta.</p></div></div></div>
  </aside>
 </div>`;
 renderSourcePanel();
 document.querySelectorAll('[data-source]').forEach(b=>b.onclick=()=>{S.source=b.dataset.source;document.querySelectorAll('[data-source]').forEach(x=>x.setAttribute('aria-checked',x===b));renderSourcePanel();});
 $('use-llm').onchange=e=>{S.llm=e.target.checked;$('consent-row').hidden=!S.llm;};
 $('consent').onchange=e=>{S.consent=e.target.checked;};
 $('run-btn').onclick=runAnalysis;
}
function renderSourcePanel(){
 const p=$('source-panel');
 if(S.source==='demo10'||S.source==='demo300'){
  const big=S.source==='demo300';
  p.innerHTML=`<div class="card flat" style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap"><p class="small ink2">${big?'300 clientes sintéticos de una distribuidora B2B ficticia.':'10 clientes sintéticos: riesgo alto, medio y bajo, las 3 palancas de retención y 1 registro fuera de dominio para ver al Supervisor frenarlo.'}</p><a class="btn sm" href="/api/example-${big?300:10}.csv">${icon('download','s')}Ver CSV</a></div>`;
 }else if(S.source==='csv'){
  const c=S.csv;
  p.innerHTML=`${c?`<div class="file-chip ${c.error?'bad':''}"><span class="ic">${icon(c.error?'alert':'file')}</span><div><b>${esc(c.name)}</b><div class="small muted">${(c.size/1024).toFixed(1)} KB · ${c.error?'no válido':c.preview?`${c.preview.count} clientes válidos`:'validando…'}</div>${c.error?`<ul class="errors">${c.error.split(' · ').slice(0,6).map(e=>`<li>${esc(e)}</li>`).join('')}</ul>`:''}</div><div class="actions"><button class="btn sm" id="csv-change">Cambiar</button><button class="btn sm ghost" id="csv-remove" aria-label="Quitar archivo">${icon('x','s')}</button></div></div>`:''}
  <div class="drop" id="drop" role="button" tabindex="0" aria-describedby="drop-hint" ${c&&!c.error?'hidden':''}><span class="ic">${icon('upload')}</span><b>Arrastra tu CSV aquí o haz clic para elegirlo</b><span class="small muted" id="drop-hint">Columnas: <span class="mono">cliente_id, ${FEATURES.join(', ')}</span> · máx. 300 filas y 256 KB</span></div>
  <input type="file" id="csv-file" accept=".csv,text/csv" hidden>
  <div id="csv-preview"></div>
  <p class="small muted mt">¿Sin archivo? <a href="/api/template.csv">Descarga la plantilla</a> o la <a href="/api/example-10.csv">cartera de 10</a>.</p>`;
  const input=$('csv-file'),drop=$('drop'),pick=()=>{input.value='';input.click();};
  input.onchange=()=>input.files[0]&&loadCsv(input.files[0]);
  drop.onclick=pick;
  drop.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick();}};
  drop.ondragover=e=>{e.preventDefault();drop.classList.add('over');};
  drop.ondragleave=()=>drop.classList.remove('over');
  drop.ondrop=e=>{e.preventDefault();drop.classList.remove('over');e.dataTransfer.files[0]&&loadCsv(e.dataTransfer.files[0]);};
  if($('csv-change'))$('csv-change').onclick=pick;
  if($('csv-remove'))$('csv-remove').onclick=()=>{S.csv=null;renderSourcePanel();};
  if(c?.preview)showPreview();
 }else{
  const d={cliente_id:'B2B-001',antiguedad:24,compras_mensuales:5,monto_promedio:800,reclamos:2,dias_ultima_compra:30,pagos_atrasados:1,...(S.single||{})};
  p.innerHTML=`<div class="card flat"><form class="form-grid" id="single-form">
   <div class="field"><label for="f-cliente_id">Código de cliente</label><input id="f-cliente_id" name="cliente_id" value="${esc(d.cliente_id)}" pattern="[A-Za-z0-9_-]{1,48}" required><small>Código anónimo</small></div>
   ${FEATURES.map(f=>`<div class="field"><label for="f-${f}">${LABELS[f]}</label><input id="f-${f}" name="${f}" type="number" min="0" step="${f==='monto_promedio'?'0.01':'1'}" value="${d[f]}" required><small>Rango del modelo: ${RANGES[f][0]}–${RANGES[f][1]}</small></div>`).join('')}
  </form></div>`;
 }
}
async function loadCsv(file){
 const base={name:file.name,size:file.size,text:'',preview:null,error:null};
 if(!/\.csv$/i.test(file.name)&&file.type!=='text/csv'){S.csv={...base,error:'El archivo debe ser .csv'};renderSourcePanel();return;}
 if(file.size>256000){S.csv={...base,error:'El archivo supera 256 KB'};renderSourcePanel();return;}
 S.csv={...base,text:await file.text()};renderSourcePanel();
 try{
  const v=await api('/api/public/validate-csv',{method:'POST',headers:{'Content-Type':'text/csv'},body:S.csv.text});
  S.csv.preview=v;renderSourcePanel();
 }catch(e){S.csv.error=e.message;renderSourcePanel();}
}
function showPreview(){
 const v=S.csv.preview;
 $('csv-preview').innerHTML=`<div class="table-wrap preview"><table><thead><tr><th>cliente_id</th>${FEATURES.map(f=>`<th class="r">${LABELS[f]}</th>`).join('')}</tr></thead><tbody>${v.preview.map(r=>`<tr><td>${esc(r.cliente_id)}</td>${FEATURES.map(f=>`<td class="r">${r[f]}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="small muted" style="margin-top:6px">Vista previa de ${v.preview.length} de ${v.count} filas.</p>`;
}

/* ---------- Live run (NDJSON stream) ---------- */
async function runAnalysis(){
 if(S.busy)return;
 const useLLM=S.llm&&!!S.config?.llm_configured;
 if(useLLM&&!S.consent){notice('Marca la autorización para enviar indicadores al LLM, o desactiva el razonamiento con LLM.','error');return;}
 const q=`use_llm=${useLLM}&consent=${useLLM}`;let url,opts={method:'POST'},label;
 if(S.source==='demo10'||S.source==='demo300'){const n=S.source==='demo10'?10:300;url=`/api/public/analyze-stream?demo=${n}&${q}`;label=`Cartera de ${n} clientes`;}
 else if(S.source==='csv'){
  if(!S.csv?.preview){notice('Primero sube un CSV válido.','error');return;}
  url=`/api/public/analyze-stream?${q}`;opts={method:'POST',headers:{'Content-Type':'text/csv'},body:S.csv.text};label=S.csv.name;
 }else{
  const form=$('single-form');if(!form.reportValidity())return;
  const row=Object.fromEntries(new FormData(form));for(const f of FEATURES)row[f]=Number(row[f]);S.single=row;
  url='/api/public/analyze-stream';opts={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({customers:[row],use_llm:useLLM,consent_external_processing:useLLM})};label=`Cliente ${row.cliente_id}`;
 }
 S.busy=true;notice('');
 S.live={label,useLLM,start:performance.now(),received:[],shown:[],result:null,error:null,replay:false,customers:null};
 updateChrome();
 location.hash==='#/sala'?viewRoom():location.hash='#/sala';
 pump();
 try{
  const res=await fetch(url,opts);
  if(!res.ok){let body=null;try{body=await res.json();}catch{}throw Error(errorText(body,res.status));}
  const reader=res.body.getReader(),dec=new TextDecoder();let buf='';
  for(;;){
   const {done,value}=await reader.read();if(done)break;
   buf+=dec.decode(value,{stream:true});let i;
   while((i=buf.indexOf('\n'))>=0){const line=buf.slice(0,i).trim();buf=buf.slice(i+1);if(line)onEvent(JSON.parse(line));}
  }
  if(!S.live.result&&!S.live.error)throw Error('La conexión se cerró antes de terminar.');
 }catch(e){S.live.error=e.message;notice(e.message,'error');renderRoom();}
 finally{S.busy=false;}
}
function onEvent(e){
 const L=S.live;
 if(e.type==='start'){L.customers=e.customers;L.batch=e.llm_batch;L.useLLM=e.use_llm;}
 else if(e.type==='message'){e.at=performance.now()-L.start;L.received.push(e);}
 else if(e.type==='result'){
  const run=e.run;run.local_label=L.label;L.result=run;
  S.run=run;S.page=0;S.filters={query:'',risk:'',quadrant:'',sort:'revenue_at_risk'};S.planFilter='pending';
  updateChrome();
 }else if(e.type==='error'){L.error=e.detail;}
}
// Messages are revealed one by one so a fast run stays readable; timestamps remain the real ones.
let pumpTimer;
function pump(){
 clearTimeout(pumpTimer);
 const L=S.live;if(!L)return;
 if(L.shown.length<L.received.length){L.shown.push(L.received[L.shown.length]);if(location.hash==='#/sala')renderRoom();}
 if(L.shown.length<L.received.length||(!L.result&&!L.error))pumpTimer=setTimeout(pump,L.replay?260:320);
 else if(location.hash==='#/sala')renderRoom();
}
function replay(){
 if(!S.run)return;
 S.live={label:S.run.local_label,useLLM:S.run.llm_report.requested,start:0,received:S.run.trace.map(m=>({...m,at:(new Date(m.timestamp)-new Date(S.run.trace[0].timestamp))})),shown:[],result:S.run,error:null,replay:true,customers:S.run.predictions.length};
 location.hash==='#/sala'?viewRoom():location.hash='#/sala';pump();
}
function viewRoom(){
 if(!S.live&&S.run){replay();return;}
 $('view').innerHTML=`<div id="room"></div>`;renderRoom();
}
// What each agent has delivered so far, read from the briefs of its own messages.
function laneResult(k,msgs){
 const last=t=>[...msgs].reverse().find(m=>m.tool===t)?.brief;
 if(k==='predictivo'){const b=last('neural_inference_and_mean_ablation');return b?`${b.high} alto · ${b.medium} medio · ${b.low} bajo${b.out_of_domain?` · ${b.out_of_domain} a validar`:''}`:'';}
 if(k==='retencion'){const b=last('recommendations');return b?actions(b.actions):'';}
 if(k==='supervisor'){const b=last('supervisor_llm_result');if(b&&b.actions)return `${b.actions.approve_plan||0} aprobadas · ${b.actions.request_review||0} para revisar`;return msgs.some(m=>m.tool==='validated_report')?'Todas las propuestas pasan los controles':'';}
 if(k==='estratega'){const b=last('executive_summary');return b?b.headline:'';}
 return '';
}
function renderRoom(){
 const L=S.live,box=$('room');if(!L||!box)return;
 const st=agentStates(L.shown),finished=(L.result||L.error)&&L.shown.length>=L.received.length;
 const cfg=S.config||{},elapsed=finished&&L.result?L.result.elapsed_ms:L.replay?0:performance.now()-L.start;
 const stateLabel={waiting:'En espera',working:'Trabajando',llm:'Consultando al LLM',done:'Listo',failed:'Detenido'};
 const step=(k,i)=>{const a=st[k];const cls=finished&&a.state!=='failed'?'done':a.state;const out=laneResult(k,L.shown);
  const llm=a.llmOk?'<span class="badge ok plain">LLM validado</span>':a.llmFailed?'<span class="badge idle plain">Resuelto con reglas</span>':a.llm?'':'<span class="badge idle plain">Sin LLM</span>';
  return `<article class="step ${cls}" style="--c:var(--a-${k})"><div class="top"><span class="n">${i+1}</span>${av(k)}<div><b>${NAMES[k]}</b><div class="state"><span class="dot"></span>${stateLabel[cls]}</div></div></div>
  <p class="does">${AGENTS[k].does}</p><div class="out ${out?'':'empty'}"><span>Entrega</span><b>${esc(out||AGENTS[k].gives)}</b></div><div class="foot">${llm}${a.llm?`<span class="muted">${a.llm} ${a.llm===1?'consulta':'consultas'} al LLM</span>`:''}</div></article>`;};
 const t0=L.shown[0]?.at||0;
 const r=L.result;
 const flagged=r?r.recommendations.filter(x=>x.supervisor_review?.action==='request_review').length:0;
 box.innerHTML=`
 <div class="room-head"><div><div class="kicker">${finished?icon('check','s'):'<span class="dot live"></span>'}${L.replay?'Reproducción de la ejecución':finished?'Ejecución terminada':'Ejecución en vivo'}</div><h1>Agentes en acción</h1></div>
  <div class="room-head meta"><span>${icon('layers','s')}${esc(L.label)}${L.customers?` · ${L.customers} clientes`:''}</span><span>${icon('spark','s')}${L.useLLM?`LLM ${esc(cfg.llm_model||'')}`:'Sin LLM: red neuronal y reglas'}</span><span class="num">${icon('play','s')}${dur(elapsed)}</span></div></div>
 <div class="pipeline">${ORDER.map(step).join('')}
  <article class="step you ${finished&&r?'ready':''}" style="--c:var(--a-usuario)"><div class="top"><span class="n">5</span>${av('usuario')}<div><b>Tú</b><div class="state"><span class="dot"></span>${finished&&r?'Te toca decidir':'En espera'}</div></div></div>
   <p class="does">Ves la recomendación final y aceptas o rechazas cada propuesta.</p>
   ${finished&&r?`<a class="btn cta" href="#/plan">Decidir ${icon('arrow','s')}</a>`:'<div class="out empty"><span>Entrega</span><b>Tu decisión</b></div>'}</article></div>
 ${finished&&r?`<div class="card done-card mt"><div><b>Los agentes terminaron.</b> <span class="ink2">${r.predictions.length} clientes analizados · ${r.recommendations.length} propuestas · ${flagged?`${flagged} marcadas por el Supervisor para revisar`:r.recommendations.some(x=>x.supervisor_review)?'todas aprobadas por el Supervisor':'todas superan los controles del Supervisor'}.</span></div>
  <div class="actions"><a class="btn" href="#/resumen">Ver resultados</a><a class="btn primary" href="#/plan">Ir a tu decisión ${icon('arrow','s')}</a></div></div>`:''}
 ${finished&&L.error?`<div class="card mt"><b>No se pudo completar.</b> <span class="ink2">${esc(L.error)}</span> <a class="btn sm" href="#/inicio" style="margin-left:8px">Volver</a></div>`:''}
 <p class="sr-only" role="status" aria-atomic="true">${finished?'Ejecución terminada.':`${L.shown.length} mensajes. ${ORDER.filter(k=>st[k].state==='llm').map(k=>NAMES[k]+' consulta al LLM').join('. ')}`}</p>
 <details class="card mt convo-card" ${finished?'':'open'}><summary><b>Conversación entre agentes</b> <span class="muted small">${L.shown.length} mensajes reales, explicados en lenguaje natural</span></summary>
  ${!finished?`<div class="actions" style="margin-top:8px"><button class="btn sm" id="skip">Mostrar todo</button></div>`:''}
  <div class="feed">${L.shown.map(m=>{
   const isLLM=m.sender==='llm'||m.recipient==='llm',fb=m.status==='error';
   const full=r?.trace?.[m.sequence-1];
   return `<div class="ev">${av(m.sender,true)}<div><div class="who"><b>${NAMES[m.sender]||esc(m.sender)}</b>→ ${NAMES[m.recipient]||esc(m.recipient)}${isLLM?`<span class="badge llm plain">${icon('spark','s')}LLM</span>`:''}${m.status==='retry'?'<span class="badge warn plain">reintento</span>':''}${fb?'<span class="badge idle plain">sigue con reglas</span>':''}</div>
    <div class="say">${esc(narrate(m))}</div>${full?`<details><summary>Contenido técnico · <span class="mono">${esc(m.tool)}</span></summary><pre>${esc(JSON.stringify(full.payload,null,1).slice(0,3000))}</pre></details>`:''}</div><span class="t">+${dur(m.at-t0)}</span></div>`;}).join('')||'<p class="muted small">Esperando el primer mensaje del Supervisor…</p>'}</div></details>`;
 if($('skip'))$('skip').onclick=()=>{L.shown=L.received.slice();renderRoom();};
}

/* ---------- Summary ---------- */
function viewSummary(){
 const r=S.run,a=r.analytics,ex=r.executive,rev=a.revenue,hi=a.segments.find(s=>s.risk==='ALTO');
 $('view').innerHTML=`
 <div class="page-head"><div><div class="kicker">${esc(r.local_label||'Análisis')} · ${new Date(r.created).toLocaleString('es-PE')}</div><h1>Resultados</h1><p>Cuánto ingreso está expuesto, quiénes lo concentran y qué proponen los agentes.</p></div>
  <div class="actions"><button class="btn" id="dl-report">${icon('download','s')}Informe JSON</button><a class="btn primary" href="#/plan">Ir a tu decisión ${icon('arrow','s')}</a></div></div>
 <div class="grid g-3">
  <div class="card kpi hero"><div class="label">Ingreso mensual en riesgo<button class="help" title="Suma de probabilidad × ingreso mensual de cada cliente.">${icon('help','s')}</button></div><div class="value">${money(rev.monthly_at_risk,true)}</div><div class="sub">${pct(rev.share_at_risk)} de ${money(rev.monthly_total,true)} que factura la cartera</div></div>
  <div class="card kpi"><div class="label">Clientes en riesgo alto</div><div class="value">${hi.count}<small> / ${a.count}</small></div><div class="sub">${a.segments[1].count} más en riesgo medio</div></div>
  <div class="card kpi"><div class="label">Salud media<button class="help" title="100 × (1 − probabilidad de abandono), promedio de la cartera.">${icon('help','s')}</button></div><div class="value">${a.health_score}<small>/100</small></div><div class="sub">${a.out_of_domain_count?`${a.out_of_domain_count} registro(s) a validar`:'Datos dentro del dominio del modelo'}</div></div>
 </div>
 ${ex?`<article class="card brief mt"><div class="card-head" style="margin-bottom:0"><div class="kicker" style="margin:0">${av('estratega',true)} Agente Estratega · resumen para gerencia</div>${ex.source==='llm'?`<span class="badge llm plain">${icon('spark','s')}Redactado por LLM · cifras verificadas</span>`:'<span class="badge rules plain">Generado por reglas</span>'}</div>
  <h2>${esc(ex.headline)}</h2><div class="cols"><div><h3>Hallazgos</h3><ul>${ex.findings.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div><div><h3>Qué hacer</h3><ul>${ex.actions.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div></div></article>`:''}
 <div class="grid g-2 mt">
  <article class="card"><div class="card-head"><div><h2>Atender primero</h2><p>Mayor ingreso mensual en riesgo.</p></div><a class="btn sm ghost" href="#/clientes">Ver todos ${icon('arrow','s')}</a></div>
   ${a.priorities.length?`<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Riesgo</th><th class="r">En riesgo/mes</th><th>Acción</th></tr></thead><tbody>${a.priorities.slice(0,5).map(x=>{const rc=recOf(x.cliente_id);return `<tr tabindex="0" data-customer="${esc(x.cliente_id)}"><td><b>${esc(x.cliente_id)}</b></td><td>${riskBadge(x.risk)}</td><td class="r">${money(x.attention_score)}</td><td>${ACTION_LABELS[rc?.action]||''}</td></tr>`;}).join('')}</tbody></table></div>`:'<p class="muted">No hay clientes de riesgo medio o alto dentro del dominio del modelo.</p>'}</article>
  <article class="card"><div class="card-head"><div><h2>Qué hacer con cada grupo</h2><p>Valor alto = factura ≥ ${money(a.value_threshold)} al mes (la mediana).</p></div></div>
   <div class="quads">${[['rescatar','Llamada personal esta semana'],['proteger','Cuidar la relación y crecer'],['automatizar','Acciones masivas de bajo costo'],['mantener','Seguimiento rutinario']].map(([k,what])=>{const q=a.quadrants[k];return `<button class="quad q-${k}" data-quad="${k}"><span class="top"><i class="qdot"></i>${QUADRANTS[k].label}</span><span class="big">${q.count}</span><small>${money(q.revenue_at_risk,true)}/mes en riesgo</small><span class="what">${what}</span></button>`;}).join('')}</div></article>
 </div>
 <details class="card mt more"><summary><b>Ver gráficos detallados</b> <span class="muted small">mapa de clientes, qué empuja el riesgo y distribución</span></summary>
  <div class="grid g-main mt">
   <div><h3 style="margin-bottom:6px">Dónde está el riesgo</h3><p class="small muted">Cada punto es un cliente: derecha = más probable que se vaya; arriba = factura más.</p><div id="scatter"></div>
    <div class="legend">${Object.entries(QUADRANTS).map(([k,q])=>`<span><i class="qdot q-${k}"></i>${q.label}</span>`).join('')}</div></div>
   <div><h3 style="margin-bottom:8px">Qué empuja el riesgo</h3><div class="bars">${a.sensitivities.map(s=>`<div class="bar-row"><span>${LABELS[s.feature]}</span><div class="bar-track"><div class="bar-fill" style="width:${(s.mean_absolute_delta/(a.sensitivities[0].mean_absolute_delta||1)*100).toFixed(1)}%"></div></div><span class="num" style="text-align:right">${pp(s.mean_absolute_delta)}</span></div>`).join('')||'<p class="muted">Sin datos dentro del dominio.</p>'}</div>
    <h3 style="margin:18px 0 8px">Clientes por probabilidad</h3><div id="hist"></div></div>
  </div>
  <ul class="howto-list"><li><b>Probabilidad</b>: estimación de la red neuronal. Alto ≥ 70%, medio 40–70%, bajo &lt; 40%.</li><li><b>Ingreso en riesgo</b> = probabilidad × ingreso mensual. Es exposición esperada, no pérdida contable.</li><li><b>Salud</b> = 100 − probabilidad.</li></ul>
 </details>`;
 $('dl-report').onclick=()=>download(`informe_${r.id}.json`,JSON.stringify(r,null,2),'application/json');
 document.querySelectorAll('[data-quad]').forEach(b=>b.onclick=()=>{S.filters={...S.filters,quadrant:b.dataset.quad,risk:''};S.page=0;location.hash='#/clientes';});
 $('scatter').innerHTML=scatter(r);$('hist').innerHTML=histogram(a.histogram);
 bindCustomerOpeners();bindTips();
}
function scatter(run){
 const W=640,H=320,L=56,R=14,T=14,B=40,ps=run.predictions;
 const vals=ps.map(p=>Math.max(1,p.monthly_revenue));
 const lo=Math.log10(Math.min(...vals))-.05,hi=Math.log10(Math.max(...vals))+.05,span=Math.max(hi-lo,.5);
 const x=v=>L+v*(W-L-R),y=v=>T+(1-(Math.log10(Math.max(1,v))-lo)/span)*(H-T-B);
 const ticks=[];for(let e=Math.ceil(lo);e<=Math.floor(hi);e++){ticks.push(10**e);if(10**e*3<10**hi)ticks.push(3*10**e);}
 const thr=run.analytics.value_threshold;
 return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Clientes por probabilidad de abandono e ingreso mensual">
  ${[0,.2,.4,.6,.8,1].map(t=>`<line class="grid-line" x1="${x(t)}" x2="${x(t)}" y1="${T}" y2="${H-B}"/><text x="${x(t)}" y="${H-B+16}" text-anchor="middle">${t*100}%</text>`).join('')}
  ${ticks.map(t=>`<line class="grid-line" x1="${L}" x2="${W-R}" y1="${y(t)}" y2="${y(t)}"/><text x="${L-8}" y="${y(t)+4}" text-anchor="end">${money(t,true).replace('S/ ','')}</text>`).join('')}
  <line class="thr" x1="${x(.4)}" x2="${x(.4)}" y1="${T}" y2="${H-B}"/><text class="thr-label" x="${x(.4)+5}" y="${T+10}">en riesgo →</text>
  <line class="thr" x1="${L}" x2="${W-R}" y1="${y(thr)}" y2="${y(thr)}"/><text class="thr-label" x="${L+6}" y="${y(thr)-6}">valor alto ↑</text>
  ${ps.map(p=>`<circle class="pt" data-customer="${esc(p.cliente_id)}" data-tip="<b>${esc(p.cliente_id)}</b>${RISK[p.risk]} · ${pct(p.probability)}<br>${money(p.monthly_revenue)}/mes · ${money(p.revenue_at_risk)} en riesgo<br>${QUADRANTS[p.quadrant].label}" cx="${x(p.probability).toFixed(1)}" cy="${y(p.monthly_revenue).toFixed(1)}" r="${ps.length>100?4.5:7}" fill="var(--q-${p.quadrant})"/>`).join('')}
  <text x="${(L+W-R)/2}" y="${H-6}" text-anchor="middle">Probabilidad de abandono</text>
  <text x="12" y="${(T+H-B)/2}" text-anchor="middle" transform="rotate(-90 12 ${(T+H-B)/2})">Ingreso mensual (S/, escala log)</text>
 </svg>`;
}
function histogram(h){
 const W=520,H=150,L=8,B=24,T=16,max=Math.max(...h,1),bw=(W-L)/10;
 const color=i=>i>=7?'var(--hi)':i>=4?'var(--md)':'var(--lo)',name=i=>i>=7?'alto':i>=4?'medio':'bajo';
 return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Histograma de probabilidades">
  ${h.map((v,i)=>{const bh=Math.max(v?2:0,(v/max)*(H-B-T));return `<rect data-tip="<b>${i*10}–${i*10+10}%</b>${v} clientes · riesgo ${name(i)}" x="${L+i*bw+1}" y="${H-B-bh}" width="${bw-2}" height="${bh}" rx="3" fill="${color(i)}"/>${v?`<text x="${L+i*bw+bw/2}" y="${H-B-bh-4}" text-anchor="middle">${v}</text>`:''}<text x="${L+i*bw+bw/2}" y="${H-7}" text-anchor="middle">${i*10}%</text>`;}).join('')}
  <line class="axis" x1="${L}" x2="${W}" y1="${H-B}" y2="${H-B}"/>
 </svg><div class="legend"><span><i class="qdot" style="background:var(--lo)"></i>Bajo &lt;40%</span><span><i class="qdot" style="background:var(--md)"></i>Medio 40–70%</span><span><i class="qdot" style="background:var(--hi)"></i>Alto ≥70%</span></div>`;
}
function bindTips(root=document){
 root.querySelectorAll('[data-tip]').forEach(el=>{
  el.onmouseenter=e=>showTip(el.dataset.tip,e);el.onmousemove=e=>moveTip(e);el.onmouseleave=hideTip;
 });
}
function showTip(html,e){const t=$('tip');t.innerHTML=html;t.hidden=false;moveTip(e);}
function moveTip(e){const t=$('tip'),w=t.offsetWidth;t.style.left=Math.min(e.clientX+14,innerWidth-w-8)+'px';t.style.top=(e.clientY+14)+'px';}
function hideTip(){$('tip').hidden=true;}
function bindCustomerOpeners(root=document){
 root.querySelectorAll('[data-customer]').forEach(el=>{
  el.onclick=()=>openCustomer(el.dataset.customer);
  if(el.tagName==='TR')el.onkeydown=e=>{if(e.key==='Enter')openCustomer(el.dataset.customer);};
 });
}

/* ---------- Customers ---------- */
function viewCustomers(){
 const f=S.filters;
 $('view').innerHTML=`
 <div class="page-head"><div><div class="kicker">${S.run.predictions.length} clientes analizados</div><h1>Clientes</h1><p>Haz clic en un cliente para ver qué dijo cada agente sobre él.</p></div></div>
 <div class="toolbar">
  <input class="search" id="q" type="search" placeholder="Buscar código de cliente…" value="${esc(f.query)}" aria-label="Buscar cliente">
  <div class="seg" role="group" aria-label="Filtrar por riesgo">${[['','Todos'],['ALTO','Alto'],['MEDIO','Medio'],['BAJO','Bajo']].map(([v,l])=>`<button data-risk="${v}" aria-pressed="${f.risk===v}">${l}</button>`).join('')}</div>
  <select class="search" style="flex:0 1 210px" id="sort" aria-label="Ordenar">${[['revenue_at_risk','Mayor ingreso en riesgo'],['probability','Mayor probabilidad'],['monthly_revenue','Mayor ingreso mensual'],['id','Código']].map(([v,l])=>`<option value="${v}" ${f.sort===v?'selected':''}>${l}</option>`).join('')}</select>
  ${f.quadrant?`<button class="btn sm" id="clear-quad">Segmento: ${QUADRANTS[f.quadrant].label} ${icon('x','s')}</button>`:''}
 </div>
 <div id="table"></div>`;
 $('q').oninput=e=>{S.filters.query=e.target.value;S.page=0;renderTable();};
 document.querySelectorAll('[data-risk]').forEach(b=>b.onclick=()=>{S.filters.risk=b.dataset.risk;S.page=0;document.querySelectorAll('[data-risk]').forEach(x=>x.setAttribute('aria-pressed',x===b));renderTable();});
 $('sort').onchange=e=>{S.filters.sort=e.target.value;renderTable();};
 if($('clear-quad'))$('clear-quad').onclick=()=>{S.filters.quadrant='';viewCustomers();};
 renderTable();
}
function renderTable(){
 const rows=filterCustomers(S.run,S.filters),size=25,pages=Math.max(1,Math.ceil(rows.length/size));
 S.page=Math.min(S.page,pages-1);
 const view=rows.slice(S.page*size,S.page*size+size);
 $('table').innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Probabilidad de abandono</th><th class="r">En riesgo/mes</th><th>Acción propuesta</th><th>Supervisor</th></tr></thead><tbody>
  ${view.map(p=>`<tr tabindex="0" data-customer="${esc(p.cliente_id)}"><td><b>${esc(p.cliente_id)}</b>${p.warnings.length?` <span class="badge warn plain" title="Fuera del dominio del modelo">${icon('alert','s')}datos</span>`:''}</td><td>${probBar(p)}</td><td class="r"><b>${money(p.revenue_at_risk)}</b></td><td>${ACTION_LABELS[p.rec?.action]||''}</td><td>${supBadge(p.rec)}</td></tr>`).join('')}
 </tbody></table></div>${pages>1?`<div class="pager"><span>${rows.length} clientes · página ${S.page+1} de ${pages}</span><div class="actions"><button class="btn sm" id="prev" ${S.page?'':'disabled'}>Anterior</button><button class="btn sm" id="next" ${S.page<pages-1?'':'disabled'}>Siguiente</button></div></div>`:''}`
 :'<div class="empty card"><h2>Sin resultados</h2><p>Ajusta la búsqueda o los filtros.</p></div>';
 if($('prev')){$('prev').onclick=()=>{S.page--;renderTable();};$('next').onclick=()=>{S.page++;renderTable();};}
 bindCustomerOpeners($('table'));
}

/* ---------- Customer drawer: the agents' conversation about one customer ---------- */
let lastFocus=null;
function factorsHtml(p){
 const max=Math.max(...p.factors.map(f=>Math.abs(f.delta_probability)),.01);
 return p.factors.map(f=>{const w=Math.abs(f.delta_probability)/max*50;return `<div class="factor"><span>${LABELS[f.feature]} <span class="muted num">(${f.value})</span></span><div class="track"><div class="fill ${f.delta_probability>=0?'up':'down'}" style="width:${w.toFixed(1)}%"></div></div><span class="num" style="text-align:right;color:${f.delta_probability>=0?'var(--hi-ink)':'var(--lo-ink)'}">${f.delta_probability>=0?'+':'−'}${pp(Math.abs(f.delta_probability))}</span></div>`;}).join('');
}
function bubble(k,title,body,extra=''){return `<div class="msg">${av(k,true)}<div class="bubble ${k==='usuario'?'you':''}"><header><b>${NAMES[k]}</b>${extra}</header>${body}</div></div>`;}
function openCustomer(id){
 const p=predOf(id),r=recOf(id);if(!p)return;
 lastFocus=document.activeElement;
 const d=$('drawer'),interp=p.llm_interpretation,sup=r?.supervisor_review,sim=r?.simulation;
 const pushes=p.factors.filter(f=>f.delta_probability>0.005).slice(0,2);
 const ev=e=>(e||[]).map(x=>(LABELS[x]||x).toLowerCase()).join(', ');
 const predictive=`<p>Probabilidad de abandono <b>${pct(p.probability,1)}</b> (${RISK[p.risk].toLowerCase()}). ${pushes.length?`Lo que más la empuja: ${pushes.map(f=>`${LABELS[f.feature].toLowerCase()} (+${pp(f.delta_probability)})`).join(' y ')}.`:p.probability>.98?'La probabilidad está saturada: varias señales actúan juntas y ninguna sola la mueve.':'Ningún indicador aislado la eleva de forma marcada.'}</p>
  ${p.warnings.length?`<p class="note">${icon('alert','s')} ${esc(p.warnings.join(' · '))}</p>`:''}
  ${interp?`<p class="note">${icon('spark','s')} LLM: ${interp.action==='review_data'?'pide validar los datos antes de actuar':'confirma la lectura del riesgo'} citando ${esc(ev(interp.evidence))}.</p>`:''}${interp?.reason?`<blockquote class="why">${icon('spark','s')}<span>«${esc(interp?.reason)}»</span></blockquote>`:''}
  <details style="margin-top:8px"><summary class="small muted">Ver los 6 factores</summary>${factorsHtml(p)}</details>`;
 const retention=r?`<p>Propongo <b>${ACTION_LABELS[r.action]||esc(r.action)}</b> · ${esc(r.owner)}, ${esc(r.timeframe).toLowerCase()}.</p>
  ${sim?`<div class="sim"><span>Si se logra: ${esc(sim.scenario)}</span><span class="num">${pct(sim.risk_reduction+sim.probability_after,1)} <span class="arrow">→</span> <b>${pct(sim.probability_after,1)}</b></span><span class="badge ok plain">−${pp(sim.risk_reduction)}</span><span class="muted">${money(sim.revenue_protected_monthly)}/mes protegidos</span></div>`:'<p class="note">Acción sin palanca medible en el modelo (contacto o seguimiento): no estimo su impacto.</p>'}
  ${r.source==='llm'?(changed(r)?`<div class="changed">${icon('spark','s')} Elegido con LLM. Las reglas habrían propuesto «${ACTION_LABELS[r.rule_baseline]}».</div>`:`<p class="note">${icon('spark','s')} El LLM confirmó la acción que proponían las reglas.</p>`):'<p class="note">Elegido por reglas explícitas.</p>'}${r.llm_reason?`<blockquote class="why">${icon('spark','s')}<span>«${esc(r.llm_reason)}»</span></blockquote>`:''}
  <details style="margin-top:8px"><summary class="small muted">Pasos y verificación</summary><ol class="steps">${r.steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol><p class="small" style="margin-top:6px"><span class="muted">Éxito si:</span> ${esc(r.success_check)}</p></details>`:'';
 const supervisor=`<p>${sup?(sup.action==='approve_plan'?'Revisé la propuesta con el LLM y es coherente con los indicadores.':'<b>Pido revisión humana</b> antes de aceptar: la propuesta necesita contexto adicional.'):'Verifiqué con controles deterministas: acción permitida, evidencia existente, plan del playbook y simulación recalculada.'}</p>${sup?`<p class="note">Evidencia revisada: ${esc(ev(sup.evidence))}.</p>`:''}${sup?.reason?`<blockquote class="why">${icon('spark','s')}<span>«${esc(sup?.reason)}»</span></blockquote>`:''}`;
 d.innerHTML=`<div class="drawer-top"><div><div class="kicker">Ficha de cliente</div><h2 id="drawer-title">${esc(p.cliente_id)}</h2><div class="actions" style="margin-top:8px">${riskBadge(p.risk)}${quadBadge(p.quadrant)}${r?prioBadge(r.priority):''}</div></div><button class="icon-btn" id="drawer-close" aria-label="Cerrar">${icon('x')}</button></div>
 <div class="facts"><div class="fact"><span>Probabilidad</span><b>${pct(p.probability,1)}</b></div><div class="fact"><span>Salud</span><b>${p.health_score}/100</b></div><div class="fact"><span>Ingreso/mes</span><b>${money(p.monthly_revenue,true)}</b></div><div class="fact"><span>En riesgo/mes</span><b>${money(p.revenue_at_risk,true)}</b></div></div>
 <h3 style="margin:20px 0 8px">Conversación de los agentes</h3>
 <div class="convo">
  ${bubble('predictivo','',predictive,interp?srcBadge('llm'):'<span class="badge rules plain">Red neuronal</span>')}
  ${r?bubble('retencion','',retention,srcBadge(r.source)):''}
  ${bubble('supervisor','',supervisor,sup?(sup.action==='approve_plan'?'<span class="badge ok plain">Aprueba</span>':'<span class="badge fail plain">Revisión humana</span>'):'<span class="badge ok plain">Controles OK</span>')}
  ${r?bubble('usuario','',`<p class="small ink2" style="margin-bottom:8px">${r.decision==='pending'?'¿Aceptas esta propuesta?':'Tu decisión:'}</p>${decisionHtml(r)}<div class="actions mt"><button class="btn sm" id="draft-btn">${icon('file','s')}Borrador de contacto</button><button class="btn sm" id="sim-btn">${icon('sliders','s')}Probar en simulador</button></div><div id="draft"></div>`):''}
 </div>`;
 d.hidden=false;$('drawer-backdrop').hidden=false;document.body.style.overflow='hidden';
 $('drawer-close').onclick=closeDrawer;$('drawer-close').focus();
 bindDecisions(d,()=>{openCustomer(id);updateChrome();});
 if($('draft-btn'))$('draft-btn').onclick=()=>{const pk=actionPackage(S.run,id,S.config?.actions);$('draft').innerHTML=`<p class="small muted mt">Plantilla para revisión; no se envía nada.</p><pre class="doc">${esc(pk.draft)}</pre><button class="btn sm" id="dl-draft">${icon('download','s')}Descargar TXT</button>`;$('dl-draft').onclick=()=>download(`borrador_${id}.txt`,pk.draft,'text/plain;charset=utf-8');};
 if($('sim-btn'))$('sim-btn').onclick=()=>{S.sim=Object.fromEntries(FEATURES.map(f=>[f,p.observed[f]]));S.simFrom=id;location.hash='#/simulador';};
}
function closeDrawer(){
 if($('drawer').hidden)return;
 $('drawer').hidden=true;$('drawer-backdrop').hidden=true;document.body.style.overflow='';
 lastFocus?.focus?.();
}
function decisionHtml(r){
 if(r.decision!=='pending')return `<div class="decision"><span class="decided ${r.decision}">${icon(r.decision==='approved'?'check':'x','s')}${r.decision==='approved'?'Aceptada':'Rechazada'}</span><button class="btn sm ghost" data-decide="pending" data-id="${esc(r.cliente_id)}">Deshacer</button></div>`;
 return `<div class="decision"><button class="btn sm primary" data-decide="approved" data-id="${esc(r.cliente_id)}">${icon('check','s')}Aceptar</button><button class="btn sm danger" data-decide="rejected" data-id="${esc(r.cliente_id)}">Rechazar</button></div>`;
}
function bindDecisions(root,after){
 root.querySelectorAll('[data-decide]').forEach(b=>b.onclick=e=>{e.stopPropagation();const r=recOf(b.dataset.id);if(r&&(r.decision==='pending')!==(b.dataset.decide==='pending')){r.decision=b.dataset.decide;after();}});
}

/* ---------- Agents audit ---------- */
function viewAgents(){
 const r=S.run,rep=r.agent_report,llm=r.llm_report,st=r.agent_llm||{};
 const byAgent=k=>(r.usage||[]).filter(u=>u.agent===k).reduce((s,u)=>s+(u.total_tokens||0),0);
 const msAgent=k=>llm.attempts.filter(a=>a.agent===k).reduce((s,a)=>s+a.elapsed_ms,0);
 const maxTok=Math.max(1,...ORDER.map(byAgent)),maxMs=Math.max(1,...ORDER.map(msAgent));
 const statusB=s=>({validated:'<span class="badge ok plain">LLM validado</span>',failed:'<span class="badge idle plain">Resuelto con reglas</span>'}[s]||'<span class="badge idle plain">Sin LLM</span>');
 const reviews=r.recommendations.filter(x=>x.supervisor_review).length,flags=r.recommendations.filter(x=>x.supervisor_review?.action==='request_review').length;
 $('view').innerHTML=`
 <div class="page-head"><div><div class="kicker">${r.trace.length} mensajes · ${dur(r.elapsed_ms)} · ${llm.attempts.length} llamadas al LLM</div><h1>Auditoría técnica</h1><p>Qué aportó cada agente, cuánto costó y qué controles se aplicaron. El LLM solo elige entre opciones permitidas y cada respuesta se valida antes de usarse.</p></div>
  <div class="actions"><button class="btn" id="replay">${icon('play','s')}Reproducir ejecución</button><button class="btn" id="dl-trace">${icon('download','s')}Traza JSON</button></div></div>
 <div class="metric-row">
  <div class="metric"><span>Clientes revisados por LLM</span><b>${rep.retention.llm_count}</b><small>de ${r.predictions.length} (máx. ${S.config?.max_llm_customers||10})</small></div>
  <div class="metric"><span>Decisiones que el LLM cambió</span><b>${rep.retention.changed_vs_rules||0}</b><small>frente a las reglas</small></div>
  <div class="metric"><span>Segundas opiniones</span><b>${reviews}</b><small>${flags} piden revisión humana</small></div>
  <div class="metric"><span>Correcciones del Supervisor</span><b>${rep.supervisor.corrections}</b><small>salidas rehechas</small></div>
  <div class="metric"><span>Resumen ejecutivo</span><b>${rep.strategist?.source==='llm'?'LLM':'Reglas'}</b><small>${rep.strategist?.source==='llm'?'cifras verificadas':'sin LLM o rechazado'}</small></div>
 </div>
 <div class="grid g-2 mt">
  ${ORDER.map(k=>`<article class="card"><div class="card-head"><div style="display:flex;gap:10px;align-items:center">${av(k)}<div><h2>Agente ${NAMES[k]}</h2><p>${AGENTS[k].does}</p></div></div>${statusB(st[k]?.status)}</div>
   <div class="bars"><div class="bar-row"><span>Tokens LLM</span><div class="bar-track"><div class="bar-fill" style="width:${byAgent(k)/maxTok*100}%"></div></div><span class="num" style="text-align:right">${byAgent(k).toLocaleString('es-PE')}</span></div>
   <div class="bar-row"><span>Tiempo de LLM</span><div class="bar-track"><div class="bar-fill" style="width:${msAgent(k)/maxMs*100}%"></div></div><span class="num" style="text-align:right">${(msAgent(k)/1000).toFixed(2)} s</span></div></div>
   <p class="small ink2 mt">${k==='predictivo'?`${rep.predictive.count} inferencias con la red · ${rep.predictive.out_of_domain} fuera de dominio.`:k==='retencion'?`${rep.retention.llm_count} acciones con LLM · ${rep.retention.rules_count} por reglas.`:k==='supervisor'?`Controles: ${rep.supervisor.checks.join(', ').toLowerCase()}.`:`Resumen ${rep.strategist?.source==='llm'?'redactado por LLM y verificado cifra a cifra':'generado por reglas'}.`}${st[k]?.reason?` <span class="muted">${esc(st[k].reason)}</span>`:''}</p></article>`).join('')}
 </div>
 <div class="grid g-main mt">
  <article class="card"><div class="card-head"><div><h2>Traza completa</h2><p>Mensajes reales del estado compartido, en orden.</p></div></div><div class="feed">
   ${r.trace.map(m=>`<div class="ev">${av(m.sender,true)}<div><div class="who"><b>${NAMES[m.sender]||esc(m.sender)}</b>→ ${NAMES[m.recipient]||esc(m.recipient)} <span class="tool">${esc(m.tool)}</span></div><div class="say">${esc(narrate(m))}</div><details><summary>Contenido técnico</summary><pre>${esc(JSON.stringify(m.payload,null,1).slice(0,4000))}</pre></details></div><span class="t">#${m.sequence}</span></div>`).join('')}
  </div></article>
  <div class="stack">
   <article class="card"><h2>Proveedor LLM</h2><div class="bars mt small">
    <div class="bar-row" style="grid-template-columns:1fr auto"><span class="muted">Proveedor · modelo</span><b>${esc(llm.provider)} · ${esc(llm.model)}</b></div>
    <div class="bar-row" style="grid-template-columns:1fr auto"><span class="muted">Tokens totales</span><b class="num">${(r.usage||[]).reduce((s,u)=>s+(u.total_tokens||0),0).toLocaleString('es-PE')}</b></div>
    <div class="bar-row" style="grid-template-columns:1fr auto"><span class="muted">Códigos de cliente enviados</span><b>Ninguno</b></div></div>
    ${llm.attempts.length?`<div class="table-wrap mt"><table><thead><tr><th>Agente</th><th>Intento</th><th>Estado</th><th>Modelo</th><th class="r">ms</th></tr></thead><tbody>${llm.attempts.map(x=>`<tr><td>${NAMES[x.agent]||esc(x.agent)}</td><td>${x.attempt}</td><td>${x.status==='validated'?'<span class="badge ok plain">validado</span>':llm.attempts.some(y=>y.agent===x.agent&&y.status==='validated')?`<span class="badge warn plain" title="${esc(x.code||'')}">reintentado</span>`:`<span class="badge idle plain" title="${esc(x.code||'')}">reglas</span>`}</td><td class="small">${esc((x.model||'').replace('openai/',''))}</td><td class="r">${Math.round(x.elapsed_ms)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="small muted mt">Sin llamadas al LLM en esta ejecución.</p>'}
    <p class="small muted" style="margin-top:10px">${esc(llm.message)}</p></article>
   ${r.warnings.length?`<article class="card"><h2>Advertencias</h2><ul class="warn-list mt">${r.warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul></article>`:''}
  </div>
 </div>`;
 $('replay').onclick=replay;
 $('dl-trace').onclick=()=>download(`traza_${r.id}.json`,JSON.stringify({id:r.id,trace:r.trace,llm_report:r.llm_report,agent_llm:r.agent_llm,agent_report:r.agent_report},null,2),'application/json');
}

/* ---------- Final decision: what the last agents recommend, and the person decides ---------- */
function compareBars(rows){
 const max=Math.max(1,...rows.map(x=>x[1]));
 return `<div class="compare">${rows.map(([label,v,cls,note])=>`<div class="cmp-row"><span>${label}</span><div class="bar-track"><div class="bar-fill ${cls}" style="width:${(v/max*100).toFixed(1)}%"></div></div><b class="num">${money(v,true)}</b>${note?`<small>${note}</small>`:''}</div>`).join('')}</div>`;
}
function chain(p,r){
 const sup=r.supervisor_review,sim=r.simulation;
 return `<div class="chain">
  <span class="link" style="--c:var(--a-predictivo)">${av('predictivo',true)}<span><small>Predictivo</small>${pct(p.probability)} · ${RISK[p.risk].replace('Riesgo ','riesgo ')}</span></span><span class="sep" aria-hidden="true">${icon('arrow','s')}</span>
  <span class="link" style="--c:var(--a-retencion)">${av('retencion',true)}<span><small>Retención</small>${ACTION_LABELS[r.action]||esc(r.action)}${sim?` · −${pp(sim.risk_reduction)}`:''}</span></span><span class="sep" aria-hidden="true">${icon('arrow','s')}</span>
  <span class="link" style="--c:var(--a-supervisor)">${av('supervisor',true)}<span><small>Supervisor</small>${sup?(sup.action==='approve_plan'?'Aprobada':'Pide revisión'):'Controles OK'}</span></span>
 </div>`;
}
function viewPlan(){
 const r0=S.run,recs=r0.recommendations,ex=r0.executive,a=r0.analytics,count=d=>recs.filter(r=>r.decision===d).length;
 const eligible=recs.filter(r=>r.decision==='pending'&&r.supervisor_review?.action!=='request_review').length;
 const flagged=recs.filter(r=>r.supervisor_review?.action==='request_review').length,reviewed=recs.some(r=>r.supervisor_review);
 const order={URGENTE:0,ATENCION:1,NORMAL:2};
 const list=recs.filter(r=>S.planFilter==='all'||r.decision===S.planFilter).map(r=>({r,p:predOf(r.cliente_id)})).sort((x,y)=>order[x.r.priority]-order[y.r.priority]||y.p.revenue_at_risk-x.p.revenue_at_risk);
 const prot=f=>recs.filter(f).filter(r=>r.simulation).reduce((s,r)=>s+r.simulation.revenue_protected_monthly,0);
 const atRisk=a.revenue.monthly_at_risk,accepted=prot(r=>r.decision==='approved'),possible=prot(r=>r.decision!=='rejected'&&r.supervisor_review?.action!=='request_review');
 const pending=count('pending'),done=!pending;
 $('view').innerHTML=`
 <div class="page-head"><div><div class="kicker">${av('usuario',true)} Paso 5 · decisión humana</div><h1>Tu decisión</h1><p>Los agentes ya terminaron. Revisa la recomendación final y acepta o rechaza cada propuesta. Nada se envía ni se ejecuta fuera de esta página.</p></div>
  <div class="actions"><button class="btn" id="export">${icon('download','s')}Exportar plan CSV</button><button class="btn primary" id="bulk" ${eligible&&r0.status==='completed'?'':'disabled'}>${icon('check','s')}Aceptar las validadas por el Supervisor (${eligible})</button></div></div>
 ${done?`<div class="card done-card">${icon('check')}<div style="flex:1"><b>Decisión completa.</b> <span class="ink2">${count('approved')} aceptadas y ${count('rejected')} rechazadas. Ingreso mensual protegido estimado: <b>${money(accepted)}</b>.</span></div><button class="btn primary" id="export2">${icon('download','s')}Descargar plan</button></div>`:''}
 <div class="grid g-final ${done?'mt':''}">
  ${ex?`<article class="card final"><div class="kicker">${av('estratega',true)} Recomendación final · Agente Estratega ${ex.source==='llm'?`<span class="badge llm plain">${icon('spark','s')}LLM · cifras verificadas</span>`:'<span class="badge rules plain">Reglas</span>'}</div>
   <h2>${esc(ex.headline)}</h2><ol class="final-actions">${ex.actions.map(x=>`<li>${esc(x)}</li>`).join('')}</ol>
   <p class="small muted">${av('supervisor',true)} ${reviewed?`El Supervisor revisó ${recs.length} propuestas con el LLM: ${recs.length-flagged} aprobadas${flagged?` y ${flagged} que necesitan tu revisión`:''}.`:`Las ${recs.length} propuestas superan los controles del Supervisor.`}</p></article>`:''}
  <article class="card"><h2>Impacto de tu plan</h2><p class="small muted" style="margin:3px 0 12px">Ingreso mensual en riesgo según el modelo. La reducción es la que simula la red si cada acción logra su objetivo; no es un efecto garantizado.</p>
   ${compareBars([['Hoy, sin actuar',atRisk,'hi'],['Con lo que ya aceptaste',Math.max(0,atRisk-accepted),accepted?'lo':'idle',accepted?`${money(accepted,true)} protegidos al mes`:'Aún no has aceptado propuestas'],['Si aceptas todas las validadas',Math.max(0,atRisk-possible),'md',`${money(possible,true)} protegidos al mes`]])}
   <div class="progress mt"><div class="bar-track"><div class="bar-fill" style="width:${((recs.length-pending)/recs.length*100).toFixed(0)}%"></div></div><span class="small muted">${recs.length-pending} de ${recs.length} propuestas decididas</span></div></article>
 </div>
 <article class="card mt"><div class="toolbar"><div class="seg" role="group" aria-label="Filtrar decisiones">${[['pending',`Pendientes (${pending})`],['approved',`Aceptadas (${count('approved')})`],['rejected',`Rechazadas (${count('rejected')})`],['all','Todas']].map(([v,l])=>`<button data-plan="${v}" aria-pressed="${S.planFilter===v}">${l}</button>`).join('')}</div><span class="muted small">Ordenadas por prioridad e ingreso en riesgo</span></div>
  <div id="plan-list">${list.slice(0,S.planLimit).map(({r,p})=>{const why=r.supervisor_review?.reason||r.llm_reason;return `<div class="dcard ${r.supervisor_review?.action==='request_review'?'flag':''}"><div class="dmain"><div class="title"><button class="linklike" data-customer="${esc(r.cliente_id)}">${esc(r.cliente_id)}</button>${prioBadge(r.priority)}<span class="muted small">${money(p.revenue_at_risk)}/mes en riesgo · ${esc(r.owner)} · ${esc(r.timeframe).toLowerCase()}</span></div>
   ${chain(p,r)}${why?`<blockquote class="why">${icon('spark','s')}<span>«${esc(why)}»</span></blockquote>`:''}</div><div class="dside">${decisionHtml(r)}</div></div>`;}).join('')||`<p class="empty">${S.planFilter==='pending'?'No quedan propuestas pendientes.':'No hay propuestas en este filtro.'}</p>`}</div>
  ${list.length>S.planLimit?`<div class="pager"><span>Mostrando ${S.planLimit} de ${list.length}</span><button class="btn sm" id="more">Mostrar más</button></div>`:''}
 </article>`;
 document.querySelectorAll('[data-plan]').forEach(b=>b.onclick=()=>{S.planFilter=b.dataset.plan;S.planLimit=40;viewPlan();});
 if($('more'))$('more').onclick=()=>{S.planLimit+=40;viewPlan();};
 $('bulk').onclick=()=>{try{const n=approvePendingLocal(S.run);notice(`${n} propuestas aceptadas. Las que el Supervisor marcó para revisar siguen pendientes.`,'ok');viewPlan();updateChrome();}catch(e){notice(e.message,'error');}};
 const exp=()=>{download(`plan_retencion_${S.run.id}.csv`,planCsv(S.run,S.config?.actions),'text/csv;charset=utf-8');notice('Plan exportado con responsables, plazos, simulación y tus decisiones. No crea tareas en un CRM.','ok');};
 $('export').onclick=exp;if($('export2'))$('export2').onclick=exp;
 bindDecisions($('plan-list'),()=>{viewPlan();updateChrome();});bindCustomerOpeners($('plan-list'));
}

/* ---------- Simulator ---------- */
let simTimer,simSeq=0;
function gauge(score){
 const r=36,c=2*Math.PI*r,color=score>=60?'var(--lo)':score>=30?'var(--md)':'var(--hi)';
 return `<svg class="gauge" viewBox="0 0 84 84" role="img" aria-label="Salud ${score} de 100"><circle cx="42" cy="42" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="8"/><circle cx="42" cy="42" r="${r}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${c*score/100} ${c}" transform="rotate(-90 42 42)"/><text x="42" y="49" text-anchor="middle">${score}</text></svg>`;
}
function viewSimulator(){
 S.sim=S.sim||{antiguedad:24,compras_mensuales:6,monto_promedio:1500,reclamos:3,dias_ultima_compra:40,pagos_atrasados:2};
 $('view').innerHTML=`
 <div class="page-head"><div><div class="kicker">${av('retencion',true)} Herramienta del Agente de Retención</div><h1>Simulador what-if</h1><p>Mueve los indicadores y mira cómo responde la red neuronal. Es la misma herramienta con la que Retención estima el impacto de cada acción.${S.simFrom?` Valores iniciales de <b>${esc(S.simFrom)}</b>.`:''}</p></div></div>
 <div class="grid g-2">
  <article class="card"><h2>Indicadores</h2><div class="sliders mt">${FEATURES.map(f=>{const [mn,mx,st]=RANGES[f];return `<div class="slider"><label for="s-${f}">${LABELS[f]}<output id="o-${f}">${S.sim[f]}</output></label><input type="range" id="s-${f}" min="${mn}" max="${mx}" step="${st}" value="${Math.min(mx,Math.max(mn,S.sim[f]))}"><small>${mn} – ${mx}</small></div>`;}).join('')}</div></article>
  <div class="stack"><article class="card" id="sim-out"><p class="muted">Calculando…</p></article><article class="card" id="sim-levers"></article></div>
 </div>`;
 FEATURES.forEach(f=>{$('s-'+f).oninput=e=>{S.sim[f]=Number(e.target.value);$('o-'+f).textContent=e.target.value;clearTimeout(simTimer);simTimer=setTimeout(runSim,120);};});
 runSim();
}
async function runSim(){
 const seq=++simSeq;
 try{
  const res=await api('/api/public/simulate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cliente_id:'SIM-001',...S.sim})});
  if(seq!==simSeq||!$('sim-out'))return;
  const p=res.prediction;
  $('sim-out').innerHTML=`<div class="health">${gauge(p.health_score)}<div><span class="muted small">Probabilidad de abandono</span><div class="big-prob">${pct(p.probability,1)}</div><div class="actions" style="margin-top:6px">${riskBadge(p.risk)}<span class="muted small">${money(p.revenue_at_risk)}/mes en riesgo de ${money(p.monthly_revenue)}</span></div></div></div>
   <h3 style="margin:16px 0 6px">Qué la empuja</h3>${factorsHtml(p)}`;
  $('sim-levers').innerHTML=`<h2>Impacto de cada acción</h2><p class="muted small" style="margin-top:3px">Probabilidad si la palanca se resuelve. Solo las acciones aplicables pueden recomendarse.</p>
   <div class="table-wrap mt"><table><thead><tr><th>Acción</th><th>Escenario</th><th class="r">Después</th><th class="r">Reducción</th><th class="r">Protegido/mes</th></tr></thead><tbody>
   ${Object.entries(res.levers).map(([a,s])=>`<tr><td>${ACTION_LABELS[a]} ${res.allowed_actions.includes(a)?'':'<span class="badge idle plain">no aplica</span>'}</td><td>${s?esc(s.scenario):'—'}</td><td class="r">${s?pct(s.probability_after,1):'—'}</td><td class="r">${s?'−'+pp(s.risk_reduction):'—'}</td><td class="r">${s?money(s.revenue_protected_monthly):'—'}</td></tr>`).join('')}
   </tbody></table></div>${p.warnings.length?`<p class="small muted mt">${icon('alert','s')} ${esc(p.warnings.join(' · '))}</p>`:''}`;
 }catch(e){if($('sim-out'))$('sim-out').innerHTML=`<p class="muted">${esc(e.message)}</p>`;}
}

/* ---------- Model ---------- */
async function viewModel(){
 $('view').innerHTML='<p class="muted">Cargando métricas…</p>';
 if(!S.metrics){try{S.metrics=await api('/api/metrics');}catch{S.metrics={status:'error'};}}
 const m=S.metrics,k=m.metrics||{},cm=k.confusion_matrix||[[0,0],[0,0]];
 $('view').innerHTML=`
 <div class="page-head"><div><div class="kicker">Transparencia</div><h1>Modelo y método</h1><p>Qué hace cada componente, cómo se midió y qué falta para usarlo en una empresa real.</p></div></div>
 ${m.status==='measured'?`<div class="grid g-4">${[['AUC',k.auc.toFixed(3),'Capacidad de ordenar clientes por riesgo'],['Exactitud',pct(k.accuracy,1),`Línea base «todos abandonan»: ${pct(m.baseline.accuracy,1)}`],['Precisión · Recall',`${pct(k.precision,0)} · ${pct(k.recall,0)}`,`F1 ${k.f1.toFixed(3)}`],['Brier',k.brier.toFixed(3),'Error de probabilidad (menor es mejor)']].map(([l,v,s])=>`<div class="card kpi"><div class="label">${l}</div><div class="value">${v}</div><div class="sub">${s}</div></div>`).join('')}</div>
 <div class="grid g-2 mt"><article class="card"><div class="card-head"><div><h2>Curva ROC</h2><p>${m.n.toLocaleString('es-PE')} ejemplos sintéticos nuevos (semilla ${m.seed}).</p></div></div>${roc(m.roc||[])}</article>
  <article class="card"><h2>Matriz de confusión (umbral 50%)</h2><div class="cm mt"><div class="hd"></div><div class="hd">Predice: se queda</div><div class="hd">Predice: abandona</div><div class="hd">Real: se queda</div><div class="tp">${cm[0][0]}</div><div>${cm[0][1]}</div><div class="hd">Real: abandona</div><div>${cm[1][0]}</div><div class="tp">${cm[1][1]}</div></div>
   <p class="small muted" style="margin-top:14px">${esc(m.note)}</p></article></div>`:'<div class="card"><p class="muted">Evaluación no disponible.</p></div>'}
 <div class="grid g-2 mt">
  <article class="card prose"><h2>Arquitectura</h2>
   <ul><li><b>Red neuronal</b> densa 6→32→16→8→1 (ReLU, sigmoide), pesos exportados del notebook y ejecutados en Python. Riesgo: bajo &lt; 40%, medio 40–70%, alto ≥ 70%.</li>
   <li><b>Explicación local</b>: cambio de probabilidad al llevar cada indicador a su media de entrenamiento.</li>
   <li><b>Valor de negocio</b>: ingreso mensual = compras × monto; ingreso en riesgo = probabilidad × ingreso; salud = 100 × (1 − probabilidad).</li>
   <li><b>What-if</b>: re-ejecuta la red con la palanca de cada acción resuelta (reclamos, pagos, recencia).</li>
   <li><b>Cuatro agentes</b> con estado compartido y mensajes trazables, transmitidos en vivo. LLM: ${esc(S.config?.llm_provider||'—')} · ${esc(S.config?.llm_model||'—')}, sobre los ${S.config?.max_llm_customers||10} clientes de mayor riesgo.</li></ul></article>
  <article class="card prose"><h2>Barreras de seguridad</h2>
   <ul><li>El LLM nunca cambia probabilidades: elige entre acciones permitidas, con salida JSON restringida por esquema.</li>
   <li>Cada respuesta se valida (índices completos, acción permitida, evidencia existente); si falla, se usan reglas y se informa.</li>
   <li>El resumen del Estratega se rechaza si cita cifras que no están en los datos; su titular siempre se calcula sin LLM.</li>
   <li>Sin códigos de cliente hacia el proveedor; presupuesto diario, reintento breve ante límite de cuota y tope de 60 s / 32 mensajes.</li>
   <li>Decisión humana obligatoria; ninguna acción externa se ejecuta.</li></ul></article>
 </div>
 <article class="card prose mt"><h2>Del prototipo a una empresa real</h2>
  <p>El modelo se entrenó con datos sintéticos: las cifras demuestran el flujo, no predicen clientes reales. Para un piloto:</p>
  <ul><li><b>Definir abandono</b> con negocio (p. ej. sin compras en 90 días) y el horizonte de alerta.</li>
  <li><b>Reentrenar</b> con históricos reales (CRM/ERP) y validar en periodos posteriores contra una regla simple.</li>
  <li><b>Calibrar</b> probabilidades y fijar umbrales según la capacidad del equipo comercial.</li>
  <li><b>Medir impacto</b> con grupo de control: retención de contactados frente a no contactados.</li>
  <li><b>Operar</b>: roles, base persistente, integración con CRM y monitoreo de deriva.</li></ul></article>`;
}
function roc(points){
 const W=360,H=250,L=34,B=30,T=8,R=8,x=v=>L+v*(W-L-R),y=v=>T+(1-v)*(H-T-B);
 return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Curva ROC">${[0,.25,.5,.75,1].map(t=>`<line class="grid-line" x1="${x(t)}" x2="${x(t)}" y1="${T}" y2="${H-B}"/><line class="grid-line" x1="${L}" x2="${W-R}" y1="${y(t)}" y2="${y(t)}"/><text x="${x(t)}" y="${H-B+14}" text-anchor="middle">${t}</text><text x="${L-6}" y="${y(t)+4}" text-anchor="end">${t}</text>`).join('')}
 <line class="thr" x1="${x(0)}" y1="${y(0)}" x2="${x(1)}" y2="${y(1)}"/>
 <polyline fill="none" stroke="var(--brand)" stroke-width="2" points="${points.map(([a,b])=>`${x(a).toFixed(1)},${y(b).toFixed(1)}`).join(' ')}"/>
 <text x="${(L+W)/2}" y="${H-2}" text-anchor="middle">Tasa de falsos positivos</text></svg>`;
}

/* ---------- Boot ---------- */
async function boot(){
 document.querySelectorAll('[data-icon]').forEach(el=>{el.outerHTML=icon(el.dataset.icon);});
 $('menu').onclick=()=>{const o=$('sidebar').classList.toggle('open');$('menu').setAttribute('aria-expanded',o);};
 $('drawer-backdrop').onclick=closeDrawer;
 document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDrawer();});
 window.addEventListener('hashchange',route);
 try{
  S.config=await api('/api/config');
  const llm=$('sys-llm');
  llm.querySelector('.dot').className='dot '+(S.config.llm_configured?'ok':'off');
  llm.querySelector('.v').textContent=S.config.llm_configured?`${S.config.llm_provider} activo`:'no configurado';
  $('sys-model').querySelector('.dot').className='dot ok';
  S.llm=!!S.config.llm_configured;
 }catch{notice('No se pudo conectar con el servidor. Recarga la página.','error');}
 updateChrome();route();
}
document.addEventListener('DOMContentLoaded',boot);
