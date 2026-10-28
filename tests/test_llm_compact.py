"""Provider contract checks use HTTP doubles; no credentials or live quota."""
import asyncio
import copy
import json

import httpx
import pytest

from backend.llm import GroqProvider, ProviderError, compact_payload, provider_schema
from backend.schemas import FEATURES


def rows(count=20):
    # Three decimals, the precision of the payload sent to the LLM.
    return [{'index':i, 'probability':round(.8+i/1000, 3), 'risk':'ALTO',
             'observed':dict(zip(FEATURES, [24, 5, 800.5, 3, 90, 2])),
             'allowed_actions':['approve_plan','request_review'],
             'proposal':{'action':'claims','evidence':['reclamos'],
                         'steps':['Revisar reclamos.', 'Confirmar resolución.']}}
            for i in range(count)]


def decode(encoded):
    if isinstance(encoded, list):
        return encoded
    restored=[]
    for values in encoded['rows']:
        row=dict(zip(encoded['columns'], values))
        row['observed']={key:row.pop(key) for key in FEATURES}
        if row.get('proposal') and 'steps' not in row['proposal']:
            row['proposal']['steps']=encoded['proposal_steps_by_action'][row['proposal']['action']]
        restored.append(row)
    return restored


def test_compact_retains_all_evidence_and_reduces_batch_size():
    original=rows()
    original[0]['predictive_review']={'index':0,'action':'interpret_risk','evidence':['probability','reclamos']}
    snapshot=copy.deepcopy(original)
    compact=compact_payload(original)
    # Null only denotes an absent optional review, never an observed value.
    restored=decode(copy.deepcopy(compact))
    for item in restored:
        if item.get('predictive_review') is None:
            item.pop('predictive_review',None)
    assert restored==original==snapshot
    assert len(json.dumps(compact,separators=(',',':'))) < .6*len(json.dumps(original,separators=(',',':')))


def test_custom_steps_are_not_overwritten_for_same_action():
    original=rows(2)
    original[1]['proposal']['steps']=['A different approved follow-up.']
    assert decode(compact_payload(original))==original


@pytest.mark.parametrize('partial',[False,True])
def test_identifiers_excluded_even_for_sparse_connection_checks(partial):
    original=rows(1)
    original[0]['cliente_id']='PRIVATE-CUSTOMER'
    original[0]['observed']['customer_name']='PRIVATE-CUSTOMER'
    original[0]['proposal']['email']='PRIVATE-CUSTOMER'
    original[0]['predictive_review']={'index':0,'action':'interpret_risk','evidence':['probability'],'cliente_id':'PRIVATE-CUSTOMER'}
    if partial:
        original[0]['observed']={'dias_ultima_compra':5,'cliente_id':'PRIVATE-CUSTOMER'}
    result=compact_payload(original)
    assert 'PRIVATE-CUSTOMER' not in json.dumps(result)
    if partial:
        assert result[0]['observed']=={'dias_ultima_compra':5}


@pytest.mark.parametrize('count',[0,21])
def test_out_of_contract_batch_does_not_reach_provider(monkeypatch,count):
    monkeypatch.setenv('GROQ_API_KEY','test-placeholder')
    def unexpected(**kwargs):
        raise AssertionError('No HTTP request for an invalid batch')
    monkeypatch.setattr(httpx,'AsyncClient',unexpected)
    with pytest.raises(ProviderError,match='INVALID_PROVIDER_BATCH'):
        asyncio.run(GroqProvider().choose(rows(count)))


@pytest.mark.parametrize('stage,actions',[
    ('predictivo',{'interpret_risk','review_data'}),
    ('retencion',{'contact','monitor','reactivate','claims','payments','review_data'}),
    ('supervisor',{'approve_plan','request_review'}),
])
def test_stage_schema_limits_actions_and_evidence(stage,actions):
    schema=provider_schema(stage)
    choice=schema['$defs']['LLMChoice']
    assert set(choice['properties']['action']['enum'])==actions
    assert set(choice['properties']['evidence']['items']['enum'])=={'probability',*FEATURES}
    assert choice['additionalProperties'] is False
    assert schema['properties']['choices']['maxItems']==20


def test_groq_single_429_never_retries_or_exposes_provider_body(monkeypatch):
    monkeypatch.setenv('GROQ_API_KEY','test-placeholder')
    real_client=httpx.AsyncClient
    calls=[]
    def respond(request):
        calls.append(request)
        return httpx.Response(429,headers={'retry-after':'10000'},json={'error':{'message':'PRIVATE-PROVIDER-DETAIL'}})
    monkeypatch.setattr(httpx,'AsyncClient',lambda **kwargs:real_client(transport=httpx.MockTransport(respond),**kwargs))
    with pytest.raises(ProviderError,match='HTTP_429_PROVIDER_REJECTED') as caught:
        asyncio.run(GroqProvider().choose(rows(1)))
    assert len(calls)==1
    assert 'PRIVATE' not in str(caught.value)


def test_groq_stage_request_is_compact_bounded_and_low_reasoning(monkeypatch):
    monkeypatch.setenv('GROQ_API_KEY','test-placeholder')
    monkeypatch.setenv('GROQ_MODEL','openai/gpt-oss-20b')
    real_client=httpx.AsyncClient
    def respond(request):
        body=json.loads(request.content)
        assert body['reasoning_effort']=='low'
        assert 768 < body['max_completion_tokens'] <= 3072
        assert body['response_format']['json_schema']['name']=='supervisor_choices'
        assert decode(json.loads(body['messages'][1]['content']))==rows()
        output={'choices':[{'index':i,'action':'approve_plan','evidence':['probability']} for i in range(20)]}
        return httpx.Response(200,json={'choices':[{'message':{'content':json.dumps(output)}}],'usage':{'total_tokens':123}})
    monkeypatch.setattr(httpx,'AsyncClient',lambda **kwargs:real_client(transport=httpx.MockTransport(respond),**kwargs))
    result,usage=asyncio.run(GroqProvider().review(rows(),'supervisor'))
    assert len(result.choices)==20 and usage['total_tokens']==123


def test_malformed_success_response_falls_back_safely(monkeypatch):
    monkeypatch.setenv('GROQ_API_KEY','test-placeholder')
    real_client=httpx.AsyncClient
    monkeypatch.setattr(httpx,'AsyncClient',lambda **kwargs:real_client(transport=httpx.MockTransport(lambda request:httpx.Response(200,json=None)),**kwargs))
    with pytest.raises(ProviderError):
        asyncio.run(GroqProvider().choose(rows(1)))
