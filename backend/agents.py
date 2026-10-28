import asyncio
import json
import os
import re
import time
import uuid
from datetime import datetime, timezone
from pydantic import BaseModel, Field, ValidationError
from .schemas import AnalysisRequest, Message, Prediction, Recommendation, LLMResponse, ExecutiveSummary
from .llm import ProviderError, explain_error
from .analytics import portfolio

def now():
    return datetime.now(timezone.utc).isoformat()

ACTIONS = {
    'contact': ('Programar contacto preventivo', ['probability']),
    'monitor': ('Mantener seguimiento comercial', ['probability']),
    'reactivate': ('Consultar necesidades y proponer reactivación', ['dias_ultima_compra']),
    'claims': ('Revisar los reclamos registrados con el ejecutivo', ['reclamos']),
    'payments': ('Revisar pagos atrasados y evaluar alternativas', ['pagos_atrasados']),
    'review_data': ('Validar datos fuera del dominio antes de actuar', ['probability']),
}

PLANS = {
    'contact': ('Ejecutivo comercial', ['Revisar el historial de compras y contacto.', 'Consultar necesidades y registrar la respuesta del cliente.'], 'Contacto registrado y siguiente paso acordado.'),
    'monitor': ('Analista comercial', ['Revisar indicadores en el siguiente corte.', 'Comparar la frecuencia de compra con su historial.'], 'Nueva revisión registrada; no asumir retención lograda.'),
    'reactivate': ('Ejecutivo comercial', ['Comprobar la fecha de la última compra.', 'Consultar si existen necesidades pendientes sin asumir el motivo de la inactividad.'], 'Respuesta del cliente y oportunidad confirmada, si corresponde.'),
    'claims': ('Atención al cliente', ['Revisar el estado y detalle de los reclamos.', 'Acordar un responsable y verificar la resolución con el cliente.'], 'Estado de cada reclamo actualizado y validado.'),
    'payments': ('Cobranza y ejecutivo comercial', ['Validar vencimientos y posibles errores de registro.', 'Conversar sobre alternativas autorizadas por la empresa.'], 'Situación de pagos verificada y acuerdo documentado, si existe.'),
    'review_data': ('Responsable de datos', ['Contrastar los valores con la fuente original.', 'Corregir errores o validar un modelo adecuado antes de decidir.'], 'Datos validados; no actuar basándose en una extrapolación.'),
}

# Measurable lever behind each action: the indicator state if the action succeeds.
LEVERS = {
    'claims': ({'reclamos': 0}, 'Reclamos resueltos (0 pendientes)'),
    'payments': ({'pagos_atrasados': 0}, 'Pagos regularizados (0 atrasados)'),
    'reactivate': ({'dias_ultima_compra': 15}, 'Compra reciente (15 días)'),
}

def simulate(model, p, action):
    """What-if tool: re-run the network with the lever resolved. Sensitivity, not causality."""
    lever = LEVERS.get(action)
    if not lever or p.warnings or model is None:
        return None
    changes = {key: min(value, p.observed[key]) for key, value in lever[0].items()}
    after = model.what_if(p.observed, changes)
    return {'scenario': lever[1], 'changes': changes, 'probability_after': after,
            'risk_reduction': p.probability-after, 'revenue_protected_monthly': (p.probability-after)*p.monthly_revenue}

def impacts(model, p):
    return {a: round(sim['risk_reduction'], 4) for a in allowed(p) if (sim := simulate(model, p, a))}

def rule_action(p, measured=None):
    options = allowed(p)
    if p.warnings or p.risk == 'BAJO':
        return options[0]
    if measured:
        best = max(measured, key=measured.get)
        if measured[best] >= 0.05:
            return best
    feature_action = {'dias_ultima_compra':'reactivate','reclamos':'claims','pagos_atrasados':'payments'}
    for factor in p.factors:
        action = feature_action.get(factor.feature)
        if factor.delta_probability > 0 and action in options:
            return action
    return options[0]

