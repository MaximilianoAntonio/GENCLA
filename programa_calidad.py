import streamlit as st
import pandas as pd
import numpy as np
import json
import uuid
import copy
import streamlit.components.v1 as components

def render_echarts(option, height=500, key_prefix="echart"):
    option_render = copy.deepcopy(option)
    option_render.setdefault("toolbox", {
        "show": True,
        "right": 10,
        "top": 10,
        "feature": {
            "saveAsImage": {
                "show": True,
                "type": "png",
                "name": "grafico_dashboard",
                "pixelRatio": 2
            }
        }
    })

    chart_id = f"{key_prefix}_{uuid.uuid4().hex}"
    options_json = json.dumps(option_render, ensure_ascii=False)
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
        st.subheader("📊 Dashboard Interactivo (Estilo Power BI)")
        st.caption("Organiza el visual por áreas: Filas, Columnas/Leyenda y Valores.")

        columnas_numericas = df.select_dtypes(include="number").columns.tolist()
        columnas_dimensiones = df.columns.tolist()

        panel_config, panel_visual = st.columns([1, 2])

        tipo_grafico = "Barras"
        col_filas = columnas_dimensiones[0]
        col_columnas = "-- Ninguno --"
        metrica = "Conteo"
        col_valor = None
        top_n = 10
        mostrar_zoom = True
        hist_col = None
        hist_bins = 12
        scatter_x = None
        scatter_y = None
        scatter_color = "-- Ninguno --"
        col_filas_sec = "-- Ninguno --"
        col_columnas_sec = "-- Ninguno --"
        nivel_tiempo_fila = "Sin transformación"
        nivel_tiempo_fila_sec = "Sin transformación"
        nivel_tiempo_col = "Sin transformación"
        nivel_tiempo_col_sec = "Sin transformación"
        ordenar_cronologico = True
        filtros_categorias = {}

        def es_columna_tiempo(serie):
            if pd.api.types.is_datetime64_any_dtype(serie):
                return True
            convertido = pd.to_datetime(serie, errors="coerce")
            return convertido.notna().mean() >= 0.7

        niveles_tiempo = ["Sin transformación", "Año", "Trimestre", "Mes", "Año-Mes", "Semana", "Día"]

        with panel_config:
            st.markdown("#### Constructor del visual")

            tipo_grafico = st.selectbox(
                "Tipo de visual:",
                options=["Barras", "Líneas", "Área", "Pie", "Dona", "Pareto", "Histograma", "Dispersión"],
                key="tipo_grafico_echarts"
            )

            st.markdown("##### Campos")

            if tipo_grafico == "Histograma":
                if columnas_numericas:
                    hist_col = st.selectbox(
                        "Valores (columna numérica):",
                        options=columnas_numericas,
                        key="col_hist_echarts"
                    )
                    hist_bins = st.slider("Bins:", min_value=5, max_value=50, value=12, key="bins_hist_echarts")
                else:
                    st.warning("No hay columnas numéricas disponibles para histograma.")
            elif tipo_grafico == "Dispersión":
                if len(columnas_numericas) >= 2:
                    scatter_x = st.selectbox(
                        "Eje X (Valores):",
                        options=columnas_numericas,
                        key="col_scatter_x"
                    )
                    scatter_y = st.selectbox(
                        "Eje Y (Valores):",
                        options=[c for c in columnas_numericas if c != scatter_x],
                        key="col_scatter_y"
                    )
                    scatter_color = st.selectbox(
                        "Leyenda (opcional):",
                        options=["-- Ninguno --"] + columnas_dimensiones,
                        key="col_scatter_color"
                    )
                else:
                    st.warning("Se requieren al menos dos columnas numéricas para el gráfico de dispersión.")
            else:
                col_filas = st.selectbox(
                    "Filas (categoría principal):",
                    options=columnas_dimensiones,
                    key="col_principal"
                )
                opciones_filas_sec = ["-- Ninguno --"] + [c for c in columnas_dimensiones if c != col_filas]
                col_filas_sec = st.selectbox(
                    "Filas secundarias:",
                    options=opciones_filas_sec,
                    key="col_filas_sec"
                )
                opciones_columnas = ["-- Ninguno --"] + [c for c in columnas_dimensiones if c != col_filas]
                col_columnas = st.selectbox(
                    "Columnas / Leyenda (series):",
                    options=opciones_columnas,
                    key="col_desglose"
                )
                if col_columnas != "-- Ninguno --":
                    opciones_col_sec = [
                        "-- Ninguno --"
                    ] + [
                        c for c in columnas_dimensiones if c not in [col_filas, col_filas_sec, col_columnas]
                    ]
                    col_columnas_sec = st.selectbox(
                        "Columnas secundarias:",
                        options=opciones_col_sec,
                        key="col_columnas_sec"
                    )

                st.markdown("##### Jerarquía temporal")
                if es_columna_tiempo(df[col_filas]):
                    nivel_tiempo_fila = st.selectbox(
                        f"Nivel tiempo para Filas ({col_filas}):",
                        options=niveles_tiempo,
                        key="nivel_tiempo_fila"
                    )
                if col_filas_sec != "-- Ninguno --" and es_columna_tiempo(df[col_filas_sec]):
                    nivel_tiempo_fila_sec = st.selectbox(
                        f"Nivel tiempo para Filas secundarias ({col_filas_sec}):",
                        options=niveles_tiempo,
                        key="nivel_tiempo_fila_sec"
                    )
                if col_columnas != "-- Ninguno --" and es_columna_tiempo(df[col_columnas]):
                    nivel_tiempo_col = st.selectbox(
                        f"Nivel tiempo para Columnas ({col_columnas}):",
                        options=niveles_tiempo,
                        key="nivel_tiempo_col"
                    )
                if col_columnas_sec != "-- Ninguno --" and es_columna_tiempo(df[col_columnas_sec]):
                    nivel_tiempo_col_sec = st.selectbox(
                        f"Nivel tiempo para Columnas secundarias ({col_columnas_sec}):",
                        options=niveles_tiempo,
                        key="nivel_tiempo_col_sec"
                    )

                if tipo_grafico == "Pareto":
                    metrica = "Conteo"
                    st.caption("Pareto usa conteo acumulado (80/20).")
                else:
                    metrica = st.selectbox(
                        "Valores (métrica):",
                        options=["Conteo", "Suma", "Promedio"],
                        key="metrica_echarts"
                    )
                    if metrica == "Conteo":
                        st.caption("Conteo no requiere columna numérica.")
                    elif columnas_numericas:
                        col_valor = st.selectbox(
                            "Columna numérica de valores:",
                            options=columnas_numericas,
                            key="col_valor_echarts"
                        )
                    else:
                        st.warning("No hay columnas numéricas para esta métrica.")

            st.markdown("##### Organización")
            top_n = st.slider("Top N categorías:", min_value=3, max_value=30, value=10)
            mostrar_zoom = st.checkbox("Zoom interactivo", value=True)
            ordenar_cronologico = st.checkbox("Orden cronológico en campos de tiempo", value=True)

            st.markdown("##### Categorización")
            columnas_filtro = st.multiselect(
                "Columnas para filtrar datos del gráfico:",
                options=columnas_dimensiones,
                key="cols_filtro_dashboard"
            )
            for col_fil in columnas_filtro:
                valores_fil = sorted(df[col_fil].dropna().astype(str).unique().tolist())
                seleccion_fil = st.multiselect(
                    f"Valores de {col_fil}:",
                    options=valores_fil,
                    key=f"valores_filtro_{col_fil}"
                )
                if seleccion_fil:
                    filtros_categorias[col_fil] = seleccion_fil

        with panel_visual:
            st.markdown("#### Visual")

            df_plot = df.copy()
            for col_fil, valores_fil in filtros_categorias.items():
                df_plot = df_plot[df_plot[col_fil].astype(str).isin(valores_fil)]

            st.caption(f"Filas disponibles para el visual: {len(df_plot):,} de {len(df):,}")

            if len(df_plot) == 0:
                st.warning("No hay datos con los filtros de categorización seleccionados. Ajusta los filtros para continuar.")
                st.stop()

            palette = [
                "#FF6B6B", "#4ECDC4", "#FFD93D", "#5D5FEF", "#F97F51",
                "#1B9CFC", "#F7B731", "#2ED573", "#9B59B6", "#F39C12"
            ]

            if tipo_grafico == "Histograma":
                if not hist_col:
                    st.info("Selecciona una columna numérica para construir el histograma.")
                else:
                    serie_valores = df_plot[hist_col].dropna().astype(float)
                    conteos, bordes = np.histogram(serie_valores, bins=hist_bins)
                    categorias = [f"{bordes[i]:.2f} - {bordes[i+1]:.2f}" for i in range(len(conteos))]
                    valores = conteos.tolist()

                    m1, m2, m3 = st.columns(3)
                    m1.metric("Filas analizadas", f"{len(serie_valores):,}")
                    m2.metric("Bins", f"{hist_bins}")
                    m3.metric("Observaciones", f"{int(serie_valores.count()):,}")

                    option = {
                        "color": palette,
                        "tooltip": {"trigger": "axis", "backgroundColor": "rgba(0,0,0,0.8)", "textStyle": {"color": "#FFFFFF"}},
                        "xAxis": {"type": "category", "data": categorias, "axisLabel": {"rotate": 25, "color": "#FFFFFF"}, "axisLine": {"lineStyle": {"color": "#FFFFFF"}}},
                        "yAxis": {"type": "value", "axisLabel": {"color": "#FFFFFF"}, "axisLine": {"lineStyle": {"color": "#FFFFFF"}}},
                        "series": [{"name": "Frecuencia", "type": "bar", "data": valores}]
                    }
                    if mostrar_zoom:
                        option["dataZoom"] = [{"type": "inside"}, {"type": "slider"}]

                    render_echarts(option=option, height=520, key_prefix="echart_histogram")
                    with st.expander("Ver tabla de frecuencias"):
                        st.dataframe(pd.DataFrame({"Rango": categorias, "Frecuencia": valores}), use_container_width=True)

            elif tipo_grafico == "Dispersión":
                if not scatter_x or not scatter_y:
                    st.info("Selecciona dos columnas numéricas para construir la dispersión.")
                else:
                    datos = df_plot[[scatter_x, scatter_y, scatter_color]].copy() if scatter_color != "-- Ninguno --" else df_plot[[scatter_x, scatter_y]].copy()
                    datos = datos.dropna()
                    if scatter_color != "-- Ninguno --":
                        datos[scatter_color] = datos[scatter_color].astype(str)

                    series = []
                    if scatter_color == "-- Ninguno --":
                        series.append({
                            "name": f"{scatter_x} vs {scatter_y}",
                            "type": "scatter",
                            "data": datos[[scatter_x, scatter_y]].values.tolist(),
                            "symbolSize": 10
                        })
                    else:
                        for grupo, grupo_df in datos.groupby(scatter_color):
                            series.append({
                                "name": str(grupo),
                                "type": "scatter",
                                "data": grupo_df[[scatter_x, scatter_y]].values.tolist(),
                                "symbolSize": 10
                            })

                    m1, m2 = st.columns(2)
                    m1.metric("Puntos", f"{len(datos):,}")
                    m2.metric("Series", f"{len(series):,}")

                    option = {
                        "color": palette,
                        "tooltip": {"trigger": "item", "backgroundColor": "rgba(0,0,0,0.8)", "textStyle": {"color": "#FFFFFF"}},
                        "xAxis": {"type": "value", "name": scatter_x, "nameTextStyle": {"color": "#FFFFFF"}, "axisLabel": {"color": "#FFFFFF"}, "axisLine": {"lineStyle": {"color": "#FFFFFF"}}},
                        "yAxis": {"type": "value", "name": scatter_y, "nameTextStyle": {"color": "#FFFFFF"}, "axisLabel": {"color": "#FFFFFF"}, "axisLine": {"lineStyle": {"color": "#FFFFFF"}}},
                        "legend": {"top": 10, "textStyle": {"color": "#FFFFFF"}},
                        "series": series
                    }

                    render_echarts(option=option, height=520, key_prefix="echart_scatter")
                    with st.expander("Ver tabla de puntos"):
                        st.dataframe(datos, use_container_width=True)

            else:
                df_vis = df_plot.copy()

                def aplicar_nivel_tiempo(df_base, columna, nivel):
                    if columna == "-- Ninguno --" or nivel == "Sin transformación":
                        return columna, False
                    serie = pd.to_datetime(df_base[columna], errors="coerce")
                    nueva_col = f"{columna} ({nivel})"
                    if nivel == "Año":
                        df_base[nueva_col] = serie.dt.year.astype("Int64").astype(str)
                    elif nivel == "Trimestre":
                        df_base[nueva_col] = serie.dt.year.astype("Int64").astype(str) + "-T" + serie.dt.quarter.astype("Int64").astype(str)
                    elif nivel == "Mes":
                        df_base[nueva_col] = serie.dt.month.astype("Int64").astype(str).str.zfill(2)
                    elif nivel == "Año-Mes":
                        df_base[nueva_col] = serie.dt.strftime("%Y-%m")
                    elif nivel == "Semana":
                        iso = serie.dt.isocalendar()
                        df_base[nueva_col] = iso["year"].astype("Int64").astype(str) + "-W" + iso["week"].astype("Int64").astype(str).str.zfill(2)
                    else:
                        df_base[nueva_col] = serie.dt.strftime("%Y-%m-%d")
                    df_base[nueva_col] = df_base[nueva_col].replace("<NA>", np.nan).fillna("Sin dato")
                    return nueva_col, True

                col_filas_eff, fila_es_tiempo = aplicar_nivel_tiempo(df_vis, col_filas, nivel_tiempo_fila)
                col_filas_sec_eff, fila_sec_es_tiempo = aplicar_nivel_tiempo(df_vis, col_filas_sec, nivel_tiempo_fila_sec)
                col_columnas_eff, col_es_tiempo = aplicar_nivel_tiempo(df_vis, col_columnas, nivel_tiempo_col)
                col_columnas_sec_eff, col_sec_es_tiempo = aplicar_nivel_tiempo(df_vis, col_columnas_sec, nivel_tiempo_col_sec)

                campos_filas = [col_filas_eff]
                if col_filas_sec_eff != "-- Ninguno --":
                    campos_filas.append(col_filas_sec_eff)

                campos_columnas = []
                if col_columnas_eff != "-- Ninguno --":
                    campos_columnas.append(col_columnas_eff)
                if col_columnas_sec_eff != "-- Ninguno --":
                    campos_columnas.append(col_columnas_sec_eff)

                hay_tiempo_filas = fila_es_tiempo or fila_sec_es_tiempo
                hay_tiempo_columnas = col_es_tiempo or col_sec_es_tiempo

                for campo in campos_filas + campos_columnas:
                    df_vis[campo] = df_vis[campo].fillna("Sin dato").astype(str)

                def etiqueta_compuesta(valor):
                    if isinstance(valor, tuple):
                        return " | ".join(str(v) for v in valor)
                    return str(valor)

                if tipo_grafico == "Pareto":
                    conteo = df_vis.groupby(campos_filas).size().sort_values(ascending=False).head(top_n)
                    categorias = [etiqueta_compuesta(v) for v in conteo.index.tolist()]
                    valores = [int(v) for v in conteo.values.tolist()]
                    total = sum(valores)

                    if total == 0:
                        st.info("No hay datos suficientes para construir el Pareto.")
                    else:
                        acumulado = np.cumsum(valores)
                        porcentaje = [round(v / total * 100, 2) for v in acumulado]

                        m1, m2, m3 = st.columns(3)
                        m1.metric("Filas analizadas", f"{len(df_vis):,}")
                        m2.metric("Categorías", f"{len(categorias):,}")
                        m3.metric("Total", f"{total:,}")

                        option = {
                            "color": palette,
                            "tooltip": {"trigger": "axis", "axisPointer": {"type": "shadow"}, "backgroundColor": "rgba(0,0,0,0.8)", "textStyle": {"color": "#FFFFFF"}},
                            "legend": {"top": 10, "textStyle": {"color": "#FFFFFF"}},
                            "xAxis": {"type": "category", "data": categorias, "axisLabel": {"rotate": 25, "color": "#FFFFFF"}, "axisLine": {"lineStyle": {"color": "#FFFFFF"}}},
                            "yAxis": [
                                {"type": "value", "name": "Conteo", "axisLabel": {"color": "#FFFFFF"}, "axisLine": {"lineStyle": {"color": "#FFFFFF"}}},
                                {"type": "value", "name": "Acumulado (%)", "axisLabel": {"formatter": "{value}%", "color": "#FFFFFF"}, "axisLine": {"lineStyle": {"color": "#FFFFFF"}}}
                            ],
                            "series": [
                                {"name": "Conteo", "type": "bar", "data": valores},
                                {"name": "Acumulado", "type": "line", "yAxisIndex": 1, "data": porcentaje, "smooth": True},
                                {"name": "Línea 80/20", "type": "line", "yAxisIndex": 1, "data": [80 for _ in porcentaje], "lineStyle": {"type": "dashed", "color": "#FFFFFF"}, "symbol": "none"}
                            ]
                        }

                        render_echarts(option=option, height=520, key_prefix="echart_pareto")
                        with st.expander("Ver tabla de Pareto"):
                            nombre_dim = " + ".join(campos_filas)
                            st.dataframe(pd.DataFrame({nombre_dim: categorias, "Conteo": valores, "Acumulado (%)": porcentaje}), use_container_width=True)

                elif metrica != "Conteo" and not col_valor:
                    st.info("Selecciona una columna numérica para continuar.")
                else:
                    if not campos_columnas:
                        if metrica == "Conteo":
                            serie = df_vis.groupby(campos_filas).size()
                        elif metrica == "Suma":
                            serie = df_vis.groupby(campos_filas)[col_valor].sum()
                        else:
                            serie = df_vis.groupby(campos_filas)[col_valor].mean()

                        if ordenar_cronologico and hay_tiempo_filas:
                            serie = serie.sort_index().head(top_n)
                        else:
                            serie = serie.sort_values(ascending=False).head(top_n)

                        categorias = [etiqueta_compuesta(v) for v in serie.index.tolist()]
                        valores = [round(float(v), 2) for v in serie.values.tolist()]

                        m1, m2, m3 = st.columns(3)
                        m1.metric("Filas analizadas", f"{len(df_vis):,}")
                        m2.metric("Categorías", f"{len(categorias):,}")
                        m3.metric("Valor total", f"{sum(valores):,.2f}")

                        if tipo_grafico in ["Pie", "Dona"]:
                            radio = ["40%", "70%"] if tipo_grafico == "Dona" else "65%"
                            option = {
                                "color": palette,
                                "tooltip": {"trigger": "item", "backgroundColor": "rgba(0,0,0,0.8)", "textStyle": {"color": "#FFFFFF"}},
                                "legend": {"orient": "vertical", "left": "left", "textStyle": {"color": "#FFFFFF"}},
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
                                "color": palette,
                                "tooltip": {"trigger": "axis", "backgroundColor": "rgba(0,0,0,0.8)", "textStyle": {"color": "#FFFFFF"}},
                                "xAxis": {"type": "category", "data": categorias, "axisLabel": {"rotate": 25, "color": "#FFFFFF"}, "axisLine": {"lineStyle": {"color": "#FFFFFF"}}},
                                "yAxis": {"type": "value", "axisLabel": {"color": "#FFFFFF"}, "axisLine": {"lineStyle": {"color": "#FFFFFF"}}},
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

                        render_echarts(option=option, height=520, key_prefix="echart_simple")
                        with st.expander("Ver tabla base del gráfico"):
                            nombre_dim = " + ".join(campos_filas)
                            st.dataframe(pd.DataFrame({nombre_dim: categorias, metrica: valores}), use_container_width=True)

                    else:
                        agg_fun = "size" if metrica == "Conteo" else ("sum" if metrica == "Suma" else "mean")
                        if metrica == "Conteo":
                            tabla = pd.pivot_table(
                                df_vis,
                                index=campos_filas,
                                columns=campos_columnas,
                                values=campos_filas[0],
                                aggfunc=agg_fun,
                                fill_value=0
                            )
                        else:
                            tabla = pd.pivot_table(
                                df_vis,
                                index=campos_filas,
                                columns=campos_columnas,
                                values=col_valor,
                                aggfunc=agg_fun,
                                fill_value=0
                            )

                        totales = tabla.sum(axis=1).sort_values(ascending=False).head(top_n)
                        if ordenar_cronologico and hay_tiempo_filas:
                            tabla_top = tabla.sort_index().head(top_n)
                        else:
                            tabla_top = tabla.loc[totales.index]

                        if ordenar_cronologico and hay_tiempo_columnas:
                            tabla_top = tabla_top.sort_index(axis=1)

                        if tipo_grafico in ["Pie", "Dona"]:
                            st.warning("Pie y Dona no aplican bien para datos por columnas/series. Se mostrará Barras apiladas.")

                        m1, m2, m3 = st.columns(3)
                        m1.metric("Filas analizadas", f"{len(df_vis):,}")
                        m2.metric("Categorías", f"{len(tabla_top.index):,}")
                        m3.metric("Series", f"{len(tabla_top.columns):,}")

                        option = {
                            "color": palette,
                            "tooltip": {
                                "trigger": "axis",
                                "axisPointer": {"type": "shadow"},
                                "backgroundColor": "rgba(0,0,0,0.8)",
                                "textStyle": {"color": "#FFFFFF"}
                            },
                            "legend": {"top": 10, "textStyle": {"color": "#FFFFFF"}},
                            "xAxis": {
                                "type": "category",
                                "data": [etiqueta_compuesta(v) for v in tabla_top.index],
                                "axisLabel": {"rotate": 25, "color": "#FFFFFF"},
                                "axisLine": {"lineStyle": {"color": "#FFFFFF"}}
                            },
                            "yAxis": {
                                "type": "value",
                                "axisLabel": {"color": "#FFFFFF"},
                                "axisLine": {"lineStyle": {"color": "#FFFFFF"}}
                            },
                            "series": []
                        }

                        for serie_col in tabla_top.columns:
                            datos_serie = [round(float(v), 2) for v in tabla_top[serie_col].tolist()]
                            option["series"].append({
                                "name": etiqueta_compuesta(serie_col),
                                "type": "line" if tipo_grafico in ["Líneas", "Área"] else "bar",
                                "stack": "total" if tipo_grafico not in ["Líneas", "Área"] else None,
                                "areaStyle": {} if tipo_grafico == "Área" else None,
                                "smooth": True if tipo_grafico in ["Líneas", "Área"] else False,
                                "data": datos_serie
                            })

                        if mostrar_zoom:
                            option["dataZoom"] = [{"type": "inside"}, {"type": "slider"}]

                        render_echarts(option=option, height=520, key_prefix="echart_multi")
                        with st.expander("Ver tabla de datos cruzados"):
                            st.dataframe(tabla_top, use_container_width=True)



