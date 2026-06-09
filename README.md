# AppCajaPana

Caja Local Web para panaderia, reconstruida como app estatica local-first.

## Uso

Abrir `index.html` en el navegador. No requiere Python, Flask, Node ni servidor backend.

La informacion se guarda localmente en el navegador con IndexedDB.

Usuarios iniciales:

- `admin` / `2711`
- `dev` / `2711`
- `turno_manana` / `1234`
- `turno_tarde` / `1234`

## Incluye

- Caja rapida con bloqueo anti doble venta.
- Enter respeta el medio de pago seleccionado.
- Atajos `E` para efectivo y `T` para transferencia.
- Cierres, metricas, movimientos, actividad, usuarios y herramientas dev.
- Nuevas secciones Mensual y Produccion.
- Modo opcional de canasta de productos.

## Mercado Pago automatico

La app incluye una integracion opcional con Supabase Edge Functions para crear pagos de Mercado Pago y sincronizar el estado automaticamente.

1. Crear un proyecto gratuito en Supabase.
2. Ejecutar `supabase/schema.sql` en el SQL editor.
3. Deployar las funciones en `supabase/functions`.
4. Configurar secrets de Supabase:
   - `MERCADO_PAGO_ACCESS_TOKEN`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `MP_WEBHOOK_URL` opcional, normalmente `https://TU-PROYECTO.supabase.co/functions/v1/mp-webhook`
5. En la app, entrar como `admin` o `dev`, ir a `Dev`, y guardar:
   - Supabase project URL
   - Supabase anon key

No guardar el Access Token de Mercado Pago en el navegador.
