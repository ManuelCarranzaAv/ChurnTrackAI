# ChurnTrackAI 2.0

Plataforma académica (curso **Tecnologías Emergentes**) de analítica de abandono para empresas **B2B**. Combina una **red neuronal real** con un **sistema de cuatro agentes coordinados** que convierten la predicción en un plan de retención priorizado por ingreso, verificable y aprobado por personas.

> Modelo entrenado con datos sintéticos. Las cifras demuestran el flujo de trabajo; no son pérdidas contables ni predicciones sobre empresas reales.

## Qué problema resuelve

En B2B pocos clientes concentran mucho ingreso, y perder uno se nota. Un equipo de Customer Success necesita responder tres preguntas cada semana:

1. **¿Quién está por irse?** → probabilidad de abandono por cliente (red neuronal 6→32→16→8→1).
2. **¿Cuánto ingreso está en juego?** → ingreso mensual en riesgo = probabilidad × (compras mensuales × monto promedio), salud del cliente (0–100) y matriz **valor × riesgo** (Rescatar, Proteger, Automatizar, Mantener).
3. **¿Qué hago y con qué impacto?** → acción de un playbook, responsable, plazo y una **simulación what-if** que re-ejecuta la red con la palanca resuelta (reclamos, pagos, recencia) para estimar la reducción de riesgo y el ingreso protegido.

## Sistema multiagente

| Agente | Responsabilidad | Herramientas | Uso del LLM (validado) |
|---|---|---|---|
| **Supervisor** | Orquesta, valida cada salida, recalcula simulaciones, pide corrección | Delegación, reintento, controles deterministas | Revisa consistencia: `approve_plan` / `request_review` |
| **Predictivo** | Inferencia, explicación local, datos fuera de dominio | Red neuronal, sustitución a la media | Interpreta el riesgo: `interpret_risk` / `review_data` |
| **Retención** | Elige la acción del playbook por cliente | Simulador what-if, catálogo de acciones | Selecciona acción usando `action_impacts` |
| **Estratega** | Resumen ejecutivo de cartera para gerencia | Agregados, matriz valor × riesgo | Redacta texto; **se rechaza si cita cifras que no están en los datos** |

Flujo: `usuario → Supervisor → Predictivo → Supervisor → Retención → Supervisor (valida + revisa) → Estratega → Supervisor → usuario`. Todo queda en una traza de mensajes (`SharedState`) descargable. El LLM (Groq `openai/gpt-oss-120b` o Gemini) nunca cambia probabilidades: responde con JSON restringido por esquema y cada respuesta se valida; si falla, se usan reglas explícitas y la interfaz lo declara. Sin códigos de cliente hacia el proveedor, presupuesto diario y límite de 60 s / 32 mensajes. Ninguna acción externa se ejecuta: la decisión final es humana.

## Ver a los agentes trabajando

- **Agentes en acción (en vivo):** `POST /api/public/analyze-stream` transmite en NDJSON cada mensaje del estado compartido mientras ocurre. La interfaz muestra los 4 agentes como pasos en cadena (Predictivo → Retención → Supervisor → Estratega → Tú): qué hace cada uno, su estado (en espera, trabajando, consultando al LLM, listo) y **lo que entrega** (p. ej. «5 alto · 2 medio · 3 bajo», «3 reactivación · 2 regularizar pagos…», «9 aprobadas · 1 para revisar», el titular del resumen). La conversación completa, narrada en lenguaje natural, queda desplegable.
- **Tu decisión (paso final):** la persona ve la recomendación final del Estratega, el veredicto del Supervisor y, por cliente, la cadena de agentes (riesgo → acción con reducción simulada → aprobación) con la justificación verificada del LLM. Acepta, rechaza o deshace cada propuesta y ve en barras el ingreso en riesgo hoy, con lo aceptado y si acepta todo lo validado.
- **Valor medible del LLM:** cada recomendación conserva la acción que habrían propuesto las reglas (`rule_baseline`).

## Robustez de los agentes

- **Modelo de respaldo:** si `GROQ_MODEL` (gpt-oss-120b) responde 429 por cuota de tokens por minuto, 5xx o tiempo agotado, la misma llamada pasa a `GROQ_FALLBACK_MODEL` (gpt-oss-20b), que en Groq tiene su propia cuota. Una espera corta (≤ 3 s) se reintenta en el mismo modelo.
- **Respuestas incompletas:** el primer intento es todo o nada y se reintenta; en el segundo se conservan las selecciones válidas y solo los clientes omitidos quedan con reglas, en vez de perder la etapa entera.
- **Errores inesperados del proveedor** se convierten en un aviso controlado: el agente sigue con reglas y el análisis termina.
- La interfaz distingue «reintento» y «resuelto con reglas» de un fallo real.

## ¿Cuántos clientes usar?

