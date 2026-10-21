# Exportación de celdas de código; sin salidas ni metadatos de Colab.

!pip -q install gradio

import numpy as np
import pandas as pd

import matplotlib.pyplot as plt

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    classification_report,
    confusion_matrix
)

from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Input, Dense, Dropout
from tensorflow.keras.optimizers import Adam

np.random.seed(42)

n = 1500

antiguedad = np.random.randint(1, 61, n)
compras_mensuales = np.random.randint(1, 16, n)
monto_promedio = np.random.randint(100, 5000, n)
reclamos = np.random.randint(0, 8, n)
dias_ultima_compra = np.random.randint(1, 121, n)
pagos_atrasados = np.random.randint(0, 6, n)

riesgo = (
    dias_ultima_compra * 0.035
    + reclamos * 0.45
    + pagos_atrasados * 0.55
    - compras_mensuales * 0.18
    - antiguedad * 0.015
)

riesgo += np.random.normal(0, 0.5, n)

churn = (riesgo > 2.0).astype(int)

df = pd.DataFrame({
    "antiguedad": antiguedad,
    "compras_mensuales": compras_mensuales,
    "monto_promedio": monto_promedio,
    "reclamos": reclamos,
    "dias_ultima_compra": dias_ultima_compra,
    "pagos_atrasados": pagos_atrasados,
    "churn": churn
})

display(df.head(10))

print("Cantidad de clientes:", len(df))
print("\nDistribución de Churn:")
print(df["churn"].value_counts())

print("\nPorcentaje de Churn:")
print(df["churn"].value_counts(normalize=True) * 100)

X = df.drop("churn", axis=1)
y = df["churn"]

X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.20,
    random_state=42,
    stratify=y
)

print("Clientes para entrenamiento:", len(X_train))
print("Clientes para prueba:", len(X_test))

scaler = StandardScaler()

X_train_scaled = scaler.fit_transform(X_train)

X_test_scaled = scaler.transform(X_test)

model = Sequential([
    Input(shape=(6,)),

    Dense(32, activation="relu"),
    Dropout(0.20),

    Dense(16, activation="relu"),

    Dense(8, activation="relu"),

    Dense(1, activation="sigmoid")
])

model.compile(
    optimizer=Adam(learning_rate=0.001),
    loss="binary_crossentropy",
    metrics=["accuracy"]
)

history = model.fit(
    X_train_scaled,
    y_train,
    epochs=50,
    batch_size=32,
    validation_split=0.20,
    verbose=1
)

pred_prob = model.predict(X_test_scaled, verbose=0).flatten()

pred_clase = (pred_prob >= 0.5).astype(int)

accuracy = accuracy_score(y_test, pred_clase)
precision = precision_score(y_test, pred_clase, zero_division=0)
recall = recall_score(y_test, pred_clase, zero_division=0)
f1 = f1_score(y_test, pred_clase, zero_division=0)

print(f"Accuracy:  {accuracy * 100:.2f}%")
print(f"Precision: {precision * 100:.2f}%")
print(f"Recall:    {recall * 100:.2f}%")
print(f"F1-Score:  {f1 * 100:.2f}%")

print("\nReporte de clasificación:")
print(classification_report(y_test, pred_clase, zero_division=0))

cm = confusion_matrix(y_test, pred_clase)

plt.figure(figsize=(5, 4))

plt.imshow(cm)

plt.title("Matriz de Confusión")
plt.xlabel("Predicción")
plt.ylabel("Valor real")

plt.xticks([0, 1], ["No Churn", "Churn"])
plt.yticks([0, 1], ["No Churn", "Churn"])

for i in range(2):
    for j in range(2):
        plt.text(j, i, cm[i, j], ha="center", va="center")

plt.show()

def predecir_cliente(
    antiguedad,
    compras_mensuales,
    monto_promedio,
    reclamos,
    dias_ultima_compra,
    pagos_atrasados
):

    datos = np.array([[
        antiguedad,
        compras_mensuales,
        monto_promedio,
        reclamos,
        dias_ultima_compra,
        pagos_atrasados
    ]])

    datos_scaled = scaler.transform(datos)

    probabilidad = model.predict(
        datos_scaled,
        verbose=0
    )[0][0]

    porcentaje = probabilidad * 100

    if porcentaje >= 70:
        riesgo = "🔴 ALTO"

        recomendacion = (
            "Contactar al cliente prioritariamente y aplicar "
            "una estrategia de retención."
        )

    elif porcentaje >= 40:
        riesgo = "🟡 MEDIO"

        recomendacion = (
            "Realizar seguimiento periódico y analizar "
            "posibles señales de insatisfacción."
        )

    else:
        riesgo = "🟢 BAJO"

        recomendacion = (
            "Mantener la relación comercial y seguimiento normal."
        )

    return porcentaje, riesgo, recomendacion

resultado = predecir_cliente(
    antiguedad=20,
    compras_mensuales=2,
    monto_promedio=800,
    reclamos=1,
    dias_ultima_compra=30,
    pagos_atrasados=2
)

print(f"Probabilidad de Churn: {resultado[0]:.2f}%")
print(f"Nivel de riesgo: {resultado[1]}")
print(f"Recomendación: {resultado[2]}")

resultado = predecir_cliente(
    antiguedad=48,
    compras_mensuales=10,
    monto_promedio=2500,
    reclamos=0,
    dias_ultima_compra=5,
    pagos_atrasados=0
)