def allowed(p):
    if p.warnings:
        return ['review_data']
    choices = ['monitor'] if p.risk == 'BAJO' else ['contact']
    if p.observed['dias_ultima_compra'] >= 60:
        choices.append('reactivate')
    if p.observed['reclamos'] >= 3:
        choices.append('claims')
    if p.observed['pagos_atrasados'] >= 2:
        choices.append('payments')
    return choices

class SharedState(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created: str = Field(default_factory=now)
    status: str = 'running'
    predictions: list[Prediction] = Field(default_factory=list)
    recommendations: list[Recommendation] = Field(default_factory=list)
    trace: list[Message] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    usage: list[dict] = Field(default_factory=list)
    llm_attempts: list[dict] = Field(default_factory=list)
    mode: str = 'rules'
    agent_llm: dict = Field(default_factory=dict)
    executive: dict | None = None

    def send(self, sender, recipient, tool, payload, status='ok'):
        if len(self.trace) >= 32:
            raise RuntimeError('MAX_STEPS')
        self.trace.append(Message(sequence=len(self.trace)+1, timestamp=now(), sender=sender, recipient=recipient, tool=tool, status=status, payload=payload))

async def review_stage(stage, request, state, provider, store):
    report = {'status':'not_called','checked_indices':[],'choices':[]}
    state.agent_llm[stage] = report
    if not request.use_llm or not provider.key or not hasattr(provider,'review'):
        report['reason'] = 'Sin solicitud, configuración o herramienta de revisión LLM.'
        return
    if not store.reserve_call(int(os.getenv('LLM_DAILY_LIMIT','50'))):
        report['reason'] = 'Presupuesto diario agotado.'
        state.warnings.append(f'{stage}: sin cuota LLM; se conservan controles deterministas.')
        return
    indices = sorted(range(len(state.predictions)),key=lambda i:-state.predictions[i].probability)[:20]
    payload = []
    for i in indices:
        p = state.predictions[i]
        options = (['review_data'] if p.warnings else ['interpret_risk']) if stage=='predictivo' else ['approve_plan','request_review']
        row = {'index':i,'probability':p.probability,'risk':p.risk,'observed':p.observed,'allowed_actions':options}
        if stage=='supervisor':
            rec = state.recommendations[i]
            row['proposal'] = {'action':rec.action,'evidence':rec.evidence,'steps':rec.steps}
        payload.append(row)
    state.send(stage,'llm',stage+'_llm_request',{'input':payload,'identifiers_removed':True})
    start = time.perf_counter()
    try:
        response, usage = await provider.review(payload,stage)
        response = LLMResponse.model_validate(response.model_dump())
        state.usage.append({**usage,'agent':stage})
        if sorted(c.index for c in response.choices)!=sorted(indices):
            raise ProviderError('INCOMPLETE_CHOICES')
        by_index={r['index']:r for r in payload}
        for c in response.choices:
            if c.action not in by_index[c.index]['allowed_actions'] or not set(c.evidence).issubset({*state.predictions[c.index].observed,'probability'}):
                raise ProviderError('UNSUPPORTED_RECOMMENDATION')
        report.update(status='validated',checked_indices=indices,choices=[c.model_dump() for c in response.choices],usage=usage)
        state.send('llm',stage,stage+'_llm_result',response.model_dump())
        state.llm_attempts.append({'agent':stage,'attempt':1,'status':'validated','elapsed_ms':round((time.perf_counter()-start)*1000,2)})
        if stage=='supervisor' and any(c.action=='request_review' for c in response.choices):
            state.warnings.append('El supervisor LLM solicita revisión humana adicional para algunas propuestas; consulta sus observaciones antes de aceptar.')
    except ProviderError as exc:
        report.update(status='failed',reason=explain_error(str(exc)))
        state.send('llm',stage,stage+'_llm_result',{'error':str(exc)},'error')
        state.llm_attempts.append({'agent':stage,'attempt':1,'status':'failed','code':str(exc),'elapsed_ms':round((time.perf_counter()-start)*1000,2)})
        state.warnings.append(stage+': '+explain_error(str(exc)))

class PredictiveAgent:
    def __init__(self, model):
        self.model = model

    def execute(self, request, state):
        # Validation is repeated at the agent boundary, not delegated to the UI.
        request = AnalysisRequest.model_validate(request.model_dump())
        state.predictions = [self.model.predict(c) for c in request.customers]
        state.send('predictivo','supervisor','neural_inference_and_mean_ablation', {'model_sha256':self.model.digest,'outputs':[{'index':i,'probability':p.probability,'risk':p.risk,'factors':[f.model_dump() for f in p.factors[:3]],'out_of_domain':bool(p.warnings)} for i,p in enumerate(state.predictions)]})

class RetentionAgent:
    def __init__(self, provider, store, model=None):
        self.provider, self.store, self.model = provider, store, model

    def materialize(self, p, action, source, evidence=None):
        evidence = evidence or ACTIONS[action][1]
        facts = {**p.observed, 'probability':round(p.probability,6)}
        reason = '; '.join(f'{key} = {facts[key]}' for key in evidence)
        owner, steps, check = PLANS[action]
        timeframe = 'Antes de actuar' if p.warnings else {'ALTO':'Propuesta: en 48 horas','MEDIO':'Propuesta: esta semana','BAJO':'Propuesta: próximo corte mensual'}[p.risk]
        return Recommendation(cliente_id=p.cliente_id, action=action, evidence=evidence, rationale=f'{ACTIONS[action][0]}. Evidencia: {reason}. Validar el contexto con una persona.', priority={'ALTO':'URGENTE','MEDIO':'ATENCION','BAJO':'NORMAL'}[p.risk], source=source, owner=owner, steps=steps, timeframe=timeframe, success_check=check, simulation=simulate(self.model, p, action))

    async def execute(self, request, state, correction=False):
        selections = None
        if request.use_llm and not correction:
            candidates = sorted(range(len(state.predictions)), key=lambda i: -state.predictions[i].probability)[:20]
            payload = [{'index':i,'probability':p.probability,'risk':p.risk,'observed':p.observed,'allowed_actions':allowed(p),'action_impacts':impacts(self.model,p)} for i in candidates for p in [state.predictions[i]]]
            if len(state.predictions) > 20:
                state.warnings.append('El LLM se solicita para los 20 clientes de mayor probabilidad; los restantes utilizan reglas explícitas.')
            interpretation={c['index']:c for c in state.agent_llm.get('predictivo',{}).get('choices',[])}
            for row in payload:
                if row['index'] in interpretation: row['predictive_review']=interpretation[row['index']]
            state.send('retencion','llm','structured_selection_request', {'input':payload, 'identifiers_removed':True})
            for attempt in range(2):
                if not self.provider.key:
                    state.warnings.append('LLM no configurado. Se aplicaron reglas explícitas, sin generación LLM.')
                    state.send('retencion','supervisor','llm_unavailable', {'reason':'LLM_NOT_CONFIGURED'},'error')
                    break
                if not self.store.reserve_call(int(os.getenv('LLM_DAILY_LIMIT','50'))):
                    state.warnings.append('Límite diario LLM alcanzado; se aplicaron reglas.')
                    state.send('retencion','supervisor','daily_budget', {'limit_reached':True},'error')
                    break
                try:
                    attempt_start = time.perf_counter()
                    response, usage = await self.provider.choose(payload)
                    response = LLMResponse.model_validate(response.model_dump())
                    state.usage.append({**usage,'agent':'retencion'})
                    ids = [c.index for c in response.choices]
                    if sorted(ids) != sorted(candidates):
                        raise ProviderError('INCOMPLETE_CHOICES')
                    selections = {c.index:c for c in response.choices}
                    for i, choice in selections.items():
                        p = state.predictions[i]
                        if choice.action not in allowed(p) or not set(choice.evidence).issubset({*p.observed,'probability'}) or not set(ACTIONS[choice.action][1]).issubset(choice.evidence):
                            raise ProviderError('UNSUPPORTED_RECOMMENDATION')
                    state.send('llm','retencion','validated_json',response.model_dump())
                    state.llm_attempts.append({'agent':'retencion','attempt':attempt+1,'status':'validated','elapsed_ms':round((time.perf_counter()-attempt_start)*1000,2)})
                    state.mode = 'mixed' if len(state.predictions) > 20 else 'llm'
                    break
                except ProviderError as exc:
                    selections = None
                    state.llm_attempts.append({'agent':'retencion','attempt':attempt+1,'status':'failed','code':str(exc),'elapsed_ms':round((time.perf_counter()-attempt_start)*1000,2)})
                    state.send('llm','retencion','provider_call', {'attempt':attempt+1,'error':str(exc)},'retry' if attempt == 0 else 'error')
                    if attempt == 1 or any(x in str(exc) for x in ('HTTP_400','HTTP_401','HTTP_403','HTTP_404','HTTP_429')):
                        state.warnings.append(explain_error(str(exc)))
                        break
                    await asyncio.sleep(0.5)
            if selections is None:
                state.warnings.append('Proveedor LLM falló o devolvió evidencia inválida; se aplicaron reglas.')
        recs = []
        for i, p in enumerate(state.predictions):
            if selections and i in selections:
                choice = selections[i]
                recs.append(self.materialize(p,choice.action,'llm',choice.evidence))
            else:
                recs.append(self.materialize(p, rule_action(p, impacts(self.model, p)), 'rules'))
        state.recommendations = recs
        state.send('retencion','supervisor','recommendations', {'source':state.mode,'outputs':[{'index':i,'action':r.action,'evidence':r.evidence,'priority':r.priority} for i,r in enumerate(recs)], 'correction':correction})

class SupervisorAgent:
    def __init__(self, model, provider, store):
        self.predictive = PredictiveAgent(model)
        self.retention = RetentionAgent(provider,store,model)
        self.strategist = StrategistAgent(store)
        self.model, self.store = model, store

    def validate(self, state):
        if len(state.predictions) != len(state.recommendations):
            return False
        for p,r in zip(state.predictions,state.recommendations):
            if r.cliente_id != p.cliente_id or r.action not in allowed(p) or r.priority != {'ALTO':'URGENTE','MEDIO':'ATENCION','BAJO':'NORMAL'}[p.risk] or r.decision != 'pending':
                return False
            if not set(ACTIONS[r.action][1]).issubset(r.evidence) or not set(r.evidence).issubset({*p.observed,'probability'}):
                return False
            if (r.owner, r.steps, r.success_check) != PLANS[r.action]:
                return False
            # The supervisor re-runs the what-if tool instead of trusting the retention output.
            expected = simulate(self.model, p, r.action)
            if (expected is None) != (r.simulation is None) or (expected and abs(expected['probability_after']-r.simulation['probability_after']) > 1e-9):
                return False
        return True

    async def run(self, request, persist=True, demo=False):
        state = SharedState()
        start = time.perf_counter()
        async def workflow():
            state.send('usuario','supervisor','analysis_request', {'customer_count':len(request.customers),'requested_llm':request.use_llm,'demo':demo})
            state.send('supervisor','predictivo','delegate_prediction',{'task':'validate, infer, explain'},'delegated')
            self.predictive.execute(request,state)
            await review_stage('predictivo',request,state,self.retention.provider,self.store)
            state.send('supervisor','retencion','delegate_retention',{'prediction_message':3,'task':'select grounded actions'},'delegated')
            await self.retention.execute(request,state)
            if not self.validate(state):
                state.send('supervisor','retencion','request_correction',{'reason':'inconsistent_recommendations'},'retry')
                state.mode = 'rules'
                await self.retention.execute(request,state,correction=True)
            if not self.validate(state):
                raise RuntimeError('SUPERVISOR_REJECTED')
            await review_stage('supervisor',request,state,self.retention.provider,self.store)
            state.send('supervisor','estratega','delegate_executive_summary',{'task':'portfolio summary from verified aggregates'},'delegated')
            await self.strategist.execute(request,state,portfolio(state.predictions),self.retention.provider)
            state.send('supervisor','usuario','validated_report',{'approved_for_human_review':True,'external_actions_executed':0})
            state.status = 'completed'
        try:
            await asyncio.wait_for(workflow(), timeout=60)
        except (TimeoutError, RuntimeError) as exc:
            state.status = 'failed'
            state.warnings.append('Ejecución interrumpida: '+type(exc).__name__)
            if len(state.trace) < 32:
                state.send('supervisor','usuario','execution_failed', {'error':type(exc).__name__},'error')
        state.agent_llm['retencion'] = {'status':'validated' if any(r.source=='llm' for r in state.recommendations) else 'failed' if any(a.get('agent')=='retencion' for a in state.llm_attempts) else 'not_called','checked_indices':[i for i,r in enumerate(state.recommendations) if r.source=='llm']}
        run = state.model_dump()
        successful = any(r.source=='llm' for r in state.recommendations)
        errors = [a['code'] for a in state.llm_attempts if a.get('code')]
        run['llm_report'] = {
            'requested':request.use_llm,
            'provider':getattr(self.retention.provider,'name','test-provider'),
            'model':getattr(self.retention.provider,'model','test-provider'),
            'api':getattr(self.retention.provider,'api','test-api'),
            'status':'validated' if successful else 'failed' if state.llm_attempts else 'not_called',
            'attempts':state.llm_attempts,
            'message':'El LLM respondió y su selección pasó los controles.' if successful else explain_error(errors[-1]) if errors else 'No se realizó una llamada al LLM. Revisa las advertencias si fue solicitado.',
            'usage':state.usage,
            'identifiers_sent':False,
            'selected_customers':sum(r.source=='llm' for r in state.recommendations),
        }
        for choice in state.agent_llm.get('supervisor',{}).get('choices',[]):
            run['recommendations'][choice['index']]['supervisor_review']=choice
        for choice in state.agent_llm.get('predictivo',{}).get('choices',[]):
            run['predictions'][choice['index']]['llm_interpretation']=choice
        run['analytics'] = portfolio(state.predictions)
        if run['analytics']:
            for row in run['predictions']:
                row['quadrant'] = run['analytics']['customer_quadrants'][row['cliente_id']]
        run['agent_report'] = {
            'predictive': {'count':len(state.predictions),'out_of_domain':sum(bool(p.warnings) for p in state.predictions)},
            'retention': {'llm_count':sum(r.source=='llm' for r in state.recommendations),'rules_count':sum(r.source=='rules' for r in state.recommendations),'actions':{action:sum(r.action==action for r in state.recommendations) for action in ACTIONS}},
            'supervisor': {'validated':state.status=='completed','checks':['Correspondencia de clientes','Acciones compatibles con indicadores','Evidencia verificable','Simulación what-if recalculada','Plan de seguimiento y revisión humana'],'corrections':sum(m.tool=='request_correction' for m in state.trace)},
            'strategist': {'source':(state.executive or {}).get('source','none'),'llm_status':state.agent_llm.get('estratega',{}).get('status','not_called')},
        }
        run['executive'] = state.executive
        run.update({'elapsed_ms':round((time.perf_counter()-start)*1000,2),'model_sha256':self.model.digest,'demo':demo,'ephemeral':not persist,'summary':{'customers':len(state.predictions),'high':sum(p.risk=='ALTO' for p in state.predictions),'medium':sum(p.risk=='MEDIO' for p in state.predictions),'low':sum(p.risk=='BAJO' for p in state.predictions)}})
        if persist:
            self.store.save(run)
        return run



NUMBER = re.compile(r'\d+(?:[.,]\d+)*')
FEATURE_NAMES = {'antiguedad':'antigüedad','compras_mensuales':'compras mensuales','monto_promedio':'monto promedio','reclamos':'reclamos','dias_ultima_compra':'días desde la última compra','pagos_atrasados':'pagos atrasados'}

def money(value):
    return f'S/ {value:,.0f}'

def executive_facts(analytics):
    """Verified aggregates handed to the strategist; every number it may cite comes from here."""
    seg = {s['risk']: s for s in analytics['segments']}
    quad = analytics['quadrants']
    return {
        'clientes': analytics['count'],
        'clientes_riesgo_alto': seg['ALTO']['count'],
        'porcentaje_riesgo_alto': f"{seg['ALTO']['share']*100:.0f}%",
        'clientes_riesgo_medio': seg['MEDIO']['count'],
        'ingreso_mensual_total': money(analytics['revenue']['monthly_total']),
        'ingreso_mensual_en_riesgo': money(analytics['revenue']['monthly_at_risk']),
        'porcentaje_ingreso_en_riesgo': f"{analytics['revenue']['share_at_risk']*100:.0f}%",
        'ingreso_anual_en_riesgo': money(analytics['revenue']['annual_at_risk']),
        'porcentaje_del_ingreso_en_riesgo_que_concentra_el_top20_de_clientes': f"{analytics['revenue']['top20_concentration']*100:.0f}%",
        'salud_promedio': analytics['health_score'],
        'cuadrante_rescatar': quad['rescatar']['count'],
        'ingreso_en_riesgo_rescatar': money(quad['rescatar']['revenue_at_risk']),
        'cuadrante_automatizar': quad['automatizar']['count'],
        'cuadrante_proteger': quad['proteger']['count'],
        'fuera_de_dominio': analytics['out_of_domain_count'],
        'variables_mas_sensibles': [FEATURE_NAMES[s['feature']] for s in analytics['sensitivities'][:2]],
        'clientes_prioritarios': [f"{t['cliente_id']} ({money(t['attention_score'])}/mes en riesgo)" for t in analytics['priorities'][:3]],
    }

def fact_sentences(f):
    return [
        f"Clientes analizados: {f['clientes']}.",
        f"Clientes con riesgo alto: {f['clientes_riesgo_alto']} ({f['porcentaje_riesgo_alto']} de los clientes). Clientes con riesgo medio: {f['clientes_riesgo_medio']}.",
        f"Ingreso mensual total de la cartera: {f['ingreso_mensual_total']}.",
        f"Ingreso mensual en riesgo: {f['ingreso_mensual_en_riesgo']} ({f['porcentaje_ingreso_en_riesgo']} del ingreso mensual total).",
        f"Ingreso en riesgo anualizado (12 meses): {f['ingreso_anual_en_riesgo']}.",
        f"El 20% de clientes con mayor ingreso en riesgo concentra el {f['porcentaje_del_ingreso_en_riesgo_que_concentra_el_top20_de_clientes']} del ingreso mensual en riesgo.",
        f"Salud promedio de la cartera: {f['salud_promedio']} sobre 100.",
        f"Segmento Rescatar (alto valor y en riesgo): {f['cuadrante_rescatar']} clientes, con {f['ingreso_en_riesgo_rescatar']} de ingreso mensual en riesgo.",
        f"Segmento Automatizar (menor valor y en riesgo): {f['cuadrante_automatizar']} clientes. Segmento Proteger (alto valor, estable): {f['cuadrante_proteger']} clientes.",
        f"Registros fuera del dominio del modelo: {f['fuera_de_dominio']}.",
        f"Variables con mayor sensibilidad en el modelo: {', '.join(f['variables_mas_sensibles']) or 'sin datos'}.",
    ]

def rule_summary(f):
    findings = [
        f"{f['clientes_riesgo_alto']} de {f['clientes']} clientes ({f['porcentaje_riesgo_alto']}) tienen riesgo alto de abandono.",
        f"El ingreso mensual en riesgo estimado es {f['ingreso_mensual_en_riesgo']} ({f['porcentaje_ingreso_en_riesgo']} del total); el 20% de clientes con más exposición concentra {f['porcentaje_del_ingreso_en_riesgo_que_concentra_el_top20_de_clientes']}.",
        f"{f['cuadrante_rescatar']} clientes combinan alto valor y riesgo: concentran {f['ingreso_en_riesgo_rescatar']} mensuales en riesgo.",
    ]
    first = ', '.join(c.split(' (')[0] for c in f['clientes_prioritarios'][:2])
    actions = [f"Asignar ejecutivo a los clientes del cuadrante Rescatar, empezando por {first or 'los de mayor exposición'}.",
               f"Atender con acciones escalables a los {f['cuadrante_automatizar']} clientes del cuadrante Automatizar.",
               f"Vigilar las variables más sensibles del modelo: {', '.join(f['variables_mas_sensibles']) or 'sin datos suficientes'}."]
    if f['fuera_de_dominio']:
        actions.append(f"Validar {f['fuera_de_dominio']} registros fuera del dominio del modelo antes de actuar.")
    return {'headline': f"{f['ingreso_mensual_en_riesgo']} de ingreso mensual en riesgo en {f['clientes']} clientes",
            'findings': findings, 'actions': actions[:4]}

def unsupported_numbers(summary, facts):
    """Numeric tokens in the draft that do not appear in the verified facts (small counts excepted)."""
    allowed_tokens = set(NUMBER.findall(json.dumps(facts, ensure_ascii=False))) | {str(i) for i in range(11)} | {'20'}
    text = ' '.join([summary['headline'], *summary['findings'], *summary['actions']])
    return sorted({t for t in NUMBER.findall(text) if t not in allowed_tokens})

class StrategistAgent:
    """Fourth agent: turns verified aggregates into an executive brief; numbers are checked against the facts."""
    def __init__(self, store):
        self.store = store

    async def execute(self, request, state, analytics, provider):
        if not analytics:
            return
        facts = executive_facts(analytics)
        summary = {**rule_summary(facts), 'source': 'rules', 'facts': facts}
        report = {'status': 'not_called'}
        state.agent_llm['estratega'] = report
        if request.use_llm and provider.key and hasattr(provider, 'narrate'):
            if not self.store.reserve_call(int(os.getenv('LLM_DAILY_LIMIT','50'))):
                report['reason'] = 'Presupuesto diario agotado.'
            else:
                # Only aggregates are shared: customer codes stay out of the provider request.
                # Self-describing sentences: each figure travels with its meaning, so it is not re-labelled.
                shared = {'hechos_verificados': fact_sentences(facts)}
                state.send('estratega','llm','executive_summary_request',{'facts':shared,'identifiers_removed':True})
                start = time.perf_counter()
                try:
                    result, usage = await provider.narrate(shared)
                    draft = ExecutiveSummary.model_validate(result).model_dump()
                    if unsupported_numbers(draft, shared):
                        raise ProviderError('UNVERIFIED_NUMBERS')
                    summary = {**draft, 'source': 'llm', 'facts': facts}
                    state.usage.append({**usage,'agent':'estratega'})
                    report.update(status='validated', usage=usage)
                    state.send('llm','estratega','executive_summary_result',{'validated':True,'numbers_checked':True})
                    state.llm_attempts.append({'agent':'estratega','attempt':1,'status':'validated','elapsed_ms':round((time.perf_counter()-start)*1000,2)})
                except (ProviderError, ValidationError) as exc:
                    code = str(exc) if isinstance(exc, ProviderError) else 'INVALID_SUMMARY'
                    report.update(status='failed', reason=explain_error(code))
                    state.send('llm','estratega','executive_summary_result',{'error':code},'error')
                    state.llm_attempts.append({'agent':'estratega','attempt':1,'status':'failed','code':code,'elapsed_ms':round((time.perf_counter()-start)*1000,2)})
                    state.warnings.append('estratega: '+(explain_error(code) if code not in ('UNVERIFIED_NUMBERS','INVALID_SUMMARY') else 'el resumen LLM citó cifras no verificadas')+' Se muestra el resumen por reglas.')
        state.executive = summary
        state.send('estratega','supervisor','executive_summary',{'source':summary['source'],'headline':summary['headline']})
