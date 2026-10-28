'use strict';
// ChurnTrackAI UI: hash-routed single page, no build step. Public analyses are temporary (not stored server-side).
const {FEATURES,LABELS,ACTION_LABELS,QUADRANTS,money,pct,approvePendingLocal,actionPackage,planCsv,filterCustomers}=window.Core;
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pp=x=>(x*100).toLocaleString('es-PE',{maximumFractionDigits:1})+' pp';
const RANGES={antiguedad:[1,60,1],compras_mensuales:[1,15,1],monto_promedio:[100,4999,50],reclamos:[0,7,1],dias_ultima_compra:[1,120,1],pagos_atrasados:[0,5,1]};
const AGENTS={
 supervisor:{name:'Supervisor',initial:'S',role:'Orquesta el flujo, valida cada salida, recalcula simulaciones y pide correcciones.',tools:['Delegación y reintento','Validación de evidencia','Revisión LLM de consistencia']},
 predictivo:{name:'Predictivo',initial:'P',role:'Ejecuta la red neuronal, explica factores y detecta datos fuera de dominio.',tools:['Inferencia neuronal','Sustitución a la media','Interpretación LLM']},
 retencion:{name:'Retención',initial:'R',role:'Elige la acción del playbook usando la simulación what-if de cada palanca.',tools:['Simulador what-if','Catálogo de acciones','Selección LLM restringida']},
 estratega:{name:'Estratega',initial:'E',role:'Redacta el resumen ejecutivo de cartera; cada cifra se verifica contra los datos.',tools:['Agregados de cartera','Matriz valor × riesgo','Verificación de cifras']},
 usuario:{name:'Usuario',initial:'U'},llm:{name:'LLM',initial:'AI'}
};
const S={config:null,metrics:null,run:null,source:'demo',csv:null,llm:false,consent:false,filters:{query:'',risk:'',quadrant:'',sort:'revenue_at_risk'},page:0,planFilter:'pending',planLimit:40,sim:null,busy:false};

