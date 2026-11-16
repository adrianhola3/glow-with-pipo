# Backend del piloto Automate

Base: `b815e3665cb47c534375ede9962c59a933b0edda`. Rama: `codex/automate-yape-backend`.
Worktree: `C:\Users\User\.codex\worktrees\643c\Glow with Pipo`.

El piloto guarda **evidencia no bancaria pendiente de revisión** en una tabla
separada. No confirma ventas, no crea pagos, no reserva stock y no usa ningún
RPC Yape legado. No se ha desplegado ni probado contra producción.

## Exports exactos para pruebas de C

Módulo sin dependencias, importable desde Node 24 y Deno:
`supabase/functions/yape-notification/core.mjs`.

- `MAX_BODY_BYTES`: 16384.
- `YAPE_PACKAGE`: `com.bcp.innovacxion.yapeapp`.
- `NotificationError(code, status = 400)`: propiedades `code`, `status`.
- `parseNotificationPayload(payload, { nowMs = Date.now() } = {})`: síncrono;
  lanza NotificationError para entradas inválidas. Para texto no inequívoco
  devuelve `{ignored:true,reason}`; para entrante admitido devuelve
  `{ignored:false,package_name,notification_id,posted_at_ms,raw_title,raw_text,
  sender_name,amount_minor,is_delayed,parser_version}`.
- `deriveEventKey(deviceId, notificationId, postedAtMs)`: Promise de SHA-256 hex
  sobre JSON del dispositivo servidor, ID Android normalizado y timestamp.
- `createNotificationHandler({deviceToken,deviceId,persist,now})`: devuelve
  `(Request) => Promise<Response>`. `now` opcional es `() => epochMs`.
  `persist(record)` inyectable recibe los campos anteriores sin `ignored`, más
  `device_id,event_key,received_at,status`; devuelve Promise de `{duplicate:boolean}`.
  Debe implementar inserción atómica, sin operaciones sobre ventas/pagos.

## Contrato HTTP

`POST /functions/v1/yape-notification`, `Content-Type: application/json`,
`X-Device-Token: <secreto exclusivo del dispositivo>`.

```json
{
  "package_name": "com.bcp.innovacxion.yapeapp",
  "notification_id": "42",
  "posted_at": 1794787200000,
  "raw_title": "Yape",
  "raw_text": "Ana Perez te envió S/ 20.00"
}
```

El timestamp del ejemplo es ilustrativo. Automate debe capturar el timestamp
Android original **en milisegundos** y conservarlo junto al ID al reintentar;
no regenerar fecha/ID al enviar. ID entero no negativo o texto no vacío
(máximo 256 caracteres). Dispositivo y credenciales servidor no vienen del body.

Éxito 200: `{received:true,duplicate:false,status:"pending_review"}`; reenvío o
update con la misma identidad/fecha: mismo resultado con `duplicate:true`.
El primer texto aceptado se conserva; updates no sobrescriben evidencia.
Texto saliente/promocional/ambiguo: 200 con
`{received:false,ignored:true,reason,status:"ignored"}`, sin persistencia.
Nunca se responde `isPaid` ni `verified_auto`.

Errores: 405 método; 401 token; 415 tipo; 413 tamaño; 400 JSON/campos/fecha;
503 configuración o almacenamiento (reintentar conservando identidad original).
Respuestas y errores no incluyen secretos, texto original ni errores upstream.
No se habilita CORS: el endpoint está destinado a Automate, no al frontend.

## Validación conservadora

Límite real de 16 KiB incluso sin Content-Length. Título <=512, texto <=8192.
Fecha entera en ms desde 2020-01-01 (rechaza epoch en segundos), no más de cinco
minutos futura. Antigüedad dentro de ese rango no impide
reintentos: más de 24h añade `is_delayed:true`.
Solo se aceptan títulos conocidos y un cuerpo completo `Nombre Apellido te
envió/yapeó [un pago/un yape] [por] S/ monto`, con sufijo opcional de código u
operación. Incluye explícitamente el formato histórico
`Adrian Huaman Castillo te envió un pago por S/ 6.00. El cód. de seguridad es: 917`.
Nombres enmascarados como `Tor*` se ignoran: requieren manejo manual fuera del
inbox y no se registra una entrada. Montos positivos sin separadores de miles, máximo ocho enteros y dos
decimales; coma o punto decimal. El parser rechaza estructuras desconocidas,
resúmenes y promociones. Puede ignorar notificaciones legítimas: recopilar
ejemplos anonimizados y revisarlos antes de ampliar la gramática.
Un código de seguridad de tres dígitos jamás identifica ni autentica un pago.

## Persistencia y concurrencia

