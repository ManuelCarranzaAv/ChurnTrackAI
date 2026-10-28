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


def test_csv_errors_name_every_row_in_spanish(client):
    head='cliente_id,antiguedad,compras_mensuales,monto_promedio,reclamos,dias_ultima_compra,pagos_atrasados\n'
    detail=client.post('/api/public/validate-csv',content=head+'X 1,10,3,500,9,20,-1\nX-2,10,abc,500,1,20,1\n').json()['detail']
    assert 'Fila 2, cliente_id: solo admite letras' in detail
    assert 'Fila 2, pagos_atrasados: debe ser mayor o igual que 0' in detail
    assert 'Fila 3, compras_mensuales: debe ser un número' in detail
    assert 'repetidos' in client.post('/api/public/validate-csv',content=head+'A,1,1,1,1,1,1\nA,1,1,1,1,1,1\n').json()['detail']
