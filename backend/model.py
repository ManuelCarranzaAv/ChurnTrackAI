"""Faithful inference of the supplied 6–32–16–8–1 Dense network."""
import hashlib
import json
import math
from pathlib import Path
from .schemas import FEATURES, RANGES, Customer, Factor, Prediction

ROOT = Path(__file__).resolve().parents[1]

class NeuralModel:
    def __init__(self, path=None):
        raw = Path(path or ROOT / 'models/network.json').read_bytes()
        self.digest = hashlib.sha256(raw).hexdigest()
        self.data = json.loads(raw)
        expected = [6, 32, 16, 8, 1]
        if len(self.data['layers']) != 4 or len(self.data['mean']) != 6 or len(self.data['scale']) != 6:
            raise ValueError('Artefacto incompleto')
        if not all(math.isfinite(x) and x > 0 for x in self.data['scale']):
            raise ValueError('Escala inválida')
        for i, layer in enumerate(self.data['layers']):
            if len(layer['kernel']) != expected[i] or len(layer['bias']) != expected[i+1] or any(len(row) != expected[i+1] for row in layer['kernel']):
                raise ValueError('Dimensiones inválidas')
            if not all(math.isfinite(x) for row in layer['kernel'] for x in row) or not all(math.isfinite(x) for x in layer['bias']):
                raise ValueError('Pesos no finitos')

    def probability(self, values):
        if len(values) != 6 or not all(math.isfinite(x) for x in values):
            raise ValueError('Se requieren seis valores finitos')
        x = [(v-m)/s for v,m,s in zip(values, self.data['mean'], self.data['scale'])]
        for idx, layer in enumerate(self.data['layers']):
            out = []
            for j, bias in enumerate(layer['bias']):
                value = bias
                for i in range(len(x)):
                    value += x[i] * layer['kernel'][i][j]
                out.append(max(0.0, value) if idx < 3 else (1/(1+math.exp(-value)) if value >= 0 else math.exp(value)/(1+math.exp(value))))
            x = out
        return x[0]

    def predict(self, customer: Customer):
        values = [getattr(customer, f) for f in FEATURES]
        p = self.probability(values)
        factors = []
        for i, feature in enumerate(FEATURES):
            replaced = values.copy()
            replaced[i] = self.data['mean'][i]
            factors.append(Factor(feature=feature, value=values[i], delta_probability=p-self.probability(replaced)))
        warnings = [f'{f}: fuera del rango sintético del notebook [{lo}, {hi}]' for f,v,(lo,hi) in zip(FEATURES, values, RANGES) if not lo <= v <= hi]
        revenue = customer.compras_mensuales*customer.monto_promedio
        return Prediction(cliente_id=customer.cliente_id, probability=p, risk='ALTO' if p >= .7 else 'MEDIO' if p >= .4 else 'BAJO', factors=sorted(factors, key=lambda f: abs(f.delta_probability), reverse=True), warnings=warnings, observed=dict(zip(FEATURES, values)),
                          monthly_revenue=revenue, revenue_at_risk=p*revenue, health_score=round(100*(1-p)))

    def what_if(self, observed, changes):
        """Model response when some indicators change; a sensitivity, not a causal effect."""
        values = [changes.get(f, observed[f]) for f in FEATURES]
        return self.probability(values)
