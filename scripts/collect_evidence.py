"""Record real local HTTP measurements; only the synthetic public demo is used."""
import json
import statistics
import sys
import time
from datetime import datetime,timezone
from pathlib import Path
import httpx
base=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8000'
from urllib.parse import urlparse
local = urlparse(base).hostname in ('127.0.0.1','localhost')
suffix = 'local' if local else 'public'
out=Path('evidence');out.mkdir(exist_ok=True)
measurements={}
with httpx.Client(base_url=base,timeout=70) as client:
    for path,method in [('/health','GET'),('/','GET'),('/api/demo','POST')]:
        times=[]
        for _ in range(5):
            start=time.perf_counter();response=client.request(method,path);response.raise_for_status();times.append((time.perf_counter()-start)*1000)
        measurements[path]={'samples':5,'median_ms':statistics.median(times),'max_ms':max(times),'status':response.status_code}
        if path=='/api/demo':
            (out/f'demo-trace-{suffix}.json').write_text(json.dumps(response.json(),indent=2),encoding='utf-8')
    status=client.get('/health').json()
(out/('http-measurements.json' if local else 'http-measurements-public.json')).write_text(json.dumps({'created':datetime.now(timezone.utc).isoformat(),'base_url':base,'scope':'LOCAL HTTP, not public production' if local else 'PUBLIC HTTPS from development computer','measurements':measurements,'health':status},indent=2),encoding='utf-8')
print(json.dumps(measurements,indent=2))
