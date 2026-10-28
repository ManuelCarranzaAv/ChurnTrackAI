import asyncio
import csv
import io
import json
import os
import secrets
import copy
import time
from contextlib import asynccontextmanager
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import IntegrityError
from pydantic import ValidationError
from .agents import SupervisorAgent, ACTIONS, LEVERS, allowed, simulate, llm_batch
from .model import NeuralModel, ROOT
from .schemas import AnalysisRequest, Customer, Decision, FEATURES
from .storage import Store
from .llm import configured_provider, ProviderError, explain_error

load_dotenv(ROOT / '.env')
MAX_BODY = 256_000
# Serverless hosts (Vercel) only allow writes under /tmp; that storage is per-instance and temporary.
RUNTIME = Path(os.getenv('RUNTIME_DIR') or ('/tmp/churntrackai' if os.getenv('VERCEL') else ROOT / 'runtime'))

class BodyLimit:
    def __init__(self, app):
        self.app = app
    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope,receive,send)
        chunks, count = [], 0
        while True:
            message = await receive()
            if message['type'] == 'http.disconnect':
                return
            count += len(message.get('body',b''))
            if count > MAX_BODY:
                return await JSONResponse({'detail':'Carga máxima: 256 KB'},413)(scope,receive,send)
            chunks.append(message)
            if not message.get('more_body',False):
                break
        index = 0
        async def replay():
            nonlocal index
            if index < len(chunks):
                message = chunks[index]; index += 1
                return message
            return await receive()
        await self.app(scope,replay,send)

def readable(error):
    """Spanish, user-facing text for a field validation error."""
    kind, ctx = error['type'], error.get('ctx', {})
    if kind == 'greater_than_equal':
        return f'debe ser mayor o igual que {ctx.get("ge"):g}'
    if kind == 'less_than_equal':
        return f'debe ser menor o igual que {ctx.get("le"):g}'
    if kind in ('float_parsing', 'float_type', 'finite_number'):
        return 'debe ser un número'
    if kind == 'string_pattern_mismatch':
        return 'solo admite letras, números, guion y guion bajo'
    if kind in ('string_too_short', 'missing'):
        return 'es obligatorio'
    if kind == 'string_too_long':
        return f'máximo {ctx.get("max_length")} caracteres'
    return error['msg'].removeprefix('Value error, ')

