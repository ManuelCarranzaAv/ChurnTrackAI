"""Live agent stream, balanced 24-client demo and LLM-vs-rules comparison."""
import json
from tests.test_system import client, ROW
from tests.test_three_agent_llm import ThreeStageProvider

def events(response):
    return [json.loads(line) for line in response.text.splitlines() if line.strip()]

def test_stream_emits_agent_messages_then_result(client):
    r=client.post('/api/public/analyze-stream?demo=24')
    assert r.status_code==200 and r.headers['content-type'].startswith('application/x-ndjson')
    ev=events(r)
    assert ev[0]['type']=='start' and ev[0]['customers']==24 and ev[-1]['type']=='result'
    messages=[e for e in ev if e['type']=='message']
    assert [m['sequence'] for m in messages]==list(range(1,len(messages)+1))
    assert {m['sender'] for m in messages}>={'supervisor','predictivo','retencion','estratega'}
    run=ev[-1]['run']
    assert len(messages)==len(run['trace']) and run['ephemeral']
    neural=next(m for m in messages if m['tool'].startswith('neural'))
    assert neural['brief']['customers']==24 and neural['brief']['out_of_domain']==1
    # Briefs stay small: no per-customer payload is streamed.
    assert all(len(json.dumps(m['brief']))<600 for m in messages)

def test_demo24_is_balanced(client):
    run=client.post('/api/demo?size=24').json()
    assert run['summary']=={'customers':24,'high':9,'medium':6,'low':9}
    assert all(q['count']>0 for q in run['analytics']['quadrants'].values())
    assert {r['action'] for r in run['recommendations']}>={'claims','payments','reactivate','monitor','review_data'}

def test_stream_validates_input(client):
    assert client.post('/api/public/analyze-stream',json={'customers':[{**ROW,'reclamos':-1}]}).status_code==422
    assert client.post('/api/public/analyze-stream?demo=7').status_code==422
    r=client.post('/api/public/analyze-stream',content='cliente_id,antiguedad\nA,1',headers={'Content-Type':'text/csv'})
    assert r.status_code==422

def test_llm_batch_and_rule_baseline(client,monkeypatch):
    monkeypatch.setenv('LLM_MAX_CUSTOMERS','5')
    provider=ThreeStageProvider();client.app.state.supervisor.retention.provider=provider
    r=client.post('/api/public/analyze-stream?demo=24&use_llm=true&consent=true')
    run=events(r)[-1]['run']
    llm=[x for x in run['recommendations'] if x['source']=='llm']
    assert len(llm)==5 and all(x['rule_baseline'] for x in llm)
    assert all(not x['rule_baseline'] for x in run['recommendations'] if x['source']=='rules')
    changed=sum(x['rule_baseline']!=x['action'] for x in llm)
    assert run['agent_report']['retention']['changed_vs_rules']==changed
    assert client.get('/api/config').json()['max_llm_customers']==5

def test_demo10_matches_llm_batch_and_covers_every_case(client):
    # The recommended test portfolio is exactly one LLM batch: every customer gets all four agents.
    assert client.get('/api/config').json()['demo_sizes'][0]==10==client.get('/api/config').json()['max_llm_customers']
    run=client.post('/api/demo?size=10').json()
    assert run['summary']['customers']==10 and run['summary']['high']>=4 and run['summary']['medium']>=1 and run['summary']['low']>=1
    assert {r['action'] for r in run['recommendations']}>={'claims','payments','reactivate','monitor','review_data'}
    assert client.get('/api/example-10.csv').status_code==200

def test_demo10_is_fully_reviewed_by_llm(client):
    provider=ThreeStageProvider();client.app.state.supervisor.retention.provider=provider
    run=events(client.post('/api/public/analyze-stream?demo=10&use_llm=true&consent=true'))[-1]['run']
    assert all(r['source']=='llm' for r in run['recommendations']) and run['mode']=='llm'
    assert all(r.get('supervisor_review') for r in run['recommendations'])
    assert not any('reglas explícitas' in w for w in run['warnings'])

class SkippingProvider(ThreeStageProvider):
    """Always omits the last customer, as an LLM sometimes does."""
    async def choose(self,payload):
        self.calls.append('retencion')
        return self.result(payload),{'total_tokens':10}
    def result(self,payload,stage='retencion'):
        full=super().result(payload,stage)
        return full.model_copy(update={'choices':full.choices[:-1]})

def test_incomplete_llm_answer_keeps_valid_part_after_retry(client):
    provider=SkippingProvider();client.app.state.supervisor.retention.provider=provider
    run=events(client.post('/api/public/analyze-stream?demo=10&use_llm=true&consent=true'))[-1]['run']
    assert run['status']=='completed'
    # Each stage: one rejected attempt, then the valid nine choices are kept and one customer stays on rules.
    assert all(run['agent_llm'][k]['status']=='validated' for k in ('predictivo','retencion','supervisor','estratega'))
    assert sum(r['source']=='llm' for r in run['recommendations'])==9
    assert sum(bool(r.get('supervisor_review')) for r in run['recommendations'])==9
    retries=[m for m in run['trace'] if m['status']=='retry']
    assert len(retries)==3 and not [m for m in run['trace'] if m['status']=='error']

class CrashingProvider(SkippingProvider):
    def result(self,payload,stage='retencion'):
        return ThreeStageProvider.result(self,payload,stage)
    async def review(self,payload,stage):
        raise KeyError('unexpected')

def test_unexpected_provider_exception_falls_back_without_stopping(client):
    client.app.state.supervisor.retention.provider=CrashingProvider()
    run=events(client.post('/api/public/analyze-stream?demo=10&use_llm=true&consent=true'))[-1]['run']
    assert run['status']=='completed' and run['agent_llm']['predictivo']['status']=='failed'
    assert run['agent_llm']['retencion']['status']=='validated'