- **10 (cartera de prueba, recomendada):** coincide con `LLM_MAX_CUSTOMERS`, así **cada cliente pasa por los 4 agentes con LLM**. Incluye riesgo alto, medio y bajo, las 3 palancas medibles (reclamos, pagos, reactivación) y 1 registro fuera de dominio para ver al Supervisor frenarlo.
- **300:** demuestra la escala de la red neuronal; el LLM revisa los 10 de mayor riesgo y el resto usa reglas explícitas.
- Validar el modelo en sí requiere miles de clientes históricos reales con su resultado conocido.

## Interfaz

- **Nuevo análisis**: cartera de prueba (10), cartera grande (300), CSV propio (validado con errores por fila y vista previa) o un cliente; LLM opcional con consentimiento.
- **Flujo**: *Agentes en acción* → *Resultados* (resumen del Estratega, 3 KPI, prioridades y segmentos; gráficos detallados desplegables) → *Tu decisión*.
- **Consultar**: *Clientes* (tabla simple con veredicto del Supervisor y ficha con la conversación de los agentes), *Auditoría técnica* (traza, tokens, intentos y modelo usado), *Simulador what-if* y *Modelo y método*.

HTML/CSS/JS sin dependencias ni compilación, modo claro/oscuro y diseño responsive.

## Ejecutar localmente

Python 3.12+:

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Para el LLM, crear `.env` (ignorado por Git) con `LLM_PROVIDER=groq`, `GROQ_API_KEY=...`, `GROQ_MODEL=openai/gpt-oss-120b`. Nunca versionar claves.

## Despliegue

- **Vercel** (nuevo): `pyproject.toml` declara `[tool.vercel] entrypoint = "backend.main:app"`; los estáticos de `/assets` se sirven desde la CDN. Ver [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md#vercel).
- **Render**: `Dockerfile` + `render.yaml` siguen funcionando.

En ambos planes gratuitos el almacenamiento SQLite es temporal. El análisis público no se guarda; para historial privado y cuotas compartidas entre instancias configurar `DATABASE_URL` con PostgreSQL (p. ej. Neon).

## API principal

| Endpoint | Función |
|---|---|
| `GET /health`, `GET /api/config`, `GET /api/metrics` | Estado, configuración no sensible, evaluación |
| `POST /api/demo?size=12\|300` | Cartera sintética, sin LLM ni persistencia |
| `POST /api/public/analyze` · `POST /api/public/analyze-csv` | Análisis temporal (JSON o CSV ≤300 filas, `use_llm` + consentimiento) |
| `POST /api/public/validate-csv` | Validación y vista previa sin inferencia |
| `POST /api/public/simulate` | Simulador what-if de un cliente (sin LLM ni almacenamiento) |
| `POST /api/public/analyze-stream` | Igual que el análisis público, pero transmite los mensajes de los agentes en vivo (NDJSON); admite `?demo=10\|24\|300`, CSV o JSON |
| `POST /api/analyze`, `GET /api/runs`, decisiones | Modo privado con `APP_API_KEY` (Bearer) e historial persistido |

CSV: `cliente_id,antiguedad,compras_mensuales,monto_promedio,reclamos,dias_ultima_compra,pagos_atrasados`.

## Pruebas

```powershell
.\.venv\Scripts\python -m pip install -r requirements-dev.txt
.\.venv\Scripts\python -m pytest -q        # 82 pruebas: modelo, API, seguridad, 4 agentes, análisis de negocio
node tests/actions.cjs                     # utilidades del frontend
```

## Evaluación del modelo

Sobre 1.000 ejemplos sintéticos nuevos: AUC 0,981, exactitud 92,7 %, F1 0,946, Brier 0,053 (línea base “todos abandonan”: 67,8 %). El escalador exportado no coincide con el del notebook original, por lo que no se reutiliza su 92 %. Detalle en `models/evaluation.json` y [docs/AUDITORIA.md](docs/AUDITORIA.md).

## Del prototipo a una empresa real

Definir abandono y horizonte con negocio, reentrenar con históricos de CRM/ERP y validación temporal, calibrar umbrales según la capacidad del equipo, medir impacto con grupo de control, y operar con roles, base persistente, integración CRM y monitoreo de deriva. Ver [docs/USO_EMPRESARIAL.md](docs/USO_EMPRESARIAL.md).

## Estructura

```text
backend/   API FastAPI, red neuronal, analítica de cartera, 4 agentes, proveedores LLM, almacenamiento
frontend/  index.html, app.css, app.js (vistas), core.js (utilidades puras testeadas)
models/    Pesos, escalador y evaluación
data/      Datos sintéticos de demo y plantilla
tests/     Pruebas Python y JS
docs/      Arquitectura, auditoría, requisitos, despliegue y uso empresarial
```
