# QA independiente: piloto Automate / Yape

Base: `b815e3665cb47c534375ede9962c59a933b0edda`, detached HEAD, worktree `C:\Users\User\.codex\worktrees\7486\Glow with Pipo`. Trabajo previo de pruebas conservado sin cambios.

## Matriz de aceptación

| Área | Casos y resultado esperado |
| --- | --- |
| Autorización | Token dedicado ausente o incorrecto: rechazo; jamás consultar ni escribir inbox; no reflejar secreto. |
| HTTP | Solo POST; JSON válido y objeto con campos requeridos; contenido malformado, cuerpo vacío y tamaño excedido rechazados sin persistir. |
| Origen y tiempo | Aceptar exclusivamente `com.bcp.innovacxion.yapeapp`; `posted_at` Unix en milisegundos válido; rechazar fechas inválidas y segundos. |
| Interpretación | Cobro entrante con nombre y monto correcto se registra pendiente de revisión; salida y promoción no deben convertirse en ingreso; montos de miles/decimales, ambiguos y nombre vacío deben manejarse explícitamente sin inventar datos. |
| Idempotencia | Reentrega del mismo evento Android crea como máximo una entrada; actualizaciones y reintentos conservan identidad apropiada; eventos distintos con mismo código de seguridad no colisionan. |
| Concurrencia y fallos | Solicitudes simultáneas no duplican eventos bajo contrato del store; fallo de lectura/escritura devuelve error sin secretos ni confirmación. |
| Aislamiento financiero | Ningún evento confirma pago ni modifica venta; revisar también permisos y llamadas en código de producción. |
| Base de datos | Revisar migración, RLS y grants, tablas y funciones accesibles a anon/authenticated, y uso de service role exclusivamente servidor. Mocks no verifican PostgreSQL. |

Las pruebas deben usar fixtures sintéticos y dependencias inyectadas, sin servicios, pagos ni notificaciones reales. La suite previa tiene un fallo conocido por semántica del límite exacto de sesión; se reporta por separado.

## Hallazgos independientes históricos

1. **[P2] Fecha en segundos aceptada como milisegundos** — `supabase/functions/yape-notification/core.mjs:24`: se valida que `posted_at` sea entero positivo y no futuro, sin cota inferior que descarte segundos Unix. La fixture `1700000000` se acepta y se registra como fecha de 1970 marcada retrasada. La prueba exige rechazo porque el contrato acordado indica milisegundos; queda fallida para revisión. No implica por sí solo confirmación de pago.
2. **Actualizaciones con la misma identidad conservan el primer contenido** — `core.mjs:159` y `index.ts:13`: identidad incluye dispositivo, ID Android y timestamp; el insert ignora duplicados aunque cambie el texto o monto. El test documenta el comportamiento: decidir si debe alertarse sobre contenido divergente, pues un reintento puede ocultar una actualización. No se acreditó cómo entrega las actualizaciones Automate en Samsung Galaxy A55 5G, firmware desconocido.
3. **Riesgo heredado, fuera del piloto** — `supabase/schema.sql:927`, `:936`, `:978`, `:1075`: el esquema versionado concede a `anon` acceso a RPC `SECURITY DEFINER` que puede crear pagos y confirmar ventas. Verificar estado real antes de producción; no se exige modificar esos RPC en este piloto. La revisión es estática y no demuestra la configuración desplegada.
4. **[P1] Formato histórico de cobro ignorado** — `core.mjs:49`: la gramática no reconoce el sufijo `El cód. de seguridad es: 917` de la fixture histórica proporcionada y devuelve `ignored: true`; el ingreso queda fuera del inbox. La prueba exige registrar ese caso concreto; para formatos desconocidos, `ignored` es una decisión conservadora aceptable. La fixture no prueba el formato actual del teléfono.

## Revisión de aislamiento y seguridad

En los archivos inspeccionados, la migración crea exclusivamente `yape_notification_inbox`, activa y fuerza RLS y revoca permisos a public/anon/authenticated; concede select e insert a `service_role`. `index.ts` usa la clave solo en Edge y escribe directamente al inbox. No se ven llamadas a RPC heredados ni escritura de ventas en el flujo nuevo. Esto es inspección estática; no verifica permisos reales, configuración de gateway, RLS ni concurrencia de PostgreSQL. Los tests usan store simulado, no servicio real.

