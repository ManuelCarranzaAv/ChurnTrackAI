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
    assert run['executive']['headline'].endswith('de ingreso mensual en riesgo en 1 clientes')
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

def test_supervisor_reviews_with_what_if_evidence(client):
    seen={}
    class Spy(ThreeStageProvider):
        async def review(self,payload,stage):
            seen[stage]=payload
            return await super().review(payload,stage)
    client.app.state.supervisor.retention.provider=Spy()
    row={**ROW,'reclamos':6,'pagos_atrasados':3,'dias_ultima_compra':90}
    client.post('/api/public/analyze',json={'customers':[row],'use_llm':True,'consent_external_processing':True})
    sup=seen['supervisor'][0]
    assert sup['proposal']['action'] in sup['action_impacts'] or sup['proposal']['action'] in ('contact','monitor')
    assert set(sup['action_impacts'])<={'claims','payments','reactivate'} and sup['action_impacts']
    assert 'action_impacts' not in seen['predictivo'][0]

def test_llm_reasons_are_kept_only_with_real_numbers(client):
    from backend.agents import checked_reason
    from backend.schemas import Customer
    p=client.app.state.supervisor.model.predict(Customer(**{**ROW,'reclamos':6}))
    assert checked_reason('Tiene 6 reclamos y 30 días sin comprar.',p)=='Tiene 6 reclamos y 30 días sin comprar.'
    assert checked_reason('Tiene 45 reclamos.',p)==''
    assert checked_reason(f'Probabilidad {p.probability*100:.0f}% con 6 reclamos.',p)
    class Reasoned(ThreeStageProvider):
        def result(self,payload,stage='retencion'):
            r=super().result(payload,stage)
            for c in r.choices: c.reason='Inventado: 999 reclamos.' if stage=='supervisor' else 'Elegido por 2 reclamos.'
            return r
    client.app.state.supervisor.retention.provider=Reasoned()
    run=client.post('/api/public/analyze',json={'customers':[ROW],'use_llm':True,'consent_external_processing':True}).json()
    assert run['recommendations'][0]['llm_reason']=='Elegido por 2 reclamos.'
    assert run['recommendations'][0]['supervisor_review']['reason']==''

def test_provider_schema_requires_reason():
    from backend.llm import provider_schema
    choice=provider_schema('retencion')['$defs']['LLMChoice']
    assert choice['required']==['index','action','evidence','reason'] and choice['additionalProperties'] is False

def test_review_stage_retries_once_after_incomplete_answer(client):
    class Flaky(ThreeStageProvider):
        def __init__(self):
            super().__init__();self.sup_calls=0
        async def review(self,payload,stage):
            if stage=='supervisor':
                self.sup_calls+=1
                if self.sup_calls==1:
                    self.calls.append(stage)
                    return LLMResponse(choices=[{'index':999,'action':'approve_plan','evidence':['probability']}]),{'total_tokens':5}
            return await super().review(payload,stage)
    provider=Flaky();client.app.state.supervisor.retention.provider=provider
    run=client.post('/api/public/analyze',json={'customers':[ROW],'use_llm':True,'consent_external_processing':True}).json()
    sup=[a for a in run['llm_report']['attempts'] if a['agent']=='supervisor']
    assert [a['status'] for a in sup]==['failed','validated'] and run['agent_llm']['supervisor']['status']=='validated'
    assert any(m['tool']=='supervisor_llm_result' and m['status']=='retry' for m in run['trace'])
