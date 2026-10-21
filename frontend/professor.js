'use strict';
function renderProfessor(){
 const target=$('llm-evidence'),report=current?.llm_report;
 if(!current){target.innerHTML='';return;}
 document.querySelector('#view-recommendations>.notice').textContent=current.demo?'Modo de práctica: las decisiones se simulan en esta pestaña, sin guardarse ni ejecutar acciones.':'La aprobación registra una decisión humana. Este MVP no envía correos ni modifica sistemas comerciales.';
 const guided=current.public_demo?.kind==='professor'||current.guided_demo;
 const cached=current.public_demo?.cached;
 const attempts=report?.attempts||[],usage=report?.usage||[];
 const tokens=usage.reduce((n,u)=>n+(Number.isFinite(u.total_tokens)?u.total_tokens:0),0);
 const hasTokens=usage.some(u=>Number.isFinite(u.total_tokens));
 const request=current.trace.find(m=>m.tool==='structured_selection_request');
 const response=current.trace.find(m=>m.tool==='validated_json');
 const title=report?.status==='validated'?'Gemini respondió y su selección fue validada':report?.status==='failed'?'Gemini fue consultado, pero no produjo una respuesta utilizable':report?.requested?'Gemini solicitado; consulta no realizada':'Este análisis utiliza reglas, sin llamada a Gemini';
 target.innerHTML=`${guided?`<article class="professor-guide"><span class="eyebrow">RECORRIDO PARA EVALUACIÓN · SIN CLAVE</span><h2>${current.predictions.length} casos para entender el sistema.</h2><p>Usamos ${current.predictions.length} clientes ficticios de distintos niveles de riesgo. Cambia de cliente y recorre los tres agentes; al final puedes simular una decisión.</p><ol><li><b>Predictivo:</b> observa los indicadores y el riesgo.<br><button class="text-button" data-guide-agent="predictivo">Ver predicción →</button></li><li><b>Retención:</b> revisa la acción y su origen: Gemini o reglas.<br><button class="text-button" data-guide-agent="retencion">Ver propuesta →</button></li><li><b>Supervisor:</b> inspecciona los controles y abre la decisión.<br><button class="text-button" data-guide-agent="supervisor">Revisar decisión →</button></li></ol><p class="cache-note">${current.guided_demo?'Ejecución neuronal y agentes con reglas. No se consultó un LLM externo.':cached?`Resultado reutilizado de ${esc(new Date(current.created).toLocaleString('es-PE'))}. No se hizo otra llamada al abrir este recorrido.`:'Resultado de esta ejecución. Las próximas visitas pueden reutilizarlo durante diez minutos para proteger la cuota.'}</p></article>`:''}<article class="card api-evidence"><div class="card-heading"><div><span class="eyebrow">EVIDENCIA DEL USO DEL LLM</span><h2>${title}</h2></div><span class="badge ${report?.status==='failed'?'ALTO':''}">${report?.status==='validated'?'RESPUESTA VALIDADA':report?.status==='failed'?'ALTERNATIVA POR REGLAS':'SIN GENERACIÓN LLM'}</span></div><p>${esc(report?.message||'Este informe anterior no incluye el resumen de llamadas a Gemini.')}</p>${current.warnings.length?`<p class="api-warning">${esc(current.warnings.join(' '))}</p>`:''}<div class="api-stats"><div><small>Proveedor / modelo</small><b>${esc(report?.model||'No informado')}</b></div><div><small>Intentos reales</small><b>${attempts.length}${cached?' · resultado reutilizado':''}</b></div><div><small>Clientes con selección LLM</small><b>${report?.selected_customers||0} / ${current.predictions.length}</b></div><div><small>Tokens informados por Google</small><b>${hasTokens?tokens:'No informados'}</b></div></div>${attempts.length?`<div class="api-attempts">${attempts.map(a=>`<span>Intento ${a.attempt}: ${a.status==='validated'?'respuesta validada':esc(a.code||'fallido')} · ${a.elapsed_ms} ms</span>`).join('')}</div>`:''}<p class="api-note">La red neuronal calcula el riesgo. Gemini selecciona una acción permitida; el plan procede del catálogo y el supervisor contrasta la evidencia. Las claves permanecen en el servidor.</p><details><summary>Ver solicitud y respuesta de la API</summary><div class="api-json"><div><h3>Indicadores enviados, sin nombres ni códigos</h3><pre>${esc(request?JSON.stringify(request.payload,null,2):'No se envió una solicitud al proveedor.')}</pre></div><div><h3>Respuesta estructurada validada</h3><pre>${esc(response?JSON.stringify(response.payload,null,2):'No existe una respuesta LLM validada en esta ejecución. Las propuestas de reglas están identificadas como tales.')}</pre></div></div></details></article>`;
 if(!report?.requested)target.querySelector('.api-evidence').innerHTML='<span class="eyebrow">MODO SIN PROVEEDOR EXTERNO</span><h2>Los tres agentes están disponibles.</h2><p>La red neuronal calcula el riesgo; Retención usa reglas explícitas y el Supervisor valida la consistencia. Puedes preparar documentos y exportar planes desde Decisiones.</p><button class="secondary" data-professor="gemini">Probar Gemini (opcional)</button>';
}
async function startProfessor(useGemini=false){
 const busyTitle=$('busy').querySelector('b'),busyNote=$('busy').querySelector('small');
 busyTitle.textContent='Consultando el caso de demostración…';busyNote.textContent=useGemini?'Consultando Gemini con datos ficticios. Si no responde, el análisis continuará con reglas.':'Ejecutando la red neuronal, el agente de retención y el supervisor. No requiere un proveedor externo.';
 await work(async()=>{tablePage=0;recPage=0;current=await api(useGemini?'/api/demo/gemini':'/api/demo',{method:'POST'});if(!useGemini)current.guided_demo=true;render();show('agents');notice(useGemini?'Prueba pública lista. Revisa el estado real de Gemini y continúa con los agentes.':'Agentes listos sin clave de acceso. Revisa un cliente y prepara su plan o documento desde Decisiones.');});
 busyTitle.textContent='Procesando análisis…';busyNote.textContent='El primer acceso puede tardar mientras despierta el servidor.';
}
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.hasAttribute('data-professor'))startProfessor(b.dataset.professor==='gemini');
 if(b.dataset.guideAgent){inspectedAgent=b.dataset.guideAgent;renderAgentWorkspace();$('agent-workspace').scrollIntoView({behavior:'smooth',block:'start'});}
 if(b.dataset.demoDecision&&current?.demo){
  const r=current.recommendations.find(x=>x.cliente_id===b.dataset.id);if(!r)return;
  r.decision=b.dataset.demoDecision;
  current.demo_simulated_decisions=current.recommendations.filter(x=>x.decision!=='pending').map(x=>({cliente_id:x.cliente_id,decision:x.decision,simulated:true,persisted:false}));
  render();notice('Decisión simulada en esta pestaña. No se guarda en el servidor ni ejecuta una acción comercial.');
 }
});
renderProfessor();

