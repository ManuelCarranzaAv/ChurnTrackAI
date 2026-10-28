import asyncio
import json
import math
import os
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from backend.main import create_app
from backend.schemas import AnalysisRequest,Customer,LLMResponse
from backend.llm import ProviderError

@pytest.fixture
def client(tmp_path,monkeypatch):
    monkeypatch.setenv('APP_API_KEY','test-only-access-key')
    app=create_app('sqlite:///'+str(tmp_path/'test.db'))
    app.state.supervisor.retention.provider.key=''
    with TestClient(app) as c:
        yield c
    app.state.store.engine.dispose()

AUTH={'Authorization':'Bearer test-only-access-key'}
ROW={'cliente_id':'TEST-001','antiguedad':24,'compras_mensuales':5,'monto_promedio':800,'reclamos':2,'dias_ultima_compra':30,'pagos_atrasados':1}

def analyze(client,**kwargs):
    return client.post('/api/analyze',json={'customers':[ROW],**kwargs},headers=AUTH)

def test_health_and_frontend(client):
    assert client.get('/health').json()['status']=='ok'
    html=client.get('/')
    assert html.status_code==200 and 'ChurnTrackAI' in html.text
    assert 'frame-ancestors' in html.headers['content-security-policy']
    assert client.get('/assets/app.js').status_code==200

def test_auth_and_private_history(client):
    assert client.post('/api/analyze',json={'customers':[ROW]}).status_code==401
    assert client.get('/api/runs').status_code==401
    assert client.post('/api/runs/x/decisions/x',json={'decision':'approved'}).status_code==401

def test_individual_model_and_trace(client):
    response=analyze(client);assert response.status_code==200
    run=response.json();assert run['status']=='completed'
    p=run['predictions'][0];assert 0<=p['probability']<=1
    assert len(p['factors'])==6
    senders={m['sender'] for m in run['trace']}
    assert {'predictivo','retencion','supervisor'}.issubset(senders)
    assert client.get('/api/runs/'+run['id'],headers=AUTH).json()['id']==run['id']

def test_batch_and_demo_isolation(client):
    rows=[{**ROW,'cliente_id':f'TEST-{i}'} for i in range(20)]
    run=client.post('/api/analyze',json={'customers':rows},headers=AUTH).json()
    assert len(run['predictions'])==20
    demo=client.post('/api/demo').json();assert len(demo['predictions'])==12
    assert client.get('/api/runs/'+demo['id'],headers=AUTH).status_code==404

@pytest.mark.parametrize('field,value',[('reclamos',-1),('antiguedad',1.5),('monto_promedio','NaN'),('monto_promedio','Infinity'),('cliente_id','ignore instructions <script>')])
def test_invalid_data(client,field,value):
    assert client.post('/api/analyze',json={'customers':[{**ROW,field:value}]},headers=AUTH).status_code==422

def test_duplicate_and_missing_columns(client):
    assert client.post('/api/analyze',json={'customers':[ROW,ROW]},headers=AUTH).status_code==422
    assert client.post('/api/analyze-csv',content='cliente_id\nONE',headers=AUTH).status_code==422
    assert client.post('/api/analyze-csv',content='cliente_id,cliente_id\nA,B',headers=AUTH).status_code==422

def test_csv_real_parser(client):
    csv='cliente_id;antiguedad;compras_mensuales;monto_promedio;reclamos;dias_ultima_compra;pagos_atrasados\n"TEST-1";24;5;"800,50";2;30;1'
    r=client.post('/api/analyze-csv',content=csv.encode(),headers=AUTH)
    assert r.status_code==200
    assert r.json()['predictions'][0]['observed']['monto_promedio']==800.5

