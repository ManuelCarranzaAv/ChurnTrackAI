'use strict';
function renderExperience(){
 const a=current?.analytics, report=current?.agent_report;
 if(!a){$('executive-summary').innerHTML='';$('agent-outcomes').innerHTML='';$('action-summary').innerHTML='';return;}
 const high=a.segments.find(s=>s.risk==='ALTO'),top=a.priorities[0],signal=a.sensitivities[0];
 $('executive-summary').innerHTML=`<article class="executive"><div><span class="eyebrow">LECTURA EJECUTIVA · ${current.demo?'EJEMPLO SINTÉTICO':'DATOS CARGADOS'}</span><h2>${high.count} de ${a.count} clientes presentan riesgo alto.</h2><p>${signal?`La variable con mayor sensibilidad media es <b>${esc(labels[signal.feature])}</b>. `:''}${a.out_of_domain_count?`${a.out_of_domain_count} registros necesitan revisión antes de actuar.`:'Todos los registros están dentro de los rangos del entrenamiento sintético.'}</p></div><div class="next-action"><small>SIGUIENTE PASO SUGERIDO</small><b>${top?'Revisar '+esc(top.cliente_id):'Revisar el seguimiento de la cartera'}</b><span>${top?'Primero en el índice de atención comercial; no es una pérdida prevista.':'Verifica las recomendaciones y conserva el informe.'}</span><button class="secondary" data-view="segments">Explorar diagnóstico →</button></div></article>`;
 if(!report){$('agent-outcomes').innerHTML='<p class="notice">Este informe histórico no incluye el resumen de agentes de la nueva versión.</p>';return;}
 const r=report.retention,s=report.supervisor;
 $('agent-outcomes').innerHTML=`<div class="agent-results"><article><span>01 · PREDICTIVO</span><strong>${report.predictive.count}</strong><h3>clientes evaluados</h3><p>${report.predictive.out_of_domain} fuera del dominio. Se calcularon seis factores por cliente.</p></article><article><span>02 · RETENCIÓN</span><strong>${r.llm_count} / ${r.rules_count}</strong><h3>acciones Gemini / reglas</h3><p>Planes con responsable propuesto, plazo y criterio de seguimiento.</p></article><article><span>03 · SUPERVISOR</span><strong>${s.validated?'Validado':'Revisar'}</strong><h3>${s.checks.length} controles de consistencia</h3><p>${s.corrections} correcciones. Ninguna acción comercial ejecutada automáticamente.</p></article></div><article class="card"><h2>Qué revisó el supervisor</h2><div class="check-chips">${s.checks.map(c=>`<span>${s.validated?'✓':'○'} ${esc(c)}</span>`).join('')}</div><p>Estos controles verifican consistencia del informe; no certifican exactitud empresarial. La traza detallada está debajo.</p></article>`;
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
const originalLogout=$('logout').onclick;$('logout').onclick=()=>{originalLogout();$('access-status').textContent='Modo visitante · acceso cerrado.';$('analysis-access-note').textContent='Valida el acceso para cargar tus propios datos.';};
$('demo-300').onclick=()=>work(async()=>{tablePage=0;recPage=0;current=await api('/api/demo?size=300',{method:'POST'});render();show('segments');notice('300 clientes sintéticos analizados. Demostración pública sin contraseña, sin guardar datos y sin consumir Gemini.');});
$('check-llm').onclick=()=>work(async()=>{if(!apiKey)throw Error('Valida primero el acceso de ChurnTrackAI para probar Gemini.');const result=await api('/api/llm/check',{method:'POST'});$('llm-status').textContent=result.message+(result.model?' Modelo: '+result.model:'');notice(result.message,!result.available);});
$('prev-customers').onclick=()=>{tablePage--;renderTable();};$('next-customers').onclick=()=>{tablePage++;renderTable();};
$('prev-recs').onclick=()=>{recPage--;renderRecommendations();};$('next-recs').onclick=()=>{recPage++;renderRecommendations();};
renderExperience();
