"""Create an ignored local configuration without printing credentials."""
import secrets
from pathlib import Path
root=Path(__file__).resolve().parents[1]
path=root/'.env'
if not path.exists():
    text=(root/'.env.example').read_text(encoding='utf-8')
    path.write_text(text.replace('APP_API_KEY=','APP_API_KEY='+secrets.token_urlsafe(32),1),encoding='utf-8')
    print('Created .env with a private local access key. Existing settings are never overwritten.')
else:
    print('.env already exists; preserved.')
