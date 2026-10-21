# Recorrido de evaluación sin claves

1. Abrir https://churntrackai.onrender.com/ y pulsar **Iniciar demostración sin clave**. Los tres agentes procesan doce ejemplos sintéticos con la red neuronal y reglas; no requiere cuenta ni proveedor externo.
2. Seguir la guía para explorar Predictivo, Retención y Supervisor. Cambiar de cliente y observar entradas, decisiones y validaciones reales del informe.
3. Desde Supervisor, pulsar **Revisar esta acción**. En Decisiones se puede aceptar o rechazar propuestas; solo modifica la pestaña actual.
4. Pulsar **Preparar documento de seguimiento** para obtener un borrador o nota interna TXT. **Descargar plan de seguimiento CSV** exporta responsables propuestos, plazos y criterios de éxito. Son herramientas reales de exportación basadas en plantillas; no envían correos ni crean tareas en un CRM.
5. Opcionalmente, usar **Probar LLM (opcional)** o el botón de Configuración **Probar LLM con ejemplos, sin clave**. Analiza tres ejemplos fijos sin acceso privado. Revisar intentos, duración, resultado y tokens cuando el proveedor los informe. Un fallo se muestra explícitamente y los agentes continúan con reglas.
6. Para revisar escala, volver a Inicio y usar la demostración de 300 clientes. Los datos propios también se analizan sin clave desde Nuevo análisis. Solo para guardar/consultar el historial privado o usar el LLM con datos propios se necesita APP_API_KEY.

## Límites y evidencia

- `POST /api/demo/gemini` acepta exclusivamente fixtures sintéticos del servidor. Rechaza cuerpo y parámetros; no expone historiales ni permite enviar prompts arbitrarios.
- Una demostración a la vez, hasta cinco ejecuciones nuevas con permiso de LLM por día UTC. Cada una puede hacer hasta dos intentos; también aplica el presupuesto global de llamadas del proveedor. El contador se conserva en la base de datos y está sujeto a las limitaciones de SQLite efímero en Render.
- Se reutiliza el resultado diez minutos, identificando la fecha original y que no se ha hecho una llamada nueva. El caché permanece únicamente en memoria del proceso.
- Las claves quedan en el servidor. A Gemini se envían indicadores e índices numéricos, sin códigos de cliente.
- El LLM selecciona acciones permitidas; no calcula el riesgo ni redacta libremente los planes. Los planes provienen del catálogo y se validan junto a la evidencia.
- El registro representa la ejecución completada, no eventos en vivo. La interfaz no inventa respuestas, tokens ni disponibilidad.
- Las pruebas de integración real realizadas el 21/10/2026 devolvieron errores de disponibilidad. También se comprobó la API Interactions oficial y no se obtuvo generación exitosa; se conserva la integración generateContent soportada. Las pruebas con dobles verifican las ramas de éxito y fallo, pero no se presentan como evidencia de generación de Google.

## Verificación

45 pruebas automatizadas cubren el sistema, incluyendo entrada fija, aislamiento privado, reutilización, presupuesto público, exclusión concurrente, respuesta LLM válida con doble y errores reales representados sin generación ficticia. Se prueba además el recorrido en navegador sin autenticación. `node tests/actions.cjs` verifica la preparación de documentos, las etiquetas de ejecución, el escape CSV y la protección contra fórmulas.


## Análisis propio sin clave y aprobación masiva

Nuevo análisis permite un cliente o CSV de hasta 300 filas. El servidor procesa los indicadores con red neuronal y reglas, sin persistencia ni llamadas externas. El diagnóstico muestra los seis factores, el origen de la propuesta y los controles del supervisor por cliente. «Aceptar todas las pendientes» afecta toda la ejecución, incluso fuera de los filtros; conserva rechazos y aprobaciones previas. Las decisiones temporales se exportan y se pierden al recargar. Ninguna aceptación ejecuta acciones externas.

## Proveedor alternativo

Groq está implementado; requiere `LLM_PROVIDER=groq`, `GROQ_API_KEY` en Render y nuevo despliegue. `GROQ_MODEL` predeterminado: `openai/gpt-oss-20b`. No confundir la prueba con dobles automatizados con una respuesta real. La consola muestra proveedor/modelo y únicamente marca éxito tras validar respuesta y evidencia. No hay una clave gratuita compartida dentro del código.
