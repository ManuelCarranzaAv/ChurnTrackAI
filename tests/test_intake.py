from tests.test_system import client, ROW

def csv_body(rows):
    return ','.join(ROW)+'\n'+'\n'.join(','.join(str(row[k]) for k in ROW) for row in rows)

def test_preview_uses_full_validation_without_inference(client,monkeypatch):
    async def forbidden(*args,**kwargs):
        raise AssertionError('Preview must not run agents or LLM')
    monkeypatch.setattr(client.app.state.supervisor,'run',forbidden)
    rows=[{**ROW,'cliente_id':f'PREVIEW-{i}'} for i in range(300)]
    response=client.post('/api/public/validate-csv',content=csv_body(rows))
    assert response.status_code==200
    result=response.json()
    assert result['count']==300 and len(result['preview'])==5
    assert not result['llm_called'] and not result['persisted']
    assert client.app.state.store.list()==[]

def test_preview_rejects_duplicate_and_invalid_cells(client):
    for rows in ([ROW,ROW],[{**ROW,'reclamos':-1}],[{**ROW,'monto_promedio':'NaN'}]):
        assert client.post('/api/public/validate-csv',content=csv_body(rows)).status_code==422
    assert client.post('/api/public/validate-csv',content='cliente_id\nX').status_code==422
