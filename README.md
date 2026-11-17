# Metal Slug Web

Port local para navegador basado en [sp00nznet/metalslug](https://github.com/sp00nznet/metalslug/tree/4aa33572f14fb7a292ac775490774125a7db3f14). Usa WebAssembly, SDL2 y el intérprete de 68000. El paquete local incluye los datos de Metal Slug y la BIOS de Neo Geo en dos archivos de unos 14 MB cada uno. El navegador verifica sus hashes y reconstruye `metalslug.data` en memoria.

## Jugar

1. Abre **Jugar.cmd** y deja abierta la ventana del servidor local. Requiere Node.js.
2. Abre **http://127.0.0.1:8090/** en tu navegador.
3. Pulsa **Jugar**. Usa **5** para insertar moneda y **1** para empezar, o abre **☰** y usa **Moneda** e **Inicio**.

La primera visita carga el motor y los datos desde tu PC. La página los guarda en caché para próximas visitas. El servidor escucha en la interfaz de loopback de Windows. Esta compilación contiene los datos de juego de tu instalación y está preparada para uso local.

Usa las flechas para moverte, **Z** para disparar, **X** para saltar y **C** para lanzar granadas. El mando físico usa la asignación SDL2 del proyecto nativo.

## Configurar teclado

Abre **Configurar teclado** en el inicio o dentro de **☰** durante el juego. Selecciona una acción y pulsa la tecla nueva. Si ya estaba asignada, se intercambia con la anterior. Las asignaciones se guardan por navegador y por sitio. Usa **Restablecer teclas** para volver a la configuración original.

## Instalar la PWA

Cuando tengas autorización para distribuir los datos del juego:

1. Sube el proyecto a tu repositorio de GitHub, incluidos `dist/`, `scripts/` y `.github/workflows/pages.yml`.
2. En **Settings → Pages → Build and deployment → Source**, selecciona **GitHub Actions**.
3. En **Actions → Publicar en GitHub Pages**, pulsa **Run workflow**. El flujo es manual y publica solo `dist/`, después de verificar los datos y que cada archivo pese menos de 20 MB.
4. Abre en el teléfono la URL HTTPS que devuelve Pages. La ruta habitual para un repositorio de proyecto es `https://USUARIO.github.io/REPOSITORIO/`.

La dirección local de Windows solo sirve para probar en esa PC. Para ensayar la ruta de un repositorio sin publicar, ejecuta `node serve.mjs 8091 /MetalSlug-webport/` y abre `http://127.0.0.1:8091/MetalSlug-webport/`.

- **iPhone (Safari):** abre **Compartir → Añadir a pantalla de inicio**. Activa **Abrir como app web** si aparece y pulsa **Añadir**.
- **Android (Chrome):** abre **⋮ → Añadir a pantalla de inicio → Instalar**. Cuando Chrome lo permite, también aparece **Instalar app** en el launcher.

Abre el juego en línea la primera vez para completar la caché. El service worker conserva la interfaz, WebAssembly y los datos del juego para abrirlo sin conexión.

## Mando táctil

El mando usa la cruceta 3D y el stick de [ReChan](https://github.com/gabom88/ReChan/tree/main). Los botones redondos corresponden a disparar, saltar, lanzar granadas, insertar moneda e iniciar. En pantallas táctiles se muestra al entrar al juego. También se puede activar desde **☰ → Mando táctil**.

Con **☰ → Configurar mando** puedes elegir cruceta o stick, arrastrar y redimensionar controles, ocultar botones y ajustar la opacidad o vibración. El navegador recuerda el diseño en vertical y en horizontal por separado.

## Recompilar WebAssembly

Requiere Node.js 24, CMake, Ninja, Emscripten con su port SDL2 y el árbol de fuentes nativo con neogeorecomp. La configuración reutiliza el directorio de ROM verificado por el instalador nativo y las tablas de opcodes de Musashi generadas en la compilación nativa. Si están en otras carpetas, usa `-DMSLUG_ROM_DIR=...` y `-DMUSASHI_GEN=...`.

Desde PowerShell, en esta carpeta:

```powershell
cmake -S . -B build-web -G Ninja '-DCMAKE_TOOLCHAIN_FILE=D:/emsdk/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake' '-DMSLUG_SOURCE=D:/Games/mslug/metalslug' '-DCMAKE_BUILD_TYPE=Release'
cmake --build build-web --parallel 4
```

Si usas `MSLUG_GENERATED`, genera las rutinas a partir de una copia de la ROM con el crédito aplicado por `scripts/title-credit.mjs`. El código recompilado a partir del juego original puede dibujar el texto antiguo. La compilación estándar usa el intérprete y aplica el crédito a la copia del programa contenida en el paquete. Si cambias la compilación o los archivos de `dist/`, incrementa el identificador `CACHE` en `dist/sw.js` para actualizar la copia del navegador.

La compilación genera `metalslug.data` dentro de `build-web/runtime/`. El objetivo `web_bundle` prepara las dos partes y su manifiesto en `dist/`. Ejecuta `node scripts/package-web.mjs --verify` para comprobar la reconstrucción antes de publicar. Edita las imágenes de entrada en `media/`; la compilación copia `character.png` y `logo.png` a `dist/`.