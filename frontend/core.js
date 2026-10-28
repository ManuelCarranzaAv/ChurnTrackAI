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

 const api={FEATURES,LABELS,ACTION_LABELS,QUADRANTS,money,pct,approvePendingLocal,actionPackage,planCsv,filterCustomers};
 if(typeof module!=='undefined')module.exports=api;else root.Core=api;
})(typeof window!=='undefined'?window:globalThis);
