# AppCajaPana

Caja Local Web para panaderia, reconstruida como app estatica local-first.

## Uso

Abrir `index.html` en el navegador. No requiere Python, Flask, Node ni servidor backend.

La informacion se guarda localmente en el navegador con IndexedDB.

## Uso portable en laptop

La forma mas liviana de usar la app en una PC vieja es copiar la carpeta `AppCajaPana` completa a la laptop y abrir:

`AppCajaPana.vbs`

Ese launcher abre `Abrir-AppCajaPana.bat` sin mostrar consola, busca Chrome, Edge, Firefox o un navegador portable en `Browser\chrome.exe`, y usa un perfil local en `_perfil_caja` para que los datos de la caja queden separados del navegador personal.

Antes de abrir la app, el launcher revisa `update.json` en GitHub. Si encuentra una version mas nueva, descarga el ZIP, crea un backup en `_backups`, reemplaza los archivos de la app y despues abre la caja. Si no hay internet o GitHub falla, abre la version local igual.

Para dejar un icono en el escritorio:

`Crear-Acceso-Directo.bat`

Si la laptop solo tiene Internet Explorer, instalar un navegador compatible primero. Internet Explorer no es recomendado para IndexedDB ni para esta app.

Usuarios iniciales sin contrasena:

- `admin`
- `dev`
- `turno_manana`
- `turno_tarde`

## Incluye

- Caja rapida con bloqueo anti doble venta.
- Enter respeta el medio de pago seleccionado.
- Atajos `E` para efectivo y `T` para transferencia.
- Cierres, metricas, movimientos, actividad, usuarios y herramientas dev.
- Nuevas secciones Mensual y Produccion.
- Modo opcional de canasta de productos.
- Checker de updates en Dev: revisa `update.json` en GitHub al iniciar y ofrece descargar el ZIP del repo.

## Updates

La app portable instala updates automaticamente cuando se abre con `AppCajaPana.vbs` o `Abrir-AppCajaPana.bat`.

Para forzar una instalacion manual en una terminal, cerrar la app y ejecutar:

`Update-AppCajaPana.bat`

Ese script descarga la ultima version desde GitHub, crea un backup en `_backups`, e instala los archivos nuevos en la carpeta del programa.

Tambien se puede probar sin tocar archivos con:

`powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\update-app.ps1 -WhatIf`

Para publicar una version nueva:

1. Actualizar `APP_VERSION` en `app.js`.
2. Actualizar `version` y `notes` en `update.json`.
3. Subir los cambios a GitHub.

## Modo laptop vieja

En equipos muy lentos, entrar como `dev`, abrir `Dev > Apariencia y espacio`, y cambiar `Rendimiento` a `Windows 98 / rapido`.

Ese modo usa una interfaz estilo Windows 98, elimina animaciones, sombras, blur y fondos animados, mantiene graficos simples, y baja la frecuencia de revisiones en segundo plano.

Para hacer una prueba sintetica de carga similar a varios meses de uso:

`node .\tools\stress-test-low-end.js`

El test genera datos temporales en memoria y mide consultas pesadas de balance, movimientos y produccion. No modifica la base local de la app.

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
