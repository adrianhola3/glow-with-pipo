# Catálogo: lock y ledger (antes de implementación)
Fuente dominante: captura del usuario codex-clipboard-7cbc95b2-4224-46bf-b431-a88cee938bcb.png, base storefront b815e366. Direct build, sin herramientas Refero disponibles.
Conservar: crema de fondo, borgoña para acciones/selección, rosa de apoyo, logo, tipografía, imágenes y estética coquette. No cambiar tarjetas, hero ni compra.
Patrones secundarios: https://baymard.com/blog/ecommerce-filter-ui y https://baymard.com/research-articles/how-to-design-applied-filters : controles visibles, contexto de filtro aplicado y recuperación.
Craft: refero-design craft-details.md (focus-visible y formularios), visual-workflow.md (comparación con referencia).
Decisiones:
- Una barra dentro del catálogo, sticky solo al alcanzarla; búsqueda única fuera del hero y selectores nativos sin carrusel.
- Móvil: búsqueda arriba, categoría/orden debajo, targets 44px; escritorio en una fila.
- Cabecera staff/guest en shell medido con ResizeObserver; sticky offset dinámico y z-index bajo overlays.
- Estado legible y restablecer; orden independiente en secciones de combos/productos, recomendados conserva orden existente.
- Buscar sin acentos en nombre/marca/categoría/descripción/tonos; no cambiar datos de compra.
- Filtro/orden desde scroll profundo alinea resultados sin mover foco. Escritura no desplaza cada tecla.
Validación prevista: npm test/build, fixtures catálogo público solo lectura, headless móvil360/390/430 y desktop/staff/zoom, sin pagos ni gateway.

## Evidencia final
- npm test: 25/25 aprobados. npm run build: aprobado (advertencia preexistente chunk >500 kB).
- Catálogo snapshot 37 productos/3 combos: render 35 productos con stock, 3 combos; filtro stock conserva lógica de base.
- Chromium headless, StorefrontView aislado por harness temporal y repositorio mock con snapshot. Toda solicitud externa bloqueada; gateway/submit mock lanzan error si se invocan.
- 360/390/430/1280 px, guest y staff: sin desborde; barTop=headerBottom en ocho escenarios, controles44px.
- Filtro Labios, orden, búsqueda vacía, recuperación, foco conservado en select y barra oculta con bolsita: aprobados.
- Simulación Node con helper real: precios asc/desc, no mutación catálogo y búsqueda acentos/tonos aprobados.
- Reflujo equivalente200% (viewport640x450 con DPR2 sobre1280x900), guest/staff: sin solapes/desbordes, select conserva foco, resultados visibles bajo barra. No equivale a probar UI nativa de zoom ni teclado móvil real.
- Referencia preservada: borgoña/crema/rosa, tipografía/logo/tarjetas/fotos existentes. Variables faltantes de base (--pipo-border/--pipo-rose) tienen fallback solo en reglas nuevas.
- Primera ronda headless falló al localizar select por etiqueta exacta; se añadieron aria-label explícitos y la segunda pasó. Matriz, zoom y capturas finales aprobados; sin cambios de pagos.
- Evidencias de PÁGINA headless (sin escritorio): C:/Users/User/.codex/visualizations/2026/11/16/01a1e2c0-4716-7dd1-82e5-3332b755d086/discovery/final-390.png y final-1280.png; matriz guest/staff y zoom-equivalent-*.png en la misma carpeta.
- Entrada producción existente: anónimo ve LoginView; pulsar Ver Tienda Pública de Clientes. No se cambia App/login. Publicación y comprobación producción a cargo del orquestador.
- Reproducción: entrar en tienda, bajar al catálogo, desplazarse varios productos y cambiar categoría/orden; buscar "unico" o "mascara", probar consulta sin resultados y Restablecer; abrir bolsita y cerrar. Verificar foco de teclado y móvil.

- Ajustes finales: controles móviles16px; navegación Catálogo/Combos alinea incluso misma categoría. Búsqueda desde profundo alinea una vez sin Enter y conserva foco; siguientes teclas no desplazan si resultados ya están alineados.
- Caso adicional de búsqueda profunda: primera prueba detectó altura de barra cambiada al mostrar Restablecer; se corrigió midiendo alturas actuales para scroll. Segunda ejecución pasó búsqueda/foco pero comprobó cabecera antes del requestAnimationFrame; al esperar ese frame, tercera ejecución aprobada. Fallos preservados aquí; no confundir timing de test con bug de UI.
