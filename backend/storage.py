import json
from datetime import datetime, timezone
from sqlalchemy import create_engine, text

class Store:
    def __init__(self, url):
        if url.startswith('postgres://'):
            url = url.replace('postgres://', 'postgresql+psycopg://', 1)
        elif url.startswith('postgresql://'):
            url = url.replace('postgresql://', 'postgresql+psycopg://', 1)
        self.engine = create_engine(url, connect_args={'check_same_thread': False} if url.startswith('sqlite') else {}, pool_pre_ping=True)
        with self.engine.begin() as db:
            db.execute(text('CREATE TABLE IF NOT EXISTS runs (id VARCHAR(36) PRIMARY KEY, created VARCHAR(40) NOT NULL, body TEXT NOT NULL)'))
            db.execute(text('CREATE TABLE IF NOT EXISTS decisions (run_id VARCHAR(36), customer_id VARCHAR(48), decision VARCHAR(16), created VARCHAR(40), PRIMARY KEY(run_id, customer_id))'))
            db.execute(text('CREATE TABLE IF NOT EXISTS usage (day VARCHAR(10) PRIMARY KEY, calls INTEGER NOT NULL)'))

    def save(self, run):
        with self.engine.begin() as db:
            db.execute(text('INSERT INTO runs(id,created,body) VALUES (:id,:created,:body)'), {'id':run['id'], 'created':run['created'], 'body':json.dumps(run)})

    def get(self, id):
        with self.engine.connect() as db:
            row = db.execute(text('SELECT body FROM runs WHERE id=:id'), {'id':id}).first()
            if not row:
                return None
            run = json.loads(row[0])
            decisions = db.execute(text('SELECT customer_id,decision,created FROM decisions WHERE run_id=:id'), {'id':id}).all()
            for cid, decision, created in decisions:
                for rec in run.get('recommendations', []):
                    if rec['cliente_id'] == cid:
                        rec['decision'] = decision
                run.setdefault('human_decisions', []).append({'cliente_id':cid,'decision':decision,'created':created,'actor':'authenticated_admin','external_action_executed':False})
            return run

    def list(self):
        with self.engine.connect() as db:
            rows = db.execute(text('SELECT id,created,body FROM runs ORDER BY created DESC LIMIT 100')).all()
            return [{'id':id,'created':created,'status':json.loads(body)['status'],'customers':len(json.loads(body).get('predictions', []))} for id,created,body in rows]

    def decide(self, run_id, customer_id, decision):
        # Single insert makes decisions immutable and rejects concurrent approvals.
        with self.engine.begin() as db:
            db.execute(text('INSERT INTO decisions VALUES (:r,:c,:d,:t)'), {'r':run_id,'c':customer_id,'d':decision,'t':datetime.now(timezone.utc).isoformat()})

    def reserve_call(self, limit):
        day = datetime.now(timezone.utc).date().isoformat()
        with self.engine.begin() as db:
            db.execute(text('INSERT INTO usage(day,calls) VALUES (:day,0) ON CONFLICT(day) DO NOTHING'), {'day':day})
            result = db.execute(text('UPDATE usage SET calls=calls+1 WHERE day=:day AND calls < :lim'), {'day':day,'lim':limit})
            return result.rowcount == 1
