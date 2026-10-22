'use strict';
function approvePendingLocal(run){
 if(!(run?.demo||run?.ephemeral)||run.status!=='completed')throw Error('Esta ejecución no admite aprobación temporal.');
 let count=0;for(const r of run.recommendations){if(r.decision==='pending'&&r.supervisor_review?.action!=='request_review'){r.decision='approved';count++;}}
 return count;
}
if(typeof module!=='undefined')module.exports={approvePendingLocal};
function validateAnalysisMode(saved){
 if(saved&&!apiKey)throw Error('Para guardar en el historial privado, valida el acceso de administrador en Configuración.');
 if($('use-llm').checked&&!$('consent').checked)throw Error('Autoriza el procesamiento de indicadores para obtener las recomendaciones de los agentes.');
}
function recordLocalDecisions(){
 current.local_decisions=current.recommendations.filter(r=>r.decision!=='pending').map(r=>({cliente_id:r.cliente_id,decision:r.decision,persisted:false,synthetic:!!current.demo,external_action_executed:false}));
}
let explanationCustomer='';
function renderClarity(){
 const target=$('explicit-analysis'),recs=current?.recommendations||[],pending=recs.filter(r=>r.decision==='pending'&&r.supervisor_review?.action!=='request_review').length;
 $('approve-all').disabled=!pending||current?.status!=='completed';
 $('approve-all').textContent=`Aceptar todas las pendientes (${pending})`;
 $('bulk-summary').textContent=current?`${pending} pendientes · ${recs.filter(r=>r.decision==='approved').length} aceptadas · ${recs.filter(r=>r.decision==='rejected').length} rechazadas. ${current.demo||current.ephemeral?'Se conservarán solo en esta pestaña y en tu exportación.':'Se registrarán en el historial privado.'}`:'Ejecuta un análisis para revisar sus propuestas.';
 if(!current?.predictions.length){target.innerHTML='';return;}
 const p=selected(explanationCustomer)||[...current.predictions].sort((a,b)=>b.probability-a.probability)[0];explanationCustomer=p.cliente_id;
 const r=recs.find(r=>r.cliente_id===p.cliente_id),report=current.llm_report;
 const number=n=>Number(n).toLocaleString('es-PE',{maximumFractionDigits:3});
 target.innerHTML=`<article class="card analysis-explained"><span class="eyebrow">ANÁLISIS EXPLÍCITO · RESULTADOS DE ESTA EJECUCIÓN</span><h2>${current.summary.customers} ${current.summary.customers===1?'cliente analizado':'clientes analizados'}: ${current.summary.high} altos, ${current.summary.medium} medios y ${current.summary.low} bajos.</h2><p>El modelo neuronal calcula el riesgo, Retención propone el siguiente paso y Supervisor comprueba su consistencia. Duración medida: ${current.elapsed_ms} ms.</p><label>Ver explicación del cliente<select id="explanation-customer">${current.predictions.map(x=>`<option value="${esc(x.cliente_id)}" ${x.cliente_id===p.cliente_id?'selected':''}>${esc(x.cliente_id)} · ${pct(x.probability)} · ${x.risk}</option>`).join('')}</select></label><div class="explanation-cards"><section><span class="eyebrow">1 · PREDICTIVO</span><h3>${pct(p.probability)} · riesgo ${esc(p.risk)}</h3><p>Salida de la red 6 → 32 → 16 → 8 → 1. Bajo &lt; 40%, medio 40–&lt;70%, alto ≥70%. Es una estimación académica, no una certeza de abandono.</p></section><section><span class="eyebrow">2 · RETENCIÓN</span><h3>${esc(config?.actions[r?.action]?.[0]||r?.action||'Sin propuesta')}</h3><p>${esc(r?.rationale||'Sin evidencia validada')}</p><b>Origen: ${r?.source==='llm'?esc(report?.provider||'LLM')+' · respuesta validada':'reglas explícitas, sin LLM'}</b></section><section><span class="eyebrow">3 · SUPERVISOR</span><h3>${current.agent_report?.supervisor.validated?'Informe consistente':'Requiere revisión'}</h3><p>${(current.agent_report?.supervisor.checks||[]).map(esc).join(' · ')}.</p><b>Decisión: ${r?({pending:'Pendiente de revisión',approved:'Aceptada',rejected:'Rechazada'}[r.decision]):'Sin propuesta'}. No ejecutada externamente.</b></section></div><h3>Datos usados y efecto de cada indicador</h3><p>Se sustituye un indicador por su media de entrenamiento, manteniendo los demás. La diferencia en puntos porcentuales describe sensibilidad, no causalidad; valores pequeños pueden aparecer redondeados a cero.</p><div class="table-wrap"><table><thead><tr><th>INDICADOR</th><th>VALOR OBSERVADO</th><th>CAMBIO FRENTE A LA MEDIA</th></tr></thead><tbody>${p.factors.map(f=>`<tr><td>${esc(labels[f.feature])}</td><td>${number(f.value)}</td><td>${f.delta_probability>=0?'+':''}${number(f.delta_probability*100)} pp</td></tr>`).join('')}</tbody></table></div>${p.warnings.length?`<p class="notice">${esc(p.warnings.join(' '))}</p>`:''}<div class="rec-actions"><button class="secondary" data-inspect-customer="${esc(p.cliente_id)}">Ver trabajo y mensajes de los agentes →</button><button class="primary" data-review-customer="${esc(p.cliente_id)}">Revisar propuesta →</button></div></article>`;
 $('explanation-customer').onchange=e=>{explanationCustomer=e.target.value;renderClarity();};
}
if(typeof document!=='undefined'){
 $('approve-all').onclick=()=>work(async()=>{
  if(!current||current.status!=='completed')return;
  let count;
  if(current.demo||current.ephemeral){count=approvePendingLocal(current);recordLocalDecisions();}
  else{const result=await api(`/api/runs/${current.id}/approve-pending`,{method:'POST'});count=result.approved_count;current=await api('/api/runs/'+current.id);}
  render();notice(`${count} propuestas aceptadas. ${current.demo||current.ephemeral?'Exporta el informe para conservar las decisiones.':'Decisiones guardadas en el historial.'} No se enviaron mensajes ni se ejecutaron acciones externas.`);
 });
 renderClarity();
}
