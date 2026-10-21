# Material de sustentación de ChurnTrackAI

**Estado del cuestionario:** pendiente el documento correcto. El Word indicado, incluso al reenviarse la misma ruta, contiene “Proyecto Final de Fundamentos de Business Analytics / BI (Inversiones)”, respuestas sobre Aurum y preguntas A1–K4. El usuario confirmó que dispone de otro cuestionario. Este material prepara las respuestas de contenido A–K según la solicitud, pero no inventa el texto ni la numeración exacta A1–K3 del documento faltante. No es el cuestionario final listo para entregar.

## A Datos del equipo

Proyecto: Sistema de Analítica Predictiva para la Predicción de Churn en Empresas B2B mediante Redes Neuronales. Producto: ChurnTrackAI. Integrante, código académico, equipo, roles y fecha de entrega: pendientes del equipo. Aplicación: https://churntrackai.onrender.com . Código: https://github.com/ManuelCarranzaAv/ChurnTrackAI . Video pendiente. La identidad configurada en Git no acredita autoría ni composición del equipo.

## B Problema, usuario e innovación

Problema: equipos comerciales B2B necesitan priorizar revisión de clientes con señales de abandono. Usuario propuesto: analista comercial o responsable de retención. No se han realizado entrevistas ni mediciones con una empresa; esa validación de necesidad sigue pendiente.

Objetivo general: integrar inferencia neuronal y colaboración de agentes para convertir indicadores de clientes en acciones revisables. Objetivos específicos: validar y procesar seis indicadores; estimar riesgo y sensibilidad; recomendar acciones sustentadas y registrar revisión humana. La comparación con tres soluciones reales se encuentra en `REQUISITOS.md`.

Resultados medidos: equivalencia numérica de 204 casos y métricas diagnósticas sobre 1.000 ejemplos sintéticos. No se midieron reducción de churn, ingresos retenidos ni satisfacción real. La innovación académica es la integración auditable, no una nueva técnica neuronal.

## C Requerimientos funcionales

Matriz con 15 requisitos P0/P1, agentes, aceptación y estado en `REQUISITOS.md`. Flujo: docente explora demo; analista autentica, carga datos, inspecciona riesgos y factores; supervisor humano aprueba o rechaza; se exportan resultados. El MVP no automatiza acciones comerciales externas.

## D Requerimientos técnicos

Python 3.13, FastAPI, Pydantic, SQLAlchemy, httpx y JavaScript; versiones fijadas en requirements y `requirements-lock.txt`. Inferencia sin librerías pesadas. Arquitectura en `ARQUITECTURA.md`; despliegue en `DESPLIEGUE.md`. Las mediciones de latencia actuales son locales; no se afirma disponibilidad pública ni SLA. Datos sintéticos y límites de uso explicitados en la UI.

## E Arquitectura multiagente

Predictivo valida e infiere; retención selecciona acciones y evidencia; supervisor delega, valida y repara. Estado compartido y mensajes JSON Pydantic. Memoria persistente en base SQL, sin RAG. Límite de 18 mensajes, dos intentos de proveedor, 30 segundos y una reparación. La traza local real `evidence/demo-trace-local.json` muestra los tres roles. Los tests prueban también una corrección solicitada por el supervisor. No presentar agentes deterministas como tres LLM distintos.

## F Modelos, datos y costos

Red 6–32–16–8–1, ReLU y sigmoide, pesos exportados desde trabajo previo. No hay un artefacto Keras original entregado; sí pesos suficientes para inferencia. El escalador exportado y el notebook difieren: explicado en `AUDITORIA.md`.

El proveedor integrado es Gemini 2.5 Flash-Lite mediante API REST; clave `GEMINI_API_KEY`. Hasta 2.048 tokens de salida y 50 intentos diarios por defecto; el proveedor puede imponer cuotas menores. Estimación ilustrativa de 100 consultas individuales: USD 0,022 en plan estándar pagado bajo el supuesto de 1.000 tokens de entrada y 300 de salida por consulta, sin reintentos; no es gasto medido. Ver fuentes y cálculo en `DESPLIEGUE.md`. La clave está configurada. Las pruebas reales devolvieron indisponibilidad del proveedor (503); no hay generación exitosa acreditada. Sin clave se identifica expresamente la recomendación por reglas.