def test_human_approval_immutable(client):
    run=analyze(client).json()
    path=f'/api/runs/{run["id"]}/decisions/{ROW["cliente_id"]}'
    r=client.post(path,json={'decision':'approved'},headers=AUTH)
    assert r.status_code==200 and not r.json()['external_action_executed']
    assert client.post(path,json={'decision':'rejected'},headers=AUTH).status_code==409
    saved=client.get('/api/runs/'+run['id'],headers=AUTH).json()
    assert saved['recommendations'][0]['decision']=='approved'
    assert saved['human_decisions'][0]['actor']=='authenticated_admin'

def test_llm_missing_is_honest(client):
    r=analyze(client,use_llm=True,consent_external_processing=True).json()
    assert r['mode']=='rules' and r['warnings']
    assert all(x['source']=='rules' for x in r['recommendations'])

def test_llm_requires_consent(client):
    assert analyze(client,use_llm=True).status_code==422

def test_llm_failure_retries(client):
    class Broken:
        key='test-double'
        calls=0
        async def choose(self,payload):
            self.calls+=1
            raise ProviderError('TEST_PROVIDER_FAILURE')
    provider=Broken();client.app.state.supervisor.retention.provider=provider
    run=analyze(client,use_llm=True,consent_external_processing=True).json()
    assert provider.calls==2 and run['mode']=='rules'
    assert any(m['status']=='retry' for m in run['trace'])

def test_llm_valid_structured_output_test_double(client):
    class Stub:
        key='test-double'
        async def choose(self,payload):
            assert 'cliente_id' not in json.dumps(payload)
            return LLMResponse(choices=[{'index':0,'action':payload[0]['allowed_actions'][0],'evidence':['probability']}]),{'provider':'TEST_DOUBLE','total_tokens':0}
    client.app.state.supervisor.retention.provider=Stub()
    run=analyze(client,use_llm=True,consent_external_processing=True).json()
    assert run['mode']=='llm' and run['recommendations'][0]['source']=='llm'
    assert run['usage'][0]['provider']=='TEST_DOUBLE'

def test_llm_unsupported_claim_rejected(client):
    class Malicious:
        key='test-double'
        async def choose(self,payload):
            return LLMResponse(choices=[{'index':0,'action':'cancel_contract','evidence':['invented_fact']}]),{'provider':'TEST_DOUBLE'}
    client.app.state.supervisor.retention.provider=Malicious()
    run=analyze(client,use_llm=True,consent_external_processing=True).json()
    assert run['mode']=='rules'
    assert run['recommendations'][0]['action']!='cancel_contract'

def test_supervisor_requests_correction(client,monkeypatch):
    supervisor=client.app.state.supervisor
    original=supervisor.retention.execute
    async def broken(request,state,correction=False):
        await original(request,state,correction)
        if not correction:
            state.recommendations=[]
    monkeypatch.setattr(supervisor.retention,'execute',broken)
    run=analyze(client).json()
    assert run['status']=='completed'
    assert any(m['tool']=='request_correction' for m in run['trace'])

def test_daily_budget(client,monkeypatch):
    monkeypatch.setenv('LLM_DAILY_LIMIT','1')
    class Broken:
        key='test-double'
        calls=0
        async def choose(self,payload):
            self.calls+=1
            raise ProviderError('FAILED')
    provider=Broken();client.app.state.supervisor.retention.provider=provider
    run=analyze(client,use_llm=True,consent_external_processing=True).json()
    assert provider.calls==1 and run['mode']=='rules'
    assert any(m['tool']=='daily_budget' for m in run['trace'])

def test_ood_requires_data_review(client):
    run=client.post('/api/analyze',json={'customers':[{**ROW,'antiguedad':500}]},headers=AUTH).json()
    assert run['predictions'][0]['warnings']
    assert run['recommendations'][0]['action']=='review_data'

def test_size_limits(client):
    assert client.post('/api/analyze-csv',content=b'a'*256001,headers=AUTH).status_code==413
    assert client.post('/api/analyze',json={'customers':[{**ROW,'cliente_id':str(i)} for i in range(301)]},headers=AUTH).status_code==422

