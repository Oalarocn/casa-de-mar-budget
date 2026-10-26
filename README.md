# Disponibilidad · Casa de Mar

App web para que el equipo de ventas marque qué apartamentos están disponibles y descargue la ficha de disponibilidad en PDF (16:9) de Torre 1 y Torre 2, sin pasar por diseño.

## Uso diario

1. Elige **Torre 1** o **Torre 2** (el número verde indica cuántas unidades disponibles tiene cada una).
2. Marca las unidades disponibles con la casilla, o toca la unidad directamente en la imagen.
3. Toca la **estrella** para destacar una unidad. Solo se pueden destacar unidades disponibles. La estrella sale junto a la unidad en la foto y en la lista.
4. O usa **Subir Excel** para marcar todo de una vez (ver abajo).
5. **Descargar PDF**: ambas torres (2 páginas) o solo una.

En el PDF, la lista muestra únicamente los niveles con al menos una unidad disponible. Se ordena de arriba hacia abajo y pasa a dos columnas cuando no cabe en una. El texto se ajusta para que nunca se desborde.

**La selección se guarda sola en el navegador** y sigue ahí al volver a abrir la app. Ese guardado es por navegador y dispositivo: no se comparte entre asesores. Si todo el equipo debe tener la misma disponibilidad, que cada uno suba el mismo Excel.

## Códigos de unidad

`T1-901` es Torre 1, nivel 9, posición 1, contando de izquierda a derecha en la foto (igual que las columnas APT 1 a APT 4 del tracker).

- Penthouses de Torre 1: `T1-PH1` y `T1-PH2`.
- Jardines: `T1-101`, `T1-102` y `T2-101`, `T2-102`.

## Excel: qué archivos acepta

**Tracker de Casa de Mar.** Usa las hojas «Torre 1 Precio Diagrama» y «Torre 2 Precio Diagrama».
- Celda sin color, blanca o azul claro: disponible.
- Gris, amarillo o cualquier otro color: reservada.
- También toma m², habitaciones, precio y si dice «c/Jacuzzi».

**Plantilla de la app.** Se descarga en «Subir Excel → Descargar plantilla con la selección actual».
- Columnas **Disponible** y **Destacar** con lista desplegable Sí/No.
- Si se editan precio, área, habitaciones o jacuzzi, la app también los actualiza.

**Lista de códigos.** Un Excel o CSV con códigos como `T2-801`. Las unidades listadas quedan disponibles y el resto de esa torre, reservadas. La otra torre no se toca.

Después de subir un archivo, la app muestra un resumen y permite **Deshacer**.

## Publicar en GitHub Pages

1. Crea un repositorio y sube todo el contenido de esta carpeta (`index.html` debe quedar en la raíz).
2. En el repositorio ve a **Settings → Pages**.
3. En **Build and deployment** elige **Deploy from a branch**, rama `main`, carpeta `/ (root)`. Guarda.
4. En uno o dos minutos la app queda en `https://USUARIO.github.io/REPOSITORIO/`.

> **Importante sobre privacidad y licencias.** En un repositorio público cualquiera puede ver los precios, descargar las fotos y descargar las tipografías PP Writer y PP Mori. Esas tipografías son comerciales (Pangram Pangram); revisa que su licencia permita uso web. Con un plan gratuito de GitHub, Pages solo funciona con repositorios públicos. Con un plan de pago (Pro, Team o Enterprise) puedes publicar desde un repositorio privado.

## Probar en tu computadora

Abrir `index.html` con doble clic no funciona: el navegador bloquea la carga de las tipografías desde archivos locales. Usa un servidor local dentro de la carpeta:

```bash
python3 -m http.server 8000
# luego abre http://localhost:8000
```

## Mantenimiento

| Necesito… | Hacer |
|---|---|
| Cambiar precios o datos de algunas unidades | Usar la plantilla de Excel desde la app (no requiere tocar código). |
| Cambiar los datos base para todos | Volver a correr el generador con el Excel actualizado (ver abajo), o editar `data/inventario.js`. |
| Cambiar fotos o siluetas | Actualizar los `.ai` / fotos HD y volver a correr el generador. |

El generador (`herramientas/generar_assets.py`) toma los `.ai`, las fotos HD, el Excel y el PDF de ejemplo. Con ellos crea:
- Las fotos alineadas.
- Las siluetas en `data/geometria.js`.
- El inventario en `data/inventario.js`.

Al generar las fotos, alinea la foto HD con la imagen sobre la que se dibujaron las siluetas. La foto HD de Torre 2 venía escalada ~4 % y desplazada respecto de la original.

```bash
pip install pymupdf opencv-python-headless numpy pillow openpyxl
python3 herramientas/generar_assets.py --fuentes /carpeta/con/los/archivos --salida .
```

## Estructura

```
index.html            la app
css/app.css           estilos
js/escena.js          diagramación de la ficha 16:9 (la misma para vista previa y PDF)
js/render.js          dibujo en SVG (vista previa) y en PDF (pdf-lib)
js/excel.js           lectura de Excel y plantilla
js/estado.js          selección guardada en el navegador
js/app.js             interfaz
data/                 inventario y geometría (generados)
assets/               fotos HD y de vista previa, tipografías, favicon
vendor/               pdf-lib 1.17.1, @pdf-lib/fontkit 1.1.1, ExcelJS 4.4.0 (MIT), sin depender de CDNs
herramientas/         generador de recursos
```
