from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator

FEATURES = ['antiguedad', 'compras_mensuales', 'monto_promedio', 'reclamos', 'dias_ultima_compra', 'pagos_atrasados']
RANGES = [(1, 60), (1, 15), (100, 4999), (0, 7), (1, 120), (0, 5)]

class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)

class Customer(StrictModel):
    cliente_id: str = Field(min_length=1, max_length=48, pattern=r'^[A-Za-z0-9_-]+$')
    antiguedad: float = Field(ge=0, le=1200)
    compras_mensuales: float = Field(ge=0, le=10000)
    monto_promedio: float = Field(ge=0, le=10000000)
    reclamos: float = Field(ge=0, le=10000)
    dias_ultima_compra: float = Field(ge=0, le=36500)
    pagos_atrasados: float = Field(ge=0, le=10000)

    @model_validator(mode='after')
    def counts(self):
        for name in FEATURES:
            if name != 'monto_promedio' and getattr(self, name) % 1:
                raise ValueError(f'{name} debe ser entero')
        return self

class AnalysisRequest(StrictModel):
    customers: list[Customer] = Field(min_length=1, max_length=300)
    use_llm: bool = False
    consent_external_processing: bool = False

    @model_validator(mode='after')
    def unique(self):
        if len({c.cliente_id for c in self.customers}) != len(self.customers):
            raise ValueError('Identificadores duplicados')
        if self.use_llm and not self.consent_external_processing:
            raise ValueError('Se requiere consentimiento para enviar indicadores al proveedor LLM')
        return self

class Factor(StrictModel):
    feature: str
    value: float
    delta_probability: float

class Prediction(StrictModel):
    cliente_id: str
    probability: float = Field(ge=0, le=1)
    risk: Literal['ALTO', 'MEDIO', 'BAJO']
    factors: list[Factor]
    warnings: list[str]
    observed: dict[str, float]
    monthly_revenue: float = 0
    revenue_at_risk: float = 0
    health_score: int = 0

class Recommendation(StrictModel):
    cliente_id: str
    action: str
    evidence: list[str]
    rationale: str
    priority: Literal['URGENTE', 'ATENCION', 'NORMAL']
    source: Literal['rules', 'llm']
    owner: str = ''
    timeframe: str = ''
    steps: list[str] = Field(default_factory=list)
    success_check: str = ''
    simulation: dict | None = None
    decision: Literal['pending', 'approved', 'rejected'] = 'pending'

class Message(StrictModel):
    sequence: int
    timestamp: str
    sender: str
    recipient: str
    tool: str
    status: Literal['ok', 'error', 'retry', 'delegated']
    payload: dict

class Decision(StrictModel):
    decision: Literal['approved', 'rejected']

class LLMChoice(StrictModel):
    index: int = Field(ge=0)
    action: str
    evidence: list[str] = Field(min_length=1, max_length=7)

class LLMResponse(StrictModel):
    choices: list[LLMChoice] = Field(min_length=1, max_length=20)

class ExecutiveSummary(StrictModel):
    headline: str = Field(min_length=10, max_length=180)
    findings: list[str] = Field(min_length=2, max_length=4)
    actions: list[str] = Field(min_length=2, max_length=4)
