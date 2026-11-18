# Metal Slug Web

Port local para navegador basado en [sp00nznet/metalslug](https://github.com/sp00nznet/metalslug/tree/4aa33572f14fb7a292ac775490774125a7db3f14). Usa WebAssembly, SDL2 y el intérprete de 68000. El paquete local incluye los datos de Metal Slug y la BIOS de Neo Geo en dos archivos de unos 14 MB cada uno. El navegador verifica sus hashes y reconstruye `metalslug.data` en memoria.

## Jugar

1. Abre **Jugar.cmd** y deja abierta la ventana del servidor local. Requiere Node.js.
2. Abre **http://127.0.0.1:8090/** en tu navegador.
3. Pulsa **Jugar**. Usa **5** para insertar moneda y **1** para empezar, o abre **☰** y usa **Moneda** e **Inicio**.

La primera visita carga el motor y los datos desde tu PC. La página los guarda en caché para próximas visitas. El servidor escucha en la interfaz de loopback de Windows. Esta compilación contiene los datos de juego de tu instalación y está preparada para uso local.

Usa **W A S D** para moverte, **B** para disparar, **N** para saltar y **M** para lanzar granadas. El mando físico usa la asignación SDL2 del proyecto nativo.

## Configurar teclado

Abre **Configurar teclado** en el inicio o dentro de **☰** durante el juego. Selecciona una acción y pulsa la tecla nueva. Si ya estaba asignada, se intercambia con la anterior. Las asignaciones se guardan por navegador y por sitio. Usa **Restablecer teclas** para volver a la configuración por defecto (W A S D + B N M). Si nunca cambiaste las teclas antiguas (flechas + Z X C), se actualizan solas a la nueva configuración.

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

El código fuente nativo (recompilador y runtime `neogeorecomp`) está en `native/`; `native/neogeorecomp` es un submódulo, así que tras clonar ejecuta `git submodule update --init --recursive`. Requiere Node.js 24, CMake, Ninja y Emscripten con su port SDL2. Las ROM verificadas van en `native/roms/` y las tablas de opcodes de Musashi en `native/build/neogeorecomp_build/musashi_gen` (las genera la compilación nativa con `native/Setup.cmd`). Ninguna de las dos se sube al repositorio. Si están en otras carpetas, usa `-DMSLUG_ROM_DIR=...` y `-DMUSASHI_GEN=...`.

Desde PowerShell, en esta carpeta:

```powershell
cmake -S . -B build-web -G Ninja '-DCMAKE_TOOLCHAIN_FILE=D:/emsdk/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake' '-DCMAKE_BUILD_TYPE=Release'
cmake --build build-web --parallel 4
```

Si usas `MSLUG_GENERATED`, genera las rutinas a partir de una copia de la ROM con el crédito aplicado por `scripts/title-credit.mjs`. El código recompilado a partir del juego original puede dibujar el texto antiguo. La compilación estándar usa el intérprete y aplica el crédito a la copia del programa contenida en el paquete. Si cambias la compilación o los archivos de `dist/`, incrementa el identificador `CACHE` en `dist/sw.js` para actualizar la copia del navegador.

La compilación genera `metalslug.data` dentro de `build-web/runtime/`. El objetivo `web_bundle` prepara las dos partes y su manifiesto en `dist/`. Ejecuta `node scripts/package-web.mjs --verify` para comprobar la reconstrucción antes de publicar. Edita las imágenes de entrada en `media/`; la compilación copia `player1.png`, `player2.png`, `logo.png`, `bg-pattern.png` y `frame.png` a `dist/`.
## Partidas, misiones y mods

En el inicio, **Nivel inicial** permite elegir la pantalla de título o una de las seis misiones. Al elegir una misión, el juego inserta una moneda e inicia esa partida. La presentación de Neo Geo se avanza hasta que la BIOS entrega el control al juego. La introducción de Metal Slug, incluida la escena del tanque, se reproduce completa. Si elegiste una misión, el inicio automático espera a que termine la introducción.

En **Mods**, **Overclock** viene activado a ×2. Acelera el procesador 68000 virtual sin cambiar el ritmo del vídeo, el sonido ni los temporizadores, como la opción de overclock de los emuladores arcade. El juego mantiene su velocidad normal, pero termina a tiempo cada imagen y desaparecen las ralentizaciones de las escenas cargadas. En una prueba automatizada de la Misión 1, las imágenes tardías bajaron del 21 % (original) a un 3 % con ×2; el resto son transiciones de escena. ×3 y ×4 apenas mejoran y gastan más CPU. Puedes cambiarlo en el inicio o en **☰ → Pantalla y rendimiento**, y el navegador lo recuerda. Elige **Desactivado** para el comportamiento original.

Activa **Doble salto** antes de jugar. El jugador 1 puede pulsar salto de nuevo en el aire para dar un segundo impulso. Al tocar suelo recupera ese segundo salto.

El menú **☰** pausa el juego y ofrece **Save state** y **Load state**. **Autoguardar cada 10 segundos** actualiza la misma ranura usada por Save state. Load state recupera el último guardado manual o automático. Las partidas se almacenan en IndexedDB, dentro del navegador y la dirección del juego. Para recuperar un guardado, abre el juego y usa **☰ → Load state**.

Cada guardado conserva CPU, RAM, vídeo, temporizadores y sonido. El identificador del motor impide cargar estados de una compilación incompatible. El navegador puede borrar los guardados al borrar los datos del sitio.

La integración de estados se encuentra en `web/state_*.c` y `web/state_ym.cpp`. Estos archivos compilan los módulos correspondientes del toolkit y añaden sus campos de estado. Las direcciones del selector de misión y del movimiento proceden del análisis de [mslug-decompiled](https://github.com/correo415415/mslug-decompiled).
### Verificación de los estados

```powershell
cmake -S . -B build-state-tests -G Ninja '-DCMAKE_TOOLCHAIN_FILE=D:/emsdk/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake' '-DCMAKE_BUILD_TYPE=Release' '-DWEB_REGRESSION_TEST=ON'
cmake --build build-state-tests --target metalslug --parallel 3
node scripts/test-state.cjs
```

La prueba recorre las seis misiones, compara la ejecución tras restaurar CPU/vídeo/audio, rechaza estados dañados y comprueba el límite del doble salto.

Dash: Shift izquierdo (reasignable), RB del mando o botón táctil. Dura 12 fotogramas y recarga en 48; conserva colisiones. Sangre: efecto original, roja o púrpura, mediante el soft DIP BLOOD y las paletas del juego.
Imagen: el modo Estirar ocupa toda la pantalla cambiando la proporción. Se puede alternar desde el launcher y el menú del juego; el navegador recuerda el ajuste.

Disparo turbo: al activarlo en Mods, mantener disparo genera pulsaciones de tres fotogramas y pausas de tres (aproximadamente 10 pulsaciones por segundo). Funciona con teclado, controles táctiles y mando. Modo mirror: invierte horizontalmente el render de las seis misiones y cambia izquierda por derecha para ambos jugadores. Se limita a una partida activa (BIOS_USER_REQUEST=3, estado de jugador=1 y escena 0..5); título, intro, demostración y otras escenas mantienen su orientación. Ambos ajustes y la fase del turbo se conservan dentro del Save state.
El menú Opciones del juego agrupa pantalla, partida y controles, con un botón para continuar.

El mirror se compone por capas en web/state_video.c: refleja los sprites del escenario y los personajes antes de dibujar la capa FIX. El HUD, puntuación, vida, créditos y banners animados de misión conservan su posición y orientación originales. El renderer SDL presenta la imagen final sin invertirla de nuevo.

Las letras grandes animadas de MISSION START/COMPLETE son sprites independientes: web/video_mirror.h conserva la orientación y coordenadas de los glifos C-ROM 0x1087..0x10CB, correspondientes a los mapas de letras y números del banner. La capa FIX se dibuja sin espejo por encima. Se comprobó el banner completo y su salida animada mediante capturas de fotogramas reproducibles.
