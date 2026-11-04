"""Random 10-client test portfolio: a different, still balanced sample on every request.

Customers are drawn from the 300 synthetic examples, stratified by the decision the agents
would face, so each sample still covers every risk level, every measurable lever and one
out-of-domain record. Codes are fresh random identifiers, never the source row.
"""
import csv
import random
from functools import lru_cache
from .agents import impacts, rule_action
from .model import ROOT
from .schemas import FEATURES, Customer

# (risk, rule action or None for any, how many)
STRATA = [('ALTO', 'claims', 1), ('ALTO', 'payments', 1), ('ALTO', 'reactivate', 1), ('ALTO', None, 1),
          ('MEDIO', None, 2), ('BAJO', None, 3)]

@lru_cache(maxsize=1)
def _pool(model):
    with (ROOT / 'data/example-300.csv').open(encoding='utf-8') as source:
        rows = list(csv.DictReader(source))
    scored = []
    for row in rows:
        p = model.predict(Customer.model_validate(row))
        if not p.warnings:
            scored.append(({f: row[f] for f in FEATURES}, p.risk, rule_action(p, impacts(model, p))))
    return tuple(scored)

def _out_of_domain(rng):
    # Average amount above the training range (max 4,999): the predictive agent must flag it.
    return {'antiguedad': rng.randint(6, 48), 'compras_mensuales': rng.randint(2, 8),
            'monto_promedio': rng.randrange(5600, 9400, 50), 'reclamos': rng.randint(2, 6),
            'dias_ultima_compra': rng.randint(40, 110), 'pagos_atrasados': rng.randint(1, 4)}

def random_portfolio(model, seed=None):
    rng = random.Random(seed)
    pool, picked, used = list(_pool(model)), [], set()
    for risk, action, count in STRATA:
        options = [i for i, (_, r, a) in enumerate(pool) if r == risk and (action is None or a == action) and i not in used]
        for i in rng.sample(options, min(count, len(options))):
            used.add(i); picked.append(dict(pool[i][0]))
    picked.append(_out_of_domain(rng))
    rng.shuffle(picked)
    codes = rng.sample(range(1000, 9999), len(picked))
    return [{'cliente_id': f'CLI-{code}', **row} for code, row in zip(codes, picked)]

def to_csv(customers):
    lines = [','.join(['cliente_id', *FEATURES])]
    lines += [','.join(str(c[k]) for k in ['cliente_id', *FEATURES]) for c in customers]
    return '\n'.join(lines) + '\n'
