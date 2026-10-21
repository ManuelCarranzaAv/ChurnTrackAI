# Evidencias verificables

Las pruebas se realizaron con datos sintéticos. No acreditan efectividad comercial en una empresa.

| Verificación | Evidencia | Resultado |
|---|---|---|
| Paridad Python / JavaScript | `models/evaluation.json` | 204 casos, error máximo 5,55e-17 |
| Diagnóstico sintético independiente | `models/evaluation.json` | 1.000 casos, accuracy 0,927; AUC 0,98138 |
| API, agentes, autorización, límites y persistencia | `evidence/tests.xml` | 33 tests aprobados |
| Lote de 300 clientes CSV y JSON | `tests/test_system.py` | 300 aceptados; 301 rechazados |
| Análisis agregado | `tests/test_system.py` | Totales consistentes, prioridades ordenadas, datos fuera de dominio excluidos del índice |
| LLM en lote | `tests/test_system.py` | Doble de prueba: 20 selecciones LLM y 280 reglas explícitas; no equivale a llamada real |
| Proveedor Gemini real | `evidence/gemini-probe.json` | Consultar estado literal del último intento; nunca se guarda la clave |
| Traza real local | `evidence/demo-trace-local.json` | Tres agentes, inferencias y mensajes reales sobre ejemplos |
| HTTP local | `evidence/http-measurements.json` | Cinco muestras por endpoint; no mide Internet ni producción |
| Interfaz y aprobación | `evidence/dashboard-local.png`, `evidence/approval-local.png` | Capturas de sesiones locales |

Limitaciones: cuestionario correcto A1–K3 e integrantes pendientes; no se realizó validación empresarial ni grabación de video. La publicación se documenta separadamente tras verificar una URL real. SQLite en Render Free es efímero. Las aprobaciones no ejecutan acciones externas.

Actualización 21/10/2026: 33 pruebas aprobadas; /health, inicio y demo públicos respondieron HTTP 200. La interfaz publicada procesó la demo de 300, validó la clave privada, ejecutó un análisis individual y mostró correctamente la indisponibilidad real de Gemini. Evidencia HTTP en evidence/http-measurements-public.json. No es una prueba desde otro dispositivo físico.