async function api(path,opts={}){
 const res=await fetch(path,opts);
 let body=null;try{body=await res.json();}catch{}
 if(!res.ok){
  const d=body?.detail;
  throw Error(Array.isArray(d)?d.map(e=>`${(e.loc||[]).slice(1).join('.')||'dato'}: ${e.msg}`).join(' · '):d||`Error ${res.status}`);
 }
 return body;
}
let noticeTimer;
function notice(msg,kind='info'){
 const n=$('notice');clearTimeout(noticeTimer);
 if(!msg){n.hidden=true;return;}
 n.className='notice '+kind;n.hidden=false;
 n.innerHTML=`<span>${esc(msg)}</span><button aria-label="Cerrar aviso">×</button>`;
 n.querySelector('button').onclick=()=>notice('');
 if(kind!=='error')noticeTimer=setTimeout(()=>notice(''),9000);
}
function download(name,text,type){
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
const riskBadge=r=>`<span class="badge ${r}">${{ALTO:'Alto',MEDIO:'Medio',BAJO:'Bajo'}[r]||esc(r)}</span>`;
const srcBadge=s=>s==='llm'?'<span class="badge llm">LLM verificado</span>':'<span class="badge rules">Reglas</span>';
const quadBadge=q=>q?`<span class="badge q"><i class="qdot q-${q}"></i>${QUADRANTS[q].label}</span>`:'';
const statusBadge=s=>({validated:'<span class="badge ok">LLM validado</span>',failed:'<span class="badge fail">LLM falló · reglas</span>'}[s]||'<span class="badge idle">Sin LLM</span>');
const probBar=p=>`<div class="prob"><div class="bar-track"><div class="bar-fill ${p.risk}" style="width:${(p.probability*100).toFixed(1)}%"></div></div><span class="num">${pct(p.probability)}</span></div>`;
const recOf=id=>S.run?.recommendations.find(r=>r.cliente_id===id);
const predOf=id=>S.run?.predictions.find(p=>p.cliente_id===id);

/* ---------- Routing ---------- */
const TITLES={inicio:'Nuevo análisis',resumen:'Resumen ejecutivo',clientes:'Clientes',agentes:'Agentes',plan:'Plan de acción',simulador:'Simulador what-if',modelo:'Modelo y método'};
const VIEWS={inicio:viewStart,resumen:viewSummary,clientes:viewCustomers,agentes:viewAgents,plan:viewPlan,simulador:viewSimulator,modelo:viewModel};
function route(){
 let name=(location.hash.replace(/^#\/?/,'')||'inicio').split('?')[0];
 if(!VIEWS[name])name='inicio';
 if(document.querySelector(`[data-route="${name}"]`)?.hasAttribute('data-needs-run')&&!S.run){location.hash='#/inicio';return;}
 document.querySelectorAll('.nav a').forEach(a=>{a.classList.toggle('active',a.dataset.route===name);a.classList.toggle('disabled',a.hasAttribute('data-needs-run')&&!S.run);if(a.dataset.route===name)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
 $('crumb').textContent=TITLES[name];document.title=`${TITLES[name]} · ChurnTrackAI`;
 $('sidebar').classList.remove('open');$('menu').setAttribute('aria-expanded','false');
 closeDrawer();
 VIEWS[name]();
 $('view').focus({preventScroll:true});window.scrollTo(0,0);
}
function updateChrome(){
 const c=$('run-chip');
 if(S.run){const s=S.run.summary;c.hidden=false;c.textContent=`${s.customers} clientes · ${s.high} riesgo alto · ${S.run.mode==='rules'?'reglas':'con LLM'}`;}
 else c.hidden=true;
 document.querySelectorAll('.nav a[data-needs-run]').forEach(a=>a.classList.toggle('disabled',!S.run));
}

/* ---------- Start ---------- */
function viewStart(){
 const cfg=S.config||{},llmOk=cfg.llm_configured;
 $('view').innerHTML=`
 <section class="hero">
  <div><span class="eyebrow">Customer Success B2B · IA aplicada</span>
   <h1>Detecta qué clientes están por irse, cuánto ingreso está en juego y qué hacer.</h1>
   <p>Una red neuronal estima la probabilidad de abandono de cada cliente. Cuatro agentes coordinados convierten esa predicción en un plan de retención priorizado, verificable y aprobado por personas.</p>
  </div>
  <div class="pipeline-mini" aria-label="Agentes del sistema">
   ${['predictivo','retencion','supervisor','estratega'].map((k,i)=>`<div class="pm"><span class="n">${i+1}</span><div><b>Agente ${AGENTS[k].name}</b><small>${AGENTS[k].role}</small></div></div>`).join('')}
  </div>
 </section>
 <h2>1 · Elige los datos</h2>
 <div class="sources mt" role="group" aria-label="Fuente de datos">
  ${[['demo','◎','Cartera de ejemplo','300 clientes B2B sintéticos, listos para explorar.'],['csv','⇪','Subir cartera CSV','Hasta 300 clientes con 6 indicadores.'],['single','◉','Un cliente','Ingresa los indicadores manualmente.']].map(([k,ic,t,d])=>`<button class="source" data-source="${k}" aria-pressed="${S.source===k}"><span class="ic" aria-hidden="true">${ic}</span><b>${t}</b><small>${d}</small></button>`).join('')}
 </div>
 <div class="card panel" id="source-panel"></div>
 <h2 class="mt" style="margin-top:26px">2 · Configura y ejecuta</h2>
 <div class="llm-box">
  <label class="switch"><input type="checkbox" id="use-llm" ${S.llm?'checked':''} ${llmOk?'':'disabled'}><span></span><span class="sr-only">Activar revisión LLM</span></label>
  <div><b>Revisión con LLM ${llmOk?`<span class="badge llm">${esc(cfg.llm_provider)} · ${esc(cfg.llm_model)}</span>`:'<span class="badge idle">no configurado en el servidor</span>'}</b>
   <p>Los agentes consultan al LLM para interpretar, elegir acciones, supervisar y redactar el resumen de hasta ${cfg.max_llm_customers||20} clientes prioritarios. Solo se envían indicadores numéricos sin códigos de cliente. Toda respuesta se valida; si falla, se usan reglas explícitas y se informa.</p>
   <label style="display:flex;gap:8px;margin-top:8px;font-size:13px;align-items:flex-start" id="consent-row" ${S.llm?'':'hidden'}><input type="checkbox" id="consent" ${S.consent?'checked':''}> Autorizo enviar estos indicadores anónimos al proveedor LLM para este análisis.</label>
  </div>
 </div>
 <div class="run-bar">
  <p class="muted" style="font-size:13px">El análisis es temporal: no se guarda en el servidor. Exporta el informe o el plan antes de cerrar.</p>
  <button class="btn primary" id="run-btn">Ejecutar análisis →</button>
 </div>`;
 renderSourcePanel();
 document.querySelectorAll('[data-source]').forEach(b=>b.onclick=()=>{S.source=b.dataset.source;document.querySelectorAll('[data-source]').forEach(x=>x.setAttribute('aria-pressed',x===b));renderSourcePanel();});
 $('use-llm').onchange=e=>{S.llm=e.target.checked;$('consent-row').hidden=!S.llm;};
 $('consent').onchange=e=>{S.consent=e.target.checked;};
 $('run-btn').onclick=runAnalysis;
}
function renderSourcePanel(){
 const p=$('source-panel');
 if(S.source==='demo'){
  p.innerHTML=`<div class="card-head"><div><h2>Cartera de ejemplo · 300 clientes</h2><p>Distribuidora B2B ficticia. Indicadores generados con la misma regla sintética del entrenamiento.</p></div><a class="btn small" href="/api/example-300.csv">Descargar CSV</a></div>
  <p class="muted" style="font-size:13.5px">Ideal para recorrer todo el flujo: resumen ejecutivo, matriz valor × riesgo, agentes y plan de acción.</p>`;
 }else if(S.source==='csv'){
  p.innerHTML=`<div class="card-head"><div><h2>Subir cartera</h2><p>Columnas exactas: <span class="mono">cliente_id, ${FEATURES.join(', ')}</span>. Separador coma o punto y coma.</p></div><a class="btn small" href="/api/template.csv">Plantilla</a></div>
  <label class="drop" id="drop" tabindex="0"><input type="file" id="csv-file" accept=".csv,text/csv" hidden><b>${S.csv?esc(S.csv.name):'Arrastra tu CSV aquí o haz clic para elegirlo'}</b><span class="muted" style="font-size:13px">Máximo 300 filas y 256 KB. Se valida antes de analizar.</span></label>
  <div id="csv-preview"></div>`;
  const input=$('csv-file'),drop=$('drop');
  input.onchange=()=>input.files[0]&&loadCsv(input.files[0]);
  drop.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();input.click();}};
  drop.ondragover=e=>{e.preventDefault();drop.classList.add('over');};
  drop.ondragleave=()=>drop.classList.remove('over');
  drop.ondrop=e=>{e.preventDefault();drop.classList.remove('over');e.dataTransfer.files[0]&&loadCsv(e.dataTransfer.files[0]);};
  if(S.csv?.preview)showPreview();
 }else{
  const d={cliente_id:'B2B-001',antiguedad:24,compras_mensuales:5,monto_promedio:800,reclamos:2,dias_ultima_compra:30,pagos_atrasados:1,...(S.single||{})};
  p.innerHTML=`<div class="card-head"><div><h2>Indicadores del cliente</h2><p>Usa un código anónimo. Los conteos deben ser enteros.</p></div></div>
  <form class="form-grid" id="single-form">
   <div class="field"><label for="f-cliente_id">Código de cliente</label><input id="f-cliente_id" name="cliente_id" value="${esc(d.cliente_id)}" pattern="[A-Za-z0-9_-]{1,48}" required></div>
   ${FEATURES.map(f=>`<div class="field"><label for="f-${f}">${LABELS[f]}</label><input id="f-${f}" name="${f}" type="number" min="0" step="${f==='monto_promedio'?'0.01':'1'}" value="${d[f]}" required><small>Rango del modelo: ${RANGES[f][0]}–${RANGES[f][1]}</small></div>`).join('')}
  </form>`;
 }
}
async function loadCsv(file){
 if(file.size>256000){notice('El archivo supera 256 KB.','error');return;}
 const text=await file.text();
 S.csv={name:file.name,text,preview:null};
 renderSourcePanel();
 try{
  const v=await api('/api/public/validate-csv',{method:'POST',headers:{'Content-Type':'text/csv'},body:text});
  S.csv.preview=v;showPreview();notice(`${v.count} clientes válidos. Listo para analizar.`,'ok');
 }catch(e){S.csv=null;renderSourcePanel();notice('CSV inválido: '+e.message,'error');}
}
function showPreview(){
 const v=S.csv.preview;
 $('csv-preview').innerHTML=`<p class="mt" style="font-size:13px"><b>${v.count}</b> clientes válidos · vista previa de ${v.preview.length}</p><div class="table-wrap preview"><table><thead><tr><th>cliente_id</th>${FEATURES.map(f=>`<th class="r">${LABELS[f]}</th>`).join('')}</tr></thead><tbody>${v.preview.map(r=>`<tr><td>${esc(r.cliente_id)}</td>${FEATURES.map(f=>`<td class="r num">${r[f]}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
async function runAnalysis(){
 if(S.busy)return;
 const useLLM=S.llm&&!!S.config?.llm_configured;
 if(useLLM&&!S.consent){notice('Marca la autorización para enviar indicadores al LLM, o desactiva la revisión LLM.','error');return;}
 let request;
 const q=`?use_llm=${useLLM}&consent=${useLLM}`;
 try{
  if(S.source==='demo'){
   if(useLLM){const text=await (await fetch('/api/example-300.csv')).text();request=()=>api('/api/public/analyze-csv'+q,{method:'POST',headers:{'Content-Type':'text/csv'},body:text});}
   else request=()=>api('/api/demo?size=300',{method:'POST'});
  }else if(S.source==='csv'){
   if(!S.csv?.preview){notice('Primero sube un CSV válido.','error');return;}
   const text=S.csv.text;request=()=>api('/api/public/analyze-csv'+q,{method:'POST',headers:{'Content-Type':'text/csv'},body:text});
  }else{
   const form=$('single-form');if(!form.reportValidity())return;
   const row=Object.fromEntries(new FormData(form));for(const f of FEATURES)row[f]=Number(row[f]);S.single=row;
   request=()=>api('/api/public/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({customers:[row],use_llm:useLLM,consent_external_processing:useLLM})});
  }
 }catch(e){notice(e.message,'error');return;}
 S.busy=true;notice('');
 $('view').innerHTML=`<div class="progress" aria-live="polite">
  <div class="card"><span class="eyebrow">Ejecutando</span><h2>El Supervisor está coordinando a los agentes…</h2><p class="muted" style="margin-top:6px;font-size:13.5px">${useLLM?'Con LLM, cada agente espera la respuesta del proveedor y la valida: puede tardar hasta un minuto.':'Sin LLM el análisis tarda unos segundos.'}</p></div>
  ${['predictivo','retencion','supervisor','estratega'].map(k=>`<div class="step running"><span class="st" aria-hidden="true"></span><div><b>${AGENTS[k].name}</b><small>${AGENTS[k].role}</small></div></div>`).join('')}
 </div>`;
 try{
  const run=await request();
  run.local_label=S.source==='demo'?'Cartera de ejemplo':S.source==='csv'?S.csv.name:'Cliente individual';
  S.run=run;S.page=0;S.filters={query:'',risk:'',quadrant:'',sort:'revenue_at_risk'};S.planFilter='pending';
  updateChrome();
  if(run.status!=='completed')notice('El análisis no se completó: '+(run.warnings||[]).join(' '),'error');
  else if(run.warnings?.length)notice(run.warnings[0],'info');
  location.hash='#/resumen';
 }catch(e){notice(e.message,'error');viewStart();}
 finally{S.busy=false;}
}

/* ---------- Summary ---------- */
function viewSummary(){
 const r=S.run,a=r.analytics,ex=r.executive,rev=a.revenue,hi=a.segments.find(s=>s.risk==='ALTO');
 $('view').innerHTML=`
 <div class="page-head"><div><span class="eyebrow">${esc(r.local_label||'Análisis')} · ${new Date(r.created).toLocaleString('es-PE')}</span><h1>Resumen ejecutivo</h1><p>Situación de la cartera, ingreso expuesto y dónde actuar primero.</p></div>
  <div class="actions"><button class="btn" id="dl-report">Descargar informe JSON</button><a class="btn primary" href="#/plan">Revisar plan de acción →</a></div></div>
 ${ex?`<article class="card brief"><div class="card-head" style="margin-bottom:0"><span class="eyebrow">Agente Estratega · resumen para gerencia</span>${ex.source==='llm'?'<span class="badge llm">Redactado por LLM · cifras verificadas</span>':'<span class="badge rules">Generado por reglas</span>'}</div>
  <h2>${esc(ex.headline)}</h2><div class="cols"><div><h3>Hallazgos</h3><ul>${ex.findings.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div><div><h3>Acciones recomendadas</h3><ul>${ex.actions.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div></div></article>`:''}
 <div class="grid g-4 mt">
  <div class="card kpi accent"><div class="label">Ingreso mensual en riesgo</div><div class="value">${money(rev.monthly_at_risk,true)}</div><div class="sub">${pct(rev.share_at_risk)} de ${money(rev.monthly_total,true)} mensuales</div></div>
  <div class="card kpi"><div class="label">Exposición anualizada</div><div class="value">${money(rev.annual_at_risk,true)}</div><div class="sub">Top 20% de clientes: ${pct(rev.top20_concentration)} del riesgo</div></div>
  <div class="card kpi"><div class="label">Clientes en riesgo alto</div><div class="value">${hi.count}<span class="muted" style="font-size:16px"> / ${a.count}</span></div><div class="sub">${pct(hi.share)} de la cartera · ${a.segments[1].count} en riesgo medio</div></div>
  <div class="card kpi"><div class="label">Salud promedio <span title="Health score = 100 × (1 − probabilidad)">ⓘ</span></div><div class="value">${a.health_score}<span class="muted" style="font-size:16px">/100</span></div><div class="sub">${a.out_of_domain_count?`${a.out_of_domain_count} registros fuera de dominio`:'Todos los datos dentro del dominio del modelo'}</div></div>
 </div>
 <div class="grid g-main mt">
  <article class="card"><div class="card-head"><div><h2>Matriz valor × riesgo</h2><p>Cada punto es un cliente. Haz clic para ver su detalle.</p></div></div>${scatter(r)}
   <div class="legend">${Object.entries(QUADRANTS).map(([k,q])=>`<span><i class="qdot q-${k}"></i>${q.label}</span>`).join('')}</div></article>
  <article class="card"><div class="card-head"><div><h2>Segmentos de acción</h2><p>Valor alto = ingreso mensual ≥ mediana (${money(a.value_threshold)}).</p></div></div>
   <div class="quads">${['rescatar','proteger','automatizar','mantener'].map(k=>{const q=a.quadrants[k];return `<button class="quad" data-quad="${k}"><div class="top"><b><i class="qdot q-${k}"></i> ${QUADRANTS[k].label}</b><span class="muted" style="font-size:12px">${QUADRANTS[k].hint}</span></div><div class="big">${q.count}</div><small>${money(q.revenue_at_risk,true)}/mes en riesgo</small></button>`;}).join('')}</div>
   <p class="muted" style="font-size:12.5px;margin-top:12px">Rescatar: atención personal inmediata · Proteger: cuidar y crecer · Automatizar: acciones escalables de bajo costo · Mantener: seguimiento rutinario.</p></article>
 </div>
 <div class="grid g-2 mt">
  <article class="card"><div class="card-head"><div><h2>Prioridades de atención</h2><p>Mayor ingreso mensual en riesgo (probabilidad × ingreso).</p></div><a class="btn small ghost" href="#/clientes">Ver todos →</a></div>
   ${a.priorities.length?`<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Riesgo</th><th class="r">En riesgo/mes</th><th>Acción propuesta</th></tr></thead><tbody>${a.priorities.slice(0,8).map(x=>`<tr tabindex="0" data-customer="${esc(x.cliente_id)}"><td><b>${esc(x.cliente_id)}</b></td><td>${riskBadge(x.risk)}</td><td class="r num">${money(x.attention_score)}</td><td>${ACTION_LABELS[recOf(x.cliente_id)?.action]||''}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">No hay clientes de riesgo medio/alto dentro del dominio del modelo.</p>'}</article>
  <article class="card"><div class="card-head"><div><h2>Distribución de probabilidad</h2><p>Clientes por tramo de probabilidad estimada.</p></div></div>${histogram(a.histogram)}
   <h3 style="margin:18px 0 10px">Variables más sensibles en esta cartera</h3>
   <div class="bars">${a.sensitivities.map(s=>`<div class="bar-row"><span>${LABELS[s.feature]}</span><div class="bar-track"><div class="bar-fill" style="width:${(s.mean_absolute_delta/(a.sensitivities[0].mean_absolute_delta||1)*100).toFixed(1)}%"></div></div><span class="num r">${pp(s.mean_absolute_delta)}</span></div>`).join('')||'<p class="muted">Sin datos dentro del dominio.</p>'}</div>
   <p class="muted" style="font-size:12px;margin-top:10px">${esc(a.sensitivity_definition)}</p></article>
 </div>
 <p class="muted mt" style="font-size:12.5px">${esc(a.revenue_definition)}</p>`;
 $('dl-report').onclick=()=>download(`informe_${r.id}.json`,JSON.stringify(r,null,2),'application/json');
 document.querySelectorAll('[data-quad]').forEach(b=>b.onclick=()=>{S.filters={...S.filters,quadrant:b.dataset.quad,risk:''};S.page=0;location.hash='#/clientes';});
 bindCustomerOpeners();
}
function scatter(run){
 const W=640,H=330,L=58,R=12,T=12,B=36,ps=run.predictions;
 const vals=ps.map(p=>Math.max(1,p.monthly_revenue));
 const lo=Math.log10(Math.min(...vals)),hi=Math.log10(Math.max(...vals))+1e-9,span=Math.max(hi-lo,.5);
 const x=v=>L+v*(W-L-R),y=v=>T+(1-(Math.log10(Math.max(1,v))-lo)/span)*(H-T-B);
 const ticks=[];for(let e=Math.ceil(lo);e<=Math.floor(hi);e++)ticks.push(10**e);
 const thr=run.analytics.value_threshold;
 return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Dispersión de clientes por probabilidad de abandono e ingreso mensual">
  ${[0,.2,.4,.6,.8,1].map(t=>`<line class="grid-line" x1="${x(t)}" x2="${x(t)}" y1="${T}" y2="${H-B}"/><text x="${x(t)}" y="${H-B+16}" text-anchor="middle">${t*100}%</text>`).join('')}
  ${ticks.map(t=>`<line class="grid-line" x1="${L}" x2="${W-R}" y1="${y(t)}" y2="${y(t)}"/><text x="${L-8}" y="${y(t)+4}" text-anchor="end">${money(t,true).replace('S/ ','')}</text>`).join('')}
  <line x1="${x(.4)}" x2="${x(.4)}" y1="${T}" y2="${H-B}" stroke="var(--muted)" stroke-dasharray="4 4"/>
  <line x1="${L}" x2="${W-R}" y1="${y(thr)}" y2="${y(thr)}" stroke="var(--muted)" stroke-dasharray="4 4"/>
  <text x="${x(.4)+6}" y="${y(thr)-6}">mediana de valor</text>
  ${ps.map(p=>`<circle class="dotc" data-customer="${esc(p.cliente_id)}" cx="${x(p.probability).toFixed(1)}" cy="${y(p.monthly_revenue).toFixed(1)}" r="${ps.length>100?4:6}" fill="var(--q-${p.quadrant})" fill-opacity=".72"><title>${esc(p.cliente_id)} · ${pct(p.probability)} · ${money(p.monthly_revenue)}/mes</title></circle>`).join('')}
  <text x="${(L+W-R)/2}" y="${H-4}" text-anchor="middle">Probabilidad de abandono →</text>
  <text x="14" y="${(T+H-B)/2}" text-anchor="middle" transform="rotate(-90 14 ${(T+H-B)/2})">Ingreso mensual (S/, log)</text>
 </svg>`;
}
function histogram(h){
 const W=520,H=170,L=30,B=26,T=8,max=Math.max(...h,1),bw=(W-L)/10;
 const color=i=>i>=7?'var(--high)':i>=4?'var(--med)':'var(--low)';
 return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Histograma de probabilidades">
  ${h.map((v,i)=>{const bh=(v/max)*(H-B-T-12);return `<rect x="${L+i*bw+3}" y="${H-B-bh}" width="${bw-6}" height="${bh}" rx="4" fill="${color(i)}" fill-opacity=".85"><title>${i*10}–${i*10+10}%: ${v} clientes</title></rect>${v?`<text x="${L+i*bw+bw/2}" y="${H-B-bh-4}" text-anchor="middle">${v}</text>`:''}<text x="${L+i*bw+bw/2}" y="${H-8}" text-anchor="middle">${i*10}%</text>`;}).join('')}
  <line class="axis" x1="${L}" x2="${W}" y1="${H-B}" y2="${H-B}"/>
 </svg><div class="legend"><span><i class="qdot" style="background:var(--low)"></i>Bajo &lt;40%</span><span><i class="qdot" style="background:var(--med)"></i>Medio 40–70%</span><span><i class="qdot" style="background:var(--high)"></i>Alto ≥70%</span></div>`;
}
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
 <div class="page-head"><div><span class="eyebrow">${S.run.predictions.length} clientes analizados</span><h1>Clientes</h1><p>Busca, filtra y abre cada cliente para ver por qué está en riesgo y qué proponen los agentes.</p></div></div>
 <div class="toolbar">
  <input class="search" id="q" type="search" placeholder="Buscar código de cliente…" value="${esc(f.query)}" aria-label="Buscar cliente">
  <div class="seg" role="group" aria-label="Filtrar por riesgo">${[['','Todos'],['ALTO','Alto'],['MEDIO','Medio'],['BAJO','Bajo']].map(([v,l])=>`<button data-risk="${v}" aria-pressed="${f.risk===v}">${l}</button>`).join('')}</div>
  <select class="search" style="flex:0 1 190px" id="quad" aria-label="Filtrar por segmento"><option value="">Todos los segmentos</option>${Object.entries(QUADRANTS).map(([k,q])=>`<option value="${k}" ${f.quadrant===k?'selected':''}>${q.label}</option>`).join('')}</select>
  <select class="search" style="flex:0 1 210px" id="sort" aria-label="Ordenar">${[['revenue_at_risk','Mayor ingreso en riesgo'],['probability','Mayor probabilidad'],['monthly_revenue','Mayor ingreso mensual'],['health','Menor salud'],['id','Código']].map(([v,l])=>`<option value="${v}" ${f.sort===v?'selected':''}>${l}</option>`).join('')}</select>
 </div>
 <div id="table"></div>`;
 $('q').oninput=e=>{S.filters.query=e.target.value;S.page=0;renderTable();};
 document.querySelectorAll('[data-risk]').forEach(b=>b.onclick=()=>{S.filters.risk=b.dataset.risk;S.page=0;document.querySelectorAll('[data-risk]').forEach(x=>x.setAttribute('aria-pressed',x===b));renderTable();});
 $('quad').onchange=e=>{S.filters.quadrant=e.target.value;S.page=0;renderTable();};
 $('sort').onchange=e=>{S.filters.sort=e.target.value;renderTable();};
 renderTable();
}
function renderTable(){
 const rows=filterCustomers(S.run,S.filters),size=25,pages=Math.max(1,Math.ceil(rows.length/size));
 S.page=Math.min(S.page,pages-1);
 const view=rows.slice(S.page*size,S.page*size+size);
 $('table').innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Riesgo</th><th>Probabilidad</th><th class="r">Ingreso/mes</th><th class="r">En riesgo/mes</th><th class="r">Salud</th><th>Segmento</th><th>Acción propuesta</th></tr></thead><tbody>
  ${view.map(p=>`<tr tabindex="0" data-customer="${esc(p.cliente_id)}"><td><b>${esc(p.cliente_id)}</b>${p.warnings.length?' <span class="badge MEDIO" title="Fuera del dominio del modelo">⚠ datos</span>':''}</td><td>${riskBadge(p.risk)}</td><td>${probBar(p)}</td><td class="r num">${money(p.monthly_revenue)}</td><td class="r num"><b>${money(p.revenue_at_risk)}</b></td><td class="r num">${p.health_score}</td><td>${quadBadge(p.quadrant)}</td><td>${ACTION_LABELS[p.rec?.action]||''} ${p.rec?.source==='llm'?'<span class="badge llm">LLM</span>':''}</td></tr>`).join('')}
 </tbody></table></div><div class="pager"><span>${rows.length} clientes · página ${S.page+1} de ${pages}</span><div class="actions"><button class="btn small" id="prev" ${S.page?'':'disabled'}>← Anterior</button><button class="btn small" id="next" ${S.page<pages-1?'':'disabled'}>Siguiente →</button></div></div>`
 :'<div class="empty card"><h2>Sin resultados</h2><p>Ajusta la búsqueda o los filtros.</p></div>';
 if($('prev')){$('prev').onclick=()=>{S.page--;renderTable();};$('next').onclick=()=>{S.page++;renderTable();};}
 bindCustomerOpeners($('table'));
}

/* ---------- Customer drawer ---------- */
let lastFocus=null;
function gauge(score){
 const r=40,c=2*Math.PI*r,color=score>=60?'var(--low)':score>=30?'var(--med)':'var(--high)';
 return `<svg class="gauge" viewBox="0 0 96 96" role="img" aria-label="Salud ${score} de 100"><circle cx="48" cy="48" r="${r}" fill="none" stroke="var(--line)" stroke-width="9"/><circle cx="48" cy="48" r="${r}" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${c*score/100} ${c}" transform="rotate(-90 48 48)"/><text x="48" y="55" text-anchor="middle">${score}</text></svg>`;
}
function factorsHtml(p){
 const max=Math.max(...p.factors.map(f=>Math.abs(f.delta_probability)),.01);
 return p.factors.map(f=>{const w=Math.abs(f.delta_probability)/max*50;return `<div class="factor"><span>${LABELS[f.feature]} <span class="muted num">(${f.value})</span></span><div class="track"><div class="fill ${f.delta_probability>=0?'up':'down'}" style="width:${w.toFixed(1)}%"></div></div><span class="num r" style="color:${f.delta_probability>=0?'var(--high)':'var(--low)'}">${f.delta_probability>=0?'+':'−'}${pp(Math.abs(f.delta_probability))}</span></div>`;}).join('');
}
function simHtml(sim){
 if(!sim)return '<p class="muted" style="font-size:13px">Esta acción no tiene una palanca medible en el modelo (seguimiento o contacto general): no se estima su impacto.</p>';
 return `<div class="sim"><span>Si se logra: <b>${esc(sim.scenario)}</b></span><span class="num r">${pct(sim.risk_reduction+sim.probability_after,1)} <span class="arrow">→</span> <b>${pct(sim.probability_after,1)}</b></span><span class="badge ok">−${pp(sim.risk_reduction)}</span></div>
 <p class="muted" style="font-size:12.5px;margin-top:6px">Ingreso mensual protegido estimado: <b>${money(sim.revenue_protected_monthly)}</b>. Es la respuesta del modelo al cambiar el indicador, no un efecto causal garantizado.</p>`;
}
function openCustomer(id){
 const p=predOf(id),r=recOf(id);if(!p)return;
 lastFocus=document.activeElement;
 const d=$('drawer'),interp=p.llm_interpretation,sup=r?.supervisor_review;
 d.innerHTML=`<button class="icon-btn close" id="drawer-close" aria-label="Cerrar">×</button>
 <span class="eyebrow">Ficha de cliente</span><h2 id="drawer-title" style="font-size:22px">${esc(p.cliente_id)}</h2>
 <div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 16px">${riskBadge(p.risk)} ${quadBadge(p.quadrant)} ${r?`<span class="badge ${r.priority}">${{URGENTE:'Urgente',ATENCION:'Atención',NORMAL:'Normal'}[r.priority]}</span>`:''}</div>
 ${p.warnings.length?`<div class="notice" style="margin:0 0 14px">⚠ ${esc(p.warnings.join(' · '))}</div>`:''}
 <div class="card"><div class="health">${gauge(p.health_score)}<div class="kv" style="flex:1">
  <div><span>Probabilidad</span><b class="num">${pct(p.probability,1)}</b></div><div><span>Ingreso mensual</span><b class="num">${money(p.monthly_revenue)}</b></div>
  <div><span>En riesgo/mes</span><b class="num">${money(p.revenue_at_risk)}</b></div><div><span>Salud</span><b class="num">${p.health_score}/100</b></div></div></div></div>
 <div class="card mt"><div class="card-head"><div><h3>¿Qué explica el riesgo?</h3><p>Cambio en la probabilidad al sustituir cada variable por la media de entrenamiento. Rojo empuja hacia el abandono.</p></div></div>${factorsHtml(p)}
  ${p.probability>.98||p.probability<.02?'<p class="muted" style="font-size:12.5px;margin-top:8px">La probabilidad está saturada: cambiar una sola variable apenas la mueve porque varias señales actúan a la vez. La simulación de la acción combina la palanca con el resto del perfil.</p>':''}</div>
 ${r?`<div class="card mt"><div class="card-head"><div><h3>Recomendación del Agente de Retención</h3><p>${esc(r.timeframe)} · Responsable: ${esc(r.owner)}</p></div>${srcBadge(r.source)}</div>
  <b style="font-size:16px">${ACTION_LABELS[r.action]||esc(r.action)}</b>
  <ol class="steps">${r.steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol>
  <p style="font-size:13px;margin:8px 0 12px"><span class="muted">Verificación de éxito:</span> ${esc(r.success_check)}</p>
  ${simHtml(r.simulation)}
  <p class="muted" style="font-size:12px;margin-top:8px">Evidencia citada: ${r.evidence.map(e=>LABELS[e]||e).join(', ')}</p></div>`:''}
 <div class="card mt"><h3 style="margin-bottom:10px">Revisión de los agentes</h3>
  <div class="review"><header><b>Predictivo</b>${interp?'<span class="badge llm">LLM</span>':'<span class="badge rules">Red neuronal</span>'}</header>${interp?`${interp.action==='review_data'?'Pide validar los datos antes de actuar.':'Interpreta el riesgo con la evidencia:'} ${interp.evidence.map(e=>LABELS[e]||e).join(', ')}.`:'Probabilidad calculada por la red; sin interpretación LLM para este cliente.'}</div>
  <div class="review"><header><b>Supervisor</b>${sup?(sup.action==='approve_plan'?'<span class="badge ok">Aprueba el plan</span>':'<span class="badge fail">Pide revisión humana</span>'):'<span class="badge rules">Controles deterministas</span>'}</header>${sup?`Evidencia revisada: ${sup.evidence.map(e=>LABELS[e]||e).join(', ')}.`:'Verificó acción permitida, evidencia, plan y simulación recalculada.'}</div>
 </div>
 ${r?`<div class="card mt"><h3 style="margin-bottom:10px">Decisión humana</h3>${decisionHtml(r)}
  <div class="actions mt"><button class="btn small" id="draft-btn">Preparar borrador</button><button class="btn small" id="sim-btn">Abrir en simulador</button></div><div id="draft"></div></div>`:''}`;
 d.hidden=false;$('drawer-backdrop').hidden=false;document.body.style.overflow='hidden';
 $('drawer-close').onclick=closeDrawer;$('drawer-close').focus();
 bindDecisions(d,()=>openCustomer(id));
 if($('draft-btn'))$('draft-btn').onclick=()=>{const pk=actionPackage(S.run,id,S.config?.actions);$('draft').innerHTML=`<p class="muted mt" style="font-size:12.5px">Plantilla para revisión; no se envía nada.</p><pre class="doc">${esc(pk.draft)}</pre><button class="btn small" id="dl-draft">Descargar TXT</button>`;$('dl-draft').onclick=()=>download(`borrador_${id}.txt`,pk.draft,'text/plain;charset=utf-8');};
 if($('sim-btn'))$('sim-btn').onclick=()=>{S.sim=Object.fromEntries(FEATURES.map(f=>[f,p.observed[f]]));S.simFrom=id;location.hash='#/simulador';};
}
function closeDrawer(){
 if($('drawer').hidden)return;
 $('drawer').hidden=true;$('drawer-backdrop').hidden=true;document.body.style.overflow='';
 lastFocus?.focus?.();
}
function decisionHtml(r){
 if(r.decision!=='pending')return `<p class="decided ${r.decision}">${r.decision==='approved'?'✓ Aceptada':'✕ Rechazada'} <span class="muted" style="font-weight:400">· registrada solo en esta pestaña; no ejecuta acciones externas.</span></p>`;
 return `<div class="decision"><button class="btn small primary" data-decide="approved" data-id="${esc(r.cliente_id)}">Aceptar</button><button class="btn small danger" data-decide="rejected" data-id="${esc(r.cliente_id)}">Rechazar</button></div>${r.supervisor_review?.action==='request_review'?'<p class="muted" style="font-size:12.5px;margin-top:6px">El Supervisor pidió revisión humana: decide de forma individual.</p>':''}`;
}
function bindDecisions(root,after){
 root.querySelectorAll('[data-decide]').forEach(b=>b.onclick=e=>{e.stopPropagation();const r=recOf(b.dataset.id);if(r&&r.decision==='pending'){r.decision=b.dataset.decide;after();}});
}

/* ---------- Agents ---------- */
function viewAgents(){
 const r=S.run,rep=r.agent_report,llm=r.llm_report,st=r.agent_llm||{};
 const usage=(r.usage||[]).reduce((s,u)=>s+(u.total_tokens||0),0);
 const card=(k,stats,status)=>`<article class="agent"><div class="role"><span class="av ${k}">${AGENTS[k].initial}</span><div><b>Agente ${AGENTS[k].name}</b><br>${status}</div></div><p>${AGENTS[k].role}</p><ul>${AGENTS[k].tools.map(t=>`<li>${t}</li>`).join('')}</ul><div class="meta">${stats}</div></article>`;
 $('view').innerHTML=`
 <div class="page-head"><div><span class="eyebrow">Sistema multiagente · ${r.trace.length} mensajes · ${(r.elapsed_ms/1000).toFixed(1)} s</span><h1>Cómo trabajaron los agentes</h1><p>Cada agente tiene una responsabilidad, herramientas propias y un estado compartido. El Supervisor valida antes de entregar; el LLM solo elige dentro de opciones permitidas y sus salidas se verifican.</p></div>
  <div class="actions"><button class="btn" id="dl-trace">Descargar traza JSON</button></div></div>
 <div class="agents-flow">
  ${card('predictivo',`<span class="badge rules">${rep.predictive.count} inferencias</span>${rep.predictive.out_of_domain?`<span class="badge MEDIO">${rep.predictive.out_of_domain} fuera de dominio</span>`:''}`,statusBadge(st.predictivo?.status))}
  ${card('retencion',`<span class="badge llm">${rep.retention.llm_count} por LLM</span><span class="badge rules">${rep.retention.rules_count} por reglas</span>`,statusBadge(st.retencion?.status))}
  ${card('supervisor',`<span class="badge ${rep.supervisor.validated?'ok':'fail'}">${rep.supervisor.validated?'Informe validado':'No validado'}</span><span class="badge rules">${rep.supervisor.corrections} correcciones</span>`,statusBadge(st.supervisor?.status))}
  ${card('estratega',`<span class="badge ${rep.strategist?.source==='llm'?'llm':'rules'}">Resumen por ${rep.strategist?.source==='llm'?'LLM':'reglas'}</span>`,statusBadge(st.estratega?.status))}
 </div>
 <div class="grid g-main mt">
  <article class="card"><div class="card-head"><div><h2>Traza de mensajes</h2><p>Registro real de la ejecución, en orden. Abre un mensaje para ver su contenido.</p></div></div><div class="timeline">
   ${r.trace.map(m=>`<div class="msg"><span class="av ${m.sender}">${AGENTS[m.sender]?.initial||'?'}</span><div><div class="line1"><b>${AGENTS[m.sender]?.name||esc(m.sender)}</b><span class="muted">→ ${AGENTS[m.recipient]?.name||esc(m.recipient)}</span><span class="tool">${esc(m.tool)}</span>${m.status==='ok'?'':`<span class="badge ${m.status==='error'?'fail':m.status==='delegated'?'idle':'MEDIO'}">${esc(m.status)}</span>`}</div>
   <details><summary>Contenido (${JSON.stringify(m.payload).length.toLocaleString('es-PE')} caracteres)</summary><pre>${esc(JSON.stringify(m.payload,null,1).slice(0,4000))}</pre></details></div></div>`).join('')}
  </div></article>
  <div class="stack">
   <article class="card"><h2>Uso del LLM</h2><div class="kv mt" style="grid-template-columns:1fr">
    <div><span>Solicitado</span><b>${llm.requested?'Sí':'No'}</b></div><div><span>Proveedor · modelo</span><b>${esc(llm.provider)} · ${esc(llm.model)}</b></div>
    <div><span>Llamadas</span><b>${llm.attempts.length}</b></div><div><span>Tokens totales</span><b class="num">${usage.toLocaleString('es-PE')}</b></div>
    <div><span>Clientes con selección LLM</span><b>${llm.selected_customers}</b></div><div><span>Códigos de cliente enviados</span><b>No</b></div></div>
    ${llm.attempts.length?`<div class="table-wrap mt"><table><thead><tr><th>Agente</th><th>Intento</th><th>Estado</th><th class="r">ms</th></tr></thead><tbody>${llm.attempts.map(x=>`<tr><td>${AGENTS[x.agent]?.name||esc(x.agent)}</td><td>${x.attempt}</td><td>${x.status==='validated'?'<span class="badge ok">validado</span>':`<span class="badge fail" title="${esc(x.code||'')}">falló</span>`}</td><td class="r num">${Math.round(x.elapsed_ms)}</td></tr>`).join('')}</tbody></table></div>`:''}
    <p class="muted" style="font-size:12.5px;margin-top:10px">${esc(llm.message)}</p></article>
   <article class="card"><h2>Controles del Supervisor</h2><ul class="warn-list mt">${rep.supervisor.checks.map(c=>`<li>${esc(c)}</li>`).join('')}<li>Verificación de cifras del resumen ejecutivo</li><li>Ninguna acción externa ejecutada</li></ul></article>
   ${r.warnings.length?`<article class="card"><h2>Advertencias</h2><ul class="warn-list mt">${r.warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul></article>`:''}
  </div>
 </div>`;
 $('dl-trace').onclick=()=>download(`traza_${r.id}.json`,JSON.stringify({id:r.id,trace:r.trace,llm_report:r.llm_report,agent_llm:r.agent_llm,agent_report:r.agent_report},null,2),'application/json');
}

/* ---------- Plan ---------- */
function viewPlan(){
 const recs=S.run.recommendations,count=d=>recs.filter(r=>r.decision===d).length;
 const eligible=recs.filter(r=>r.decision==='pending'&&r.supervisor_review?.action!=='request_review').length;
 const order={URGENTE:0,ATENCION:1,NORMAL:2};
 const list=recs.filter(r=>S.planFilter==='all'||r.decision===S.planFilter).map(r=>({r,p:predOf(r.cliente_id)})).sort((a,b)=>order[a.r.priority]-order[b.r.priority]||b.p.revenue_at_risk-a.p.revenue_at_risk);
 const protectedRev=recs.filter(r=>r.decision==='approved'&&r.simulation).reduce((s,r)=>s+r.simulation.revenue_protected_monthly,0);
 $('view').innerHTML=`
 <div class="page-head"><div><span class="eyebrow">Revisión humana</span><h1>Plan de acción</h1><p>Acepta o rechaza cada propuesta. Las decisiones se guardan solo en esta pestaña y en tu exportación: no se envían correos ni se modifica un CRM.</p></div>
  <div class="actions"><button class="btn" id="export">Exportar plan CSV</button><button class="btn primary" id="bulk" ${eligible&&S.run.status==='completed'?'':'disabled'}>Aceptar elegibles (${eligible})</button></div></div>
 <div class="grid g-4">
  <div class="card kpi"><div class="label">Pendientes</div><div class="value">${count('pending')}</div><div class="sub">${eligible} elegibles para aceptación conjunta</div></div>
  <div class="card kpi"><div class="label">Aceptadas</div><div class="value">${count('approved')}</div><div class="sub">${count('rejected')} rechazadas</div></div>
  <div class="card kpi"><div class="label">Revisión humana pedida</div><div class="value">${recs.filter(r=>r.supervisor_review?.action==='request_review').length}</div><div class="sub">Excluidas de la aceptación conjunta</div></div>
  <div class="card kpi accent"><div class="label">Ingreso protegido (aceptadas)</div><div class="value">${money(protectedRev,true)}</div><div class="sub">Estimación del modelo, por mes</div></div>
 </div>
 <article class="card mt"><div class="toolbar"><div class="seg" role="group" aria-label="Filtrar decisiones">${[['pending','Pendientes'],['approved','Aceptadas'],['rejected','Rechazadas'],['all','Todas']].map(([v,l])=>`<button data-plan="${v}" aria-pressed="${S.planFilter===v}">${l}</button>`).join('')}</div><span class="muted" style="font-size:13px">${list.length} propuestas · orden: prioridad e ingreso en riesgo</span></div>
  <div id="plan-list">${list.slice(0,S.planLimit).map(({r,p})=>`<div class="plan-row"><div><div class="title"><b data-customer="${esc(r.cliente_id)}" style="cursor:pointer;text-decoration:underline dotted">${esc(r.cliente_id)}</b><span class="badge ${r.priority}">${{URGENTE:'Urgente',ATENCION:'Atención',NORMAL:'Normal'}[r.priority]}</span><span>${ACTION_LABELS[r.action]||esc(r.action)}</span>${srcBadge(r.source)}${r.supervisor_review?.action==='request_review'?'<span class="badge fail">Supervisor: revisar</span>':''}</div>
   <p>${esc(r.owner)} · ${esc(r.timeframe)} · ${money(p.revenue_at_risk)}/mes en riesgo${r.simulation?` · reducción modelada −${pp(r.simulation.risk_reduction)}`:''}</p></div>${decisionHtml(r)}</div>`).join('')||'<p class="empty">No hay propuestas en este filtro.</p>'}</div>
  ${list.length>S.planLimit?`<div class="pager"><span>Mostrando ${S.planLimit} de ${list.length}</span><button class="btn small" id="more">Mostrar más</button></div>`:''}
 </article>`;
 document.querySelectorAll('[data-plan]').forEach(b=>b.onclick=()=>{S.planFilter=b.dataset.plan;S.planLimit=40;viewPlan();});
 if($('more'))$('more').onclick=()=>{S.planLimit+=40;viewPlan();};
 $('bulk').onclick=()=>{try{const n=approvePendingLocal(S.run);notice(`${n} propuestas aceptadas. Las que el Supervisor marcó para revisión quedan pendientes.`,'ok');viewPlan();}catch(e){notice(e.message,'error');}};
 $('export').onclick=()=>{download(`plan_retencion_${S.run.id}.csv`,planCsv(S.run,S.config?.actions),'text/csv;charset=utf-8');notice('Plan exportado. Incluye responsables, plazos, simulación y decisiones; no crea tareas en un CRM.','ok');};
 bindDecisions($('plan-list'),viewPlan);bindCustomerOpeners($('plan-list'));
}

/* ---------- Simulator ---------- */
let simTimer,simSeq=0;
function viewSimulator(){
 S.sim=S.sim||{antiguedad:24,compras_mensuales:6,monto_promedio:1500,reclamos:3,dias_ultima_compra:40,pagos_atrasados:2};
 $('view').innerHTML=`
 <div class="page-head"><div><span class="eyebrow">Herramienta del Agente de Retención</span><h1>Simulador what-if</h1><p>Mueve los indicadores y observa cómo responde la red neuronal. Es la misma herramienta que usa el Agente de Retención para estimar el impacto de cada acción.${S.simFrom?` Valores iniciales de <b>${esc(S.simFrom)}</b>.`:''}</p></div></div>
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
  $('sim-out').innerHTML=`<div class="health">${gauge(p.health_score)}<div><span class="muted" style="font-size:13px">Probabilidad de abandono</span><div class="big-prob">${pct(p.probability,1)}</div>${riskBadge(p.risk)} <span class="muted" style="font-size:13px">· ${money(p.revenue_at_risk)}/mes en riesgo de ${money(p.monthly_revenue)}</span></div></div>
   <h3 style="margin:18px 0 6px">Factores</h3>${factorsHtml(p)}`;
  $('sim-levers').innerHTML=`<h2>Impacto modelado de cada acción</h2><p class="muted" style="font-size:13px;margin-top:4px">Probabilidad si la palanca de la acción se resuelve. Solo las acciones permitidas para estos indicadores pueden recomendarse.</p>
   <div class="table-wrap mt"><table><thead><tr><th>Acción</th><th>Escenario</th><th class="r">Después</th><th class="r">Reducción</th><th class="r">S/ protegidos/mes</th></tr></thead><tbody>
   ${Object.entries(res.levers).map(([a,s])=>`<tr><td>${ACTION_LABELS[a]} ${res.allowed_actions.includes(a)?'':'<span class="badge idle">no aplica</span>'}</td><td>${s?esc(s.scenario):'—'}</td><td class="r num">${s?pct(s.probability_after,1):'—'}</td><td class="r num">${s?'−'+pp(s.risk_reduction):'—'}</td><td class="r num">${s?money(s.revenue_protected_monthly):'—'}</td></tr>`).join('')}
   </tbody></table></div>${p.warnings.length?`<p class="muted mt" style="font-size:12.5px">⚠ ${esc(p.warnings.join(' · '))}</p>`:''}`;
 }catch(e){if($('sim-out'))$('sim-out').innerHTML=`<p class="muted">${esc(e.message)}</p>`;}
}

/* ---------- Model ---------- */
async function viewModel(){
 $('view').innerHTML='<p class="muted">Cargando métricas…</p>';
 if(!S.metrics){try{S.metrics=await api('/api/metrics');}catch{S.metrics={status:'error'};}}
 const m=S.metrics,k=m.metrics||{},cm=k.confusion_matrix||[[0,0],[0,0]];
 $('view').innerHTML=`
 <div class="page-head"><div><span class="eyebrow">Transparencia</span><h1>Modelo y método</h1><p>Qué hace cada componente, cómo se midió y qué falta para usarlo en una empresa real.</p></div></div>
 ${m.status==='measured'?`<div class="grid g-4">${[['AUC',k.auc.toFixed(3),'Capacidad de ordenar por riesgo'],['Exactitud',pct(k.accuracy,1),`Línea base “todos abandonan”: ${pct(m.baseline.accuracy,1)}`],['Precisión · Recall',`${pct(k.precision,0)} · ${pct(k.recall,0)}`,`F1 ${k.f1.toFixed(3)}`],['Brier',k.brier.toFixed(3),'Error de probabilidad (menor es mejor)']].map(([l,v,s])=>`<div class="card kpi"><div class="label">${l}</div><div class="value">${v}</div><div class="sub">${s}</div></div>`).join('')}</div>
 <div class="grid g-2 mt"><article class="card"><div class="card-head"><div><h2>Curva ROC</h2><p>${m.n.toLocaleString('es-PE')} ejemplos sintéticos nuevos (semilla ${m.seed}).</p></div></div>${roc(m.roc||[])}</article>
  <article class="card"><h2>Matriz de confusión (umbral 50%)</h2><div class="cm mt"><div class="hd"></div><div class="hd">Pred. se queda</div><div class="hd">Pred. abandona</div><div class="hd">Real se queda</div><div class="tp">${cm[0][0]}</div><div>${cm[0][1]}</div><div class="hd">Real abandona</div><div>${cm[1][0]}</div><div class="tp">${cm[1][1]}</div></div>
   <p class="muted" style="font-size:12.5px;margin-top:14px">${esc(m.note)}</p></article></div>`:'<div class="card"><p class="muted">Evaluación no disponible.</p></div>'}
 <div class="grid g-2 mt">
  <article class="card prose"><h2>Arquitectura</h2>
   <ul><li><b>Red neuronal</b> densa 6→32→16→8→1 (ReLU, sigmoide), pesos exportados del notebook y ejecutados en Python puro. Riesgo: bajo &lt;40%, medio 40–70%, alto ≥70%.</li>
   <li><b>Explicabilidad local</b>: cambio de probabilidad al sustituir cada variable por su media de entrenamiento.</li>
   <li><b>Valor de negocio</b>: ingreso mensual = compras × monto promedio; ingreso en riesgo = probabilidad × ingreso; salud = 100 × (1 − probabilidad).</li>
   <li><b>Simulador what-if</b>: re-ejecuta la red con la palanca de cada acción resuelta (reclamos, pagos, recencia).</li>
   <li><b>Cuatro agentes</b> con estado compartido y mensajes trazables: Supervisor, Predictivo, Retención y Estratega. Proveedor LLM: ${esc(S.config?.llm_provider||'—')} (${esc(S.config?.llm_model||'—')}).</li></ul></article>
  <article class="card prose"><h2>Barreras de seguridad</h2>
   <ul><li>El LLM nunca cambia probabilidades: solo elige entre acciones permitidas para cada cliente, con salida JSON restringida por esquema.</li>
   <li>Cada respuesta se valida: índices completos, acción permitida, evidencia existente. Si falla, se usan reglas y se informa.</li>
   <li>El resumen del Estratega se rechaza si contiene cifras que no están en los datos verificados.</li>
   <li>Sin códigos de cliente hacia el proveedor; presupuesto diario y límites de tiempo y mensajes.</li>
   <li>Decisión humana obligatoria; ninguna acción externa se ejecuta.</li></ul></article>
 </div>
 <article class="card prose mt"><h2>Del prototipo a una empresa real</h2>
  <p>El modelo se entrenó con datos sintéticos: las cifras demuestran el flujo, no predicen clientes reales. Para un piloto:</p>
  <ul><li><b>Definir abandono</b> con negocio (p. ej. sin compras en 90 días) y el horizonte de alerta.</li>
  <li><b>Reentrenar</b> con históricos reales (CRM/ERP) y validar en periodos posteriores (validación temporal) contra una regla simple.</li>
  <li><b>Calibrar</b> probabilidades y fijar umbrales según la capacidad del equipo comercial.</li>
  <li><b>Medir impacto</b> con grupo de control: comparar tasa de retención de clientes contactados vs. no contactados.</li>
  <li><b>Operar</b>: usuarios con roles, base de datos persistente, integración con CRM y monitoreo de deriva del modelo.</li></ul></article>`;
}
function roc(points){
 const W=360,H=260,L=36,B=28,T=8,R=8,x=v=>L+v*(W-L-R),y=v=>T+(1-v)*(H-T-B);
 return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Curva ROC">${[0,.25,.5,.75,1].map(t=>`<line class="grid-line" x1="${x(t)}" x2="${x(t)}" y1="${T}" y2="${H-B}"/><line class="grid-line" x1="${L}" x2="${W-R}" y1="${y(t)}" y2="${y(t)}"/><text x="${x(t)}" y="${H-B+14}" text-anchor="middle">${t}</text><text x="${L-6}" y="${y(t)+4}" text-anchor="end">${t}</text>`).join('')}
 <line x1="${x(0)}" y1="${y(0)}" x2="${x(1)}" y2="${y(1)}" stroke="var(--muted)" stroke-dasharray="4 4"/>
 <polyline fill="none" stroke="var(--brand)" stroke-width="2.5" points="${points.map(([a,b])=>`${x(a).toFixed(1)},${y(b).toFixed(1)}`).join(' ')}"/>
 <text x="${(L+W)/2}" y="${H-2}" text-anchor="middle">Falsos positivos</text></svg>`;
}

/* ---------- Boot ---------- */
async function boot(){
 $('menu').onclick=()=>{const o=$('sidebar').classList.toggle('open');$('menu').setAttribute('aria-expanded',o);};
 $('drawer-backdrop').onclick=closeDrawer;
 document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDrawer();});
 window.addEventListener('hashchange',route);
 try{
  S.config=await api('/api/config');
  const llm=$('sys-llm');
  llm.querySelector('.dot').className='dot '+(S.config.llm_configured?'ok':'off');
  llm.querySelector('small').textContent=S.config.llm_configured?`${S.config.llm_provider} · ${S.config.llm_model}`:'No configurado · reglas';
  $('sys-model').querySelector('.dot').className='dot ok';
 }catch{notice('No se pudo conectar con el servidor. Recarga la página.','error');}
 updateChrome();route();
}
document.addEventListener('DOMContentLoaded',boot);
