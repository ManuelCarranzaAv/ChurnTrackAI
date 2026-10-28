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

- **Sala de agentes (en vivo):** `POST /api/public/analyze-stream` transmite en NDJSON cada mensaje del estado compartido mientras ocurre. La interfaz muestra el estado de cada agente (en espera, trabajando, consultando al LLM, listo o falló) y narra cada mensaje en lenguaje natural, con su contenido técnico desplegable. Se puede reproducir después desde *Auditoría de agentes*.
- **Conversación por cliente:** en la ficha de cada cliente, Predictivo, Retención y Supervisor explican su parte (riesgo y factores, acción y simulación, verificación o revisión humana) y tú decides.
- **Valor medible del LLM:** cada recomendación conserva la acción que habrían propuesto las reglas (`rule_baseline`). La interfaz muestra cuántas decisiones cambió el LLM, cuántas segundas opiniones dio el Supervisor y cuántas pidió revisar una persona.

## ¿Cuántos clientes usar?

- **24 (cartera de prueba, recomendada):** 9 de riesgo alto, 6 medio y 9 bajo, los 4 segmentos de valor, las 4 palancas de retención y 1 registro fuera de dominio. Así cada agente actúa al menos una vez.
- **300:** demuestra la escala de la red neuronal. El LLM sigue revisando solo los `LLM_MAX_CUSTOMERS` clientes de mayor riesgo (10 por defecto: con las justificaciones cabe en el límite de 8.000 tokens por minuto del plan gratuito de Groq).
- Validar el modelo en sí no se hace con ninguna de las dos: requiere miles de clientes históricos reales con su resultado conocido.

## Interfaz

- **Nuevo análisis**: cartera de prueba (24), cartera grande (300), CSV propio (validado con errores por fila y vista previa) o un cliente; LLM opcional con consentimiento.
- **Resumen ejecutivo**: brief del Estratega, KPI de ingreso en riesgo, matriz valor × riesgo interactiva, segmentos, prioridades, distribución y sensibilidad.
- **Clientes**: búsqueda, filtros y ficha por cliente (salud, factores, recomendación, simulación, revisión de agentes, borrador de contacto).
- **Agentes**: estado de cada agente, traza real de mensajes, uso de tokens y controles.
- **Plan de acción**: aceptar/rechazar, aceptación conjunta que respeta las observaciones del Supervisor, exportación CSV con protección contra fórmulas.
- **Simulador what-if** y **Modelo y método** (AUC, matriz de confusión, ROC, barreras y ruta a producción).

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
| `POST /api/public/analyze-stream` | Igual que el análisis público, pero transmite los mensajes de los agentes en vivo (NDJSON); admite `?demo=24\|300`, CSV o JSON |
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
