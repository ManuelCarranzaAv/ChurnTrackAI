'use strict';
// Pure helpers shared by the UI and the Node tests. Nothing here sends messages or creates CRM records.
(function(root){
 const FEATURES=['antiguedad','compras_mensuales','monto_promedio','reclamos','dias_ultima_compra','pagos_atrasados'];
 const LABELS={antiguedad:'Antigüedad (meses)',compras_mensuales:'Compras mensuales',monto_promedio:'Monto promedio (S/)',reclamos:'Reclamos',dias_ultima_compra:'Días desde última compra',pagos_atrasados:'Pagos atrasados',probability:'Probabilidad de abandono'};
 const ACTION_LABELS={contact:'Contacto preventivo',monitor:'Seguimiento comercial',reactivate:'Reactivación',claims:'Resolver reclamos',payments:'Regularizar pagos',review_data:'Validar datos'};
 const QUADRANTS={rescatar:{label:'Rescatar',hint:'Alto valor · en riesgo'},proteger:{label:'Proteger',hint:'Alto valor · estable'},automatizar:{label:'Automatizar',hint:'Menor valor · en riesgo'},mantener:{label:'Mantener',hint:'Menor valor · estable'}};

 const money=(n,compact)=>'S/ '+Number(n||0).toLocaleString('es-PE',compact&&Math.abs(n)>=1e5?{notation:'compact',maximumFractionDigits:1}:{maximumFractionDigits:0});
 const pct=(n,d=0)=>(Number(n||0)*100).toLocaleString('es-PE',{maximumFractionDigits:d,minimumFractionDigits:d})+'%';

 // Bulk acceptance never overrides a decision already taken nor a supervisor request for extra review.
 function approvePendingLocal(run){
  if(!(run?.demo||run?.ephemeral)||run.status!=='completed')throw Error('Esta ejecución no admite aprobación temporal.');
  let count=0;for(const r of run.recommendations){if(r.decision==='pending'&&r.supervisor_review?.action!=='request_review'){r.decision='approved';count++;}}
  return count;
 }

 function actionPackage(run,customerId,actions={}){
  const p=run?.predictions.find(x=>x.cliente_id===customerId);
  const r=run?.recommendations.find(x=>x.cliente_id===customerId);
  if(!p||!r)throw Error('No existe una recomendación para este cliente.');
  const title=actions[r.action]?.[0]||r.action;
  const internal=['monitor','review_data'].includes(r.action);
  const draft=internal?`NOTA INTERNA · ${customerId}\n${title}\n\n${(r.steps||[]).join('\n')}\n\nVerificar: ${r.success_check}\n\nNo se ha contactado al cliente.`:`BORRADOR PARA REVISIÓN · ${customerId}\nAsunto: Coordinación de seguimiento comercial\n\nHola [nombre del contacto]:\n\nNos gustaría coordinar una conversación para conocer tus necesidades actuales y revisar cómo podemos atenderlas. ¿Qué horario te resultaría conveniente?\n\nSaludos,\n[nombre del ejecutivo]\n\nNOTA INTERNA — eliminar antes de enviar:\nObjetivo: ${title}\nResponsable propuesto: ${r.owner}\nPasos: ${(r.steps||[]).join(' ')}\nEste texto procede de una plantilla, no de un LLM. No se ha enviado.`;
  const sim=r.simulation;
  return {cliente_id:customerId,action:title,owner:r.owner||'Por asignar',timeframe:r.timeframe||'Por acordar',steps:(r.steps||[]).join(' | '),success_check:r.success_check||'',risk:p.risk,
   probability:p.probability!=null?Number(p.probability).toFixed(4):'',revenue_at_risk:p.revenue_at_risk!=null?Math.round(p.revenue_at_risk):'',
   modeled_reduction:sim?Number(sim.risk_reduction).toFixed(4):'',decision:r.decision,source:r.source,synthetic:!!run.demo,execution:'Propuesta; no ejecutada',draft,internal};
 }

 function planCsv(run,actions={}){
  const columns=['cliente_id','action','owner','timeframe','steps','success_check','risk','probability','revenue_at_risk','modeled_reduction','decision','source','synthetic','execution'];
  // Spreadsheet formula injection guard: prefix risky leading characters.
  const cell=value=>'"'+String(value??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';
  return '﻿'+[columns,...run.recommendations.map(r=>{const p=actionPackage(run,r.cliente_id,actions);return columns.map(c=>p[c]);})].map(row=>row.map(cell).join(';')).join('\r\n');
 }

 function filterCustomers(run,{query='',risk='',quadrant='',sort='revenue_at_risk'}={}){
  const q=query.trim().toLowerCase();
  const recs=Object.fromEntries((run?.recommendations||[]).map(r=>[r.cliente_id,r]));
  const rows=(run?.predictions||[]).filter(p=>(!q||p.cliente_id.toLowerCase().includes(q))&&(!risk||p.risk===risk)&&(!quadrant||p.quadrant===quadrant)).map(p=>({...p,rec:recs[p.cliente_id]}));
  const key={revenue_at_risk:p=>-p.revenue_at_risk,probability:p=>-p.probability,monthly_revenue:p=>-p.monthly_revenue,health:p=>p.health_score,id:p=>p.cliente_id};
  const f=key[sort]||key.revenue_at_risk;
  return rows.sort((a,b)=>{const x=f(a),y=f(b);return x<y?-1:x>y?1:0;});
 }

 const NAMES={supervisor:'Supervisor',predictivo:'Predictivo',retencion:'Retención',estratega:'Estratega',llm:'LLM',usuario:'Tú'};
 const plural=(n,one,many)=>`${n} ${n===1?one:many}`;
 const actionList=a=>Object.entries(a||{}).sort((x,y)=>y[1]-x[1]).map(([k,n])=>`${n} ${(ACTION_LABELS[k]||k).toLowerCase()}`).join(', ');
 const review=a=>{const ok=(a||{}).approve_plan||0,rv=(a||{}).request_review||0;return `${plural(ok,'plan aprobado','planes aprobados')}${rv?`, ${rv} para revisión humana`:''}`;};
 // Plain-language narration of one trace message (live or replayed). Only states what the brief contains.
 function narrate(m){
  const b=m.brief||{},err=b.error;
  if(err&&m.sender==='llm')return `La respuesta del LLM no se aceptó (${err}). ${m.status==='retry'?'Reintento.':'El agente continúa con reglas explícitas.'}`;
  switch(m.tool){
   case 'analysis_request':return `Solicito analizar ${plural(b.customer_count,'cliente','clientes')} ${b.requested_llm?'con revisión LLM':'sin LLM'}.`;
   case 'delegate_prediction':return 'Delego al Predictivo: validar los datos, calcular el riesgo y explicar sus factores.';
   case 'neural_inference_and_mean_ablation':return `Calculé el riesgo con la red neuronal: ${b.high} alto, ${b.medium} medio, ${b.low} bajo${b.out_of_domain?`. ${plural(b.out_of_domain,'registro queda','registros quedan')} fuera del dominio del modelo`:''}.`;
   case 'predictivo_llm_request':return `Envío ${plural(b.customers,'perfil','perfiles')} sin código de cliente al LLM para interpretar el riesgo.`;
   case 'predictivo_llm_result':return `Interpretación validada para ${plural(b.choices,'cliente','clientes')}${b.actions?.review_data?` (${b.actions.review_data} con datos a revisar)`:''}.`;
   case 'delegate_retention':return 'Delego a Retención: elegir una acción sustentada para cada cliente.';
   case 'structured_selection_request':return `Pido al LLM elegir la acción de ${plural(b.customers,'cliente','clientes')}, con el impacto simulado de cada palanca como evidencia.`;
   case 'validated_json':return `Selección validada: ${actionList(b.actions)}.`;
   case 'provider_call':return `La llamada al LLM falló (${b.error||'error'}).`;
   case 'llm_unavailable':return 'El LLM no está configurado: aplico reglas explícitas.';
   case 'daily_budget':return 'Se agotó el presupuesto diario del LLM: aplico reglas explícitas.';
   case 'recommendations':return `${b.correction?'Corrección entregada: ':''}${plural(b.customers,'plan propuesto','planes propuestos')} — ${actionList(b.actions)}.`;
   case 'request_correction':return 'Encontré propuestas inconsistentes: pido a Retención rehacerlas con reglas.';
   case 'supervisor_llm_request':return `Pido al LLM una segunda revisión de ${plural(b.customers,'propuesta','propuestas')}.`;
   case 'supervisor_llm_result':return `Revisión validada: ${review(b.actions)}.`;
   case 'delegate_executive_summary':return 'Delego al Estratega el resumen para gerencia.';
   case 'executive_summary_request':return `Envío ${plural(b.facts,'hecho verificado','hechos verificados')} al LLM, sin códigos de cliente.`;
   case 'executive_summary_result':return b.validated?'Borrador aceptado: todas sus cifras existen en los datos verificados.':'Borrador rechazado.';
   case 'executive_summary':return `Resumen listo (${b.source==='llm'?'redactado por LLM':'por reglas'}): «${b.headline}».`;
   case 'validated_report':return 'Informe validado y entregado. No se ejecutó ninguna acción externa: la decisión es tuya.';
   case 'execution_failed':return 'La ejecución se interrumpió.';
   default:return m.tool;
  }
 }
 // Agent lane states derived from the message stream: waiting → working → llm → done/failed.
 function agentStates(messages){
  const s={supervisor:{state:'waiting',msgs:0,llm:0},predictivo:{state:'waiting',msgs:0,llm:0},retencion:{state:'waiting',msgs:0,llm:0},estratega:{state:'waiting',msgs:0,llm:0}};
  for(const m of messages){
   if(s[m.sender])s[m.sender].msgs++;
   if(m.sender==='usuario')s.supervisor.state='working';
   if(m.sender==='supervisor'&&s[m.recipient]&&m.status==='delegated')s[m.recipient].state='working';
   if(s[m.sender]&&m.recipient==='llm'){s[m.sender].state='llm';s[m.sender].llm++;}
   if(m.sender==='llm'&&s[m.recipient]){s[m.recipient].state='working';if(m.status==='error')s[m.recipient].llmFailed=true;else if(m.status==='ok')s[m.recipient].llmOk=true;}
   if(s[m.sender]&&m.sender!=='supervisor'&&m.recipient==='supervisor')s[m.sender].state='done';
   if(m.tool==='validated_report')s.supervisor.state='done';
   if(m.tool==='execution_failed')s.supervisor.state='failed';
  }
  return s;
 }

 const api={FEATURES,LABELS,ACTION_LABELS,QUADRANTS,NAMES,money,pct,approvePendingLocal,actionPackage,planCsv,filterCustomers,narrate,agentStates};
 if(typeof module!=='undefined')module.exports=api;else root.Core=api;
})(typeof window!=='undefined'?window:globalThis);
