from tests.test_system import client, ROW, AUTH
from backend.schemas import LLMResponse

class ThreeStageProvider:
    key='test-double'
    name='test-double'
    model='test-model'
    def __init__(self,review=False,invalid=False):
        self.calls=[];self.flag=review;self.invalid=invalid
    async def choose(self,payload):
        self.calls.append('retencion')
        assert all('predictive_review' in p for p in payload)
        return self.result(payload),{'total_tokens':10}
    async def review(self,payload,stage):
        self.calls.append(stage)
        assert all('cliente_id' not in p for p in payload)
        if stage=='supervisor':
            assert all('proposal' in p for p in payload)
        return self.result(payload,stage),{'total_tokens':10}
    async def narrate(self,facts):
        self.calls.append('estratega')
        if self.invalid:
            return {'headline':'Riesgo de 999.999 soles inventados','findings':['a','b'],'actions':['c','d']},{'total_tokens':10}
        hechos=facts['hechos_verificados']
        assert all('B2B-' not in h and 'TEST-' not in h for h in hechos)
        return {'headline':hechos[3],'findings':[hechos[0],'Revisar prioridades.'],
                'actions':['Contactar a los prioritarios.','Validar datos.']},{'total_tokens':10}
    def result(self,payload,stage='retencion'):
        return LLMResponse(choices=[{'index':999 if self.invalid and stage=='supervisor' else p['index'],
            'action':'request_review' if self.flag and stage=='supervisor' else p['allowed_actions'][0],
            'evidence':['probability']} for p in payload])

def test_three_real_stages_orchestrated_with_double(client):
    provider=ThreeStageProvider();client.app.state.supervisor.retention.provider=provider
    run=client.post('/api/public/analyze',json={'customers':[ROW],'use_llm':True,'consent_external_processing':True}).json()
    assert provider.calls==['predictivo','retencion','supervisor','estratega']
    assert run['status']=='completed' and run['ephemeral'] and not run['demo']
    assert all(r['status']=='validated' for r in run['agent_llm'].values())
    assert len(run['llm_report']['attempts'])==4
    assert run['executive']['source']=='llm' and run['agent_report']['strategist']['llm_status']=='validated'
    assert run['predictions'][0]['llm_interpretation']['action']=='interpret_risk'
    assert run['recommendations'][0]['supervisor_review']['action']=='approve_plan'
    assert sum(u['total_tokens'] for u in run['usage'])==40
    assert client.get('/api/runs/'+run['id'],headers=AUTH).status_code==404

def test_supervisor_observation_excluded_from_bulk(client):
    client.app.state.supervisor.retention.provider=ThreeStageProvider(review=True)
    run=client.post('/api/analyze',json={'customers':[ROW],'use_llm':True,'consent_external_processing':True},headers=AUTH).json()
    path='/api/runs/'+run['id']
    assert run['recommendations'][0]['supervisor_review']['action']=='request_review'
    assert client.post(path+'/approve-pending',headers=AUTH).json()['approved_count']==0
    assert client.post(path+'/decisions/'+ROW['cliente_id'],json={'decision':'approved'},headers=AUTH).status_code==200

def test_invalid_supervisor_response_is_not_claimed_valid(client):
    client.app.state.supervisor.retention.provider=ThreeStageProvider(invalid=True)
    run=client.post('/api/public/analyze',json={'customers':[ROW],'use_llm':True,'consent_external_processing':True}).json()
    assert run['status']=='completed' and run['agent_llm']['supervisor']['status']=='failed'
    assert run['agent_llm']['retencion']['status']=='validated'
    assert 'supervisor_review' not in run['recommendations'][0]
    # Invented figures in the executive summary are rejected and replaced by the rule-based brief.
    assert run['agent_llm']['estratega']['status']=='failed' and run['executive']['source']=='rules'

def test_public_custom_budget_prevents_all_llm_calls(client):
    provider=ThreeStageProvider();client.app.state.supervisor.retention.provider=provider
    for _ in range(10):assert client.app.state.store.reserve_public_demo(10)
    run=client.post('/api/public/analyze',json={'customers':[ROW],'use_llm':True,'consent_external_processing':True}).json()
    assert provider.calls==[] and run['mode']=='rules' and run['warnings']