print(f"Probabilidad de Churn: {resultado[0]:.2f}%")
print(f"Nivel de riesgo: {resultado[1]}")
print(f"Recomendación: {resultado[2]}")

def procesar_csv(filepath):

    df_clientes = pd.read_csv(filepath)

    columnas_requeridas = [
        "antiguedad",
        "compras_mensuales",
        "monto_promedio",
        "reclamos",
        "dias_ultima_compra",
        "pagos_atrasados"
    ]

    faltantes = [
        col for col in columnas_requeridas
        if col not in df_clientes.columns
    ]

    if faltantes:
        raise ValueError(
            "Faltan estas columnas: " + ", ".join(faltantes)
        )

    X_nuevos = df_clientes[columnas_requeridas]

    X_nuevos_scaled = scaler.transform(X_nuevos)

    probabilidades = model.predict(
        X_nuevos_scaled,
        verbose=0
    ).flatten()

    df_clientes["probabilidad_churn"] = (
        probabilidades * 100
    ).round(2)

    df_clientes["nivel_riesgo"] = pd.cut(
        df_clientes["probabilidad_churn"],
        bins=[-1, 39.99, 69.99, 100],
        labels=[
            "🟢 Bajo",
            "🟡 Medio",
            "🔴 Alto"
        ]
    )

    def generar_recomendacion(row):

        p = row["probabilidad_churn"]

        if p >= 70:

            if row["dias_ultima_compra"] >= 60:
                return "Reactivación y contacto prioritario."

            elif row["reclamos"] >= 3:
                return "Resolver reclamos y realizar seguimiento."

            elif row["pagos_atrasados"] >= 2:
                return "Revisar pagos y ofrecer alternativas."

            else:
                return "Contacto preventivo y estrategia de retención."

        elif p >= 40:

            return "Realizar seguimiento periódico."

        else:

            return "Mantener seguimiento comercial."

    df_clientes["recomendacion"] = (
        df_clientes.apply(
            generar_recomendacion,
            axis=1
        )
    )

    output_path = "/content/resultados_churn.csv"

    df_clientes.to_csv(
        output_path,
        index=False
    )

    return df_clientes, output_path

import gradio as gr

def interfaz_cliente(
    antiguedad,
    compras_mensuales,
    monto_promedio,
    reclamos,
    dias_ultima_compra,
    pagos_atrasados
):

    porcentaje, riesgo, recomendacion = predecir_cliente(
        antiguedad,
        compras_mensuales,
        monto_promedio,
        reclamos,
        dias_ultima_compra,
        pagos_atrasados
    )

    resultado = f"""
# Resultado de la predicción

## Probabilidad de Churn
### {porcentaje:.2f}%

## Nivel de riesgo
### {riesgo}

### Recomendación

{recomendacion}
"""

    return resultado


def interfaz_csv(filepath):

    if filepath is None:
        return "Por favor, carga un archivo CSV."

    resultados, archivo = procesar_csv(filepath)

    return resultados, archivo


with gr.Blocks(
    title="Sistema de Predicción de Churn B2B"
) as demo:

    gr.Markdown("""
    # 📊 Sistema de Predicción de Churn B2B

    ### Prototipo funcional basado en Redes Neuronales

    Permite identificar clientes con riesgo de abandono
    y generar recomendaciones de retención.
    """)

    # ------------------------------------------
    # PREDICCIÓN INDIVIDUAL
    # ------------------------------------------

    gr.Markdown("## 👤 Predicción individual")

    with gr.Row():

        with gr.Column():

            antiguedad = gr.Number(
                label="Antigüedad (meses)",
                value=24
            )

            compras = gr.Number(
                label="Compras mensuales",
                value=5
            )

            monto = gr.Number(
                label="Monto promedio (S/)",
                value=800
            )

        with gr.Column():

            reclamos = gr.Number(
                label="Número de reclamos",
                value=2
            )

            dias = gr.Number(
                label="Días desde última compra",
                value=30
            )

            atrasos = gr.Number(
                label="Pagos atrasados",
                value=1
            )

    boton = gr.Button(
        "🔍 PREDECIR CHURN"
    )

    resultado_individual = gr.Markdown()

    boton.click(
        fn=interfaz_cliente,
        inputs=[
            antiguedad,
            compras,
            monto,
            reclamos,
            dias,
            atrasos
        ],
        outputs=resultado_individual
    )

    # ------------------------------------------
    # PREDICCIÓN MASIVA
    # ------------------------------------------

    gr.Markdown("---")

    gr.Markdown("""
    ## 📁 Predicción masiva mediante CSV

    Carga un archivo con los datos de los clientes
    para obtener las probabilidades de Churn.
    """)

    archivo = gr.File(
        label="Subir archivo CSV",
        file_types=[".csv"],
        type="filepath"
    )

    boton_csv = gr.Button(
        "📊 ANALIZAR CLIENTES"
    )

    tabla_resultados = gr.Dataframe(
        label="Resultados"
    )

    archivo_resultado = gr.File(
        label="Descargar resultados"
    )

    boton_csv.click(
        fn=interfaz_csv,
        inputs=archivo,
        outputs=[
            tabla_resultados,
            archivo_resultado
        ]
    )


demo.launch(share=True)