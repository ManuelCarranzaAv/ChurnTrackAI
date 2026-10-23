'use strict';
function renderExperience(){
 const a=current?.analytics, report=current?.agent_report;
 if(!a){$('executive-summary').innerHTML='';$('agent-outcomes').innerHTML='';$('action-summary').innerHTML='';return;}
 const high=a.segments.find(s=>s.risk==='ALTO'),top=a.priorities[0],signal=a.sensitivities[0];
 $('executive-summary').innerHTML=`<article class="executive"><div><span class="eyebrow">LECTURA EJECUTIVA · ${current.demo?'EJEMPLO SINTÉTICO':'DATOS CARGADOS'}</span><h2>${high.count} de ${a.count} clientes presentan riesgo alto.</h2><p>${signal?`La variable con mayor sensibilidad media es <b>${esc(labels[signal.feature])}</b>. `:''}${a.out_of_domain_count?`${a.out_of_domain_count} registros necesitan revisión antes de actuar.`:'Todos los registros están dentro de los rangos del entrenamiento sintético.'}</p></div><div class="next-action"><small>SIGUIENTE PASO SUGERIDO</small><b>${top?'Revisar '+esc(top.cliente_id):'Revisar el seguimiento de la cartera'}</b><span>${top?'Primero en el índice de atención comercial; no es una pérdida prevista.':'Verifica las recomendaciones y conserva el informe.'}</span><button class="secondary" data-view="segments">Explorar diagnóstico →</button></div></article>`;
 if(!report){$('agent-outcomes').innerHTML='<p class="notice">Este informe histórico no incluye el resumen de agentes de la nueva versión.</p>';return;}
 const r=report.retention,s=report.supervisor;
 $('agent-outcomes').innerHTML=`<div class="agent-results"><article><span>01 · PREDICTIVO</span><strong>${report.predictive.count}</strong><h3>clientes evaluados</h3><p>${report.predictive.out_of_domain} fuera del dominio. Se calcularon seis factores por cliente.</p></article><article><span>02 · RETENCIÓN</span><strong>${r.llm_count} / ${r.rules_count}</strong><h3>acciones LLM / reglas</h3><p>Planes con responsable propuesto, plazo y criterio de seguimiento.</p></article><article><span>03 · SUPERVISOR</span><strong>${s.validated?'Validado':'Revisar'}</strong><h3>${s.checks.length} controles de consistencia</h3><p>${s.corrections} correcciones. Ninguna acción comercial ejecutada automáticamente.</p></article></div><article class="card"><h2>Qué revisó el supervisor</h2><div class="check-chips">${s.checks.map(c=>`<span>${s.validated?'✓':'○'} ${esc(c)}</span>`).join('')}</div><p>Estos controles verifican consistencia del informe; no certifican exactitud empresarial. La traza detallada está debajo.</p></article>`;
 $('action-summary').innerHTML=`<div class="action-chips">${Object.entries(r.actions).filter(([,n])=>n).map(([action,n])=>`<span><b>${n}</b> ${esc(config?.actions[action]?.[0]||action)}</span>`).join('')}</div>`;
}
$('access-form').onsubmit=e=>{e.preventDefault();work(async()=>{
 const entered=$('api-key').value.trim();$('api-key').value='';
 if(!entered){$('access-status').textContent='Introduce la clave privada de ChurnTrackAI.';throw Error('La clave de acceso está vacía.');}
 if(entered.startsWith('AQ.')||entered.startsWith('AIza')){$('access-status').textContent='Esa es una clave de Google, no la clave de acceso de ChurnTrackAI.';throw Error('Gemini se configura solo en el servidor. Para entrar, utiliza APP_API_KEY de tu archivo .env o de Render → Environment.');}
 apiKey=entered;
 try{await api('/api/session');}catch(error){apiKey='';$('access-status').textContent='Acceso rechazado. Comprueba APP_API_KEY; no uses GEMINI_API_KEY.';throw error;}
 $('access-status').textContent='✓ Acceso validado en el servidor.';$('analysis-access-note').textContent='✓ Acceso validado. Puedes analizar un cliente o cargar hasta 300 filas.';show('analysis');notice('Acceso correcto. Completa los datos y pulsa Analizar.');
 });};
