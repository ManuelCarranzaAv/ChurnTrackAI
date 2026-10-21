# Publicación en Render y verificación

## Estado de publicación

Aplicación: https://churntrackai.onrender.com. Repositorio: https://github.com/ManuelCarranzaAv/ChurnTrackAI. Salud: https://churntrackai.onrender.com/health. Servicio Render `srv-dbc4qnon74is73fcthvg`, Free, Docker, región Oregon. El despliegue inicial fue confirmado live; la verificación de cada actualización se conserva separadamente. No se ha probado desde un segundo dispositivo físico.

## Elección de plataforma

Condiciones consultadas el 20 de octubre de 2026; revisar de nuevo al contratar.

| Opción | Recursos y restricciones relevantes | Decisión |
|---|---|---|
| Render Free | 512 MB, 0,1 CPU. Suspensión tras 15 min sin tráfico; reactivación cercana a un minuto. Disco efímero. 750 horas gratuitas por workspace/mes | Principal; un contenedor FastAPI para todo |
| Koyeb Free | 512 MB, 0,1 vCPU, 2 GB SSD; una instancia por organización, sin volumen; escala a cero tras 1 h | Alternativa Docker si está disponible para la cuenta |
| Vercel más backend | Requiere conservar un backend y almacenamiento externos para esta arquitectura; añade configuración entre servicios | Innecesario para este MVP |

