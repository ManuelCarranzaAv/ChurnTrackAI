# ChurnTrackAI

Plataforma académica de analítica predictiva B2B con red neuronal real y tres agentes coordinados: predictivo, retención y supervisor. Reutiliza los pesos de `modelo.js`, añade API Python, persistencia, dashboard y revisión humana.

**Estado:** aplicación publicada en https://churntrackai.onrender.com/. Flujo Inicio → Diagnóstico → Recomendaciones → Aceptación. Análisis individual y CSV hasta 300 clientes; Groq configurado en servidor. Tres roles consultan al LLM para hasta 20 clientes priorizados. Modelo académico sintético, no validado con empresas. Guía del cuestionario: [SUSTENTACION.md](docs/SUSTENTACION.md).

## Inicio rápido

Python 3.13. Desde la raíz del proyecto en PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python scripts/setup_local.py
.\.venv\Scripts\python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

Abrir [la aplicación local](http://127.0.0.1:8000). `scripts/start.ps1` también inicia el servidor. En este entorno ya se creó `.venv`; si `ensurepip` no está disponible, un Python con pip puede instalar dentro de ella con `python -m pip --python .venv\Scripts\python.exe install -r requirements.txt`.

1. En **Inicio**, elegir **Cliente individual** o **Cartera CSV**, ingresar indicadores y pulsar **Analizar churn**. No se solicita clave de acceso para este análisis temporal.
2. Revisar resultados y factores en **Diagnóstico**.
3. En **Recomendaciones**, seleccionar cliente y agente: Predictivo interpreta evidencia; Retención propone una acción; Supervisor revisa la propuesta. Cada etapa indica si realmente respondió el LLM o si se usaron reglas. Descargar informe y traza JSON.
4. En **Aceptación**, aceptar/rechazar individualmente o aceptar pendientes elegibles. Las propuestas marcadas para revisión adicional quedan fuera de la aceptación masiva. No se envían correos ni se modifica CRM.
5. Exportar resultados antes de cerrar. **Opciones de guardado** permite historial privado con APP_API_KEY; la consulta pública al LLM no requiere esa clave.
6. **Evaluación e historial** conserva métricas y consulta privada.

## Proveedor LLM

Configurar exclusivamente en Render Environment o .env ignorado: `LLM_PROVIDER=groq`, `GROQ_API_KEY`, `GROQ_MODEL=openai/gpt-oss-20b`. Alternativamente `LLM_PROVIDER=gemini`, `GEMINI_API_KEY` y `GEMINI_MODEL`. Nunca introducir claves en la interfaz ni versionarlas.

Las tres etapas usan respuestas estructuradas y validación semántica. El riesgo siempre procede de la red neuronal. Hasta 20 clientes de mayor riesgo reciben revisión LLM; todos los demás mantienen inferencia y recomendaciones por reglas explícitas. Si falla el proveedor, se informa sin simular respuestas exitosas. El aviso junto a Analizar explica el envío de indicadores sin códigos al proveedor.

Presupuesto predeterminado: 50 intentos de proveedor/día; 10 análisis públicos con LLM/día (`PUBLIC_LLM_DAILY_LIMIT`). Por análisis: una llamada predictiva, hasta dos de retención y una de supervisión. Límite total 60 segundos y 32 mensajes. Estos límites no garantizan disponibilidad o cuota del proveedor.

## Datos y API

CSV UTF-8 con coma o punto y coma, exactamente estas columnas:

```csv
cliente_id,antiguedad,compras_mensuales,monto_promedio,reclamos,dias_ultima_compra,pagos_atrasados
DEMO-001,24,5,800,2,30,1
```

`cliente_id` admite letras ASCII, números, guion y guion bajo; máximo 48 caracteres. Los conteos deben ser enteros no negativos. No se permiten nulos, NaN, infinito, duplicados ni campos adicionales. Hasta 300 filas y 256 KB; LLM para los 20 clientes de mayor probabilidad; el resto usa reglas. Se rechaza el lote completo si una fila es inválida. Fuera del dominio sintético se pide revisar los datos antes de actuar.

| Endpoint | Función | Acceso |
|---|---|---|
| `GET /health` | Estado de modelo y base | Público |
| `GET /api/config` | Configuración no sensible | Público |
| `GET /api/metrics` | Diagnóstico medido del artefacto | Público |
| `POST /api/demo` | Datos sintéticos fijos, sin persistencia | Público |
| `POST /api/public/analyze` | JSON: hasta 300 clientes, LLM con consentimiento, sin persistencia | Público |
| `POST /api/public/analyze-csv` | CSV validado; use_llm y consent; sin persistencia | Público |
| `POST /api/demo/llm` | Prueba LLM con ejemplos fijos y presupuesto limitado | Público |
| `POST /api/runs/{id}/approve-pending` | Acepta pendientes sin sobrescribir rechazos; no ejecuta acciones | Bearer |
| `POST /api/analyze` | JSON con `customers`, `use_llm`, `consent_external_processing` | Bearer |
| `POST /api/analyze-csv` | Cuerpo `text/csv`; opciones `use_llm` y `consent` | Bearer |
| `GET /api/runs` | Últimas 100 ejecuciones | Bearer |
| `GET /api/runs/{id}` | Informe, traza y decisiones | Bearer |
| `POST /api/runs/{id}/decisions/{cliente_id}` | `{"decision":"approved"}` o `rejected` | Bearer |
| `GET /api/template.csv` | Plantilla de 12 clientes sintéticos | Público |

## Reproducir las verificaciones

```powershell
.\.venv\Scripts\python -m pip install -r requirements-dev.txt
.\.venv\Scripts\python scripts/evaluate.py
.\.venv\Scripts\python -m pytest -q --junitxml=evidence/tests.xml
node --check frontend/app.js
node tests/actions.cjs
node tests/clarity.cjs
# Con servidor local encendido:
.\.venv\Scripts\python scripts/collect_evidence.py
```

`evaluate.py` requiere Node para comparar con el original. Ejecutó 204 comparaciones con error máximo 5,55e-17. Sobre 1.000 ejemplos sintéticos nuevos: accuracy 92,7%, precisión 95,08%, recall 94,10%, F1 94,59%, AUC 0,9814. Son resultados diagnósticos; no pertenecen al test original ni prueban generalización real. Ver `models/evaluation.json` y `docs/AUDITORIA.md`.

El notebook original reportaba 92% de accuracy, pero su escalador no coincide con el exportado. Por tanto, no se atribuye esa métrica a esta versión. El procedimiento opcional `scripts/train.py`, con `requirements-training.txt`, entrena y exporta otro modelo en `models/retrained/`; no reemplaza automáticamente el servido. No ha sido ejecutado ni evaluado en esta entrega.

## Despliegue

Render es la opción principal. `Dockerfile` sirve frontend y backend en un solo servicio y `render.yaml` selecciona el plan Free. Seguir [la guía de publicación](docs/DESPLIEGUE.md). El contenedor incluye solo inferencia y runtime; no instala TensorFlow, NumPy ni pandas.

```powershell
docker compose up --build
```

Docker no está instalado localmente; Render construyó el contenedor y confirmó el servicio live. Compose persiste SQLite en un volumen. Render Free no ofrece disco persistente: configurar PostgreSQL externo con `DATABASE_URL` si las trazas deben sobrevivir reinicios. PostgreSQL está soportado por código pero su conexión no se ha probado con una instancia real.

## Estructura

```text
backend/      API, esquemas, red, agentes, proveedor LLM, almacenamiento
frontend/     Interfaz responsiva sin CDN ni proceso de compilación
models/       Pesos, escalador y evaluación medidos
data/         Demo, plantilla y diagnóstico sintéticos
scripts/      Inicio, exportación/evaluación, entrenamiento y evidencias
tests/        Pruebas de integración, seguridad y agentes
docs/         Auditoría, arquitectura, requisitos, despliegue y sustentación
evidence/     Pruebas, traza, medidas y capturas LOCALES
original/     Referencias originales preservadas
runtime/      Base de datos local y temporales; excluidos de Git
```

El notebook original se conserva localmente y se excluye de publicación automática porque contiene metadatos de Colab y salidas históricas. `original/notebook-source.py` conserva el código para revisión; `scripts/train.py` ofrece el procedimiento reproducible sin sus salidas. No se afirma autoría de entrenamiento del equipo: el equipo debe confirmar ese dato.

## Documentos y límites pendientes

- [Auditoría técnica](docs/AUDITORIA.md)
- [Arquitectura, agentes y seguridad](docs/ARQUITECTURA.md)
- [Requisitos y aceptación](docs/REQUISITOS.md)
- [Guía Render y costos](docs/DESPLIEGUE.md)
- [Evidencias y pruebas](docs/EVIDENCIAS.md)
- [Material para el cuestionario y video](docs/SUSTENTACION.md)

Pendientes: generación real exitosa de Gemini (proveedor indisponible en la última prueba), comprobación HTTPS desde otro equipo, cuestionario correcto A1–K3, integrantes y video. No hay URLs públicas inventadas ni declaraciones académicas marcadas como cumplidas sin evidencia.


## Recorrido para el profesor

En Inicio, **Iniciar recorrido con Gemini** ejecuta tres casos ficticios sin clave de acceso. Muestra la llamada real, estado, intentos, duración, uso informado y respuesta validada; los fallos se distinguen de la generación exitosa. Se puede recorrer cada agente y simular una decisión solo en la pestaña. La demo de 300 sigue disponible sin proveedor. Detalles y límites en [RECORRIDO_PROFESOR.md](docs/RECORRIDO_PROFESOR.md).

`POST /api/demo/gemini` solo admite fixtures internos: sin cuerpo ni parámetros, caché explícito de diez minutos, una ejecución concurrente y hasta cinco nuevas demostraciones diarias con LLM (máximo dos intentos cada una), sujeto además al presupuesto global y a la persistencia del almacenamiento. Datos propios e historiales siguen requiriendo autorización. 37 pruebas pasan; las pruebas reales recientes de Google siguen sin acreditar una generación exitosa.