const originalLogout=$('logout').onclick;$('logout').onclick=()=>{originalLogout();$('access-status').textContent='Modo visitante · acceso cerrado.';$('analysis-access-note').textContent='Puedes analizar sin clave. Los resultados permanecen en esta pestaña.';};
$('demo-300').onclick=()=>work(async()=>{tablePage=0;recPage=0;current=await api('/api/demo?size=300',{method:'POST'});render();show('segments');notice('300 clientes sintéticos analizados. Demostración pública sin contraseña, sin guardar datos y sin consumir Gemini.');});
$('check-llm').onclick=()=>startProfessor(true);
$('prev-customers').onclick=()=>{tablePage--;renderTable();};$('next-customers').onclick=()=>{tablePage++;renderTable();};
$('prev-recs').onclick=()=>{recPage--;renderRecommendations();};$('next-recs').onclick=()=>{recPage++;renderRecommendations();};
renderExperience();

// Enhance the finished workspace after all deferred scripts have registered.
// Every status below comes from a returned analysis, never a simulated run.
document.addEventListener('DOMContentLoaded',()=>{
 document.body.classList.add('product-workspace');
 Object.assign(pages,{
  dashboard:['Inicio','Entiende el riesgo. Decide a tiempo.','Analiza un cliente o tu cartera. Los agentes preparan recomendaciones para tu revisión.'],
  segments:['Diagnóstico','Una lectura clara de tu cartera.','Identifica prioridades y consulta los indicadores detrás de cada resultado.'],
  agents:['Recomendaciones','Tres agentes. Una propuesta por cliente.','Sigue los datos, las herramientas y los resultados de la ejecución.'],
  recommendations:['Aceptación','Tú decides el siguiente paso.','Revisa las propuestas, acepta las adecuadas y conserva tu plan de seguimiento.']
 });
 const originalShow=show;
 show=function(view){originalShow(view);document.body.dataset.page=activeView;};
 $('analysis-access-note').textContent='Elige los datos que quieres analizar.';
 const methodLabels={single:['01','Un cliente','Introduce seis indicadores y revisa su caso.'],batch:['02','Cartera de clientes','Carga un CSV con hasta 300 registros.']};
 const methods=document.querySelector('.analysis-methods');
 methods.querySelectorAll('[data-method]').forEach(button=>{
  const [number,title,description]=methodLabels[button.dataset.method];
  button.innerHTML=`<span class="method-number">${number}</span><span><b>${title}</b><small>${description}</small></span><span class="method-check" aria-hidden="true">✓</span>`;
 });
 methods.prepend(methods.querySelector('[data-method="single"]'));
 const forms=document.querySelector('.analysis-forms'),layout=document.createElement('div');
 layout.className='intake-layout';forms.before(layout);layout.append(forms);
 const guide=document.createElement('aside');guide.className='intake-guide';
 guide.innerHTML=`<span class="eyebrow">TU EQUIPO DE ANÁLISIS</span><h2>Un recorrido, tres perspectivas.</h2><p>Los agentes trabajan en secuencia y dejan su evidencia en cada análisis.</p><ol class="role-route"><li><span>01</span><div><h3>Predictivo</h3><p>Calcula el riesgo con la red neuronal. El LLM interpreta las señales disponibles.</p><small>Entrada: indicadores del cliente</small></div></li><li><span>02</span><div><h3>Retención</h3><p>Elige una acción compatible y prepara un plan con responsable y plazo.</p><small>Entrada: diagnóstico y evidencia</small></div></li><li><span>03</span><div><h3>Supervisor</h3><p>Contrasta el plan, comprueba su consistencia y señala lo que requiere revisión.</p><small>Salida: propuesta para tu aceptación</small></div></li></ol><div class="human-check"><span aria-hidden="true">✓</span><div><b>La decisión final es tuya</b><p>Revisas y aceptas las propuestas antes de usarlas en tu gestión comercial.</p></div></div>`;
 layout.append(guide);
 const processing=document.querySelector('.processing-note');
 forms.append(processing);
 const singleIntro=$('single-analysis').querySelector('p');
 singleIntro.textContent='Usa definiciones consistentes para los indicadores de tu cartera. Identifica al cliente con un código anónimo.';
 $('batch-analysis').querySelector('p').textContent='Carga tus indicadores en formato CSV UTF-8. Cada cliente recibirá su diagnóstico y una propuesta de seguimiento.';
 const blankHeadline=document.querySelector('#workspace-start .start-card');
 if(blankHeadline)blankHeadline.setAttribute('aria-hidden','true');
 const overview=$('executive-summary');$('view-segments').prepend(overview);
 const originalExperience=renderExperience;
 renderExperience=function(){originalExperience();renderDecisionOverview();};
 const originalClarity=renderClarity;
 renderClarity=function(){
  originalClarity();
  const card=document.querySelector('.analysis-explained');if(!card)return;
  card.querySelector('.eyebrow').textContent='EXPLICACIÓN POR CLIENTE';
  card.querySelector('h2').textContent='Comprende cada diagnóstico.';
  const heading=Array.from(card.children).find(el=>el.tagName==='H3'),table=card.querySelector('.table-wrap');
  if(heading&&table){const disclosure=document.createElement('details');disclosure.className='indicator-disclosure';disclosure.innerHTML='<summary>Ver los datos y la sensibilidad de cada indicador</summary>';heading.before(disclosure);const note=heading.nextElementSibling;disclosure.append(heading);if(note?.tagName==='P')disclosure.append(note);disclosure.append(table);}
 };
 const originalAgentWorkspace=renderAgentWorkspace;
 renderAgentWorkspace=function(){originalAgentWorkspace();renderObservedHandoff();};
 // Existing application handlers own all navigations and selections.
 document.querySelector('[data-method="single"]').click();
 show(activeView);renderClarity();renderExperience();renderAgentWorkspace();
});

