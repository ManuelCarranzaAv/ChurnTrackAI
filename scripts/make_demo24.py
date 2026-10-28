"""Build data/demo-24.csv: a small, balanced synthetic portfolio for testing the agents.

It covers every risk level, every value segment and every retention lever, plus one
out-of-domain row, so a single LLM-reviewed run exercises all agent behaviours.
Run: python scripts/make_demo24.py
"""
import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.agents import impacts, rule_action  # noqa: E402
from backend.model import NeuralModel  # noqa: E402
from backend.schemas import FEATURES, Customer  # noqa: E402

model = NeuralModel()
rows = list(csv.DictReader((ROOT / 'data/example-300.csv').open(encoding='utf-8')))
scored = []
for row in rows:
    p = model.predict(Customer.model_validate(row))
    scored.append((row, p, rule_action(p, impacts(model, p))))

picked, seen = [], set()
def take(cond, n):
    for row, p, action in sorted(scored, key=lambda x: -x[1].revenue_at_risk):
        if len([1 for r in picked if cond(*r)]) >= n:
            return
        if row['cliente_id'] not in seen and cond(row, p, action):
            picked.append((row, p, action)); seen.add(row['cliente_id'])

# High risk across the three measurable levers and both value halves.
for action in ('claims', 'payments', 'reactivate'):
    take(lambda r, p, a, action=action: p.risk == 'ALTO' and a == action, 2)
take(lambda r, p, a: p.risk == 'ALTO', 8)
take(lambda r, p, a: p.risk == 'MEDIO', 6)
take(lambda r, p, a: p.risk == 'BAJO' and p.monthly_revenue >= 15000, 4)
take(lambda r, p, a: p.risk == 'BAJO', 9)

out = [{'cliente_id': f'CLI-{i+1:03d}', **{f: r[f] for f in FEATURES}} for i, (r, _, _) in enumerate(picked)]
# One record outside the training domain (amount above 4,999) to show the data-quality path.
out.append({'cliente_id': 'CLI-024', 'antiguedad': '14', 'compras_mensuales': '4', 'monto_promedio': '7800',
            'reclamos': '5', 'dias_ultima_compra': '95', 'pagos_atrasados': '3'})
with (ROOT / 'data/demo-24.csv').open('w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=['cliente_id', *FEATURES])
    writer.writeheader(); writer.writerows(out)
print(len(out), 'clientes escritos en data/demo-24.csv')