## Ejecución

- `YAPE_NOTIFICATION_CORE=C:\Users\User\.codex\worktrees\643c\Glow with Pipo\supabase\functions\yape-notification\core.mjs node --test tests/automate_notifications.test.js`: **5 pasan, 1 falla**, exit 1. La ruta se estableció mediante `$env:YAPE_NOTIFICATION_CORE` en PowerShell.
- Con la misma variable, `npm test`: **63 pruebas, 61 pasan, 2 fallan**, exit 1. La primera falla es la fecha en segundos; la segunda es la prueba preexistente de expiración exacta de 30 minutos en `tests/persistence_auth.test.js:91`.
- Una iteración de pruebas; no se cambió producto ni se debilitaron aserciones. Los archivos previos siguen sin commit ni modificación.
- Pendiente antes de aceptar: resolver o aclarar contrato de fecha, y ejecutar contra versión definitiva de B. La prueba concurrente solo comprueba el contrato del store simulado. Falta prueba en PostgreSQL local y dispositivo real; no hubo pagos ni datos reales.

Segunda iteración tras incorporar la fixture histórica: dirigida **5/7**, dos fallos (fecha en segundos y formato histórico); suite completa **61/64**, los mismos dos fallos y el fallo previo de sesión. Ambos comandos retornaron exit 1. Revisión de `index.ts`: inserta con `on_conflict=event_key` y `resolution=ignore-duplicates`, valida la forma de respuesta y no expone respuestas upstream; su comportamiento real depende de PostgREST, privilegios y unicidad de la base no ejecutados aquí.

## Tercera iteración y decisión local

Acepto el **inbox local para revisión y pruebas posteriores**, sin defectos bloqueantes identificados dentro de ese alcance. No se acepta producción ni confirmación automática de pagos. Los hallazgos 1 y 4 anteriores quedaron resueltos en los archivos de B examinados: la fecha mínima de 2020 rechaza segundos Unix y la gramática reconoce la fixture histórica. Se mantienen la limitación de primera versión para eventos repetidos con contenido diferente y el riesgo de RPC heredados.

- Revisión independiente de C: diff de B desde `b815e3665cb47c534375ede9962c59a933b0edda` hasta `c10026f8e56de03637f7999ab7f5b234910ab608`, incluidos núcleo, adaptador y migración; el núcleo probado tiene SHA-256 `1b915b62ee06825b173fc84893f159dc90f75602d8d1eaae3a304a60495cd8ee`. El adaptador sigue escribiendo solo al inbox con resolución de duplicados, sin llamadas a RPC heredados ni ventas. La migración limita también fechas mínimas y preserva restricciones de permisos. El diff final de B amplía únicamente los sufijos aceptados y documentación frente a su commit inmediatamente anterior.
- Ejecutado por C: `$env:YAPE_NOTIFICATION_CORE='C:\Users\User\.codex\worktrees\643c\Glow with Pipo\supabase\functions\yape-notification\core.mjs'` seguido de `node --test tests/automate_notifications.test.js`: **7 pasan, 0 fallan**, exit 0; aserciones sin cambios. La suite completa no se repitió en esta iteración; su última ejecución y fallo previo de sesión constan arriba.
- Evidencia comunicada por el coordinador, **no ejecutada por C**: `npx deno check --no-config --no-lock index.ts` exit 0; migración aplicada dos veces en PGlite con roles locales sintéticos, con SELECT/INSERT denegados a anon/authenticated, inserción y replay del servicio que conservan una fila pendiente, y DELETE denegado a esos roles. Esta evidencia no demuestra configuración ni comportamiento de Supabase real.
- Siguen pendientes la validación del Samsung Galaxy A55 5G (firmware desconocido), formatos de notificación actuales, configuración del gateway y permisos reales antes de producción. Los formatos desconocidos pueden quedar ignorados; una prueba aislada no demuestra que todos los cobros lleguen al inbox. No se usaron pagos ni datos reales.