Fuentes: [planes Render](https://render.com/docs/compute-plans), [servicios gratuitos Render](https://render.com/docs/free), [instancias Koyeb](https://www.koyeb.com/docs/reference/instances), [límites de funciones Vercel](https://vercel.com/docs/functions/limitations).

Render no recomienda sus instancias gratuitas para producción empresarial. El plan también tiene cuotas de transferencia y construcción; revisar su panel para evitar sobrecostos. No se implementan pings para impedir la suspensión. El frontend muestra reconexión y limita la espera a 70 segundos; no reenvía automáticamente un POST que pudo haber sido procesado.

## Preparar GitHub

1. Conectar GitHub en esta conversación o iniciar sesión en el navegador disponible. No transmitir tokens por chat.
2. Crear un repositorio del proyecto. Revisar `git status` y confirmar que `.env`, `runtime/`, `.venv/`, el cuestionario ajeno y el notebook con metadatos quedan excluidos.
3. Publicar el código, modelos JSON, datos sintéticos y documentación. No incluir bases de datos con clientes.
4. Registrar la URL real del repositorio y el commit desplegado en `evidence/deployment.json` cuando existan.

Si se hace manualmente, tras crear el repositorio vacío y configurar Git local:

```powershell
git add backend frontend models data scripts tests docs evidence original .gitignore .dockerignore .env.example requirements.txt requirements-dev.txt requirements-training.txt requirements-lock.txt Dockerfile compose.yaml render.yaml pytest.ini README.md
git commit -m "Implementar plataforma B2B con inferencia y agentes auditables"
# Usar aquí la URL REAL devuelta por GitHub:
git remote add origin <URL_REAL_DEL_REPOSITORIO>
git push -u origin HEAD
```

No ejecutar marcadores `<...>` literalmente. Si ya hay un remoto, comprobarlo y actualizarlo sin sobrescribir repositorios ajenos. No se requieren GitHub Actions: el autodespliegue de Render basta para el MVP.

## Crear el servicio

1. En [Render Dashboard](https://dashboard.render.com), iniciar sesión.
2. Elegir **New → Blueprint** y conectar el repositorio con `render.yaml`. Alternativa: **New → Web Service**, repositorio, runtime Docker, plan Free y health check `/health`.
3. Comprobar el plan gratuito antes de confirmar. No añadir un disco ni un plan pagado sin decidir su costo.
4. `APP_API_KEY` se genera por Blueprint; para configuración manual generar una clave larga aleatoria y guardarla en Environment. Compartirla con el docente por un canal privado, no en README ni en video.
5. Configurar `GEMINI_API_KEY` en Environment para demostrar el LLM. `GEMINI_MODEL=gemini-2.5-flash-lite`; `LLM_DAILY_LIMIT=50`. La clave se introduce en el panel seguro.
6. Por defecto, `DATABASE_URL=sqlite:////app/runtime/churn.db`. Solo sirve para una demo descartable. Para conservar historial, reemplazar por la conexión segura PostgreSQL de una base externa. Se aceptan prefijos `postgres://`, `postgresql://` y `postgresql+psycopg://`. Usar TLS según las instrucciones del proveedor.
7. Desplegar. El contenedor usa el `PORT` de Render, escucha `0.0.0.0` y ejecuta un solo worker.
8. Revisar logs de build y servidor. El runtime no requiere descargar o entrenar modelos al arrancar.

Render Postgres gratuito expira a los 30 días y permite una base gratuita por workspace. No asumir almacenamiento permanente sin costo. Fuente: [Render Free](https://render.com/docs/free). La conexión PostgreSQL del proyecto necesita una prueba real tras configurarla.

## Verificar en la URL real

Guardar la URL literal que entregue Render. En una ventana independiente comprobar:

- `/health` responde 200, modelo loaded y base ok.
- Dashboard y estilos cargan por HTTPS; no depende de localhost ni CDN.
- Demo produce 12 predicciones, 4 clientes de riesgo alto y 6 mensajes en el modo de reglas con el artefacto actual.
- Configuración admite la clave; un cliente y el CSV generan resultados y el historial los recupera.
- Con Gemini activado y consentimiento, la traza muestra llamada, JSON validado y consumo real. Confirmar `mode=llm`; un fallback no satisface esta verificación.
- Aprobar una recomendación; recargar el informe y comprobar que persiste sin acción externa.
- Exportar informe y CSV. Abrir el reporte de métricas y los factores.
- Repetir desde otro equipo o red; capturar pantallas de la URL pública y medir latencia online, incluida primera carga después de suspensión.

`scripts/collect_evidence.py` recopila medidas HTTP y traza sintética. Antes de usarlo en producción adaptar el campo `scope` y los nombres de salida para distinguir evidencia pública de local; las verificaciones humanas de LLM, aprobación y otro dispositivo no quedan cubiertas por ese script.

## Actualizaciones

Cambiar código, ejecutar pytest y equivalencia del modelo si se tocaron sus artefactos, revisar secretos y subir el commit. Render puede desplegar automáticamente el branch conectado. Verificar `/health`, demo y traza después de cada build. Mantener el modelo y su evaluación juntos. Guardar exportaciones antes de reiniciar un servicio con SQLite efímero. Usar rollback desde Render ante un fallo y documentar el commit restaurado.

## LLM y presupuesto

Gemini 2.5 Flash-Lite ofrece entrada y salida sin cargo dentro del nivel gratuito elegible. Las cuotas dependen de la cuenta y pueden cambiar. En el nivel pagado estándar, la referencia consultada es USD 0,10 por millón de tokens de entrada y USD 0,40 de salida. Google indica que el contenido del nivel gratuito puede utilizarse para mejorar sus productos: la demo debe usar datos sintéticos. Fuente: [precios oficiales Gemini](https://ai.google.dev/gemini-api/docs/pricing#gemini-2.5-flash-lite).

Estimación ilustrativa para 100 consultas de un cliente: con 1.000 tokens de entrada y 300 de salida por consulta, costo pagado = 100 × (1000×0,10 + 300×0,40) / 1.000.000 = **USD 0,022**, sin reintentos. Con dos intentos en todas, USD 0,044. Esto es un escenario de presupuesto, no consumo medido. Los lotes grandes consumen más. En cuota gratuita elegible el cargo de tokens puede ser USD 0, pero 100 consultas quizá deban distribuirse en varios días por los límites. El límite local de 50 intentos diarios también aplica.

Los tokens reales se registran desde `usageMetadata`; las llamadas fallidas pueden consumir cuota sin informar tokens. No hay aún evidencia de una llamada real en este entorno. Ningún costo de hosting, facturación o disponibilidad se considera garantizado.

## ZIP y alternativas

El archivo ZIP de entrega conserva fuentes y artefactos para subir a un repositorio o construir una imagen Docker. Render se despliega desde Git o una imagen compatible; no asumir que acepta un ZIP como web completa. Koyeb puede construir el mismo Dockerfile con las variables indicadas. Subir únicamente HTML a un hosting estático no ejecuta esta API ni sus agentes.


## Acceso para el profesor

El enlace público permite ejecutar 12 o 300 ejemplos sintéticos sin clave y sin consumir Gemini. Para cargar datos propios se requiere APP_API_KEY, validada por `/api/session`. GEMINI_API_KEY permanece exclusivamente en el servidor. No compartir claves del proveedor.

Render Free no establece una caducidad fija para este servicio web: se suspende después de 15 minutos sin tráfico y vuelve a arrancar con una visita, normalmente en aproximadamente un minuto. Hay 750 horas gratuitas por espacio de trabajo y mes, además de cuotas de transferencia y compilación. El enlace puede compartirse mientras el servicio y la cuenta estén activos y dentro de cuota. SQLite se pierde al suspender, reiniciar o desplegar; exportar informes. No se ha contratado un plan de pago ni se promete disponibilidad continua. Fuente: https://render.com/docs/free (consultada 21/10/2026).

Vercel admite FastAPI/Python, pero migrar esta aplicación requiere adaptar almacenamiento y cuotas a funciones sin estado. Se conserva Render porque ya ejecuta el backend completo; el modo público reproducible permite la revisión académica. Fuente: https://vercel.com/docs/functions/runtimes/python .
