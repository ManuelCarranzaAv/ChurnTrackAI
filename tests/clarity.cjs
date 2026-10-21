const assert=require('node:assert/strict');
const {approvePendingLocal}=require('../frontend/clarity.js');
const run={ephemeral:true,status:'completed',recommendations:[{decision:'pending'},{decision:'rejected'},{decision:'approved'}]};
assert.equal(approvePendingLocal(run),1);
assert.deepEqual(run.recommendations.map(x=>x.decision),['approved','rejected','approved']);
assert.equal(approvePendingLocal(run),0);
assert.throws(()=>approvePendingLocal({...run,ephemeral:false}));
assert.throws(()=>approvePendingLocal({...run,status:'failed'}));
console.log('5 comprobaciones de aprobación temporal correctas');
