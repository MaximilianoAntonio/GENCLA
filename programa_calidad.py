import streamlit as st
import pandas as pd
import numpy as np
import json
import uuid
import math
import copy
import colorsys
import re
import urllib.parse
import streamlit.components.v1 as components

# ── Constantes ────────────────────────────────────────────────────────────────
NINGUNO = "-- Ninguno --"
NIVELES_TIEMPO = ["Sin transformación", "Año", "Trimestre", "Mes", "Año-Mes", "Semana", "Día"]

PALETAS = {
    "Predeterminada": ["#FF6B6B", "#4ECDC4", "#FFD93D", "#5D5FEF", "#F97F51", "#1B9CFC", "#F7B731", "#2ED573", "#9B59B6", "#F39C12"],
    "Puesta de sol":  ["#f94144", "#f3722c", "#f8961e", "#f9844a", "#f9c74f", "#90be6d", "#43aa8b", "#4d908e", "#577590", "#277da1"],
    "Océano":         ["#0077b6", "#00b4d8", "#48cae4", "#90e0ef", "#caf0f8", "#023e8a", "#0096c7", "#ade8f4", "#03045e", "#4cc9f0"],
    "Pastel":         ["#ffadad", "#ffd6a5", "#fdffb6", "#caffbf", "#9bf6ff", "#a0c4ff", "#bdb2ff", "#ffc6ff", "#e9c46a", "#d4e09b"],
}

# ── Detección de tema ────────────────────────────────────────────────────────

def _tema():
    """Detecta el tema activo y retorna los colores de UI para los gráficos."""
    try:
        base = st.get_option("theme.base")
        bg_custom = st.get_option("theme.backgroundColor")
        if base == "dark":
            oscuro = True
            fondo = bg_custom or "#0e1117"
        elif base == "light":
            oscuro = False
            fondo = bg_custom or "#ffffff"
        else:
            fondo = bg_custom or "#ffffff"
            r, g, b = int(fondo[1:3], 16), int(fondo[3:5], 16), int(fondo[5:7], 16)
            oscuro = (0.299 * r + 0.587 * g + 0.114 * b) < 128
    except Exception:
        oscuro = True
        fondo = "#0e1117"

    if oscuro:
        return {
            "fondo":       fondo,
            "texto":       "#FFFFFF",
            "linea":       "rgba(255,255,255,0.7)",
            "split":       "rgba(255,255,255,0.12)",
            "tooltip_bg":  "rgba(20,20,20,0.88)",
            "tooltip_txt": "#FFFFFF",
        }
    return {
        "fondo":       fondo,
        "texto":       "#1F2937",
        "linea":       "rgba(55,65,81,0.7)",
        "split":       "rgba(0,0,0,0.10)",
        "tooltip_bg":  "rgba(255,255,255,0.95)",
        "tooltip_txt": "#1F2937",
    }


# ── Funciones de utilidad ─────────────────────────────────────────────────────

