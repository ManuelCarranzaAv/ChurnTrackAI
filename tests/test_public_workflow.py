import asyncio
import json
import httpx
import pytest
from tests.test_system import client, AUTH, ROW
from backend.llm import GroqProvider, ProviderError, configured_provider


def test_public_custom_analysis_not_saved_or_sent(client):
    result=client.post('/api/public/analyze',json={'customers':[ROW]})
    assert result.status_code==200
    run=result.json()
    assert run['ephemeral'] and not run['demo'] and not run['llm_report']['requested']
    assert run['agent_report']['supervisor']['validated']
    assert client.get('/api/runs/'+run['id'],headers=AUTH).status_code==404
    assert client.get('/api/runs',headers=AUTH).json()==[]


def test_public_boundary_and_private_isolation(client):
    assert client.post('/api/public/analyze',json={'customers':[ROW],'use_llm':True}).status_code==422
    assert client.post('/api/public/analyze',json={'customers':[ROW]*301}).status_code==422
    assert client.post('/api/analyze',json={'customers':[ROW]}).status_code==401
    assert client.get('/api/runs').status_code==401
    assert client.post('/api/runs/x/approve-pending').status_code==401


def test_public_csv_300_and_validation(client):
    columns=list(ROW)
    body=','.join(columns)+'\n'+'\n'.join(','.join(str({**ROW,'cliente_id':f'C-{i}'}[k]) for k in columns) for i in range(300))
    result=client.post('/api/public/analyze-csv',content=body)
    assert result.status_code==200
    assert len(result.json()['predictions'])==300 and result.json()['ephemeral']
    assert client.post('/api/public/analyze-csv?use_llm=true',content=body).status_code==422
    assert client.post('/api/public/analyze-csv',content=body+'\n'+','.join(str(ROW[k]) for k in columns)).status_code==422
    assert client.post('/api/public/analyze-csv',content='cliente_id\nX').status_code==422


def test_bulk_approval_preserves_rejection_and_is_idempotent(client):
    rows=[{**ROW,'cliente_id':f'C-{i}'} for i in range(3)]
    run=client.post('/api/analyze',json={'customers':rows},headers=AUTH).json()
    path='/api/runs/'+run['id']
    assert client.post(path+'/decisions/C-0',json={'decision':'rejected'},headers=AUTH).status_code==200
    result=client.post(path+'/approve-pending',headers=AUTH).json()
    assert result=={'approved_count':2,'external_action_executed':False}
    assert client.post(path+'/approve-pending',headers=AUTH).json()['approved_count']==0
    saved=client.get(path,headers=AUTH).json()
    assert [r['decision'] for r in saved['recommendations']]==['rejected','approved','approved']


def test_groq_adapter_validates_schema_and_usage(monkeypatch):
    monkeypatch.setenv('GROQ_API_KEY','unit-test-placeholder')
    monkeypatch.setenv('LLM_PROVIDER','groq')
    provider=configured_provider()
    assert isinstance(provider,GroqProvider)
    original=httpx.AsyncClient
    def respond(request):
        body=json.loads(request.content)
        assert request.url.host=='api.groq.com'
        assert request.headers['authorization']=='Bearer unit-test-placeholder'
        assert body['response_format']['json_schema']['strict'] is True
        return httpx.Response(200,json={'choices':[{'message':{'content':json.dumps({'choices':[{'index':0,'action':'monitor','evidence':['probability']}]})}}], 'usage':{'prompt_tokens':11,'completion_tokens':9,'total_tokens':20}})
    monkeypatch.setattr(httpx,'AsyncClient',lambda **kw:original(transport=httpx.MockTransport(respond),**kw))
    parsed,usage=asyncio.run(provider.choose([{'index':0,'probability':.1,'risk':'BAJO','observed':{k:v for k,v in ROW.items() if k!='cliente_id'},'allowed_actions':['monitor']}]))
    assert parsed.choices[0].action=='monitor' and usage['provider']=='groq' and usage['total_tokens']==20


@pytest.mark.parametrize('status,body',[(401,{'error':'sensitive body'}),(200,{'choices':[{'message':{'content':'invalid json'}}]})])
def test_groq_failure_is_safe(monkeypatch,status,body):
    monkeypatch.setenv('GROQ_API_KEY','unit-test-placeholder')
    original=httpx.AsyncClient
    monkeypatch.setattr(httpx,'AsyncClient',lambda **kw:original(transport=httpx.MockTransport(lambda req:httpx.Response(status,json=body)),**kw))
    with pytest.raises(ProviderError) as exc:
        asyncio.run(GroqProvider().choose([]))
    assert 'sensitive' not in str(exc.value) and 'unit-test-placeholder' not in str(exc.value)


def test_llm_public_alias_keeps_fixture_only(client):
    assert client.post('/api/demo/llm',json={'prompt':'x'}).status_code==422
    run=client.post('/api/demo/llm').json()
    assert len(run['predictions'])==3 and run['demo'] and run['ephemeral']


def _groq_rows():
    return [{'index':0,'probability':.1,'risk':'BAJO','observed':{k:v for k,v in ROW.items() if k!='cliente_id'},'allowed_actions':['monitor']}]

def test_groq_retries_once_after_short_rate_limit(monkeypatch):
    monkeypatch.setenv('GROQ_API_KEY','unit-test-placeholder')
    monkeypatch.setattr(asyncio,'sleep',lambda s:_noop())
    calls=[]
    def respond(request):
        calls.append(1)
        if len(calls)==1:
            return httpx.Response(429,headers={'retry-after':'1.5'},json={'error':'rate'})
        return httpx.Response(200,json={'choices':[{'message':{'content':json.dumps({'choices':[{'index':0,'action':'monitor','evidence':['probability']}]})}}],'usage':{'total_tokens':5}})
    original=httpx.AsyncClient
    monkeypatch.setattr(httpx,'AsyncClient',lambda **kw:original(transport=httpx.MockTransport(respond),**kw))
    parsed,usage=asyncio.run(GroqProvider().choose(_groq_rows()))
    assert len(calls)==2 and parsed.choices[0].action=='monitor' and usage['rate_limit_wait_s']==1.5

@pytest.mark.parametrize('headers',[{'retry-after':'45'},{}])
def test_groq_long_or_repeated_rate_limit_fails_safely(monkeypatch,headers):
    monkeypatch.setenv('GROQ_API_KEY','unit-test-placeholder')
    monkeypatch.setattr(asyncio,'sleep',lambda s:_noop())
    calls=[]
    def respond(request):
        calls.append(1);return httpx.Response(429,headers=headers,json={'error':'rate'})
    original=httpx.AsyncClient
    monkeypatch.setattr(httpx,'AsyncClient',lambda **kw:original(transport=httpx.MockTransport(respond),**kw))
    with pytest.raises(ProviderError,match='HTTP_429'):
        asyncio.run(GroqProvider().choose(_groq_rows()))
    # A long wait is not attempted; a short one is retried exactly once.
    assert len(calls)==(1 if headers else 2)

async def _noop():
    return None
