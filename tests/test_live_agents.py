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
