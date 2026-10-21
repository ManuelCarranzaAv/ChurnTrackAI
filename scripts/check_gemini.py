"""Probe the configured provider with fictional indicators, never print credentials."""
import asyncio
import json
from pathlib import Path
from datetime import datetime, timezone
from dotenv import load_dotenv
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.llm import GeminiProvider, ProviderError
load_dotenv()

async def main():
    provider = GeminiProvider()
    result = {'created': datetime.now(timezone.utc).isoformat(), 'model': provider.model, 'data': 'one synthetic customer, no identifiers'}
    try:
        response, usage = await provider.choose([{'index':0,'probability':0.2,'risk':'BAJO','observed':{'antiguedad':24,'compras_mensuales':5,'monto_promedio':800,'reclamos':2,'dias_ultima_compra':30,'pagos_atrasados':1},'allowed_actions':['monitor']}])
        result.update(status='success', response=response.model_dump(), usage=usage)
    except ProviderError as exc:
        result.update(status='failed', error=str(exc))
    Path('evidence/gemini-probe.json').write_text(json.dumps(result, indent=2),encoding='utf-8')
    print(json.dumps(result))

asyncio.run(main())
