cmake_minimum_required(VERSION 3.21)
project(metalslug_web C CXX)
if(NOT EMSCRIPTEN)
    message(FATAL_ERROR "Use the Emscripten CMake toolchain")
endif()
set(MSLUG_SOURCE "" CACHE PATH "Path to the native Metal Slug checkout")
set(MUSASHI_GEN "${MSLUG_SOURCE}/build/neogeorecomp_build/musashi_gen" CACHE PATH "Native build's Musashi opcode sources")
set(MSLUG_GENERATED "" CACHE PATH "Optional: native build's ROM-derived C sources, for personal builds")
set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 14)

set(ng "${MSLUG_SOURCE}/neogeorecomp")
set(ext "${ng}/ext")
if(NOT EXISTS "${MUSASHI_GEN}/m68kops.c" OR NOT EXISTS "${ng}/src/ng_internal.h")
    message(FATAL_ERROR "Set MSLUG_SOURCE to the Metal Slug folder after a successful native build, or specify MUSASHI_GEN")
endif()
add_executable(metalslug
    web/neogeo_web.c web/window_web.c
    "${MSLUG_SOURCE}/src/main.c" "${MSLUG_SOURCE}/src/game.c"
    "${ng}/src/exec.c" "${ng}/src/cpu.c" "${ng}/src/bus.c" "${ng}/src/lspc.c"
    "${ng}/src/video.c" "${ng}/src/io.c" "${ng}/src/audio.c"
    "${ng}/src/ym2610.cpp" "${ng}/src/platform.c" "${ng}/src/romload.c" "${ng}/src/musashi_glue.c"
    "${ext}/musashi/m68kcpu.c" "${ext}/musashi/m68kdasm.c"
    "${ext}/musashi/softfloat/softfloat.c" "${MUSASHI_GEN}/m68kops.c"
    "${ext}/z80/z80.c"
    "${ext}/ymfm/src/ymfm_opn.cpp" "${ext}/ymfm/src/ymfm_adpcm.cpp"
    "${ext}/ymfm/src/ymfm_ssg.cpp" "${ext}/ymfm/src/ymfm_misc.cpp"
)
target_include_directories(metalslug PRIVATE "${ng}/include" "${ng}/src" "${ext}/musashi"
    "${MUSASHI_GEN}" "${ext}/z80" "${ext}/ymfm/src")
target_compile_definitions(metalslug PRIVATE NG_HAVE_SDL MUSASHI_CNF="ng_musashi_conf.h")
target_compile_options(metalslug PRIVATE "-sUSE_SDL=2")
if(MSLUG_GENERATED)
    file(GLOB generated CONFIGURE_DEPENDS "${MSLUG_GENERATED}/recomp_*.c")
    if(NOT EXISTS "${MSLUG_GENERATED}/recomp_table.c" OR NOT EXISTS "${MSLUG_GENERATED}/recomp_common.h")
        message(FATAL_ERROR "MSLUG_GENERATED must point to the native build's generated directory")
    endif()
    target_sources(metalslug PRIVATE ${generated})
    target_include_directories(metalslug PRIVATE "${MSLUG_GENERATED}")
    target_compile_definitions(metalslug PRIVATE MSLUG_HAVE_RECOMP)
endif()
target_link_options(metalslug PRIVATE "-sUSE_SDL=2" "-sMODULARIZE=1" "-sEXPORT_NAME=createMetalSlug"
    "-sEXPORTED_RUNTIME_METHODS=callMain" "-sALLOW_MEMORY_GROWTH=1" "-sSTACK_SIZE=1048576"
    "-sENVIRONMENT=web" "-sFORCE_FILESYSTEM=1" "-sINVOKE_RUN=0")
set_target_properties(metalslug PROPERTIES SUFFIX ".js" RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_BINARY_DIR}/runtime")

# Only the verified set used by the game is bundled into metalslug.data.
set(MSLUG_ROM_DIR "${MSLUG_SOURCE}/roms" CACHE PATH "Verified Metal Slug and Neo Geo ROM directory")
set(rom_files
    201-p1.p1 201-s1.s1 201-m1.m1 201-c1.c1 201-c2.c2 201-c3.c3 201-c4.c4
    201-v1.v1 201-v2.v2 sp-s2.sp1 sfix.sfix sm1.sm1 000-lo.lo)
foreach(rom IN LISTS rom_files)
    set(source "${MSLUG_ROM_DIR}/${rom}")
    if(NOT EXISTS "${source}")
        message(FATAL_ERROR "Missing ${source}. Use the ROM directory verified by native setup.")
    endif()
    target_link_options(metalslug PRIVATE "SHELL:--preload-file \"${source}@/roms/${rom}\"")
    set_property(TARGET metalslug APPEND PROPERTY LINK_DEPENDS "${source}")
endforeach()

find_program(NODE_EXECUTABLE NAMES node REQUIRED)
add_custom_target(web_bundle ALL
    COMMAND "${NODE_EXECUTABLE}" "${CMAKE_CURRENT_SOURCE_DIR}/scripts/package-web.mjs" "$<TARGET_FILE_DIR:metalslug>"
    DEPENDS metalslug
    VERBATIM)