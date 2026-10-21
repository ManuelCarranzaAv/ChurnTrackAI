'use strict';
// Deterministic, reviewable artifacts. These tools do not send messages or create CRM records.
function actionPackage(run,customerId,actions={}){
 const p=run?.predictions.find(x=>x.cliente_id===customerId);
 const r=run?.recommendations.find(x=>x.cliente_id===customerId);
 if(!p||!r)throw Error('No existe una recomendación para este cliente.');
 const title=actions[r.action]?.[0]||r.action;
 const internal=['monitor','review_data'].includes(r.action);
 const draft=internal?`NOTA INTERNA · ${customerId}\n${title}\n\n${(r.steps||[]).join('\n')}\n\nVerificar: ${r.success_check}\n\nNo se ha contactado al cliente.`:`BORRADOR PARA REVISIÓN · ${customerId}\nAsunto: Coordinación de seguimiento comercial\n\nHola [nombre del contacto]:\n\nNos gustaría coordinar una conversación para conocer tus necesidades actuales y revisar cómo podemos atenderlas. ¿Qué horario te resultaría conveniente?\n\nSaludos,\n[nombre del ejecutivo]\n\nNOTA INTERNA — eliminar antes de enviar:\nObjetivo: ${title}\nResponsable propuesto: ${r.owner}\nPasos: ${(r.steps||[]).join(' ')}\nEste texto procede de una plantilla, no de un LLM. No se ha enviado.`;
 return {cliente_id:customerId,action:title,owner:r.owner||'Por asignar',timeframe:r.timeframe||'Por acordar',steps:(r.steps||[]).join(' | '),success_check:r.success_check||'',risk:p.risk,decision:r.decision,source:r.source,synthetic:!!run.demo,execution:'Propuesta; no ejecutada',draft,internal};
}
function planCsv(run,actions={}){
 const columns=['cliente_id','action','owner','timeframe','steps','success_check','risk','decision','source','synthetic','execution'];
 const cell=value=>'"'+String(value??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';
 return '\ufeff'+[columns,...run.recommendations.map(r=>{const p=actionPackage(run,r.cliente_id,actions);return columns.map(c=>p[c]);})].map(row=>row.map(cell).join(';')).join('\r\n');
}
if(typeof module!=='undefined')module.exports={actionPackage,planCsv};
if(typeof document!=='undefined'){
 document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||!current)return;
  if(b.id==='export-action-plan'){
   download('plan_seguimiento_'+current.id+'.csv',planCsv(current,config?.actions),'text/csv;charset=utf-8');notice('Plan CSV preparado para descargar. Incluye responsables propuestos y controles; no crea tareas en un CRM.');
  }
  if(b.dataset.prepareAction){
   const p=actionPackage(current,b.dataset.prepareAction,config?.actions);
   $('action-artifact').hidden=false;
   $('action-artifact').innerHTML=`<article class="card"><span class="eyebrow">HERRAMIENTA EJECUTADA · DOCUMENTO PREPARADO</span><h2>${p.internal?'Nota interna':'Borrador de contacto'} · ${esc(p.cliente_id)}</h2><p>Plantilla basada en el plan seleccionado. Revísala y completa los campos antes de usarla. No se ha enviado ningún mensaje.</p><pre>${esc(p.draft)}</pre><button class="primary" data-download-draft="${esc(p.cliente_id)}">Descargar documento TXT</button> <button class="secondary" data-close-artifact>Cerrar vista</button></article>`;
   $('action-artifact').scrollIntoView({behavior:'smooth',block:'start'});
  }
  if(b.dataset.downloadDraft){const p=actionPackage(current,b.dataset.downloadDraft,config?.actions);download('borrador_'+p.cliente_id+'.txt',p.draft,'text/plain;charset=utf-8');notice('Documento preparado para descargar. No se ha enviado.');}
  if(b.hasAttribute('data-close-artifact'))$('action-artifact').hidden=true;
 });
}