function renderDecisionOverview(){
 const target=$('executive-summary');if(!current?.predictions?.length){target.innerHTML='';return;}
 const ps=current.predictions,recs=current.recommendations||[],total=ps.length;
 const counts={ALTO:ps.filter(p=>p.risk==='ALTO').length,MEDIO:ps.filter(p=>p.risk==='MEDIO').length,BAJO:ps.filter(p=>p.risk==='BAJO').length};
 const pending=recs.filter(r=>r.decision==='pending').length,flags=recs.filter(r=>r.supervisor_review?.action==='request_review').length;
 const covered=recs.filter(r=>r.source==='llm').length;
 target.innerHTML=`<article class="decision-overview"><div class="overview-heading"><div><span class="eyebrow">RESULTADO DEL ANÁLISIS</span><h2>${total===1?'El diagnóstico de tu cliente':total+' clientes, una lista de prioridades.'}</h2><p>${counts.ALTO?`${counts.ALTO} ${counts.ALTO===1?'cliente presenta':'clientes presentan'} riesgo alto según el modelo.`:'No se identificaron clientes en el segmento de riesgo alto.'} Revisa la evidencia antes de actuar.</p></div><span class="run-state">${current.status==='completed'?'Análisis completado':'Análisis interrumpido'}</span></div><div class="risk-overview">${[['ALTO','Riesgo alto','Desde 70%'],['MEDIO','Riesgo medio','40% a menos de 70%'],['BAJO','Riesgo bajo','Menos de 40%']].map(([risk,label,range])=>`<button data-risk="${risk}" class="risk-total risk-${risk.toLowerCase()}" aria-label="Filtrar ${label.toLowerCase()}: ${counts[risk]} clientes"><span>${label}</span><strong>${counts[risk]}</strong><small>${range} <i aria-hidden="true">↗</i></small></button>`).join('')}</div><div class="overview-foot"><span><b>${pending}</b> propuestas pendientes${flags?` · <b>${flags}</b> con observación del Supervisor`:''}</span><span><b>${covered}/${total}</b> acciones seleccionadas por LLM · <b>${(Number(current.elapsed_ms||0)/1000).toLocaleString('es-PE',{maximumFractionDigits:1})} s</b> de procesamiento</span></div></article>`;
}

