# GENCLA - Homologador y Visualizador BI

Proyecto academico para Ingenieria Clinica Aplicada. Esta version incluye:

- App Streamlit original en [programa_calidad.py](programa_calidad.py)
- Nueva SPA en Vite + React + TypeScript dentro de /web

## Ejecutar la app web

1. Instala dependencias
   - `cd web`
   - `npm install`
2. Inicia desarrollo
   - `npm run dev`
3. Abre `http://localhost:5173`

## Despliegue en Vercel

El repositorio incluye [vercel.json](vercel.json) con configuracion para la app en /web.

Pasos recomendados:
1. Importa el repo en Vercel.
2. Verifica que el build apunte a /web.
3. Usa `npm run build` y salida `dist`.

## Datos de prueba

Puedes cargar archivos CSV, Excel y Parquet. La app procesa los datos en el navegador.

## Funcionalidades destacadas

- Homologacion con trazabilidad y restauracion del dataset.
- Automatizacion de homologacion (normalizacion, reglas comunes, fuzzy y diccionario).
- Visualizador BI con 8 tipos de grafico y jerarquia temporal.
- Recomendaciones automaticas y dashboard de 4 visuales.
- Filtros con busqueda, tabla con orden y paginacion.
- Exportaciones: CSV, Excel, PNG y PDF.
