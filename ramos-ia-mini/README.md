# RAMOS IA MINI — prototipo móvil (DEMOSTRACIÓN)

Prototipo independiente de punto de venta para usar desde el iPhone. El micrófono es el protagonista.
**No está conectado a RAMOS IA principal ni a ninguna base de datos real.**

- HTML + CSS + JavaScript puro: sin dependencias y sin paso de compilación.
- Los datos (productos, precios, stock, ventas) se guardan **solo en el navegador** (`localStorage`).
  Se pierden si se borran los datos de Safari, si se usa navegación privada o si se elimina la app de la pantalla de inicio.
  En ⚙ Ajustes → “Exportar copia” se puede bajar un respaldo en JSON.
- Funciona como PWA: se instala en la pantalla de inicio y abre sin conexión (la voz sí necesita internet).

## 1. Iniciar el prototipo en la computadora

```bash
cd ramos-ia-mini
npx http-server -p 8080 -c-1 .     # o: python3 -m http.server 8080
```

Abrir <http://localhost:8080>. En `localhost` el micrófono funciona porque el navegador lo considera seguro.

> Desde el iPhone **no** uses la IP de tu computadora (`http://192.168…`): sin HTTPS, Safari bloquea el micrófono
> y además estarías exponiendo un servicio de tu computadora en la red. Usá la publicación HTTPS del paso 2.

## 2. Publicar una vista previa HTTPS (GitHub Pages, gratis)

El repositorio ya incluye el flujo `.github/workflows/ramos-ia-mini-pages.yml`, que prueba el intérprete y publica esta carpeta.

1. En GitHub: **Settings → Pages → Build and deployment → Source: “GitHub Actions”** (una sola vez).
2. Llevá estos cambios a la rama `main` (merge del pull request o push).
3. En la pestaña **Actions**, esperá que termine “Publicar RAMOS IA MINI” (≈1 minuto).
   Si no arrancó solo, ejecutalo con **Run workflow**.
4. La dirección queda así: **https://diegoangelayalaramos650-creator.github.io/MINI-RAMOS/**

No se usan credenciales ni servicios de tu computadora: GitHub sirve los archivos estáticos.

## 3. Abrir en Safari y 4. agregar a la pantalla de inicio

1. En el iPhone, abrí la dirección en **Safari**.
2. Tocá el botón **Compartir** (cuadrado con flecha) → **Agregar a inicio** → **Agregar**.
3. Aparece el ícono rojo **RAMOS MINI**.

## 5. Probar el micrófono

Antes: en el iPhone, **Ajustes → General → Teclado → Activar dictado** encendido (y Siri habilitado). Safari usa
ese servicio de Apple para reconocer la voz.

1. Abrí la app **desde Safari** (ver la nota de abajo sobre la pantalla de inicio).
2. Tocá **🎙️ VENDER POR VOZ** → **Permitir y empezar**. Safari pide permiso para el micrófono y el reconocimiento de voz: **Permitir**.
3. Decí: *“Vendé dos kilos de milanesas y tres kilos de pata muslo”*. Tocá **Listo** si no se detiene solo.
4. Revisá el texto reconocido y la vista previa. Podés corregir el texto, el producto o la cantidad, o descartar líneas.
5. Tocá **Confirmar**: recién ahí cambia el carrito.

Si algo falla, ⚙ Ajustes muestra un diagnóstico (HTTPS, reconocimiento disponible, modo pantalla de inicio).

### Compatibilidad del reconocimiento de voz en iPhone

| Dónde se abre | Reconocimiento de voz web (`webkitSpeechRecognition`) | Alternativa |
|---|---|---|
| Safari, con HTTPS | Disponible desde iOS 14.5, con Siri/Dictado activado | — |
| App de la pantalla de inicio (PWA) | Apple lo tuvo **deshabilitado** en apps de inicio; puede no funcionar según la versión de iOS | 🎤 del teclado |
| Dentro de otra página (vista previa embebida) | Bloqueado por el navegador | 🎤 del teclado |
| `http://` sin HTTPS | Bloqueado | 🎤 del teclado |

**Alternativa compatible siempre:** en la ventana de voz hay un cuadro de texto. Tocalo y usá el **🎤 del teclado
del iPhone** (dictado de iOS). Es reconocimiento de voz real de Apple, y el texto pasa por el mismo intérprete,
la misma vista previa y la misma confirmación.

La app nunca simula reconocimiento: si el navegador no puede, lo dice y ofrece el teclado.

## Qué se puede decir

El intérprete es limitado (sin IA): reconoce los productos cargados (nombre + “palabras para voz”) y cantidades en español.

| Frase | Resultado |
|---|---|
| “Vendé dos kilos de milanesas y tres kilos de pata muslo” | + 2 kg Milanesas, + 3 kg Pata muslo |
| “Un kilo y medio de milanesas” / “kilo y medio…” / “1,5 kg…” | + 1,5 kg |
| “Medio kilo…”, “un kilo doscientos…”, “500 gramos…” | 0,5 / 1,2 / 0,5 kg |
| “Dos maples de huevos” | + 2 maples |
| “Agregá tres kilos de pollo” | + 3 kg Pollo entero |
| “Sacá un kilo de milanesas” / “Sacá las milanesas” | − 1 kg / quita la línea |
| “Cambiá los dos kilos por tres” | la línea con 2 kg pasa a 3 kg (si hay una sola) |
| “Cambiá las milanesas a cuatro kilos” | Milanesas = 4 kg |
| “Vaciá el carrito” / “Borrá todo” | vacía la venta |

Reglas: **nunca inventa productos ni cantidades**. Si falta la cantidad, si la unidad no corresponde
(“dos kilos de huevos”) o si un producto no existe (“carne picada”), lo marca y pide corregir o repetir.
Para que reconozca otras formas de decir un producto, agregalas en Productos → “Palabras para voz”.

## Funciones

- **Vender**: buscador, favoritos, categorías, precio por kg o unidad, botón “+” rápido, hoja de cantidad,
  carrito con cantidades editables, total destacado, Cobrar y Limpiar siempre visibles.
- **Cobrar**: Efectivo, Transferencia, Mercado Pago y Tarjeta; pago dividido; vuelto (solo sale del efectivo);
  no deja confirmar si falta dinero o si los medios electrónicos superan el total.
- **Ventas**: historial local, totales del día, ganancia estimada, desglose por medio, detalle y anulación (devuelve stock).
- **Productos**: alta, edición (costo, venta, unidad, categoría, favorito, palabras para voz) y baja.
- **Stock**: stock inicial editable, descuento automático al vender, ajustes (ingreso / egreso / fijar), aviso de stock bajo, movimientos.
- **Ajustes**: nombre de sucursal, idioma de voz, diagnóstico, exportar copia, reiniciar demo.

## Pruebas

```bash
node --test tests/parser.test.js                     # intérprete de voz
npx http-server -p 8080 . & node tests/e2e.js        # recorrido completo en viewport de iPhone (requiere Playwright)
```

La prueba de punta a punta reemplaza el reconocimiento de voz por uno falso **solo dentro de la prueba**,
para verificar resultados y errores. El reconocimiento real solo se puede probar en un dispositivo.

## Pendiente / fuera de alcance

- Probar el micrófono en un iPhone real (no se puede automatizar desde acá).
- Datos solo locales: sin sincronización entre dispositivos ni usuarios.
- Intérprete por reglas: no entiende frases libres complejas ni sinónimos que no estén cargados.
- Sin impresión de tickets, facturación ni integración real con Mercado Pago o terminales de tarjeta (solo se registra el medio).