def _ajustar_contraste_blanco(obj):
    if isinstance(obj, dict):
        return {k: _ajustar_contraste_blanco(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_ajustar_contraste_blanco(item) for item in obj]
    if isinstance(obj, str) and obj.strip().upper() == "#FFFFFF":
        return "#1F2937"
    return obj


def _ajustar_hex_lum(hex_color, delta):
    if not isinstance(hex_color, str) or not hex_color.startswith("#") or len(hex_color) != 7:
        return hex_color
    try:
        r = int(hex_color[1:3], 16) / 255.0
        g = int(hex_color[3:5], 16) / 255.0
        b = int(hex_color[5:7], 16) / 255.0
    except ValueError:
        return hex_color
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    l = max(0.0, min(1.0, l + delta))
    r2, g2, b2 = colorsys.hls_to_rgb(h, l, s)
    return "#{:02X}{:02X}{:02X}".format(int(r2 * 255), int(g2 * 255), int(b2 * 255))


def _ajustar_paleta(palette, t):
    # En tema oscuro subimos un poco la luminosidad; en claro la bajamos levemente.
    delta = 0.10 if t["fondo"] != "#ffffff" and t["texto"] == "#FFFFFF" else -0.08
    return [_ajustar_hex_lum(color, delta) for color in palette]


def _inyectar_echarts_preload():
    """Indica al navegador que precargue ECharts una sola vez por sesión."""
    if "echarts_preload_inyectado" not in st.session_state:
        st.markdown(
            '<link rel="preload" href="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js" as="script">',
            unsafe_allow_html=True,
        )
        st.session_state.echarts_preload_inyectado = True


def render_echarts(option, height=500, key_prefix="echart"):
    _inyectar_echarts_preload()
    t = _tema()
    fondo = t["fondo"]
    option_render = _ajustar_contraste_blanco(copy.deepcopy(option))
    # backgroundColor va en la opción de ECharts para que el canvas coincida con el tema.
    # La clave de descarga usa "#F9F9F9" (casi blanco) para evitar que _ajustar_contraste_blanco
    # la convierta a oscuro, manteniendo una imagen descargada legible.
    option_render["backgroundColor"] = fondo
    option_render.setdefault("toolbox", {
        "show": True, "right": 10, "top": 10,
        "feature": {
            "saveAsImage": {
                "show": True, "type": "png",
                "name": "grafico_dashboard",
                "pixelRatio": 2, "backgroundColor": "#F9F9F9"
            }
        }
    })
    chart_id = f"{key_prefix}_{uuid.uuid4().hex}"
    options_json = json.dumps(option_render, ensure_ascii=False)
    html = f"""<!DOCTYPE html>
<html style="background:{fondo};margin:0;padding:0;">
<head>
  <meta charset="utf-8">
  <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
</head>
<body style="margin:0;padding:0;background:{fondo};">
  <div id="{chart_id}" style="width:100%;height:{height}px;"></div>
  <script>
    var chart = echarts.init(document.getElementById('{chart_id}'));
    var option = {options_json};
    chart.setOption(option);
    window.addEventListener('resize', function() {{ chart.resize(); }});
  </script>
</body>
</html>"""
    data_url = "data:text/html;charset=utf-8," + urllib.parse.quote(html)
    st.iframe(data_url, height=height)


def _mermaid_id(label, prefix):
    safe = re.sub(r"[^a-zA-Z0-9_]", "_", label).strip("_")
    if not safe:
        safe = "n"
    if safe[0].isdigit():
        safe = f"n_{safe}"
    return f"{prefix}_{safe}"


def render_mermaid(diagrama, height=520):
    t = _tema()
    theme = "dark" if t["texto"] == "#FFFFFF" else "default"
    html = f"""<!DOCTYPE html>
<html style="margin:0;padding:0;background:{t['fondo']};">
<head>
    <meta charset="utf-8">
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
</head>
<body style="margin:0;padding:0;background:{t['fondo']};">
    <div class="mermaid">{diagrama}</div>
    <script>
        mermaid.initialize({{ startOnLoad: true, theme: "{theme}" }});
    </script>
</body>
</html>"""
    data_url = "data:text/html;charset=utf-8," + urllib.parse.quote(html)
    st.iframe(data_url, height=height)


def _escape_xml(texto):
    return (texto.replace("&", "&amp;")
                 .replace("<", "&lt;")
                 .replace(">", "&gt;")
                 .replace('"', "&quot;"))


def _clip_text(texto, max_chars):
    if texto is None:
        return ""
    txt = str(texto)
    if len(txt) <= max_chars:
        return txt
    return txt[: max_chars - 1] + "…"


def _parse_causas(texto):
    """Convierte texto libre a lista de causas mayores con subcausas.

    Formato esperado por linea:
    - Causa mayor
    - - Subcausa (o > Subcausa, * Subcausa)
    """
    causas = []
    actual = None
    for line in texto.splitlines():
        raw = line.strip()
        if not raw:
            continue
        if raw.startswith(("-", ">", "*")):
            sub = raw.lstrip("-*> ").strip()
            if not sub:
                continue
            if actual is None:
                causas.append({"causa": sub, "subcausas": []})
                actual = causas[-1]
            else:
                actual["subcausas"].append(sub)
        else:
            causas.append({"causa": raw, "subcausas": []})
            actual = causas[-1]
    return causas


def render_ishikawa_svg(problema, causas_por_categoria, height=620, width=1000):
    t = _tema()
    fondo = t["fondo"]
    texto = t["texto"]
    linea = t["linea"]

    categorias = ["Metodo", "Maquina", "Mano de obra", "Materiales", "Medicion", "Medio ambiente"]
    colores = ["#6C5CE7", "#E17055", "#00B894", "#FDCB6E", "#00A8FF", "#0984E3"]

    def _box_w(texto_in, base=120, char_w=7, pad=24):
        return max(base, len(str(texto_in)) * char_w + pad)

    max_causa_len = 0
    max_sub_len = 0
    max_cat_len = max(len(c) for c in categorias)
    for cat in categorias:
        for item in causas_por_categoria.get(cat, []):
            max_causa_len = max(max_causa_len, len(item.get("causa", "")))
            for sub in item.get("subcausas", []):
                max_sub_len = max(max_sub_len, len(sub))

    max_causa_w = _box_w("X" * max_causa_len, base=130)
    max_sub_w = _box_w("X" * max_sub_len, base=110, char_w=6, pad=22)
    max_cat_w = _box_w("X" * max_cat_len, base=120)
    efecto_w = _box_w(problema, base=130)

    left_pad = max(0, (max_causa_w + max_sub_w) - 180 + 32)
    right_pad = max(0, (width - 150 + efecto_w) - width)
    view_min_x = -left_pad
    view_width = width + left_pad + right_pad

    cx = width - 140
    cy = height / 2
    pares = max(1, math.ceil(len(categorias) / 2))
    spine_start = 180
    spine_end = cx - 40
    section_gap = (spine_end - spine_start) / (pares + 1)

    top_y = 140
    bottom_y = height - 140
    attach_x = [spine_start + section_gap * (i + 1) for i in range(pares)]

    offsets = [(0, 0), (22, 28), (-26, -40), (36, 56), (-48, -72), (60, 88)]

    def rect(x, y, w, h, fill, stroke, text, text_color="#FFFFFF", title_text="", font_size=13):
        title = _escape_xml(title_text) if title_text else ""
        return (
            f"<g>"
            f"<title>{title}</title>"
            f"<rect x='{x}' y='{y}' width='{w}' height='{h}' rx='6' ry='6' "
            f"fill='{fill}' stroke='{stroke}' />"
            f"<text x='{x + w/2}' y='{y + h/2 + 5}' text-anchor='middle' "
            f"fill='{text_color}' font-size='{font_size}' font-family='sans-serif'>{text}</text>"
            f"</g>"
        )

    svg = [
        f"<svg width='100%' height='100%' viewBox='{view_min_x} 0 {view_width} {height}' preserveAspectRatio='xMidYMid meet' "
        f"xmlns='http://www.w3.org/2000/svg' style='background:{fondo};display:block;'>",
        f"<defs><marker id='arrow' markerWidth='10' markerHeight='10' refX='6' refY='3' orient='auto'>"
        f"<path d='M0,0 L0,6 L6,3 z' fill='{linea}' /></marker></defs>",
        f"<line x1='{spine_start}' y1='{cy}' x2='{spine_end}' y2='{cy}' stroke='{linea}' stroke-width='2' />",
        f"<line x1='{spine_end}' y1='{cy}' x2='{cx - 10}' y2='{cy}' stroke='{linea}' stroke-width='2' marker-end='url(#arrow)' />",
    ]

    # Caja de efecto
    efecto_texto = _escape_xml(problema)
    svg.append(rect(cx - 10, cy - 26, efecto_w, 52, "#5B8FF9", "#2B5FB5", efecto_texto, title_text=problema))

    # Categorias superiores
    for idx, cat in enumerate(categorias[:3]):
        ax = attach_x[min(idx, len(attach_x) - 1)]
        svg.append(f"<line x1='{ax}' y1='{cy}' x2='{ax - 120}' y2='{top_y}' stroke='{linea}' stroke-width='2' />")
        cat_text = _escape_xml(cat)
        cat_w = _box_w(cat, base=120)
        svg.append(rect(ax - 210, top_y - 18, cat_w, 36, colores[idx], "#444", cat_text, title_text=cat))

        causas = causas_por_categoria.get(cat, [])
        n = min(6, len(causas))
        for cidx, causa_item in enumerate(causas[:6], start=1):
            t = cidx / (n + 1)
            px = ax - 120 * t
            py = cy - (cy - top_y) * t
            causa = causa_item["causa"]
            causa_text = _escape_xml(causa)
            box_w = _box_w(causa, base=130)
            dx, dy = offsets[min(cidx - 1, len(offsets) - 1)]
            box_center_x = px - 120 - dx
            box_center_y = py - dy
            box_x = box_center_x - (box_w / 2)
            box_h = 26
            box_y = box_center_y - (box_h / 2)
            svg.append(rect(box_x, box_y, box_w, box_h, "#E8E8FF", "#B6A7FF", causa_text, text_color="#222222", title_text=causa))
            svg.append(
                f"<line x1='{box_x + box_w}' y1='{box_y + (box_h / 2)}' x2='{px}' y2='{py}' "
                f"stroke='{linea}' stroke-width='1.5' marker-end='url(#arrow)' />"
            )

    # Categorias inferiores
    for idx, cat in enumerate(categorias[3:], start=3):
        ax = attach_x[min(idx - 3, len(attach_x) - 1)]
        svg.append(f"<line x1='{ax}' y1='{cy}' x2='{ax - 120}' y2='{bottom_y}' stroke='{linea}' stroke-width='2' />")
        cat_text = _escape_xml(cat)
        cat_w = _box_w(cat, base=120)
        svg.append(rect(ax - 210, bottom_y - 18, cat_w, 36, colores[idx], "#444", cat_text, title_text=cat))

        causas = causas_por_categoria.get(cat, [])
        n = min(6, len(causas))
        for cidx, causa_item in enumerate(causas[:6], start=1):
            t = cidx / (n + 1)
            px = ax - 120 * t
            py = cy + (bottom_y - cy) * t
            causa = causa_item["causa"]
            causa_text = _escape_xml(causa)
            box_w = _box_w(causa, base=130)
            dx, dy = offsets[min(cidx - 1, len(offsets) - 1)]
            box_center_x = px - 120 - dx
            box_center_y = py + dy
            box_x = box_center_x - (box_w / 2)
            box_h = 26
            box_y = box_center_y - (box_h / 2)
            svg.append(rect(box_x, box_y, box_w, box_h, "#E8E8FF", "#B6A7FF", causa_text, text_color="#222222", title_text=causa))
            svg.append(
                f"<line x1='{box_x + box_w}' y1='{box_y + (box_h / 2)}' x2='{px}' y2='{py}' "
                f"stroke='{linea}' stroke-width='1.5' marker-end='url(#arrow)' />"
            )

    svg.append("</svg>")
    html = """<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        html, body {{ margin: 0; padding: 0; width: 100%; height: 100%; }}
        .wrap {{ width: 100%; height: 100%; }}
    </style>
</head>
<body>
    <div class="wrap">{}</div>
</body>
</html>""".format("".join(svg))
    data_url = "data:text/html;charset=utf-8," + urllib.parse.quote(html)
    st.iframe(data_url, height=height)


def _df_para_tabla(df):
    df_out = df.copy()
    for col in df_out.columns:
        if df_out[col].dtype == "object":
            df_out[col] = df_out[col].astype("string")
    return df_out


def es_columna_tiempo(serie):
    if pd.api.types.is_datetime64_any_dtype(serie):
        return True
    return pd.to_datetime(serie, errors="coerce").notna().mean() >= 0.7


def aplicar_nivel_tiempo(df_base, columna, nivel):
    """Retorna (nombre_col_efectiva, serie_transformada | None). No muta df_base."""
    if columna == NINGUNO or nivel == "Sin transformación":
        return columna, None
    serie = pd.to_datetime(df_base[columna], errors="coerce")
    nueva_col = f"{columna} ({nivel})"
    if nivel == "Año":
        result = serie.dt.year.astype("Int64").astype(str)
    elif nivel == "Trimestre":
        result = serie.dt.year.astype("Int64").astype(str) + "-T" + serie.dt.quarter.astype("Int64").astype(str)
    elif nivel == "Mes":
        result = serie.dt.strftime("%Y-%m")
    elif nivel == "Año-Mes":
        result = serie.dt.strftime("%Y-%m")
    elif nivel == "Semana":
        iso = serie.dt.isocalendar()
        result = iso["year"].astype("Int64").astype(str) + "-W" + iso["week"].astype("Int64").astype(str).str.zfill(2)
    else:
        result = serie.dt.strftime("%Y-%m-%d")
    return nueva_col, result.replace("<NA>", np.nan).fillna("Sin dato")


def etiqueta_compuesta(valor):
    if isinstance(valor, tuple):
        return " | ".join(str(v) for v in valor)
    return str(valor)


# ── Helpers de construcción ECharts ───────────────────────────────────────────

def _tooltip(trigger, t):
    base = {
        "trigger": trigger,
        "backgroundColor": t["tooltip_bg"],
        "textStyle": {"color": t["tooltip_txt"]},
    }
    if trigger == "axis":
        base["axisPointer"] = {"type": "shadow"}
    return base


def _eje_x_cat(categorias, t, rotate=25, nombre=""):
    base = {
        "type": "category",
        "data": categorias,
        "axisLabel": {
            "color": t["texto"],
            "rotate": rotate,
            "interval": 0,
            "hideOverlap": True,
            "overflow": "break",
            "width": 120,
        },
        "axisLine": {"lineStyle": {"color": t["linea"]}},
    }
    if nombre:
        base["name"] = nombre
        base["nameTextStyle"] = {"color": t["texto"]}
    return base


def _eje_y_val(t, nombre=""):
    base = {
        "type": "value",
        "axisLabel": {"color": t["texto"]},
        "axisLine": {"lineStyle": {"color": t["linea"]}},
        "splitLine": {"lineStyle": {"color": t["split"]}},
    }
    if nombre:
        base["name"] = nombre
        base["nameTextStyle"] = {"color": t["texto"]}
    return base


def _data_zoom():
    return [{"type": "inside"}, {"type": "slider"}]


def _label_cfg(mostrar, t, posicion="top"):
    if not mostrar:
        return {"show": False}
    return {"show": True, "position": posicion, "color": t["texto"], "fontSize": 11}


def _titulo(texto, t):
    if not texto:
        return None
    return {
        "text": texto,
        "left": "center",
        "top": 6,
        "textStyle": {"color": t["texto"], "fontSize": 18, "fontWeight": "bold"},
    }


def _grid_con_titulo(bottom=48):
    # Deja espacio para titulo y leyenda sin solaparse.
    return {"top": 56, "left": 48, "right": 24, "bottom": bottom}


# ── Constructores de opciones por tipo de gráfico ─────────────────────────────

def build_option_histograma(categorias, valores, palette, t, mostrar_zoom, mostrar_etiquetas,
                            eje_x_nombre="", titulo=""):
    option = {
        "color": palette,
        "tooltip": _tooltip("axis", t),
        "title": _titulo(titulo, t),
        "grid": _grid_con_titulo(bottom=72),
        "xAxis": _eje_x_cat(categorias, t, nombre=eje_x_nombre),
        "yAxis": _eje_y_val(t, "Frecuencia"),
        "series": [{
            "name": "Frecuencia",
            "type": "bar",
            "data": valores,
            "label": _label_cfg(mostrar_etiquetas, t),
            "itemStyle": {"borderRadius": [4, 4, 0, 0]},
        }],
    }
    if mostrar_zoom:
        option["dataZoom"] = _data_zoom()
    return option


def build_option_dispersión(series, scatter_x, scatter_y, palette, t, titulo=""):
    return {
        "color": palette,
        "title": _titulo(titulo, t),
        "tooltip": {"trigger": "item", "backgroundColor": t["tooltip_bg"], "textStyle": {"color": t["tooltip_txt"]}},
        "xAxis": {
            "type": "value", "name": scatter_x,
            "nameTextStyle": {"color": t["texto"]},
            "axisLabel": {"color": t["texto"]},
            "axisLine": {"lineStyle": {"color": t["linea"]}},
            "splitLine": {"lineStyle": {"color": t["split"]}},
        },
        "yAxis": {
            "type": "value", "name": scatter_y,
            "nameTextStyle": {"color": t["texto"]},
            "axisLabel": {"color": t["texto"]},
            "axisLine": {"lineStyle": {"color": t["linea"]}},
            "splitLine": {"lineStyle": {"color": t["split"]}},
        },
        "legend": {"top": 28, "textStyle": {"color": t["texto"]}},
        "grid": _grid_con_titulo(),
        "series": series,
    }


def build_option_pareto(categorias, valores, porcentaje, palette, t, eje_x_nombre="", titulo=""):
    return {
        "color": palette,
        "tooltip": _tooltip("axis", t),
        "title": _titulo(titulo, t),
        "legend": {"top": 28, "textStyle": {"color": t["texto"]}},
        "grid": _grid_con_titulo(bottom=72),
        "xAxis": _eje_x_cat(categorias, t, nombre=eje_x_nombre),
        "yAxis": [
            _eje_y_val(t, "Conteo"),
            {
                "type": "value", "name": "Acumulado (%)",
                "axisLabel": {"formatter": "{value}%", "color": t["texto"]},
                "axisLine": {"lineStyle": {"color": t["linea"]}},
                "splitLine": {"show": False},
            },
        ],
        "series": [
            {
                "name": "Conteo", "type": "bar", "data": valores,
                "itemStyle": {"borderRadius": [4, 4, 0, 0]},
            },
            {
                "name": "Acumulado", "type": "line",
                "yAxisIndex": 1, "data": porcentaje, "smooth": True,
            },
            {
                "name": "Línea 80%", "type": "line",
                "yAxisIndex": 1, "data": [80] * len(porcentaje),
                "lineStyle": {"type": "dashed", "color": "#FFD93D"},
                "symbol": "none",
            },
        ],
    }


def build_option_pie_dona(categorias, valores, tipo_grafico, mostrar_etiquetas,
                          formato_etiqueta, posicion_etiqueta, palette, t, titulo=""):
    radio = ["40%", "70%"] if tipo_grafico == "Dona" else "65%"
    formatos = {
        "Valor": "{c}",
        "Categoría + valor + %": "{b}\n{c} ({d}%)",
        "Porcentaje": "{d}%",
    }
    fmt = formatos.get(formato_etiqueta, "{d}%")
    # Etiquetas exteriores usan el color del texto del tema; interiores siempre blanco
    # para contrastar con los segmentos de color de la paleta.
    color_label = t["texto"] if posicion_etiqueta == "Exterior" else "#FFFFFF"
    return {
        "color": palette,
        "title": _titulo(titulo, t),
        "tooltip": {
            "trigger": "item",
            "formatter": "{b}: {c} ({d}%)",
            "backgroundColor": t["tooltip_bg"],
            "textStyle": {"color": t["tooltip_txt"]},
        },
        "legend": {"orient": "vertical", "left": "left", "textStyle": {"color": t["texto"]}},
        "series": [{
            "name": "Valor", "type": "pie", "radius": radio,
            "data": [{"value": v, "name": c} for c, v in zip(categorias, valores)],
            "label": {
                "show": mostrar_etiquetas,
                "position": "outside" if posicion_etiqueta == "Exterior" else "inside",
                "formatter": fmt,
                "color": color_label,
            },
            "labelLine": {"show": mostrar_etiquetas and posicion_etiqueta == "Exterior"},
            "emphasis": {
                "itemStyle": {"shadowBlur": 10, "shadowOffsetX": 0},
                "label": {"show": True, "fontSize": 14, "fontWeight": "bold"},
            },
        }],
    }


def build_option_serie_simple(categorias, valores, tipo_grafico, metrica,
                               palette, t, mostrar_zoom, mostrar_etiquetas,
                               eje_x_nombre="", titulo=""):
    tipo_serie = "bar" if tipo_grafico == "Barras" else "line"
    serie = {
        "name": metrica,
        "type": tipo_serie,
        "data": valores,
        "smooth": tipo_serie == "line",
        "areaStyle": {} if tipo_grafico == "Área" else None,
        "label": _label_cfg(mostrar_etiquetas, t),
    }
    if tipo_serie == "bar":
        serie["itemStyle"] = {"borderRadius": [4, 4, 0, 0]}
    option = {
        "color": palette,
        "tooltip": _tooltip("axis", t),
        "title": _titulo(titulo, t),
        "grid": _grid_con_titulo(bottom=72),
        "xAxis": _eje_x_cat(categorias, t, nombre=eje_x_nombre),
        "yAxis": _eje_y_val(t, metrica),
        "series": [serie],
    }
    if mostrar_zoom:
        option["dataZoom"] = _data_zoom()
    return option


def build_option_multi_series(tabla_top, tipo_grafico, metrica, palette,
                               t, mostrar_zoom, mostrar_etiquetas,
                               eje_x_nombre="", titulo=""):
    es_linea_area = tipo_grafico in ["Líneas", "Área"]
    tipo_serie = "line" if es_linea_area else "bar"
    posicion_label = "top" if es_linea_area else "inside"
    series = []
    for col in tabla_top.columns:
        datos = [round(float(v), 2) for v in tabla_top[col].tolist()]
        s = {
            "name": etiqueta_compuesta(col),
            "type": tipo_serie,
            "stack": None if es_linea_area else "total",
            "areaStyle": {} if tipo_grafico == "Área" else None,
            "smooth": es_linea_area,
            "data": datos,
            "label": _label_cfg(mostrar_etiquetas, t, posicion_label),
        }
        if not es_linea_area:
            s["itemStyle"] = {"borderRadius": [4, 4, 0, 0]}
        series.append(s)
    option = {
        "color": palette,
        "tooltip": _tooltip("axis", t),
        "title": _titulo(titulo, t),
        "legend": {"top": 28, "textStyle": {"color": t["texto"]}},
        "grid": _grid_con_titulo(bottom=72),
        "xAxis": _eje_x_cat([etiqueta_compuesta(v) for v in tabla_top.index], t, nombre=eje_x_nombre),
        "yAxis": _eje_y_val(t, metrica),
        "series": series,
    }
    if mostrar_zoom:
        option["dataZoom"] = _data_zoom()
    return option


# ── Aplicación ────────────────────────────────────────────────────────────────

st.set_page_config(page_title="Homologador y Visor", layout="wide")
st.title("🔄 Homologador y Visualizador de Datos")
st.markdown("Sube tu archivo de Excel, limpia tus datos en la primera pestaña y analízalos en la segunda.")

col_uploader, col_reset = st.columns([3, 1])
with col_reset:
    if st.button("Restablecer datos"):
        for key in ["df", "nombre_archivo", "historial", "archivo_excel"]:
            if key in st.session_state:
                del st.session_state[key]
        st.rerun()

with col_uploader:
    archivo_subido = st.file_uploader(
        "Sube tu archivo Excel (.xlsx)",
        type=["xlsx"],
        key="archivo_excel"
    )

if archivo_subido is not None:
    if "nombre_archivo" not in st.session_state or st.session_state.nombre_archivo != archivo_subido.name:
        try:
            st.session_state.df = pd.read_excel(archivo_subido, engine='openpyxl')
        except ImportError:
            st.error("Falta la dependencia 'openpyxl'. Instalala con: pip install openpyxl")
            st.stop()
        except Exception as exc:
            st.error(f"No se pudo leer el archivo Excel: {exc}")
            st.stop()
        st.session_state.nombre_archivo = archivo_subido.name
        st.session_state.historial = []

    df = st.session_state.df

    if "historial" not in st.session_state:
        st.session_state.historial = []

    tab1, tab2, tab3 = st.tabs(["🔄 Homologación de Datos", "📊 Visualización de Gráficos", "🦴 Ishikawa"])

    # ══════════════════════════════════════════
    # PESTAÑA 1: HOMOLOGACIÓN
    # ══════════════════════════════════════════
    with tab1:
        st.subheader("1. Vista previa de los datos")
        st.dataframe(_df_para_tabla(df.head()), width="stretch")
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
                    if not nuevo_valor:
                        st.warning("El valor destino no puede estar vacío.")
                    else:
                        df[columna_seleccionada] = df[columna_seleccionada].replace(valores_a_cambiar, nuevo_valor)
                        st.session_state.df = df
                        registro = f"✅ Columna '{columna_seleccionada}': Se cambió {valores_a_cambiar} por '{nuevo_valor}'"
                        st.session_state.historial.append(registro)
                        st.success("¡Valores actualizados!")
                        st.rerun()

            st.divider()
            with st.expander("📜 Ver Historial de Cambios (Trazabilidad)"):
                if st.session_state.historial:
                    for item in st.session_state.historial:
                        st.write(item)
                    if st.button("Limpiar Historial"):
                        st.session_state.historial = []
                        st.rerun()
                else:
                    st.info("Aún no se han realizado homologaciones en esta sesión.")

            st.divider()
            st.subheader("3. Resultado Final y Descarga")
            st.write("🔍 **Verifica tus datos:** Aplica filtros para comprobar que la homologación se realizó correctamente.")

            col_f1, col_f2 = st.columns(2)
            with col_f1:
                idx_col = list(st.session_state.df.columns).index(columna_seleccionada) if columna_seleccionada in st.session_state.df.columns else 0
                columna_filtro = st.selectbox("Filtrar por columna:", st.session_state.df.columns, index=idx_col, key="col_filtro")
            with col_f2:
                valores_unicos_filtro = st.session_state.df[columna_filtro].dropna().unique().tolist()
                valores_seleccionados = st.multiselect(
                    "Mostrar solo estos valores (deja vacío para ver todos):",
                    options=valores_unicos_filtro,
                    key="val_filtro"
                )

            if valores_seleccionados:
                df_final = st.session_state.df[st.session_state.df[columna_filtro].isin(valores_seleccionados)]
            else:
                df_final = st.session_state.df

            st.dataframe(_df_para_tabla(df_final), width="stretch")
            st.caption(f"Mostrando {len(df_final)} filas de un total de {len(st.session_state.df)}.")

            csv = df_final.to_csv(index=False).encode('utf-8')
            st.download_button(
                label="📥 Descargar datos (CSV)",
                data=csv,
                file_name='datos_homologados.csv',
                mime='text/csv',
            )

    # ══════════════════════════════════════════
    # PESTAÑA 2: VISUALIZACIÓN
    # ══════════════════════════════════════════
    with tab2:
        st.subheader("📊 Dashboard Interactivo (Estilo Power BI)")
        st.caption("Organiza el visual por áreas: Filas, Columnas/Leyenda y Valores.")

        columnas_numericas = df.select_dtypes(include="number").columns.tolist()
        columnas_dimensiones = df.columns.tolist()

        panel_config, panel_visual = st.columns([1, 2])

        filtros_categorias = {}

        with panel_config:
            st.markdown("#### Constructor del visual")

            tipo_grafico = st.selectbox(
                "Tipo de visual:",
                options=["Barras", "Líneas", "Área", "Pie", "Dona", "Pareto", "Histograma", "Dispersión"],
                key="tipo_grafico_echarts"
            )

            st.markdown("##### Campos")

            # Defaults para variables que sólo se asignan en ramas condicionales
            hist_col = None
            hist_bins = 12
            scatter_x = None
            scatter_y = None
            scatter_color = NINGUNO
            col_filas = columnas_dimensiones[0]
            col_filas_sec = NINGUNO
            col_columnas = NINGUNO
            col_columnas_sec = NINGUNO
            nivel_tiempo_fila = "Sin transformación"
            nivel_tiempo_fila_sec = "Sin transformación"
            nivel_tiempo_col = "Sin transformación"
            nivel_tiempo_col_sec = "Sin transformación"
            metrica = "Conteo"
            col_valor = None
            mostrar_numeros_torta = False
            formato_numeros_torta = "Porcentaje"
            posicion_etiqueta_torta = "Exterior"
            mostrar_sugerencias_torta = True
            agrupar_otros_torta = False
            umbral_otros_torta = 3.0

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
                    scatter_x = st.selectbox("Eje X (Valores):", options=columnas_numericas, key="col_scatter_x")
                    scatter_y = st.selectbox(
                        "Eje Y (Valores):",
                        options=[c for c in columnas_numericas if c != scatter_x],
                        key="col_scatter_y"
                    )
                    scatter_color = st.selectbox(
                        "Leyenda (opcional):",
                        options=[NINGUNO] + columnas_dimensiones,
                        key="col_scatter_color"
                    )
                else:
                    st.warning("Se requieren al menos dos columnas numéricas para el gráfico de dispersión.")

            else:
                col_filas = st.selectbox(
                    "Filas (categoría principal):", options=columnas_dimensiones, key="col_principal"
                )
                opciones_filas_sec = [NINGUNO] + [c for c in columnas_dimensiones if c != col_filas]
                col_filas_sec = st.selectbox("Filas secundarias:", options=opciones_filas_sec, key="col_filas_sec")
                opciones_columnas = [NINGUNO] + [c for c in columnas_dimensiones if c != col_filas]
                col_columnas = st.selectbox(
                    "Columnas / Leyenda (series):", options=opciones_columnas, key="col_desglose"
                )
                if col_columnas != NINGUNO:
                    opciones_col_sec = [NINGUNO] + [
                        c for c in columnas_dimensiones
                        if c not in [col_filas, col_filas_sec, col_columnas]
                    ]
                    col_columnas_sec = st.selectbox(
                        "Columnas secundarias:", options=opciones_col_sec, key="col_columnas_sec"
                    )

                st.markdown("##### Jerarquía temporal")
                if es_columna_tiempo(df[col_filas]):
                    nivel_tiempo_fila = st.selectbox(
                        f"Nivel tiempo para Filas ({col_filas}):",
                        options=NIVELES_TIEMPO, key="nivel_tiempo_fila"
                    )
                if col_filas_sec != NINGUNO and es_columna_tiempo(df[col_filas_sec]):
                    nivel_tiempo_fila_sec = st.selectbox(
                        f"Nivel tiempo para Filas secundarias ({col_filas_sec}):",
                        options=NIVELES_TIEMPO, key="nivel_tiempo_fila_sec"
                    )
                if col_columnas != NINGUNO and es_columna_tiempo(df[col_columnas]):
                    nivel_tiempo_col = st.selectbox(
                        f"Nivel tiempo para Columnas ({col_columnas}):",
                        options=NIVELES_TIEMPO, key="nivel_tiempo_col"
                    )
                if col_columnas_sec != NINGUNO and es_columna_tiempo(df[col_columnas_sec]):
                    nivel_tiempo_col_sec = st.selectbox(
                        f"Nivel tiempo para Columnas secundarias ({col_columnas_sec}):",
                        options=NIVELES_TIEMPO, key="nivel_tiempo_col_sec"
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
            mostrar_etiquetas = st.checkbox("Etiquetas de valor", value=False, key="mostrar_etiquetas")
            ordenar_cronologico = st.checkbox("Orden cronológico en campos de tiempo", value=True)
            orden_ascendente = st.checkbox("Ordenar de menor a mayor (valores)", value=False, key="orden_ascendente")
            paleta_nombre = st.selectbox(
                "Paleta de colores:", options=list(PALETAS.keys()), key="paleta_nombre"
            )
            palette = _ajustar_paleta(PALETAS[paleta_nombre], _tema())

            if tipo_grafico in ["Pie", "Dona"]:
                st.markdown("##### Etiquetas en torta/dona")
                mostrar_numeros_torta = st.checkbox(
                    "Mostrar números en el gráfico", value=True, key="mostrar_numeros_torta"
                )
                if mostrar_numeros_torta:
                    formato_numeros_torta = st.selectbox(
                        "Formato de etiqueta:",
                        options=["Porcentaje", "Valor", "Categoría + valor + %"],
                        key="formato_numeros_torta"
                    )
                    posicion_etiqueta_torta = st.selectbox(
                        "Posición de etiqueta:",
                        options=["Exterior", "Interior"],
                        key="posicion_etiqueta_torta"
                    )
                mostrar_sugerencias_torta = st.checkbox(
                    "Mostrar sugerencias automáticas", value=True, key="mostrar_sugerencias_torta"
                )
                st.markdown("##### Agrupación automática")
                agrupar_otros_torta = st.checkbox(
                    "Agrupar categorías pequeñas en 'Otros'", value=False, key="agrupar_otros_torta"
                )
                if agrupar_otros_torta:
                    umbral_otros_torta = st.slider(
                        "Umbral mínimo por categoría (%):",
                        min_value=1.0, max_value=15.0, value=3.0, step=0.5,
                        key="umbral_otros_torta"
                    )

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

            t = _tema()
            df_plot = df.copy()
            for col_fil, valores_fil in filtros_categorias.items():
                df_plot = df_plot[df_plot[col_fil].astype(str).isin(valores_fil)]

            st.caption(f"Filas disponibles para el visual: {len(df_plot):,} de {len(df):,}")

            if len(df_plot) == 0:
                st.warning("No hay datos con los filtros de categorización seleccionados. Ajusta los filtros para continuar.")

            elif tipo_grafico == "Histograma":
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

                    option = build_option_histograma(
                        categorias, valores, palette, t,
                        mostrar_zoom, mostrar_etiquetas,
                        eje_x_nombre=hist_col,
                        titulo=f"Histograma de {hist_col}"
                    )
                    render_echarts(option=option, height=520, key_prefix="echart_histogram")
                    with st.expander("Ver tabla de frecuencias"):
                        st.dataframe(_df_para_tabla(pd.DataFrame({"Rango": categorias, "Frecuencia": valores})), width="stretch")

            elif tipo_grafico == "Dispersión":
                if not scatter_x or not scatter_y:
                    st.info("Selecciona dos columnas numéricas para construir la dispersión.")
                else:
                    cols_sel = [scatter_x, scatter_y] + ([scatter_color] if scatter_color != NINGUNO else [])
                    datos = df_plot[cols_sel].copy().dropna()
                    if scatter_color != NINGUNO:
                        datos[scatter_color] = datos[scatter_color].astype(str)

                    series = []
                    if scatter_color == NINGUNO:
                        series.append({
                            "name": f"{scatter_x} vs {scatter_y}",
                            "type": "scatter",
                            "data": datos[[scatter_x, scatter_y]].values.tolist(),
                            "symbolSize": 10,
                        })
                    else:
                        for grupo, grupo_df in datos.groupby(scatter_color):
                            series.append({
                                "name": str(grupo),
                                "type": "scatter",
                                "data": grupo_df[[scatter_x, scatter_y]].values.tolist(),
                                "symbolSize": 10,
                            })

                    m1, m2 = st.columns(2)
                    m1.metric("Puntos", f"{len(datos):,}")
                    m2.metric("Series", f"{len(series):,}")

                    option = build_option_dispersión(
                        series, scatter_x, scatter_y, palette, t,
                        titulo=f"{scatter_x} vs {scatter_y}"
                    )
                    render_echarts(option=option, height=520, key_prefix="echart_scatter")
                    with st.expander("Ver tabla de puntos"):
                        st.dataframe(_df_para_tabla(datos), width="stretch")

            else:
                df_vis = df_plot.copy()

                col_filas_eff, serie = aplicar_nivel_tiempo(df_vis, col_filas, nivel_tiempo_fila)
                fila_es_tiempo = serie is not None
                if fila_es_tiempo:
                    df_vis[col_filas_eff] = serie

                col_filas_sec_eff, serie = aplicar_nivel_tiempo(df_vis, col_filas_sec, nivel_tiempo_fila_sec)
                fila_sec_es_tiempo = serie is not None
                if fila_sec_es_tiempo:
                    df_vis[col_filas_sec_eff] = serie

                col_columnas_eff, serie = aplicar_nivel_tiempo(df_vis, col_columnas, nivel_tiempo_col)
                col_es_tiempo = serie is not None
                if col_es_tiempo:
                    df_vis[col_columnas_eff] = serie

                col_columnas_sec_eff, serie = aplicar_nivel_tiempo(df_vis, col_columnas_sec, nivel_tiempo_col_sec)
                col_sec_es_tiempo = serie is not None
                if col_sec_es_tiempo:
                    df_vis[col_columnas_sec_eff] = serie

                campos_filas = [col_filas_eff]
                if col_filas_sec_eff != NINGUNO:
                    campos_filas.append(col_filas_sec_eff)

                campos_columnas = []
                if col_columnas_eff != NINGUNO:
                    campos_columnas.append(col_columnas_eff)
                if col_columnas_sec_eff != NINGUNO:
                    campos_columnas.append(col_columnas_sec_eff)

                hay_tiempo_filas = fila_es_tiempo or fila_sec_es_tiempo
                hay_tiempo_columnas = col_es_tiempo or col_sec_es_tiempo

                for campo in campos_filas + campos_columnas:
                    df_vis[campo] = df_vis[campo].fillna("Sin dato").astype(str)

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

                        nombre_dim = " + ".join(campos_filas)
                        option = build_option_pareto(
                            categorias, valores, porcentaje, palette, t,
                            eje_x_nombre=nombre_dim,
                            titulo=f"Pareto de {nombre_dim}"
                        )
                        render_echarts(option=option, height=520, key_prefix="echart_pareto")
                        with st.expander("Ver tabla de Pareto"):
                            nombre_dim = " + ".join(campos_filas)
                            st.dataframe(
                                _df_para_tabla(pd.DataFrame({nombre_dim: categorias, "Conteo": valores, "Acumulado (%)": porcentaje})),
                                width="stretch"
                            )

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
                            serie = serie.sort_values(ascending=orden_ascendente).head(top_n)

                        categorias = [etiqueta_compuesta(v) for v in serie.index.tolist()]
                        valores = [round(float(v), 2) for v in serie.values.tolist()]

                        categorias_agrupadas = 0
                        if tipo_grafico in ["Pie", "Dona"] and agrupar_otros_torta and len(valores) > 1:
                            total_previo = sum(valores)
                            if total_previo > 0:
                                categorias_filtradas, valores_filtrados, valor_otros = [], [], 0.0
                                for cat, val in zip(categorias, valores):
                                    if (val / total_previo) * 100 < umbral_otros_torta:
                                        valor_otros += val
                                        categorias_agrupadas += 1
                                    else:
                                        categorias_filtradas.append(cat)
                                        valores_filtrados.append(val)
                                if 0 < categorias_agrupadas < len(categorias):
                                    categorias = categorias_filtradas + ["Otros"]
                                    valores = valores_filtrados + [round(valor_otros, 2)]
                                else:
                                    categorias_agrupadas = 0

                        m1, m2, m3 = st.columns(3)
                        m1.metric("Filas analizadas", f"{len(df_vis):,}")
                        m2.metric("Categorías", f"{len(categorias):,}")
                        m3.metric("Valor total", f"{sum(valores):,.2f}")

                        if categorias_agrupadas > 0:
                            st.caption(f"Se agruparon {categorias_agrupadas} categorías menores a {umbral_otros_torta:.1f}% en 'Otros'.")

                        nombre_dim = " + ".join(campos_filas)
                        if tipo_grafico in ["Pie", "Dona"]:
                            option = build_option_pie_dona(
                                categorias, valores, tipo_grafico,
                                mostrar_numeros_torta, formato_numeros_torta,
                                posicion_etiqueta_torta, palette, t,
                                titulo=f"{tipo_grafico} de {nombre_dim}"
                            )
                        else:
                            option = build_option_serie_simple(
                                categorias, valores, tipo_grafico, metrica,
                                palette, t, mostrar_zoom, mostrar_etiquetas,
                                eje_x_nombre=nombre_dim,
                                titulo=f"{metrica} por {nombre_dim}"
                            )

                        render_echarts(option=option, height=520, key_prefix="echart_simple")

                        if tipo_grafico in ["Pie", "Dona"] and mostrar_sugerencias_torta:
                            total_valor = sum(valores)
                            sugerencias = []
                            if total_valor > 0:
                                idx_principal = int(np.argmax(valores))
                                principal = categorias[idx_principal]
                                peso_principal = (valores[idx_principal] / total_valor) * 100
                                if peso_principal >= 60:
                                    sugerencias.append(f"La categoría '{principal}' concentra {peso_principal:.1f}% del total. Podría haber alta dependencia de un solo segmento.")
                                elif peso_principal >= 40:
                                    sugerencias.append(f"La categoría '{principal}' lidera con {peso_principal:.1f}% del total. Vale la pena monitorear su tendencia en el tiempo.")
                                else:
                                    sugerencias.append("La distribución luce más equilibrada entre categorías.")
                                pequenas = sum(1 for v in valores if (v / total_valor) * 100 < 3)
                                if pequenas >= 3:
                                    sugerencias.append("Hay varias categorías pequeñas (<3%). Considera agruparlas como 'Otros' para mejorar legibilidad.")
                                if len(categorias) > 8:
                                    sugerencias.append("Hay muchas categorías para un pie/dona. Para comunicar mejor, usa Top N o cambia a barras.")
                            if sugerencias:
                                with st.expander("💡 Sugerencias automáticas"):
                                    for sug in sugerencias:
                                        st.write(f"- {sug}")

                        with st.expander("Ver tabla base del gráfico"):
                            nombre_dim = " + ".join(campos_filas)
                            st.dataframe(
                                _df_para_tabla(pd.DataFrame({nombre_dim: categorias, metrica: valores})),
                                width="stretch"
                            )

                    else:
                        if metrica == "Conteo":
                            tabla = pd.pivot_table(
                                df_vis.assign(_n=1),
                                index=campos_filas, columns=campos_columnas,
                                values="_n", aggfunc="sum", fill_value=0
                            )
                        else:
                            agg_fun = "sum" if metrica == "Suma" else "mean"
                            tabla = pd.pivot_table(
                                df_vis,
                                index=campos_filas, columns=campos_columnas,
                                values=col_valor, aggfunc=agg_fun, fill_value=0
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

                        nombre_dim = " + ".join(campos_filas)
                        option = build_option_multi_series(
                            tabla_top, tipo_grafico, metrica, palette, t,
                            mostrar_zoom, mostrar_etiquetas,
                            eje_x_nombre=nombre_dim,
                            titulo=f"{metrica} por {nombre_dim}"
                        )
                        render_echarts(option=option, height=520, key_prefix="echart_multi")
                        with st.expander("Ver tabla de datos cruzados"):
                            st.dataframe(_df_para_tabla(tabla_top), width="stretch")

    # ══════════════════════════════════════════
    # PESTAÑA 3: ISHIKAWA
    # ══════════════════════════════════════════
    with tab3:
        st.subheader("🦴 Diagrama de Ishikawa")
        st.caption("Completa el problema y agrega causas por categoria (una por linea).")

        problema = st.text_input("Problema principal:", key="ishikawa_problema")

        categorias = ["Metodo", "Maquina", "Mano de obra", "Materiales", "Medicion", "Medio ambiente"]
        causas_por_categoria = {}
        for cat in categorias:
            causas_texto = st.text_area(
                f"Causas mayores - {cat}:",
                height=120,
                key=f"ishikawa_{cat}"
            )
            causas_por_categoria[cat] = _parse_causas(causas_texto)

        if not problema:
            st.info("Ingresa el problema principal para generar el diagrama.")
        else:
            render_ishikawa_svg(problema, causas_por_categoria, height=640, width=1000)
