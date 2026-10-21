# ChurnTrackAI

Plataforma académica de analítica predictiva B2B con red neuronal real y tres agentes coordinados: predictivo, retención y supervisor. Reutiliza los pesos de `modelo.js`, añade API Python, persistencia, dashboard y revisión humana.

**Estado:** aplicación publicada en [https://churntrackai.onrender.com](https://churntrackai.onrender.com), código en [GitHub](https://github.com/ManuelCarranzaAv/ChurnTrackAI). Modelo académico sintético, no validado con empresas. La actualización incorpora acceso validado, demo pública de 300 clientes, planes de acción y resumen de agentes. Gemini está configurado en el servidor, pero la comprobación del 21/10/2026 devolvió HTTP 503; no se afirma generación exitosa.

## Inicio rápido

Python 3.13. Desde la raíz del proyecto en PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python scripts/setup_local.py
.\.venv\Scripts\python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

Abrir [la aplicación local](http://127.0.0.1:8000). `scripts/start.ps1` también inicia el servidor. En este entorno ya se creó `.venv`; si `ensurepip` no está disponible, un Python con pip puede instalar dentro de ella con `python -m pip --python .venv\Scripts\python.exe install -r requirements.txt`.

1. Seleccionar **Analizar 300 clientes de ejemplo** o **Explorar con datos de ejemplo** para ejecutar una inferencia real sobre datos ficticios sin contraseña.
2. Para cargar datos y guardar resultados, abrir `.env` localmente, copiar el valor de `APP_API_KEY` y ponerlo en Configuración → Validar acceso y continuar. Esta clave es distinta de GEMINI_API_KEY; la interfaz rechaza una clave incorrecta antes de continuar. No publicar ese archivo ni mostrarlo en el video.
3. En Análisis predictivo introducir un cliente o subir `data/template.csv`.
4. Revisar Clientes y segmentos, Inteligencia multiagente y Recomendaciones.
5. Aprobar o rechazar una recomendación. Se registra la decisión; no se envía correo ni se modifica un CRM.
6. Exportar JSON del informe o CSV de resultados. El historial requiere la clave del espacio de trabajo.

## Activar el LLM real

Obtener una clave en [Google AI Studio](https://aistudio.google.com/api-keys) e introducirla **solo** en `.env` o en las variables seguras de Render como `GEMINI_API_KEY`. Mantener `GEMINI_MODEL=gemini-3.1-flash-lite`, sujeto a disponibilidad de la cuenta. Reiniciar el servicio después de configurar. No se solicitan secretos por chat.

Marcar **Solicitar selección de acciones al LLM** y el consentimiento para procesar indicadores sin identificadores. La traza debe mostrar `structured_selection_request`, `validated_json`, `mode=llm` (o `mixed` en lotes mayores de 20) y metadatos de consumo de Gemini. Si no hay clave, cuota o respuesta válida, el informe avisa y marca `mode=rules`. El LLM elige acciones permitidas y evidencia; el texto explicativo se construye con los datos verificados.

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
