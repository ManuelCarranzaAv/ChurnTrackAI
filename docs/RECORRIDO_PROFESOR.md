# Recorrido de evaluación sin claves

1. Abrir https://churntrackai.onrender.com/ y pulsar **Iniciar recorrido con Gemini**.
2. Esperar el resultado. El servidor analiza tres ejemplos ficticios de riesgo alto, medio y bajo y solicita una selección estructurada de acciones a Gemini si hay configuración y cuota.
3. Leer **Evidencia del uso del LLM**: modelo, intentos, duración, tokens informados y número de clientes con selección validada. Expandir solicitud/respuesta para inspeccionar los datos. Un error no es una generación exitosa.
4. Usar los botones de la guía para ir a Predictivo, Retención y Supervisor. Cambiar el cliente en la mesa de agentes.
5. Desde Supervisor, pulsar **Revisar esta acción** y **Simular aprobación** o **Simular rechazo**. La práctica solo modifica la pestaña actual; no almacena decisiones ni contacta clientes.
6. Para revisar escala, volver a Inicio y usar la demostración de 300 clientes con reglas. Para datos propios se requiere acceso privado.

## Límites y evidencia

- `POST /api/demo/gemini` acepta exclusivamente fixtures sintéticos del servidor. Rechaza cuerpo y parámetros; no expone historiales ni permite enviar prompts arbitrarios.
- Una demostración a la vez, hasta cinco ejecuciones nuevas con permiso de LLM por día UTC. Cada una puede hacer hasta dos intentos; también aplica el presupuesto global de llamadas del proveedor. El contador se conserva en la base de datos y está sujeto a las limitaciones de SQLite efímero en Render.
- Se reutiliza el resultado diez minutos, identificando la fecha original y que no se ha hecho una llamada nueva. El caché permanece únicamente en memoria del proceso.
- Las claves quedan en el servidor. A Gemini se envían indicadores e índices numéricos, sin códigos de cliente.
- El LLM selecciona acciones permitidas; no calcula el riesgo ni redacta libremente los planes. Los planes provienen del catálogo y se validan junto a la evidencia.
- El registro representa la ejecución completada, no eventos en vivo. La interfaz no inventa respuestas, tokens ni disponibilidad.
- Las pruebas de integración real realizadas el 21/10/2026 devolvieron errores de disponibilidad. También se comprobó la API Interactions oficial y no se obtuvo generación exitosa; se conserva la integración generateContent soportada. Las pruebas con dobles verifican las ramas de éxito y fallo, pero no se presentan como evidencia de generación de Google.

## Verificación

37 pruebas automatizadas cubren el sistema, incluyendo entrada fija, aislamiento privado, reutilización, presupuesto público, exclusión concurrente, respuesta LLM válida con doble y errores reales representados sin generación ficticia. Se prueba además el recorrido en navegador sin autenticación.

