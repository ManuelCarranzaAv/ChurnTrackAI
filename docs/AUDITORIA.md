# Auditoría técnica de ChurnTrackAI

Se inspeccionaron los cuatro archivos del proyecto original, el notebook suministrado. Los originales se preservaron en `original/`. La aplicación integrada se desarrolla en la carpeta de trabajo ANALISIS DE ABANDONO; no se sobrescribió la carpeta del escritorio.

## Hallazgos y decisiones

| Componente | Hallazgo comprobado | Decisión |
|---|---|---|
| `modelo.js` | Pesos numéricos, medias y escalas exportados; inferencia funcional 6–32–16–8–1 | Reutilizar exactamente. Conversión JSON e inferencia Python sin TensorFlow en producción |
| `index.html` | Dos formularios, predicción real en navegador, reglas comerciales y exportación CSV | Preservar marca, variables, umbrales y flujo. Reemplazar interfaz y conectar API |
| Parser CSV | Separación manual por comas; manejo incorrecto de comillas y ausencia de validación numérica estricta | Parser CSV estándar, validación de columnas, duplicados, límites, finitud y enteros |
| `README.md` | Instrucciones para Static Space de Hugging Face | Documentar un servicio completo FastAPI y Render |
| `EXPORTAR_MODELO_A_JS.py` | Exporta cuatro capas Dense y StandardScaler | Conservar como referencia y extraer parámetros sin ejecutar código arbitrario |
| Notebook | Genera 1.500 registros sintéticos, no usa una base de empresas reales | Señalar origen sintético en UI, evaluación, documentación y demo |
| Artefacto y notebook | Medias del escalador distintas | No atribuir las métricas del notebook al modelo servido. Registrar discrepancia y evaluar por separado |
| Backend y agentes originales | No existen API, persistencia, LLM ni coordinación multiagente | Implementar módulos nuevos y probar su colaboración |

## Dataset y modelo del notebook

Variables, en orden: `antiguedad`, `compras_mensuales`, `monto_promedio`, `reclamos`, `dias_ultima_compra`, `pagos_atrasados`. Semilla NumPy 42. Rangos enteros: 1–60 meses; 1–15 compras; 100–4.999 de monto; 0–7 reclamos; 1–120 días; 0–5 atrasos.

La etiqueta es `churn = (0.035*dias + 0.45*reclamos + 0.55*atrasos - 0.18*compras - 0.015*antiguedad + ruido_normal(0,0.5) > 2)`. No define un horizonte de abandono observado. El monto no interviene en la regla, aunque sí es una entrada de la red; puede adquirir asociaciones espurias.

Partición estratificada 80/20 con semilla 42. StandardScaler se ajusta sobre el entrenamiento, nunca sobre test. Red Keras Dense 32 ReLU, Dropout 0,20, Dense 16 ReLU, Dense 8 ReLU, Dense 1 sigmoide; Adam 0,001, entropía cruzada binaria, 50 épocas, batch 32, validación 20% del entrenamiento.

La validación interna del notebook comparte el ajuste del escalador con el entrenamiento completo. Esto introduce información de distribución de la validación al escalado, aunque el test externo permanece separado. Tampoco se fija la semilla de TensorFlow ni existe early stopping. El nuevo script opcional `scripts/train.py` separa train/validación/test antes de ajustar el escalador, fija semilla y restaura el mejor checkpoint. No se ha ejecutado ni se afirma que mejore el modelo.

El notebook informa accuracy 92%, precisión 95,26%, recall 93,49%, F1 94,37% en 300 ejemplos. Son salidas históricas guardadas, no mediciones reproducidas del artefacto. Sus medias reconstruidas comienzan en 30,8883; 8,0833; 2.525,8383. El archivo exportado contiene 30,975; 8,036875; 2.608,63375. No se conoce el conjunto exacto usado para entrenar estos pesos.

## Validación ejecutada del artefacto

`scripts/evaluate.py` conserva el escalador exportado y compara Python contra Node sobre 204 entradas, incluidos límites. Error máximo absoluto 5,551115123125783e-17. El Dropout se omite durante inferencia, tal como corresponde a una red en modo evaluación.

Diagnóstico nuevo: 1.000 ejemplos sintéticos, semilla 20261020, misma regla generadora del notebook. Accuracy 0,927; precisión 0,95082; recall 0,94100; F1 0,94589; AUC 0,98138; Brier 0,05278. Matriz [[289,33],[40,638]]. No es un holdout certificado del entrenamiento original ni validación externa. No se usó este conjunto para cambiar pesos o umbrales. Las métricas y la curva completa están en `models/evaluation.json`.

## Límites de uso

El sistema es un MVP académico. No demuestra reducción real de churn, impacto comercial, ROI ni calibración en una cartera empresarial. Requiere datos históricos etiquetados, definición de horizonte, separación temporal y por empresa, validación de segmentos y revisión de sesgos antes de un uso operativo. El historial representa ejecuciones del sistema, no evolución temporal del churn.