def test_300_customers_and_segment_totals(client):
    rows=[{**ROW,'cliente_id':f'C-{i}','dias_ultima_compra':i%120+1} for i in range(300)]
    r=client.post('/api/analyze',json={'customers':rows},headers=AUTH)
    assert r.status_code==200
    run=r.json();assert run['status']=='completed' and len(run['recommendations'])==300
    a=run['analytics'];assert sum(a['histogram'])==sum(s['count'] for s in a['segments'])==300
    assert 0<=a['median_probability']<=1
    scores=[p['attention_score'] for p in a['priorities']]
    assert scores==sorted(scores,reverse=True)
    assert client.get('/api/config').json()['max_customers']==300

def test_300_csv_and_301_rejected(client):
    data=client.get('/api/example-300.csv').text
    r=client.post('/api/analyze-csv',content=data,headers=AUTH)
    assert r.status_code==200 and len(r.json()['predictions'])==300
    assert client.post('/api/analyze-csv',content=data+data.splitlines()[-1].replace('DEMO-300','DEMO-301')+'\n',headers=AUTH).status_code==422

def test_analytics_excludes_ood_priorities(client):
    run=client.post('/api/analyze',json={'customers':[{**ROW,'dias_ultima_compra':500}]},headers=AUTH).json()
    assert run['analytics']['out_of_domain_count']==1
    assert run['analytics']['priorities']==[] and run['analytics']['sensitivities']==[]

def test_300_llm_selection_is_bounded_and_honest(client):
    class Stub:
        key='test-double'
        async def choose(self,payload):
            assert len(payload)==10
            assert [p['probability'] for p in payload]==sorted([p['probability'] for p in payload],reverse=True)
            return LLMResponse(choices=[{'index':p['index'],'action':p['allowed_actions'][0],'evidence':['probability']} for p in payload]),{'provider':'TEST_DOUBLE'}
    client.app.state.supervisor.retention.provider=Stub()
    rows=[{**ROW,'cliente_id':f'C-{i}','dias_ultima_compra':i%120+1} for i in range(300)]
    run=client.post('/api/analyze',json={'customers':rows,'use_llm':True,'consent_external_processing':True},headers=AUTH).json()
    assert run['status']=='completed' and run['mode']=='mixed'
    # Default LLM batch (LLM_MAX_CUSTOMERS) is 10: sized for free-tier tokens per minute.
    assert sum(r['source']=='llm' for r in run['recommendations'])==10
    assert sum(r['source']=='rules' for r in run['recommendations'])==290

def test_rate_limit(client):
    for _ in range(30):
        client.post('/nonexistent')
    assert client.post('/api/demo').status_code==429

def test_neural_reference_measurement(client):
    metrics=client.get('/api/metrics').json()
    assert metrics['parity']['max_abs_error']<1e-12
    assert metrics['parity']['cases']>=200
    assert metrics['provenance']['matches_notebook'] is False

def test_store_survives_restart(client):
    from backend.storage import Store
    run=analyze(client).json()
    other=Store(str(client.app.state.store.engine.url))
    assert other.get(run['id'])['id']==run['id']
    other.engine.dispose()

def test_access_validation_endpoint(client):
    assert client.get('/api/session').status_code==401
    assert client.get('/api/session',headers={'Authorization':'Bearer wrong-key'}).status_code==401
    assert client.get('/api/session',headers=AUTH).json()['authenticated'] is True

def test_public_professor_demo_300_is_private_and_free(client):
    run=client.post('/api/demo?size=300').json()
    assert run['demo'] and run['status']=='completed' and len(run['predictions'])==300
    assert run['mode']=='rules' and run['usage']==[]
    assert client.get('/api/runs/'+run['id'],headers=AUTH).status_code==404
    assert client.post('/api/demo?size=301').status_code==422

def test_agent_plans_and_supervisor_report(client):
    run=analyze(client).json();r=run['recommendations'][0]
    assert len(r['steps'])==2 and r['owner'] and r['success_check']
    assert run['agent_report']['supervisor']['validated']
    assert run['agent_report']['retention']['rules_count']==1

