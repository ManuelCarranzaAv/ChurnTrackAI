const assert=require('node:assert/strict');
const {actionPackage,planCsv}=require('../frontend/core.js');
const run={demo:true,predictions:[{cliente_id:'A',risk:'ALTO'},{cliente_id:'B',risk:'BAJO'}],recommendations:[{cliente_id:'A',action:'contact',owner:'=HYPERLINK("x")',steps:['Verificar; "dato"'],decision:'pending',source:'rules'},{cliente_id:'B',action:'monitor',steps:[],decision:'approved',source:'rules'}]};
const contact=actionPackage(run,'A',{contact:['Contacto preventivo']});
assert.equal(contact.execution,'Propuesta; no ejecutada');
assert.match(contact.draft,/No se ha enviado/);
assert.equal(contact.synthetic,true);
assert.equal(actionPackage(run,'B').internal,true);
assert.match(actionPackage(run,'B').draft,/NOTA INTERNA/);
assert.match(planCsv(run),/"'=HYPERLINK/);
assert.match(planCsv(run),/Verificar; ""dato""/);
assert.throws(()=>actionPackage(run,'missing'));
console.log('8 comprobaciones de documentos y CSV correctas');
// Bulk acceptance (formerly clarity.cjs) and customer filtering.
const {approvePendingLocal,filterCustomers}=require('../frontend/core.js');
const temp={ephemeral:true,status:'completed',recommendations:[{decision:'pending'},{decision:'rejected'},{decision:'approved'},{decision:'pending',supervisor_review:{action:'request_review'}}]};
assert.equal(approvePendingLocal(temp),1);
assert.deepEqual(temp.recommendations.map(x=>x.decision),['approved','rejected','approved','pending']);
assert.equal(approvePendingLocal(temp),0);
assert.throws(()=>approvePendingLocal({...temp,ephemeral:false}));
assert.throws(()=>approvePendingLocal({...temp,status:'failed'}));
const book={predictions:[{cliente_id:'A1',risk:'ALTO',probability:.9,revenue_at_risk:10,monthly_revenue:11,health_score:10,quadrant:'automatizar'},{cliente_id:'B2',risk:'MEDIO',probability:.5,revenue_at_risk:500,monthly_revenue:1000,health_score:50,quadrant:'rescatar'}],recommendations:[]};
assert.deepEqual(filterCustomers(book).map(p=>p.cliente_id),['B2','A1']);
assert.deepEqual(filterCustomers(book,{sort:'probability'}).map(p=>p.cliente_id),['A1','B2']);
assert.deepEqual(filterCustomers(book,{query:'a1'}).map(p=>p.cliente_id),['A1']);
assert.deepEqual(filterCustomers(book,{quadrant:'rescatar'}).map(p=>p.cliente_id),['B2']);
console.log('9 comprobaciones de aprobación y filtrado correctas');
// Agent narration and lane states (live room).
const {narrate,agentStates}=require('../frontend/core.js');
const trace=[
 {sender:'usuario',recipient:'supervisor',tool:'analysis_request',status:'ok',brief:{customer_count:24,requested_llm:true}},
 {sender:'supervisor',recipient:'predictivo',tool:'delegate_prediction',status:'delegated',brief:{task:'x'}},
 {sender:'predictivo',recipient:'supervisor',tool:'neural_inference_and_mean_ablation',status:'ok',brief:{customers:24,high:9,medium:6,low:9,out_of_domain:1}},
 {sender:'predictivo',recipient:'llm',tool:'predictivo_llm_request',status:'ok',brief:{customers:12}},
 {sender:'llm',recipient:'predictivo',tool:'predictivo_llm_result',status:'error',brief:{error:'HTTP_429_PROVIDER_REJECTED'}},
];
assert.match(narrate(trace[2]),/9 alto, 6 medio, 9 bajo\. 1 registro queda fuera del dominio/);
assert.match(narrate(trace[4]),/no se aceptó \(HTTP_429/);
assert.match(narrate({tool:'supervisor_llm_result',sender:'llm',status:'ok',brief:{choices:3,actions:{approve_plan:2,request_review:1}}}),/2 planes aprobados, 1 para revisión humana/);
let st=agentStates(trace.slice(0,4));
assert.equal(st.predictivo.state,'llm');assert.equal(st.supervisor.state,'working');assert.equal(st.retencion.state,'waiting');
st=agentStates(trace);
assert.equal(st.predictivo.state,'working');assert.ok(st.predictivo.llmFailed);assert.equal(st.predictivo.llm,1);
console.log('6 comprobaciones de narración de agentes correctas');