## G Despliegue en línea

Preparados Dockerfile, compose, Blueprint, variables y `/health`. Runtime local comprobado. Publicación HTTPS y repositorio remoto verificados. Docker se construyó en Render; PostgreSQL no está validado con una instancia real. El plan gratuito Render tiene suspensión y almacenamiento efímero; no garantiza persistencia de SQLite.

## H Seguridad y ética

Acceso con clave, IDs anónimos, ausencia de prompts libres, consentimiento LLM, catálogo de acciones y validación de evidencia. Recomendaciones requieren aprobación y no ejecutan acciones. No se atribuyen problemas contractuales ni insatisfacción que no consten en datos. Entradas fuera del dominio activan revisión. Faltan validación de sesgos con empresas reales, identidad individual y política de retención para un uso empresarial.

## I Pruebas y evidencias

Resultados reales en `evidence/tests.xml`, matriz `docs/EVIDENCIAS.md`, comparación del modelo en `models/evaluation.json`, medidas HTTP y capturas locales. Los tests de respuestas del proveedor usan dobles identificados y no cuentan como evidencia LLM real. Medidas HTTP públicas: evidence/http-measurements-public.json. Prueba desde otro dispositivo físico pendiente.

## J Gestión del proyecto

Proceso aplicado en esta sesión: auditoría, diseño modular, implementación incremental, pruebas, preparación de despliegue y registro de evidencias. Puede describirse como iteración técnica compatible con CRISP-DM, pero no afirmar que el equipo siguió una metodología durante semanas sin sus registros.

Cronograma de semanas del curso, aportes de integrantes, enlaces a commits personales, aprendizajes individuales y fecha de entrega: pendientes del equipo. Aprendizajes técnicos observables: comprobar procedencia de pesos evita atribuir métricas incorrectas; la infraestructura gratuita requiere distinguir demo de persistencia durable; las salidas LLM necesitan controles semánticos además del JSON válido.

Mejoras propuestas: dataset real con horizonte explícito, separación temporal por empresa, comparación con baseline, calibración, evaluación por segmentos, identidad individual, registro de resultados de retención y PostgreSQL duradero. No afirmar que se implementaron estas mejoras.

## K Declaración final

No marcar como cumplida la publicación ni la llamada real al LLM hasta disponer de las evidencias. El código evita secretos versionados, pero el equipo debe revisar los archivos antes de publicar. La autoría del entrenamiento original debe ser confirmada por sus integrantes. Las respuestas finales deben cotejarse con el cuestionario correcto y ser iguales entre miembros.

## Guion de video de cuatro minutos

| Tiempo sugerido | Demostración | Explicación |
|---|---|---|
| 0:00–0:30 | URL pública real y `/health` | Problema B2B, objetivo y origen sintético del modelo. Si solo existe localhost, señalarlo y no presentar el video como despliegue terminado |
| 0:30–1:10 | Demo y dashboard | 12 clientes sintéticos, distribución calculada y filtros; no son clientes de una empresa real |
| 1:10–1:50 | Análisis individual y CSV | Variables, validación de datos y factores de sensibilidad sin causalidad |
| 1:50–2:40 | Inteligencia multiagente | Expandir mensajes del supervisor, predictivo y retención; explicar estado compartido y reglas de corrección |
| 2:40–3:15 | LLM y recomendaciones | Mostrar ejecución real Gemini solo si existe; si hay fallback, decir que son reglas y dejar pendiente el requisito LLM |
| 3:15–3:40 | Aprobar propuesta, exportar e historial | Decisión persistida, sin envío de correos ni acción en CRM |
| 3:40–4:00 | Métricas y limitaciones | Equivalencia JS/Python, diagnóstico sintético, escalador discrepante y mejoras futuras |

Ocultar claves, paneles de secretos y datos personales. Registrar el video real, subirlo al destino elegido por el equipo y añadir su URL verificada; no crear una URL de ejemplo.
