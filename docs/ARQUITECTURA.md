# Arquitectura actual

Frontend HTML/CSS/JS → FastAPI → Supervisor → Predictivo → Retención → Supervisor → revisión humana.

- Predictivo ejecuta la red neuronal y sensibilidad por sustitución a la media. Su consulta LLM interpreta indicadores; no modifica probabilidades.
- Retención recibe también la interpretación previa y selecciona una acción/evidencia del catálogo. El plan se construye con plantillas verificables.
- Supervisor comprueba correspondencia, acciones, evidencia y planes, permite una reparación y consulta al LLM sobre consistencia. Puede señalar revisión adicional.
- Un proveedor configurable (Groq o Gemini), tres roles y tres etapas; no son tres modelos distintos.
- Salida estructurada restringida por etapa: acciones y claves de evidencia enumeradas. Validación posterior contra cada cliente.
- SharedState y mensajes Pydantic conservan origen, índices, herramientas, errores, consumo y estado. Máximo 32 mensajes y 60 segundos.
- Hasta 20 clientes priorizados con LLM; los 300 se procesan con red y recomendaciones. Cada etapa declara su cobertura real.
- Público: /api/public/analyze y /api/public/analyze-csv admiten LLM con consentimiento, sin persistencia SQL ni clave administrativa. Límites públicos y globales de proveedor.
- Privado: /api/analyze, historial y decisiones persistidas requieren APP_API_KEY. SQLAlchemy con SQLite, PostgreSQL configurable.
- Aceptar todas excluye request_review y no cambia decisiones ya tomadas. Aceptación individual conserva control humano. Ninguna aceptación ejecuta acciones externas.
- No RAG, memoria vectorial, CRM ni envío de correo. Sin identidad individual de revisor.

Detalles de contratos, límites, pruebas y evidencia real en README.md y evidence/. El registro visible de los agentes representa la ejecución completada; no es streaming en vivo.
