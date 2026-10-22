'use strict';
// This workspace reads the returned run. It never simulates live agent activity.
let inspectedCustomer='', inspectedAgent='predictivo', workspaceRun='';
const agentNames={predictivo:'Predictivo',retencion:'Retención',supervisor:'Supervisor',usuario:'Usuario',llm:'LLM'};
const toolNames={analysis_request:'Recibió la solicitud',delegate_prediction:'Delegó el diagnóstico',neural_inference_and_mean_ablation:'Calculó riesgos y factores',delegate_retention:'Solicitó propuestas de retención',structured_selection_request:'Consultó a LLM',validated_json:'Validó la respuesta de LLM',provider_call:'Registró la respuesta del proveedor',llm_unavailable:'Activó la alternativa por reglas',daily_budget:'Comprobó el presupuesto',recommendations:'Entregó las recomendaciones',request_correction:'Solicitó una corrección',validated_report:'Validó el informe para revisión humana',execution_failed:'Registró una interrupción'};
function renderWorkspace(){
 const loaded=!!current?.predictions?.length;
 document.body.classList.toggle('has-analysis',loaded);
 $('workspace-start').hidden=false;
 $('workspace-context').hidden=!loaded;
 if(loaded){
  $('workspace-context').innerHTML=`<span><b>${current.demo?'Cartera de demostración':'Cartera cargada'}</b> · ${current.predictions.length} clientes · ${esc(new Date(current.created).toLocaleString('es-PE'))}</span><button class="text-button" data-view="agents">${current.status==='completed'?'Ver ejecución de agentes':'Revisar ejecución interrumpida'} →</button>`;
  if(workspaceRun!==current.id){$('recommendation-search').value='';$('decision-filter').value='';renderRecommendations();workspaceRun=current.id;inspectedCustomer=current.analytics?.priorities[0]?.cliente_id||current.predictions[0].cliente_id;inspectedAgent='predictivo';}
 }
 renderAgentWorkspace();
 updateWorkflow();
}
function updateWorkflow(){
 document.querySelectorAll('.workflow-step').forEach(b=>{const selected=b.dataset.view===activeView||(activeView==='dashboard'&&b.dataset.view==='analysis');b.classList.toggle('selected',!!selected);if(selected)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});
}
function renderAgentWorkspace(){
 const target=$('agent-workspace');
 if(!current?.predictions?.length){target.innerHTML='<article class="start-card"><span class="eyebrow">EJECUCIÓN OBSERVABLE</span><h2>De los indicadores a una decisión revisable.</h2><p>Ejecuta una cartera y selecciona un cliente para inspeccionar lo que recibió, calculó y entregó cada agente.</p><div class="agent-path"><span>01 · Predictivo</span><i>→</i><span>02 · Retención</span><i>→</i><span>03 · Supervisor</span></div><button class="primary" data-view="analysis">Ir a Inicio →</button></article>';return;}
 const p=selected(inspectedCustomer)||current.predictions[0];inspectedCustomer=p.cliente_id;
 const r=current.recommendations.find(x=>x.cliente_id===p.cliente_id),s=current.agent_report?.supervisor;
 const messages=current.trace.filter(m=>m.sender===inspectedAgent||m.recipient===inspectedAgent);
 const stats={predictivo:`${current.predictions.length} clientes evaluados`,retencion:`${current.recommendations.length} planes propuestos`,supervisor:s?.validated?'Informe validado':'Revisión necesaria'};
 target.innerHTML=`<article class="card agent-console"><div class="card-heading"><div><span class="eyebrow">MESA DE AGENTES</span><h2>Inspecciona una decisión, de principio a fin.</h2><p>Registro de la ejecución ${current.status==='completed'?'completada':'interrumpida'} · ${current.elapsed_ms} ms. Esta vista no es una transmisión en vivo.</p></div><button class="secondary" data-view="analysis">Nueva ejecución</button></div><label class="agent-customer-label">Cliente que quieres revisar<select id="agent-customer">${current.predictions.map(x=>`<option value="${esc(x.cliente_id)}" ${x.cliente_id===p.cliente_id?'selected':''}>${esc(x.cliente_id)} · ${x.risk} · ${pct(x.probability)}</option>`).join('')}</select></label><div class="agent-path agent-buttons">${['predictivo','retencion','supervisor'].map((name,i)=>`<button data-agent="${name}" aria-pressed="${inspectedAgent===name}" class="${inspectedAgent===name?'selected':''}"><span>0${i+1}</span><b>${agentNames[name]}</b><small>${esc(stats[name])}</small></button>`).join('')}</div><div class="agent-inspector"><div><span class="eyebrow">${esc(p.cliente_id)} / ${agentNames[inspectedAgent]}</span>${inspectedAgent==='predictivo'?`<h2>${pct(p.probability)} · riesgo ${esc(p.risk.toLowerCase())}</h2><p>La red neuronal estima el riesgo. Los factores comparan cada indicador con su media de entrenamiento; no prueban una causa.</p><div class="agent-facts">${Object.entries(p.observed).map(([key,value])=>`<div><small>${esc(labels[key])}</small><b>${esc(value)}</b></div>`).join('')}</div><h3>Señales que más cambian la predicción</h3>${p.factors.slice(0,3).map(f=>`<div class="agent-fact-line"><span>${esc(labels[f.feature])}</span><b>${f.delta_probability>=0?'+':''}${(f.delta_probability*100).toFixed(1)} pp</b></div>`).join('')}${p.warnings.length?`<p class="notice">${esc(p.warnings.join(' '))}</p>`:''}`:inspectedAgent==='retencion'?r?`<h2>${esc(config?.actions[r.action]?.[0]||r.action)}</h2><p class="source-label">Origen de esta selección: <b>${r.source==='llm'?'LLM':'reglas explícitas'}</b>. El plan de seguimiento procede del catálogo validado.</p><p>${esc(r.rationale)}</p><div class="plan-meta"><b>${esc(r.owner)}</b><span>${esc(r.timeframe)}</span></div><ol class="plan-steps">${(r.steps||[]).map(step=>`<li>${esc(step)}</li>`).join('')}</ol><p class="success-check">${esc(r.success_check)}</p>`:'<h2>No hay propuesta validada para este cliente.</h2>':`<h2>${s?.validated?'Consistencia comprobada':'Revisión pendiente'}</h2><p>Comprueba que cada cliente tenga una acción compatible, evidencia y un plan de seguimiento. No certifica que el modelo sea preciso en empresas reales.</p><ul class="supervisor-checks">${(s?.checks||[]).map(check=>`<li>${s.validated?'✓':'○'} ${esc(check)}</li>`).join('')}</ul><p><b>Decisión ${current.demo?'de práctica':'humana'}:</b> ${r?({pending:'Pendiente',approved:'Aprobada',rejected:'Rechazada'}[r.decision]):'Sin propuesta'}. Ninguna acción externa se ha ejecutado.</p><button class="primary" data-review-customer="${esc(p.cliente_id)}">Revisar esta acción →</button>`}</div><aside class="agent-log"><h3>Intercambios del agente</h3><p>Mensajes de toda la cartera. El detalle de la izquierda corresponde al cliente seleccionado.</p>${messages.map(m=>`<div class="message-line"><span class="message-number">${m.sequence}</span><div><b>${esc(toolNames[m.tool]||m.tool)}</b><small>${esc(agentNames[m.sender]||m.sender)} → ${esc(agentNames[m.recipient]||m.recipient)}</small><span class="badge ${m.status==='error'?'ALTO':''}">${esc({ok:'Completado',error:'Error',retry:'Revisión / reintento',delegated:'Delegado'}[m.status]||m.status)}</span></div></div>`).join('')}</aside></div></article>`;
 $('agent-customer').onchange=e=>{inspectedCustomer=e.target.value;renderAgentWorkspace();};
}
async function runPublicWorkspace(view='dashboard'){
 await work(async()=>{tablePage=0;recPage=0;current=await api('/api/demo?size=300',{method:'POST'});render();show(view);notice('Ejemplo sintético analizado. Puedes inspeccionar clientes, agentes y propuestas sin clave.');});
}
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.hasAttribute('data-demo-agents'))runPublicWorkspace('agents');
 if(b.hasAttribute('data-demo-workspace'))runPublicWorkspace();
 if(b.dataset.agent){inspectedAgent=b.dataset.agent;renderAgentWorkspace();}
 if(b.dataset.inspectCustomer){inspectedCustomer=b.dataset.inspectCustomer;inspectedAgent='predictivo';renderAgentWorkspace();show('agents');}
 if(b.dataset.reviewCustomer){$('decision-filter').value='';$('recommendation-search').value=b.dataset.reviewCustomer;recPage=0;renderRecommendations();show('recommendations');}
});
['recommendation-search','decision-filter'].forEach(id=>$(id).addEventListener('input',()=>{recPage=0;renderRecommendations();}));
$('demo-300').onclick=()=>runPublicWorkspace();
renderWorkspace();

// One shared engine setting applies to both CSV and individual analyses.
const engine=document.createElement('details');engine.className='data-engine';
engine.innerHTML='<summary>Motor de recomendaciones · reglas disponibles / LLM opcional</summary>';
engine.append(document.querySelector('.llm-options'));$('engine-container').append(engine);
document.addEventListener('click',e=>{const b=e.target.closest('[data-method]');if(!b)return;$('single-analysis').hidden=b.dataset.method!=='single';$('batch-analysis').hidden=b.dataset.method!=='batch';document.querySelectorAll('[data-method]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));});});