def create_app(db_url=None):
    RUNTIME.mkdir(parents=True, exist_ok=True)
    store = Store(db_url or os.getenv('DATABASE_URL') or f'sqlite:///{(RUNTIME / "churn.db").as_posix()}')
    model = NeuralModel()
    supervisor = SupervisorAgent(model,configured_provider(),store)
    app = FastAPI(title='ChurnTrackAI',version='2.2.0',docs_url=None,redoc_url=None,openapi_url=None)
    app.add_middleware(BodyLimit)
    app.state.store, app.state.supervisor = store, supervisor
    app.state.calls = []
    app.state.simulations = []
    app.state.slots = asyncio.Semaphore(2)
    app.state.professor_lock = asyncio.Lock()
    app.state.professor_cache = None

    async def authorized(request:Request):
        expected = os.getenv('APP_API_KEY','')
        supplied = request.headers.get('authorization','').removeprefix('Bearer ')
        if not expected or not secrets.compare_digest(supplied.encode(),expected.encode()):
            raise HTTPException(401,'Ingresa una clave de acceso válida en Configuración.')

    @app.middleware('http')
    async def security(request,call_next):
        if request.method == 'POST' and request.url.path == '/api/public/simulate':
            # Pure in-memory inference (no LLM, no storage): separate, higher limit for interactive sliders.
            now = time.monotonic()
            app.state.simulations = [t for t in app.state.simulations if now-t < 60]
            if len(app.state.simulations) >= 240:
                return JSONResponse({'detail':'Demasiadas simulaciones. Espera un momento.'},429)
            app.state.simulations.append(now)
        elif request.method == 'POST':
            now = time.monotonic()
            app.state.calls = [t for t in app.state.calls if now-t < 60]
            if len(app.state.calls) >= 30:
                return JSONResponse({'detail':'Límite global de 30 operaciones por minuto. Intenta luego.'},429)
            app.state.calls.append(now)
        response = await call_next(request)
        response.headers.update({'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",'Cache-Control':'no-store'})
        return response

    @app.exception_handler(RequestValidationError)
    async def invalid(request,exc):
        return JSONResponse({'detail':[{'loc':list(e['loc']),'msg':e['msg']} for e in exc.errors()]},422)

    @app.get('/health')
    def health():
        try:
            with store.engine.connect() as db:
                from sqlalchemy import text
                db.execute(text('SELECT 1'))
            return {'status':'ok','model':'loaded','database':'ok','version':'2.2.0'}
        except Exception:
            return JSONResponse({'status':'degraded','database':'unavailable'},503)

    @app.get('/api/config')
    def config():
        return {'agents':['supervisor','predictivo','retencion','estratega'],'hosting':'vercel' if os.getenv('VERCEL') else 'render' if os.getenv('RENDER') else 'local',
                'llm_provider':getattr(supervisor.retention.provider,'name','unknown'),'llm_configured':bool(supervisor.retention.provider.key),'llm_model':supervisor.retention.provider.model,'access_configured':bool(os.getenv('APP_API_KEY')),'max_customers':300,'max_llm_customers':llm_batch(),'demo_sizes':[24,300],'actions':ACTIONS,'persistence':'postgresql' if store.engine.dialect.name == 'postgresql' else 'sqlite','hosting_ephemeral':bool(os.getenv('RENDER') or os.getenv('VERCEL')) and store.engine.dialect.name=='sqlite','model_sha256':model.digest,'disclaimer':'Modelo académico con datos sintéticos. Probabilidades no calibradas para empresas reales. Factores por sustitución a la media; no implican causalidad.'}

    @app.get('/api/metrics')
    def metrics():
        path = ROOT / 'models/evaluation.json'
        return json.loads(path.read_text(encoding='utf-8')) if path.exists() else {'status':'pending','reason':'Evaluación pendiente'}

    @app.get('/api/session',dependencies=[Depends(authorized)])
    def session():
        return {'authenticated':True,'llm_configured':bool(supervisor.retention.provider.key)}

    @app.post('/api/llm/check',dependencies=[Depends(authorized)])
    async def check_llm():
        provider = supervisor.retention.provider
        if not provider.key:
            return {'available':False,'message':explain_error('LLM_NOT_CONFIGURED')}
        if not store.reserve_call(int(os.getenv('LLM_DAILY_LIMIT','50'))):
            return {'available':False,'message':'Límite diario de llamadas alcanzado.'}
        try:
            response, usage = await provider.choose([{'index':0,'probability':0.1,'risk':'BAJO','observed':{'dias_ultima_compra':5},'allowed_actions':['monitor']}])
            if len(response.choices)!=1 or response.choices[0].action!='monitor' or response.choices[0].index!=0 or response.choices[0].evidence!=['probability']:
                raise ProviderError('UNSUPPORTED_RECOMMENDATION')
            return {'available':True,'message':'El LLM respondió y su salida fue validada.','model':provider.model,'usage':usage}
        except ProviderError as exc:
            return {'available':False,'message':explain_error(str(exc)),'code':str(exc),'model':provider.model}

    async def execute(payload,persist=True,demo=False):
        if app.state.slots.locked():
            raise HTTPException(429,'Dos análisis en curso. Intenta nuevamente.')
        async with app.state.slots:
            return await supervisor.run(payload,persist=persist,demo=demo)

    def demo_customers(size):
        if size not in (12,24,300):
            raise HTTPException(422,'La demostración admite 12, 24 o 300 clientes sintéticos.')
        if size == 12:
            return json.loads((ROOT/'data/demo.json').read_text(encoding='utf-8'))
        name = 'demo-24.csv' if size == 24 else 'example-300.csv'
        with (ROOT/'data'/name).open(encoding='utf-8') as source:
            return list(csv.DictReader(source))

    @app.post('/api/demo')
    async def demo(size:int=12):
        return await execute(AnalysisRequest(customers=demo_customers(size)),persist=False,demo=True)

    @app.post('/api/public/analyze-stream')
    async def analyze_stream(request:Request, demo:int|None=None, use_llm:bool=False, consent:bool=False):
        # Same validation and budgets as the public analysis; agent messages are streamed as NDJSON while they happen.
        if demo is not None:
            payload = AnalysisRequest(customers=demo_customers(demo),use_llm=use_llm,consent_external_processing=consent)
        elif request.headers.get('content-type','').startswith('text/csv'):
            payload = await parse_csv(request,use_llm,consent)
        else:
            try:
                payload = AnalysisRequest.model_validate_json(await request.body())
            except ValidationError as exc:
                raise HTTPException(422,[{'loc':list(e['loc']),'msg':e['msg']} for e in exc.errors()]) from None
        if app.state.slots.locked():
            raise HTTPException(429,'Dos análisis en curso. Intenta nuevamente.')
        limited = payload.use_llm and not store.reserve_public_demo(int(os.getenv('PUBLIC_LLM_DAILY_LIMIT','10')))
        if limited:
            payload = payload.model_copy(update={'use_llm':False})
        queue = asyncio.Queue()
        async def produce():
            async with app.state.slots:
                try:
                    run = await supervisor.run(payload,persist=False,demo=demo is not None,listener=queue.put_nowait)
                    if limited:
                        run['warnings'].append('Cuota pública LLM agotada. Cada cliente recibió análisis neuronal y recomendación por reglas.')
                    queue.put_nowait({'type':'result','run':run})
                except Exception:
                    queue.put_nowait({'type':'error','detail':'El análisis no pudo completarse.'})
        app.state.stream_task = asyncio.create_task(produce())
        async def events():
            yield json.dumps({'type':'start','customers':len(payload.customers),'use_llm':payload.use_llm,'llm_batch':llm_batch()})+chr(10)
            while True:
                event = await queue.get()
                yield json.dumps(event,ensure_ascii=False)+chr(10)
                if event['type'] in ('result','error'):
                    break
        return StreamingResponse(events(),media_type='application/x-ndjson',headers={'X-Accel-Buffering':'no'})

    @app.post('/api/demo/llm')
    @app.post('/api/demo/gemini')
    async def professor_demo(request:Request):
        # Public access is restricted to a server-owned synthetic fixture.
        # No uploaded body, identifiers, prompts or private run IDs are accepted.
        if await request.body() or request.query_params:
            raise HTTPException(422,'Este recorrido utiliza únicamente los ejemplos sintéticos del servidor.')
        if app.state.professor_lock.locked():
            raise HTTPException(429,'Hay una demostración en curso. Espera unos segundos y vuelve a intentarlo.')
        async with app.state.professor_lock:
            cached = app.state.professor_cache
            if cached and time.monotonic()-cached[0] < 600:
                result = copy.deepcopy(cached[1])
                result['public_demo']['cached'] = True
                return result
            customers = json.loads((ROOT/'data/demo.json').read_text(encoding='utf-8'))
            chosen = []
            for risk in ('ALTO','MEDIO','BAJO'):
                row = next((row for row in customers if model.predict(Customer.model_validate(row)).risk==risk),None)
                if row: chosen.append(row)
            if app.state.slots.locked():
                raise HTTPException(429,'El sistema está ocupado. Intenta nuevamente en unos segundos.')
            permitted = bool(supervisor.retention.provider.key) and store.reserve_public_demo(5)
            result = await execute(AnalysisRequest(customers=chosen,use_llm=permitted,consent_external_processing=permitted),persist=False,demo=True)
            result['public_demo'] = {'kind':'professor','cached':False,'cache_seconds':600,'daily_limit':5,'data':'fixed_synthetic','llm_permitted':permitted}
            if not permitted:
                result['warnings'].append('La prueba pública del LLM no está disponible: falta configuración o se alcanzó el límite de cinco demostraciones nuevas por día. Puedes recorrer los agentes con reglas.')
            app.state.professor_cache = (time.monotonic(),copy.deepcopy(result))
            return result

    @app.post('/api/public/simulate')
    def simulate_customer(customer:Customer):
        # What-if sandbox: same network and levers the retention agent uses; nothing is stored or sent out.
        p = model.predict(customer)
        return {'prediction':p.model_dump(),
                'levers':{action:simulate(model,p,action) for action in LEVERS},
                'allowed_actions':allowed(p)}

    @app.post('/api/public/analyze')
    async def public_analyze(payload:AnalysisRequest):
        return await execute_public(payload)

    async def execute_public(payload):
        # Only validated numeric indicators are accepted; never arbitrary prompts.
        limited = payload.use_llm and not store.reserve_public_demo(int(os.getenv('PUBLIC_LLM_DAILY_LIMIT','10')))
        if limited:
            payload = payload.model_copy(update={'use_llm':False})
        result = await execute(payload,persist=False)
        if limited:
            result['warnings'].append('Cuota pública LLM agotada. Cada cliente recibió análisis neuronal y recomendación por reglas.')
        return result

    @app.post('/api/analyze',dependencies=[Depends(authorized)])
    async def analyze(payload:AnalysisRequest):
        return await execute(payload)

    async def parse_csv(request:Request,use_llm:bool=False,consent:bool=False):
        try:
            body = (await request.body()).decode('utf-8-sig')
            delimiter = ';' if ';' in body.splitlines()[0] else ','
            reader = csv.DictReader(io.StringIO(body),delimiter=delimiter,strict=True)
            required = {'cliente_id',*FEATURES}
            if not reader.fieldnames or len(reader.fieldnames)!=len(set(reader.fieldnames)) or set(reader.fieldnames)!=required:
                raise ValueError('El CSV debe contener exactamente cliente_id y las seis variables; sin columnas duplicadas.')
            rows, problems = [], []
            for i,row in enumerate(reader):
                if i >= 300:
                    raise ValueError('Máximo 300 filas')
                if None in row or any(v is None for v in row.values()):
                    raise ValueError(f'Fila {i+2}: número de columnas inválido')
                try:
                    rows.append(Customer.model_validate({k:(v.replace(',','.') if delimiter==';' and k!='cliente_id' else v) for k,v in row.items()}))
                except ValidationError as exc:
                    # Report every bad cell with its spreadsheet row, so the file can be fixed in one pass.
                    problems += [f'Fila {i+2}, {".".join(map(str,e["loc"])) or "registro"}: {readable(e)}' for e in exc.errors()]
            if problems:
                raise ValueError(' · '.join(problems[:8])+(f' · y {len(problems)-8} errores más' if len(problems) > 8 else ''))
            if len({c.cliente_id for c in rows}) != len(rows):
                raise ValueError('Hay códigos de cliente repetidos: cada cliente_id debe ser único.')
            if not rows:
                raise ValueError('El archivo no tiene filas de clientes.')
            payload = AnalysisRequest(customers=rows,use_llm=use_llm,consent_external_processing=consent)
        except (UnicodeError,csv.Error,ValueError,IndexError) as exc:
            if isinstance(exc,ValidationError):
                detail = '; '.join(f'{".".join(map(str,e["loc"]))}: {e["msg"]}' for e in exc.errors())
            else:
                detail = str(exc)
            raise HTTPException(422,detail) from None
        return payload

    @app.post('/api/analyze-csv',dependencies=[Depends(authorized)])
    async def analyze_csv(request:Request,use_llm:bool=False,consent:bool=False):
        return await execute(await parse_csv(request,use_llm,consent))

    @app.post('/api/public/analyze-csv')
    async def public_csv(request:Request,use_llm:bool=False,consent:bool=False):
        if set(request.query_params)-{'use_llm','consent'}:
            raise HTTPException(422,'Opciones permitidas: use_llm y consent. El análisis público no se guarda.')
        return await execute_public(await parse_csv(request,use_llm,consent))

    @app.post('/api/public/validate-csv')
    async def validate_csv(request:Request):
        payload = await parse_csv(request)
        return {'valid':True,'count':len(payload.customers),
                'preview':[c.model_dump() for c in payload.customers[:5]],
                'llm_called':False,'persisted':False}

    @app.get('/api/runs',dependencies=[Depends(authorized)])
    def runs():
        return store.list()

    def find(id):
        run = store.get(id)
        if not run:
            raise HTTPException(404,'Ejecución no encontrada')
        return run

    @app.get('/api/runs/{id}',dependencies=[Depends(authorized)])
    def run(id:str):
        return find(id)

    @app.post('/api/runs/{id}/decisions/{customer}',dependencies=[Depends(authorized)])
    def decision(id:str,customer:str,payload:Decision):
        run = find(id)
        if run['status']!='completed' or not any(r['cliente_id']==customer for r in run['recommendations']):
            raise HTTPException(404,'Recomendación no encontrada')
        try:
            store.decide(id,customer,payload.decision)
        except IntegrityError:
            raise HTTPException(409,'La decisión ya fue registrada') from None
        return {'decision':payload.decision,'external_action_executed':False}

    @app.post('/api/runs/{id}/approve-pending',dependencies=[Depends(authorized)])
    def approve_pending(id:str):
        run = find(id)
        if run['status'] != 'completed':
            raise HTTPException(409,'El informe no está validado.')
        count = store.approve_pending(id,[r['cliente_id'] for r in run['recommendations'] if r['decision']=='pending' and r.get('supervisor_review',{}).get('action')!='request_review'])
        return {'approved_count':count,'external_action_executed':False}

    @app.get('/api/template.csv')
    def template():
        return FileResponse(ROOT/'data/template.csv',media_type='text/csv',filename='plantilla_clientes.csv')

    @app.get('/api/example-24.csv')
    def example_24():
        return FileResponse(ROOT/'data/demo-24.csv',media_type='text/csv',filename='cartera_24_clientes_sinteticos.csv')

    @app.get('/api/example-300.csv')
    def example_300():
        return FileResponse(ROOT/'data/example-300.csv',media_type='text/csv',filename='ejemplo_300_clientes_sinteticos.csv')

    @app.get('/')
    def index():
        return FileResponse(ROOT/'frontend/index.html')
    app.mount('/assets',StaticFiles(directory=ROOT/'frontend'),name='assets')
    return app

app = create_app()