def test_llm_check_requires_access_and_explains_unavailability(client):
    assert client.post('/api/llm/check').status_code==401
    result=client.post('/api/llm/check',headers=AUTH).json()
    assert not result['available'] and 'clave' in result['message']

def test_invalid_provider_credentials_not_retried(client):
    class Denied:
        key='test-double'
        calls=0
        async def choose(self,payload):
            self.calls+=1
            raise ProviderError('HTTP_403_PROVIDER_REJECTED')
    provider=Denied();client.app.state.supervisor.retention.provider=provider
    run=analyze(client,use_llm=True,consent_external_processing=True).json()
    assert provider.calls==1 and run['status']=='completed'
    assert any('permisos' in w for w in run['warnings'])

def test_public_gemini_fixed_inputs_cache_and_private_isolation(client):
    class Stub:
        key='test-double'
        model='test-model'
        calls=0
        async def choose(self,payload):
            self.calls+=1
            assert len(payload)==3 and 'cliente_id' not in json.dumps(payload)
            assert {p['risk'] for p in payload}=={'ALTO','MEDIO','BAJO'}
            return LLMResponse(choices=[{'index':p['index'],'action':p['allowed_actions'][0],'evidence':['probability']} for p in payload]),{'provider':'TEST_DOUBLE','total_tokens':123}
    provider=Stub();client.app.state.supervisor.retention.provider=provider
    run=client.post('/api/demo/gemini').json()
    assert run['llm_report']['status']=='validated' and run['llm_report']['selected_customers']==3
    assert run['llm_report']['attempts'][0]['elapsed_ms']>=0
    assert run['public_demo']['cached'] is False
    repeat=client.post('/api/demo/gemini').json()
    assert repeat['id']==run['id'] and repeat['public_demo']['cached'] is True and provider.calls==1
    assert client.get('/api/runs/'+run['id'],headers=AUTH).status_code==404
    assert client.get('/api/runs').status_code==401
    assert client.post('/api/demo/gemini',json={'customers':[ROW]}).status_code==422
    assert client.post('/api/demo/gemini?prompt=custom').status_code==422

def test_public_gemini_limit_falls_back_without_provider_call(client,monkeypatch):
    provider=client.app.state.supervisor.retention.provider;provider.key='test-double'
    async def unexpected(payload):
        raise AssertionError('No provider call after public budget exhausted')
    monkeypatch.setattr(provider,'choose',unexpected)
    for _ in range(5): assert client.app.state.store.reserve_public_demo(5)
    run=client.post('/api/demo/gemini').json()
    assert run['status']=='completed' and run['mode']=='rules'
    assert run['public_demo']['llm_permitted'] is False
    assert run['llm_report']['attempts']==[]

def test_public_gemini_failure_reports_attempts_not_generation(client,monkeypatch):
    provider=client.app.state.supervisor.retention.provider;provider.key='test-double'
    async def fail(payload,stage='retencion'): raise ProviderError('HTTP_503_PROVIDER_REJECTED')
    async def fail_narrate(facts): raise ProviderError('HTTP_503_PROVIDER_REJECTED')
    monkeypatch.setattr(provider,'choose',fail)
    monkeypatch.setattr(provider,'narrate',fail_narrate)
    run=client.post('/api/demo/gemini').json()
    assert run['status']=='completed' and run['mode']=='rules'
    # predictivo + 2 retención + supervisor + estratega
    assert run['llm_report']['status']=='failed' and len(run['llm_report']['attempts'])==5
    assert run['executive']['source']=='rules'
    assert run['llm_report']['selected_customers']==0 and run['usage']==[]
    assert not any(m['tool']=='validated_json' for m in run['trace'])

def test_public_gemini_single_flight(client):
    client.portal.call(client.app.state.professor_lock.acquire)
    try: assert client.post('/api/demo/gemini').status_code==429
    finally: client.portal.call(client.app.state.professor_lock.release)