function renderObservedHandoff(){
 if(!current?.predictions?.length)return;
 const ps=current.predictions,index=ps.findIndex(p=>p.cliente_id===inspectedCustomer),p=ps[index];if(!p)return;
 const rec=(current.recommendations||[]).find(r=>r.cliente_id===p.cliente_id),reports=current.agent_llm||{};
 const coverage=$('agent-llm-stages');
 coverage.innerHTML=`<div class="execution-coverage"><div><span class="eyebrow">EVIDENCIA DE ESTA EJECUCIÓN</span><b>${esc(current.llm_report?.provider||'Proveedor no registrado')} · ${esc(current.llm_report?.model||'Sin modelo LLM registrado')}</b></div><div class="coverage-counts">${['predictivo','retencion','supervisor'].map(name=>{const r=reports[name]||{},count=(r.checked_indices||[]).length;return `<span class="${r.status==='validated'?'coverage-ok':r.status==='failed'?'coverage-warning':''}"><b>${esc(agentNames[name])}</b> ${count}/${ps.length} con LLM${r.status==='failed'?' · incidencia':''}</span>`;}).join('')}</div><p>Se consultan hasta 20 clientes priorizados por etapa. Las demás propuestas utilizan reglas identificadas. Puedes comprobar cada respuesta en la evidencia técnica.</p></div>`;
 const consoleCard=document.querySelector('.agent-console'),heading=consoleCard?.querySelector('.card-heading');
 if(heading){heading.querySelector('h2').textContent='Sigue el recorrido de este cliente.';heading.querySelector('p').textContent=`Resultados recibidos del servidor · ${Number(current.elapsed_ms||0).toLocaleString('es-PE')} ms · ${(current.trace||[]).length} mensajes registrados.`;}
 const stage=reports[inspectedAgent]||{},isLLM=(stage.checked_indices||[]).includes(index),choice=(stage.choices||[]).find(c=>c.index===index);
 const summary={
  predictivo:{input:'6 indicadores comerciales',tool:'Red neuronal + sensibilidad por variable',output:`${pct(p.probability)} de probabilidad · ${p.risk.toLowerCase()}`},
  retencion:{input:'Riesgo, indicadores y revisión predictiva',tool:isLLM?'Selección LLM + catálogo de acciones':'Reglas + catálogo de acciones',output:config?.actions[rec?.action]?.[0]||rec?.action||'Sin propuesta validada'},
  supervisor:{input:'Diagnóstico y propuesta de retención',tool:'Controles de consistencia'+(isLLM?' + revisión LLM':''),output:choice?.action==='request_review'?'Revisión humana adicional requerida':current.agent_report?.supervisor?.validated?'Informe consistente para revisión humana':'Revisión pendiente'}
 }[inspectedAgent];
 const inspector=document.querySelector('.agent-inspector');if(!inspector)return;
 const handoff=document.createElement('div');handoff.className='observed-handoff';
 handoff.innerHTML=`<div><span>RECIBIÓ</span><b>${esc(summary.input)}</b></div><i aria-hidden="true">→</i><div><span>UTILIZÓ</span><b>${esc(summary.tool)}</b></div><i aria-hidden="true">→</i><div><span>ENTREGÓ</span><b>${esc(summary.output)}</b></div>`;
 inspector.before(handoff);
 const proof=inspector.querySelector('.agent-ai-result');
 if(proof){proof.classList.toggle('without-llm',!isLLM);const title=proof.querySelector('b');if(title)title.textContent=isLLM?'LLM verificado para este cliente':'Resolución por reglas y controles';}
 const buttons=document.querySelectorAll('.agent-buttons [data-agent]');
 buttons.forEach(button=>{const report=reports[button.dataset.agent]||{},covered=(report.checked_indices||[]).includes(index);button.querySelector('small').textContent=covered?'LLM validado para este cliente':report.status==='failed'?'LLM no disponible · reglas aplicadas':'Reglas y controles aplicados';});
}
