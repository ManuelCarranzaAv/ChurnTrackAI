"""Descriptive portfolio analysis; no financial-loss or causal claims."""
from statistics import median
from .schemas import FEATURES


def portfolio(predictions):
    n = len(predictions)
    if not n:
        return None
    valid = [p for p in predictions if not p.warnings]
    segments = []
    for risk in ('ALTO', 'MEDIO', 'BAJO'):
        rows = [p for p in predictions if p.risk == risk]
        segments.append({'risk': risk, 'count': len(rows),
                         'share': len(rows)/n,
                         'mean_probability': sum(p.probability for p in rows)/len(rows) if rows else None,
                         'means': {f: sum(p.observed[f] for p in rows)/len(rows) if rows else None for f in FEATURES}})
    histogram = [0]*10
    for p in predictions:
        histogram[min(int(p.probability*10), 9)] += 1
    sensitivities = sorted([
        {'feature': f, 'mean_absolute_delta': sum(abs(next(x.delta_probability for x in p.factors if x.feature == f)) for p in valid)/len(valid)}
        for f in FEATURES
    ], key=lambda x: -x['mean_absolute_delta']) if valid else []
    priorities = sorted([
        {'cliente_id': p.cliente_id, 'risk': p.risk, 'probability': p.probability,
         'monthly_volume_proxy': p.observed['compras_mensuales']*p.observed['monto_promedio'],
         'attention_score': p.probability*p.observed['compras_mensuales']*p.observed['monto_promedio']}
        for p in valid if p.risk != 'BAJO'
    ], key=lambda x: -x['attention_score'])[:10]
    return {'count': n, 'mean_probability': sum(p.probability for p in predictions)/n,
            'median_probability': median(p.probability for p in predictions),
            'out_of_domain_count': n-len(valid), 'segments': segments, 'histogram': histogram,
            'sensitivities': sensitivities, 'priorities': priorities,
            'priority_definition': 'Probabilidad × compras mensuales × monto promedio. Índice orientativo en S/; no representa pérdida esperada ni ingresos verificados. Excluye datos fuera del dominio y riesgo bajo.',
            'sensitivity_definition': 'Media del cambio absoluto al sustituir cada variable por su media de entrenamiento. Solo clientes dentro del dominio; no es causalidad ni importancia global del modelo.'}