Aplicar por revisión la migración
`supabase/migrations/20261116010000_automate_notification_inbox.sql`.
Es transaccional e idempotente sobre la estructura esperada: CREATE IF NOT
EXISTS y grants repetibles; no repara estructuras preexistentes incompatibles.
RLS activado y forzado, sin políticas para clientes; privilegios revocados de
PUBLIC/anon/authenticated. Solo service_role tiene SELECT/INSERT explícitos.
No triggers, foreign keys a ventas, realtime ni modificación del esquema legado.

Edge usa REST con `on_conflict=event_key` y
`Prefer: resolution=ignore-duplicates,return=representation`: la PK resuelve
reintentos concurrentes atómicamente. Resultado vacío significa duplicate;
una fila significa primera inserción. Hay además UNIQUE sobre
`(device_id,notification_id,posted_at_ms)`.
Cambiar dispositivo/ID/timestamp representa un evento distinto: no deduplica
el movimiento bancario, que este piloto no conoce ni acredita.

## Configuración para una futura revisión de despliegue

- `YAPE_DEVICE_TOKEN`: generar fuera del repositorio con CSPRNG, 32 bytes o más,
  base64url sin padding (43 a 128 caracteres). Configurar por canal seguro en
  Edge y Automate; no usar anon key ni incluirlo en web, capturas o logs.
- `YAPE_DEVICE_ID`: identificador estable servidor `[A-Za-z0-9_-]{1,128}`.
  Un token/dispositivo por despliegue piloto. No inferir identidad del body.
- `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`: solo entorno Edge. Nunca copiar
  service role en Automate/frontend ni registrar headers o respuestas upstream.
- El gateway necesita desactivar verificación JWT **solo para esta función**
  (verify_jwt=false o flag --no-verify-jwt); el handler aplica X-Device-Token.
  No hay config global modificada ni despliegue realizado en este encargo.
- Para desarrollo, usar exclusivamente Supabase local o persistencia inyectada;
  no importar secretos de producción. No commitear .env.

Documentación oficial consultada:
[configuración de funciones](https://supabase.com/docs/guides/functions/function-configuration),
[secretos Edge](https://supabase.com/docs/guides/functions/secrets).

## Prerrequisitos y límites de producción

**No es una corrección integral de la auditoría Yape.** Antes de producción,
cerrar el acceso público de `register_incoming_yape_notification` e
`ingest_yape_android_webhook`, incluyendo permisos efectivos heredados de PUBLIC,
y migrar las acciones owner actuales a RPCs autorizados por saleId. Sus grants
se conservan aquí para no romper la UI actual: mientras existan, el flujo legado
continúa con sus riesgos y Automate no vuelve seguro el sistema completo.

Revisar las demás rutas de auto-confirmación (polling/checkout), precios,
concurrencia, reservas y libro contable antes de integración. Definir revisión
humana, retención/borrado de PII y rate limiting antes de uso real. El inbox no
incluye una UI de revisión ni una acción de aprobar pagos. El token autentica un
dispositivo, no a Yape ni al banco; un dispositivo comprometido puede fabricar
evidencia. Los duplicados aquí son eventos Android, no pagos bancarios.

## Verificación

Primera ronda propia aprobada con Node v24.19.0:

- `node --check supabase/functions/yape-notification/core.mjs`.
- `node --check supabase/functions/yape-notification/index.ts` (solo sintaxis,
  no equivale a `deno check`).
- Smoke por stdin con `node --input-type=module`: import real del core, método,
  token inválido/configuración incompleta, JSON y campos inválidos, paquete,
  futuro >5min, tamaño real sin Content-Length, parser conservador, coma decimal,
  fecha antigua marcada, ID entero/texto equivalentes, dispositivos distintos,
  updates conservando primera evidencia y 16 solicitudes concurrentes contra
  persistencia simulada atómica (una inserción y 15 duplicados). Errores upstream
  simulados devuelven 503 sin reflejar secretos.
- `npm run build`: aprobado; advertencia existente de chunk >500 kB.

Segunda ronda: import de `index.ts` con `Deno.env`, `Deno.serve` y `fetch`
simulados; verificadas URL y cabeceras REST esperadas, insert, duplicate y
respuesta 503 sin filtrar errores upstream. Ninguna llamada de red real.

Tercera ronda tras revisión del coordinador: fixture histórico con `El cód. de
seguridad es: 917` aceptado como evidencia; variantes explícitas de sufijo,
timestamp en segundos y futuro rechazados, epoch ms de 2020 marcado delayed,
nombres enmascarados y sufijos arbitrarios ignorados. Repetida idempotencia de 16
requests con mock y checks de sintaxis Node; todo aprobado, sin fallos ocultos.

No se instaló ninguna dependencia para este encargo. Sin Deno/Supabase/Docker
disponibles: quedan pendientes `deno check`, ejecución Edge, aplicación/reaplicación
de migración, permisos RLS y concurrencia PostgreSQL/PostgREST reales. La prueba
con mock no demuestra por sí sola la atomicidad de la base desplegada.
C realizará las pruebas independientes; el piloto sigue sin desplegar.
