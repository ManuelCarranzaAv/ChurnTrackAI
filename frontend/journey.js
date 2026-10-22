'use strict';
document.body.classList.add('journey');
const formSection=$('view-analysis');
while(formSection.firstChild)$('home-analysis').append(formSection.firstChild);
const storageOptions=document.createElement('details');
storageOptions.className='storage-options';storageOptions.innerHTML='<summary>Opciones de guardado</summary>';
storageOptions.append($('save-private').closest('label'));$('home-analysis').append(storageOptions);
Object.assign(toolNames,{predictivo_llm_request:'Solicitó interpretación de indicadores al LLM',predictivo_llm_result:'Recibió la interpretación contrastada',supervisor_llm_request:'Solicitó revisión independiente de las propuestas',supervisor_llm_result:'Recibió la revisión del LLM'});
const originalAgentRender=renderAgentWorkspace;
renderAgentWorkspace=function(){
 originalAgentRender();
 const target=$('agent-llm-stages');if(!current){target.innerHTML='';return;}
 const reports=current.agent_llm||{};
 target.innerHTML=`<div class="explanation-cards">${['predictivo','retencion','supervisor'].map(name=>{const r=reports[name]||{};return `<section><span class="eyebrow">${agentNames[name]}</span><h3>${r.status==='validated'?'LLM respondió':r.status==='failed'?'Respuesta LLM no utilizable':'Sin consulta LLM'}</h3><p>${(r.checked_indices||[]).length} de ${current.predictions.length} clientes con salida LLM validada. ${r.reason?esc(r.reason):'Consulta el detalle por cliente debajo.'}</p></section>`;}).join('')}</div>`;
 const index=current.predictions.findIndex(p=>p.cliente_id===inspectedCustomer),r=reports[inspectedAgent]||{};
 const covered=(r.checked_indices||[]).includes(index),choice=(r.choices||[]).find(c=>c.index===index);
 const actionLabels={interpret_risk:'Interpretó el riesgo calculado por la red neuronal',review_data:'Solicitó validar datos fuera del dominio',approve_plan:'Consideró la propuesta consistente',request_review:'Solicitó revisión humana adicional'};
 const extra=choice?`<p>${esc(actionLabels[choice.action]||choice.action)}. Evidencia citada: ${choice.evidence.map(k=>esc(labels[k]||'Probabilidad de churn')).join(', ')}.</p>`:'';
 document.querySelector('.agent-inspector>div')?.insertAdjacentHTML('afterbegin',`<div class="agent-ai-result"><b>${covered?'Consulta LLM validada para este cliente':'Este cliente se revisó con reglas y controles deterministas en esta etapa'}</b>${extra}<small>${covered?'Proveedor: '+esc(current.llm_report?.provider)+' · '+esc(current.llm_report?.model):'Las consultas LLM se priorizan para hasta 20 clientes. La recomendación y su origen se conservan explícitos.'}</small></div>`);
};
show('dashboard');renderAgentWorkspace();
const reportButton=$('export-json');
$('view-agents').prepend(reportButton);
reportButton.textContent='Descargar informe y traza JSON';
