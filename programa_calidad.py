import streamlit as st
import pandas as pd
import json
import uuid
import streamlit.components.v1 as components

def render_echarts(option, height=500, key_prefix="echart"):
    chart_id = f"{key_prefix}_{uuid.uuid4().hex}"
    options_json = json.dumps(option, ensure_ascii=False)
    html = f"""
    <div id=\"{chart_id}\" style=\"width:100%;height:{height}px;\"></div>
    <script src=\"https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js\"></script>
    <script>
      const chart = echarts.init(document.getElementById('{chart_id}'));
      const option = {options_json};
      chart.setOption(option);
      window.addEventListener('resize', () => chart.resize());
    </script>
    """
    components.html(html, height=height)

st.set_page_config(page_title="Homologador y Visor", layout="wide")

st.title("🔄 Homologador y Visualizador de Datos")
st.markdown("Sube tu archivo de Excel, limpia tus datos en la primera pestaña y analízalos en la segunda.")

# 1. Subir el archivo (esto se queda fuera de las pestañas para que aplique a ambas)
archivo_subido = st.file_uploader("Sube tu archivo Excel (.xlsx)", type=["xlsx"])

if archivo_subido is not None:
    # 2. Guardar el DataFrame en la memoria de la sesión y reiniciar variables
    if "nombre_archivo" not in st.session_state or st.session_state.nombre_archivo != archivo_subido.name:
        # Cargamos los nuevos datos
        try:
            st.session_state.df = pd.read_excel(archivo_subido, engine='openpyxl')
        except ImportError:
            st.error("Falta la dependencia 'openpyxl'. Instalala con: pip install openpyxl")
            st.stop()
        except Exception as exc:
            st.error(f"No se pudo leer el archivo Excel: {exc}")
            st.stop()
        st.session_state.nombre_archivo = archivo_subido.name
        
        # ¡AQUÍ ESTÁ LA CLAVE! 
        # Si el archivo es nuevo, el historial debe empezar desde cero obligatoriamente.
        st.session_state.historial = []
    
    # Asignamos el df guardado a una variable para usarlo más fácil
    df = st.session_state.df
    
    # Mantenemos esta validación por seguridad (por si en alguna otra parte del código 
    # se llega a borrar la variable historial por accidente)
    if "historial" not in st.session_state:
        st.session_state.historial = []

    # --- CREACIÓN DE PESTAÑAS ---
    tab1, tab2 = st.tabs(["🔄 Homologación de Datos", "📊 Visualización de Gráficos"])
    
    # ==========================================
    # PESTAÑA 1: HOMOLOGACIÓN
    # ==========================================
    with tab1:
        st.subheader("1. Vista previa de los datos")
        st.dataframe(df.head(), use_container_width=True)
        st.divider()
        
        st.subheader("2. Configura la homologación")
        columna_seleccionada = st.selectbox("Elige la columna a homologar:", df.columns, key="col_homologar")
        
        if columna_seleccionada:
            valores_unicos = df[columna_seleccionada].dropna().unique().tolist()
            
            valores_a_cambiar = st.multiselect(
                f"Selecciona los valores de '{columna_seleccionada}' que quieres modificar:",
                options=valores_unicos
            )
            
            if valores_a_cambiar:
                opciones_destino = ["-- Escribir manualmente --"] + valores_unicos
                valor_destino_seleccionado = st.selectbox("Selecciona el valor final homologado:", options=opciones_destino)
                
                if valor_destino_seleccionado == "-- Escribir manualmente --":
                    nuevo_valor = st.text_input("Escribe el nuevo valor:")
                else:
                    nuevo_valor = valor_destino_seleccionado
                
                if st.button("Aplicar Homologación", type="primary"):
                    if nuevo_valor:
                        # 1. Aplicamos el cambio
                        df[columna_seleccionada] = df[columna_seleccionada].replace(valores_a_cambiar, nuevo_valor)
                        st.session_state.df = df
                        
                        # 2. NUEVO: Guardamos el registro en el historial
                        registro = f"✅ Columna '{columna_seleccionada}': Se cambió {valores_a_cambiar} por '{nuevo_valor}'"
                        st.session_state.historial.append(registro)
                        
                        st.success("¡Valores actualizados!")
                        st.rerun()
            
            # --- SECCIÓN DE TRAZABILIDAD --
            st.divider()
            with st.expander("📜 Ver Historial de Cambios (Trazabilidad)"):
                if st.session_state.historial:
                    # Mostramos cada registro en formato de lista
                    for item in st.session_state.historial:
                        st.write(item)
                    
                    # Botón opcional para limpiar el historial si se desea empezar de cero
                    if st.button("Limpiar Historial"):
                        st.session_state.historial = []
                        st.rerun()
                else:
                    st.info("Aún no se han realizado homologaciones en esta sesión.")
            
            st.divider()
            
            st.subheader("3. Resultado Final y Descarga")
            
            # --- NUEVO: Herramienta de filtrado para verificación ---
            st.write("🔍 **Verifica tus datos:** Aplica filtros para comprobar que la homologación se realizó correctamente.")
            
            col_f1, col_f2 = st.columns(2)
            
            with col_f1:
                # El index predeterminado será la columna que el usuario está homologando actualmente
                idx_col = list(st.session_state.df.columns).index(columna_seleccionada) if columna_seleccionada in st.session_state.df.columns else 0
                columna_filtro = st.selectbox("Filtrar por columna:", st.session_state.df.columns, index=idx_col, key="col_filtro")
                
            with col_f2:
                valores_unicos_filtro = st.session_state.df[columna_filtro].dropna().unique().tolist()
                valores_seleccionados = st.multiselect(
                    "Mostrar solo estos valores (deja vacío para ver todos):", 
                    options=valores_unicos_filtro, 
                    key="val_filtro"
                )
            
            # Lógica de filtrado de Pandas
            if valores_seleccionados:
                # Filtramos: Nos quedamos solo con las filas donde el valor esté en la lista seleccionada
                df_final = st.session_state.df[st.session_state.df[columna_filtro].isin(valores_seleccionados)]
            else:
                # Si no hay filtros, mostramos la tabla completa
                df_final = st.session_state.df
                
            # Mostramos el DataFrame (ya sea el completo o el filtrado)
            st.dataframe(df_final, use_container_width=True)
            
            # Un pequeño texto útil para saber cuántas filas estamos viendo
            st.caption(f"Mostrando {len(df_final)} filas de un total de {len(st.session_state.df)}.")
            
            # --- SECCIÓN DE DESCARGA ---
            # El CSV ahora exportará df 
            csv = df.to_csv(index=False).encode('utf-8')
            st.download_button(
                label="📥 Descargar datos (CSV)",
                data=csv,
                file_name='datos_homologados.csv',
                mime='text/csv',
            )

    # ==========================================
    # PESTAÑA 2: VISUALIZACIÓN
    # ==========================================
    with tab2:
        st.subheader("📊 Dashboard Interactivo (ECharts)")

        st.write("Configura el panel para construir gráficos en distintos formatos.")

        columnas_numericas = df.select_dtypes(include="number").columns.tolist()
        columnas_categoricas = df.select_dtypes(include=["object", "category", "bool"]).columns.tolist()

        # Si no hay columnas categóricas, permitimos usar cualquier columna como eje.
        if not columnas_categoricas:
            columnas_categoricas = df.columns.tolist()

        control_1, control_2, control_3 = st.columns(3)
        with control_1:
            col_principal = st.selectbox(
                "Dimensión principal:",
                options=columnas_categoricas,
                key="col_principal"
            )
        with control_2:
            opciones_desglose = ["-- Ninguno --"] + [c for c in columnas_categoricas if c != col_principal]
            col_desglose = st.selectbox(
                "Desagregar por:",
                options=opciones_desglose,
                key="col_desglose"
            )
        with control_3:
            tipo_grafico = st.selectbox(
                "Formato de gráfico:",
                options=["Barras", "Líneas", "Área", "Pie", "Dona"],
                key="tipo_grafico_echarts"
            )

        control_4, control_5, control_6 = st.columns(3)
        with control_4:
            metrica = st.selectbox(
                "Métrica:",
                options=["Conteo", "Suma", "Promedio"],
                key="metrica_echarts"
            )
        with control_5:
            if metrica == "Conteo":
                col_valor = None
                st.caption("Para conteo no se requiere columna numérica.")
            else:
                if columnas_numericas:
                    col_valor = st.selectbox(
                        "Columna numérica:",
                        options=columnas_numericas,
                        key="col_valor_echarts"
                    )
                else:
                    col_valor = None
                    st.warning("No hay columnas numéricas para aplicar esta métrica.")
        with control_6:
            top_n = st.slider("Top N categorías:", min_value=3, max_value=30, value=10)

        mostrar_zoom = st.checkbox("Activar zoom interactivo", value=True)

        df_vis = df.copy()
        df_vis[col_principal] = df_vis[col_principal].fillna("Sin dato").astype(str)
        if col_desglose != "-- Ninguno --":
            df_vis[col_desglose] = df_vis[col_desglose].fillna("Sin dato").astype(str)

        if metrica != "Conteo" and not col_valor:
            st.info("Selecciona métrica de conteo o agrega una columna numérica para continuar.")
        else:
            if col_desglose == "-- Ninguno --":
                if metrica == "Conteo":
                    serie = df_vis[col_principal].value_counts().head(top_n)
                elif metrica == "Suma":
                    serie = df_vis.groupby(col_principal)[col_valor].sum().sort_values(ascending=False).head(top_n)
                else:
                    serie = df_vis.groupby(col_principal)[col_valor].mean().sort_values(ascending=False).head(top_n)

                categorias = [str(v) for v in serie.index.tolist()]
                valores = [round(float(v), 2) for v in serie.values.tolist()]

                m1, m2, m3 = st.columns(3)
                m1.metric("Filas analizadas", f"{len(df_vis):,}")
                m2.metric("Categorías visibles", f"{len(categorias):,}")
                m3.metric("Valor total", f"{sum(valores):,.2f}")

                if tipo_grafico in ["Pie", "Dona"]:
                    radio = ["40%", "70%"] if tipo_grafico == "Dona" else "65%"
                    option = {
                        "tooltip": {"trigger": "item"},
                        "legend": {"orient": "vertical", "left": "left"},
                        "series": [{
                            "name": metrica,
                            "type": "pie",
                            "radius": radio,
                            "data": [{"value": v, "name": c} for c, v in zip(categorias, valores)],
                            "emphasis": {"itemStyle": {"shadowBlur": 10, "shadowOffsetX": 0}}
                        }]
                    }
                else:
                    tipo_serie = "bar" if tipo_grafico == "Barras" else "line"
                    option = {
                        "tooltip": {"trigger": "axis"},
                        "xAxis": {"type": "category", "data": categorias, "axisLabel": {"rotate": 25}},
                        "yAxis": {"type": "value"},
                        "series": [{
                            "name": metrica,
                            "type": tipo_serie,
                            "data": valores,
                            "smooth": tipo_serie == "line",
                            "areaStyle": {} if tipo_grafico == "Área" else None
                        }]
                    }
                    if mostrar_zoom:
                        option["dataZoom"] = [{"type": "inside"}, {"type": "slider"}]

                render_echarts(option=option, height=500, key_prefix="echart_simple")

                with st.expander("Ver tabla base del gráfico"):
                    tabla = pd.DataFrame({col_principal: categorias, metrica: valores})
                    st.dataframe(tabla, use_container_width=True)

            else:
                if metrica == "Conteo":
                    tabla = pd.crosstab(df_vis[col_principal], df_vis[col_desglose])
                else:
                    agg_fun = "sum" if metrica == "Suma" else "mean"
                    tabla = pd.pivot_table(
                        df_vis,
                        index=col_principal,
                        columns=col_desglose,
                        values=col_valor,
                        aggfunc=agg_fun,
                        fill_value=0
                    )

                totales = tabla.sum(axis=1).sort_values(ascending=False).head(top_n)
                tabla_top = tabla.loc[totales.index]

                m1, m2, m3 = st.columns(3)
                m1.metric("Filas analizadas", f"{len(df_vis):,}")
                m2.metric("Categorías visibles", f"{len(tabla_top.index):,}")
                m3.metric("Series activas", f"{len(tabla_top.columns):,}")

                if tipo_grafico in ["Pie", "Dona"]:
                    st.warning("Pie y Dona no aplican bien para datos desagregados. Se mostrará Barras apiladas.")

                option = {
                    "tooltip": {"trigger": "axis", "axisPointer": {"type": "shadow"}},
                    "legend": {"top": 10},
                    "xAxis": {"type": "category", "data": [str(v) for v in tabla_top.index], "axisLabel": {"rotate": 25}},
                    "yAxis": {"type": "value"},
                    "series": []
                }

                for serie_col in tabla_top.columns:
                    datos_serie = [round(float(v), 2) for v in tabla_top[serie_col].tolist()]
                    option["series"].append({
                        "name": str(serie_col),
                        "type": "line" if tipo_grafico in ["Líneas", "Área"] else "bar",
                        "stack": "total" if tipo_grafico not in ["Líneas", "Área"] else None,
                        "areaStyle": {} if tipo_grafico == "Área" else None,
                        "smooth": True if tipo_grafico in ["Líneas", "Área"] else False,
                        "data": datos_serie
                    })

                if mostrar_zoom:
                    option["dataZoom"] = [{"type": "inside"}, {"type": "slider"}]

                render_echarts(option=option, height=500, key_prefix="echart_multi")

                with st.expander("Ver tabla de datos cruzados"):
                    st.dataframe(tabla_top, use_container_width=True)