"""Diagnostic evaluation, not an original holdout claim. Run from repository root."""
import hashlib
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score,precision_score,recall_score,f1_score,roc_auc_score,confusion_matrix,roc_curve,brier_score_loss
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from backend.model import NeuralModel
from backend.schemas import FEATURES

def generate(seed,n):
    rng = np.random.RandomState(seed)
    x = np.column_stack([rng.randint(lo,hi,n) for lo,hi in [(1,61),(1,16),(100,5000),(0,8),(1,121),(0,6)]])
    score=x[:,4]*.035+x[:,3]*.45+x[:,5]*.55-x[:,1]*.18-x[:,0]*.015+rng.normal(0,.5,n)
    return x,(score>2).astype(int)

def main():
    original=(ROOT/'original/modelo.js').read_text(encoding='utf-8')
    artifact={k:json.loads(re.search('const '+v+r' = (.*?);',original,re.S).group(1)) for k,v in [('mean','scalerMean'),('scale','scalerScale'),('layers','layers')]}
    (ROOT/'models/network.json').write_text(json.dumps(artifact,indent=2),encoding='utf-8')
    model=NeuralModel()
    x,y=generate(20261020,1000)
    p=np.array([model.probability(row) for row in x]);pred=(p>=.5).astype(int)
    baseline=np.ones_like(y)
    fpr,tpr,_=roc_curve(y,p)
    notebook_x,notebook_y=generate(42,1500)
    xtrain,_,_,_=train_test_split(notebook_x,notebook_y,test_size=.2,random_state=42,stratify=notebook_y)
    scaler=StandardScaler().fit(xtrain)
    # Real independent implementation comparison through Node, using original source.
    parity_input=x[:200].tolist()+[[20,2,800,1,30,2],[48,10,2500,0,5,0],[0,0,0,0,0,0],[1200,10000,10000000,10000,36500,10000]]
    js=original+'\nconsole.log(JSON.stringify('+json.dumps(parity_input)+'.map(predictChurn)));'
    values=json.loads(subprocess.check_output(['node','-e',js],text=True,encoding='utf-8'))
    errors=[abs(v-model.probability(row)) for v,row in zip(values,parity_input)]
    assert max(errors)<1e-12
    result={'status':'measured','created':datetime.now(timezone.utc).isoformat(),'n':len(x),'seed':20261020,'model_sha256':model.digest,
            'note':'Diagnóstico sobre 1,000 ejemplos sintéticos nuevos (semilla 20261020), generados con la regla del notebook. No es una evaluación empresarial ni el holdout original: el escalador exportado no coincide con el notebook recibido.',
            'metrics':{'accuracy':accuracy_score(y,pred),'precision':precision_score(y,pred),'recall':recall_score(y,pred),'f1':f1_score(y,pred),'auc':roc_auc_score(y,p),'brier':brier_score_loss(y,p),'confusion_matrix':confusion_matrix(y,pred).tolist()},
            'baseline':{'method':'predict all churn','accuracy':accuracy_score(y,baseline),'f1':f1_score(y,baseline)},'roc':list(map(list,zip(fpr.tolist(),tpr.tolist()))),
            'parity':{'cases':len(errors),'max_abs_error':max(errors),'reference':'original/modelo.js; Node.js'},
            'provenance':{'original_js_sha256':hashlib.sha256(original.encode()).hexdigest(),'notebook_scaler_mean':scaler.mean_.tolist(),'exported_scaler_mean':artifact['mean'],'matches_notebook':bool(np.allclose(scaler.mean_,artifact['mean'])),'notebook_reported_accuracy':.92,'notebook_metric_reproduced':False}}
    (ROOT/'models/evaluation.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    df=pd.DataFrame(x,columns=FEATURES);df['churn']=y;df.to_csv(ROOT/'data/diagnostic_synthetic.csv',index=False)
    demo_rows=[[48,10,2500,0,5,0],[8,2,1200,5,95,3],[24,5,800,2,30,1],[36,12,4300,0,12,0],[12,3,2100,3,65,2],[6,1,450,6,110,5],[54,14,3600,1,8,0],[18,6,1600,1,35,1],[30,4,2900,4,72,2],[42,9,1800,0,20,0],[20,2,800,1,30,2],[9,5,900,2,50,1]]
    demo=[dict(cliente_id=f'B2B-{i+1:03}',**dict(zip(FEATURES,row))) for i,row in enumerate(demo_rows)]
    (ROOT/'data/demo.json').write_text(json.dumps(demo,indent=2),encoding='utf-8')
    pd.DataFrame(demo).to_csv(ROOT/'data/template.csv',index=False)
    print(json.dumps({'metrics':result['metrics'],'parity':result['parity'],'scaler_matches':result['provenance']['matches_notebook']},indent=2))

if __name__=='__main__': main()
