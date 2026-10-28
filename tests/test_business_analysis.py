"""Revenue exposure, what-if simulation and the strategist agent (v2 analysis layer)."""
import asyncio
import pytest
from tests.test_system import client, ROW
from backend.agents import SharedState, unsupported_numbers
from backend.schemas import AnalysisRequest, Customer

def test_revenue_at_risk_is_probability_times_monthly_revenue(client):
    run=client.post('/api/demo?size=300').json()
    for p in run['predictions']:
        assert p['monthly_revenue']==pytest.approx(p['observed']['compras_mensuales']*p['observed']['monto_promedio'])
        assert p['revenue_at_risk']==pytest.approx(p['probability']*p['monthly_revenue'])
        assert p['health_score']==round(100*(1-p['probability']))
    a=run['analytics']
    assert a['revenue']['monthly_at_risk']==pytest.approx(sum(p['revenue_at_risk'] for p in run['predictions']))
    assert sum(q['count'] for q in a['quadrants'].values())==300
    assert {p['quadrant'] for p in run['predictions']}<=set(a['quadrants'])
    # Priorities are ordered by expected revenue at risk.
    scores=[x['attention_score'] for x in a['priorities']]
    assert scores==sorted(scores,reverse=True)

def test_simulation_only_improves_lever_and_matches_model(client):
    model=client.app.state.supervisor.model
    row={**ROW,'reclamos':5,'pagos_atrasados':3,'dias_ultima_compra':90}
    res=client.post('/api/public/simulate',json=row).json()
    claims=res['levers']['claims']
    assert claims['changes']=={'reclamos':0}
    assert claims['probability_after']==pytest.approx(model.what_if(res['prediction']['observed'],{'reclamos':0}))
    assert claims['risk_reduction']==pytest.approx(res['prediction']['probability']-claims['probability_after'])
    assert res['levers']['reactivate']['changes']=={'dias_ultima_compra':15}
    # A customer already below the lever target is never made "worse" by the scenario.
    recent=client.post('/api/public/simulate',json={**row,'dias_ultima_compra':5}).json()
    assert recent['levers']['reactivate']['changes']=={'dias_ultima_compra':5}
    assert recent['levers']['reactivate']['risk_reduction']==pytest.approx(0)

def test_simulate_rejects_invalid_input_and_stores_nothing(client):
    assert client.post('/api/public/simulate',json={**ROW,'reclamos':-1}).status_code==422
    assert client.post('/api/public/simulate',json={**ROW,'extra':1}).status_code==422
    client.post('/api/public/simulate',json=ROW)
    assert client.app.state.store.list()==[]

def test_supervisor_rejects_tampered_simulation(client):
    sup=client.app.state.supervisor
    state=SharedState()
    req=AnalysisRequest(customers=[Customer(**{**ROW,'reclamos':6,'compras_mensuales':9})])
    sup.predictive.execute(req,state)
    asyncio.run(sup.retention.execute(req,state))
    assert sup.validate(state)
    rec=state.recommendations[0]
    if rec.simulation is None:
        rec.simulation={'probability_after':0.0}
    else:
        rec.simulation={**rec.simulation,'probability_after':rec.simulation['probability_after']/2}
    assert not sup.validate(state)

def test_rules_prefer_action_with_largest_modeled_reduction(client):
    run=client.post('/api/demo').json()
    checked=0
    for p,r in zip(run['predictions'],run['recommendations']):
        if p['risk']=='BAJO' or p['warnings']:
            continue
        sim=client.post('/api/public/simulate',json={'cliente_id':p['cliente_id'],**p['observed']}).json()
        reductions={a:s['risk_reduction'] for a,s in sim['levers'].items() if s and a in sim['allowed_actions']}
        if reductions and max(reductions.values())>=0.05:
            assert r['simulation']['risk_reduction']==pytest.approx(max(reductions.values()))
            checked+=1
    assert checked

def test_strategist_rule_summary_numbers_are_verified(client):
    run=client.post('/api/demo?size=300').json()
    ex=run['executive']
    assert ex['source']=='rules' and run['agent_report']['strategist']['source']=='rules'
    assert unsupported_numbers(ex,ex['facts'])==[]
    assert any(m['sender']=='estratega' for m in run['trace'])
    assert unsupported_numbers({'headline':'Perderemos S/ 9,999,999','findings':[],'actions':[]},ex['facts'])==['9,999,999']

def test_config_reports_four_agents(client):
    assert client.get('/api/config').json()['agents']==['supervisor','predictivo','retencion','estratega']
