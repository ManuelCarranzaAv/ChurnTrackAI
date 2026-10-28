"""Descriptive portfolio analysis; estimates are model-based, never causal or audited figures."""
from statistics import median
from .schemas import FEATURES

QUADRANTS = {
    'rescatar': 'Alto valor y riesgo medio/alto: atención personal inmediata.',
    'proteger': 'Alto valor y riesgo bajo: cuidar la relación y explorar crecimiento.',
    'automatizar': 'Valor menor y riesgo medio/alto: acciones de bajo costo y escalables.',
    'mantener': 'Valor menor y riesgo bajo: seguimiento rutinario.',
}


def quadrant(p, value_threshold):
    high_value = p.monthly_revenue >= value_threshold
    at_risk = p.risk != 'BAJO'
    return ('rescatar' if at_risk else 'proteger') if high_value else ('automatizar' if at_risk else 'mantener')


def portfolio(predictions):
    n = len(predictions)
    if not n:
        return None
    valid = [p for p in predictions if not p.warnings]
    value_threshold = median(p.monthly_revenue for p in predictions)
    segments = []
    for risk in ('ALTO', 'MEDIO', 'BAJO'):
        rows = [p for p in predictions if p.risk == risk]
        segments.append({'risk': risk, 'count': len(rows),
                         'share': len(rows)/n,
                         'mean_probability': sum(p.probability for p in rows)/len(rows) if rows else None,
                         'monthly_revenue': sum(p.monthly_revenue for p in rows),
                         'revenue_at_risk': sum(p.revenue_at_risk for p in rows),
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
         'monthly_volume_proxy': p.monthly_revenue,
         'attention_score': p.revenue_at_risk}
        for p in valid if p.risk != 'BAJO'
    ], key=lambda x: -x['attention_score'])[:10]
    quadrants = {}
    for key in QUADRANTS:
        rows = [p for p in predictions if quadrant(p, value_threshold) == key]
        quadrants[key] = {'count': len(rows), 'revenue_at_risk': sum(p.revenue_at_risk for p in rows),
                          'monthly_revenue': sum(p.monthly_revenue for p in rows), 'description': QUADRANTS[key]}
    total_revenue = sum(p.monthly_revenue for p in predictions)
    at_risk = sum(p.revenue_at_risk for p in predictions)
    # Concentration: share of expected revenue at risk held by the riskiest-value 20% of customers.
    top = sorted(predictions, key=lambda p: -p.revenue_at_risk)[:max(1, round(n*.2))]
    return {'count': n, 'mean_probability': sum(p.probability for p in predictions)/n,
            'median_probability': median(p.probability for p in predictions),
            'out_of_domain_count': n-len(valid), 'segments': segments, 'histogram': histogram,
            'sensitivities': sensitivities, 'priorities': priorities,
            'revenue': {'monthly_total': total_revenue, 'monthly_at_risk': at_risk,
                        'annual_at_risk': at_risk*12, 'share_at_risk': at_risk/total_revenue if total_revenue else 0,
                        'top20_concentration': sum(p.revenue_at_risk for p in top)/at_risk if at_risk else 0,
                        'currency': 'S/'},
            'health_score': round(sum(p.health_score for p in predictions)/n),
            'value_threshold': value_threshold, 'quadrants': quadrants,
            'customer_quadrants': {p.cliente_id: quadrant(p, value_threshold) for p in predictions},
            'revenue_definition': 'Ingreso mensual = compras mensuales × monto promedio. Ingreso en riesgo = probabilidad × ingreso mensual. Estimación del modelo sintético; no es una pérdida contable ni auditada.',
            'priority_definition': 'Ingreso mensual en riesgo (probabilidad × compras × monto). Orienta el orden de atención; excluye datos fuera del dominio y riesgo bajo.',
            'sensitivity_definition': 'Media del cambio absoluto al sustituir cada variable por su media de entrenamiento. Solo clientes dentro del dominio; no es causalidad ni importancia global del modelo.'}
