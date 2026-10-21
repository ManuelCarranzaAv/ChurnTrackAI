
# ============================================================
# EXPORTAR LA RED NEURONAL ENTRENADA A JAVASCRIPT
# Ejecuta esta celda DESPUÉS de entrenar "model" y "scaler".
# ============================================================

import json
from pathlib import Path

# Media y escala del StandardScaler
scaler_mean = scaler.mean_.tolist()
scaler_scale = scaler.scale_.tolist()

dense_layers = []
for layer in model.layers:
    if hasattr(layer, "get_weights"):
        weights = layer.get_weights()
        if len(weights) == 2:
            kernel, bias = weights
            dense_layers.append({
                "kernel": kernel.tolist(),
                "bias": bias.tolist()
            })

if len(dense_layers) != 4:
    raise ValueError(f"Se esperaban 4 capas Dense y se encontraron {len(dense_layers)}.")

js = """
// Archivo generado automáticamente desde Google Colab.
// Contiene los pesos de la Red Neuronal entrenada.

const scalerMean = %s;
const scalerScale = %s;
const layers = %s;

function relu(x) {
  return Math.max(0, x);
}

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

function dense(input, layer, activation) {
  const output = [];
  for (let j = 0; j < layer.bias.length; j++) {
    let sum = layer.bias[j];
    for (let i = 0; i < input.length; i++) {
      sum += input[i] * layer.kernel[i][j];
    }
    output.push(activation === "relu" ? relu(sum) : sigmoid(sum));
  }
  return output;
}

function predictChurn(rawFeatures) {
  // Mismo orden usado durante el entrenamiento:
  // antiguedad, compras_mensuales, monto_promedio,
  // reclamos, dias_ultima_compra, pagos_atrasados

  const scaled = rawFeatures.map(
    (v, i) => (Number(v) - scalerMean[i]) / scalerScale[i]
  );

  let x = dense(scaled, layers[0], "relu");
  x = dense(x, layers[1], "relu");
  x = dense(x, layers[2], "relu");
  x = dense(x, layers[3], "sigmoid");

  return x[0];
}
""" % (json.dumps(scaler_mean), json.dumps(scaler_scale), json.dumps(dense_layers))

Path("/content/modelo.js").write_text(js, encoding="utf-8")

from google.colab import files
files.download("/content/modelo.js")

print("✅ modelo.js generado.")
print("Sube modelo.js junto con index.html a tu Hugging Face Static Space.")
