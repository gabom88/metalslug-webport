/*
 * neogeo.c — ng_main(): command line, ROM loading, and the frame loop.
 *
 * A frame is 264 lines of 768 68k clocks. The loop runs the CPU to the
 * start of each line, renders visible lines as they are reached, raises
 * VBlank (IRQ1) at line 240 pixel $11F, and services the LSPC timer
 * whenever its deadline falls inside the slice.
 *
 * Input comes from the window, or from an --input script so headless runs
 * are reproducible: `<frame>[-<end>] <button>[+<button>...]`, one per line.
 */
#include "ng_internal.h"
#include "state.h"
#include <neogeorecomp/cpu.h>
#include <neogeorecomp/bus.h>
#include "romload.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <emscripten.h>
#include <emscripten/html5.h>

int64_t ng_frame_start;

static uint32_t s_fb[NG_SCREEN_W * NG_SCREEN_H];

/* ---- options ---- */

#define MAX_SHOTS 64
typedef struct {
    const char *rom_path, *bios_path, *record, *input, *dump_misses, *bios_name, *wav;
    int headless, interp, verify, scale, mute;
    long frames;
    struct { long frame; const char *path; } shots[MAX_SHOTS];
    int nshots;
} options_t;

static void usage(const char *prog) {
    fprintf(stderr,
        "usage: %s [options]\n"
        "  --rom-path DIR        game ROM files (default: roms)\n"
        "  --bios-path DIR       system ROM files (default: the ROM path)\n"
        "  --bios FILE           system ROM (default: sp-s2.sp1, MVS Asia/Europe)\n"
        "  --headless            no window; run as fast as possible\n"
        "  --record FILE.mp4     pipe frames to ffmpeg\n"
        "  --frames N            stop after N frames\n"
        "  --screenshot N:FILE   save frame N as PNG (repeatable)\n"
        "  --input FILE          scripted input (see docs/running.md)\n"
        "  --interp              run everything in the interpreter\n"
        "  --verify              re-run every recompiled block in the interpreter and compare\n"
        "  --dump-misses FILE    write interpreted entry points for the recompiler\n"
        "  --scale N             window scale (default 3)\n"
        "  --wav FILE            write the audio to a WAV file\n"
        "  --mute                no sound from the window\n", prog);
}

static int parse_args(int argc, char **argv, options_t *o) {
    memset(o, 0, sizeof(*o));
    o->rom_path = "roms"; o->scale = 3; o->frames = -1; o->bios_name = "sp-s2.sp1";
    for (int i = 1; i < argc; i++) {
        const char *a = argv[i];
        const char *next = i + 1 < argc ? argv[i + 1] : NULL;
        if (!strcmp(a, "--rom-path") && next) { o->rom_path = next; i++; }
        else if (!strcmp(a, "--bios-path") && next) { o->bios_path = next; i++; }
        else if (!strcmp(a, "--bios") && next) { o->bios_name = next; i++; }
        else if (!strcmp(a, "--headless")) o->headless = 1;
        else if (!strcmp(a, "--record") && next) { o->record = next; i++; }
        else if (!strcmp(a, "--frames") && next) { o->frames = atol(next); i++; }
        else if (!strcmp(a, "--input") && next) { o->input = next; i++; }
        else if (!strcmp(a, "--interp")) o->interp = 1;
        else if (!strcmp(a, "--verify")) o->verify = 1;
        else if (!strcmp(a, "--dump-misses") && next) { o->dump_misses = next; i++; }
        else if (!strcmp(a, "--scale") && next) { o->scale = atoi(next); i++; }
        else if (!strcmp(a, "--wav") && next) { o->wav = next; i++; }
        else if (!strcmp(a, "--mute")) o->mute = 1;
        else if (!strcmp(a, "--screenshot") && next) {
            const char *colon = strchr(next, ':');
            if (!colon || o->nshots == MAX_SHOTS) { usage(argv[0]); return -1; }
            o->shots[o->nshots].frame = atol(next);
            o->shots[o->nshots].path = colon + 1;
            o->nshots++; i++;
        }
        else if (!strcmp(a, "--help") || !strcmp(a, "-h")) { usage(argv[0]); exit(0); }
        else { usage(argv[0]); return -1; }
    }
    if (!o->bios_path) o->bios_path = o->rom_path;
    return 0;
}

/* ---- scripted input ---- */

typedef struct { long start, end; ng_input_t in; } script_ev_t;
static script_ev_t *s_script;
static int s_nscript;

static int button(const char *name, ng_input_t *in) {
    static const struct { const char *n; int kind; uint8_t bit; } map[] = {
        {"up", 1, NG_UP}, {"down", 1, NG_DOWN}, {"left", 1, NG_LEFT}, {"right", 1, NG_RIGHT},
        {"a", 1, NG_A}, {"b", 1, NG_B}, {"c", 1, NG_C}, {"d", 1, NG_D},
        {"p2up", 2, NG_UP}, {"p2down", 2, NG_DOWN}, {"p2left", 2, NG_LEFT}, {"p2right", 2, NG_RIGHT},
        {"p2a", 2, NG_A}, {"p2b", 2, NG_B}, {"p2c", 2, NG_C}, {"p2d", 2, NG_D},
        {"start", 3, 0}, {"start2", 4, 0}, {"select", 5, 0}, {"coin", 6, 0}, {"coin2", 7, 0},
        {"service", 8, 0}, {"test", 9, 0},
    };
    for (size_t i = 0; i < sizeof(map) / sizeof(map[0]); i++) {
        if (strcmp(name, map[i].n)) continue;
        switch (map[i].kind) {
        case 1: in->p1 |= map[i].bit; break;
        case 2: in->p2 |= map[i].bit; break;
        case 3: in->start1 = 1; break;
        case 4: in->start2 = 1; break;
        case 5: in->select1 = 1; break;
        case 6: in->coin1 = 1; break;
        case 7: in->coin2 = 1; break;
        case 8: in->service = 1; break;
        case 9: in->test = 1; break;
        }
        return 0;
    }
    return -1;
}

static int load_script(const char *path) {
    FILE *f = fopen(path, "r");
    if (!f) { fprintf(stderr, "error: cannot open %s\n", path); return -1; }
    char line[256];
    int lineno = 0;
    while (fgets(line, sizeof(line), f)) {
        lineno++;
        char *hash = strchr(line, '#');
        if (hash) *hash = 0;
        long start, end;
        char buttons[200];
        int n = sscanf(line, "%ld-%ld %199s", &start, &end, buttons);
        if (n != 3) {
            if (sscanf(line, "%ld %199s", &start, buttons) != 2) continue;
            end = start + 5;   /* long enough for the BIOS to debounce a press */
        }
        script_ev_t ev = {start, end, {0}};
        for (char *tok = strtok(buttons, "+"); tok; tok = strtok(NULL, "+"))
            if (button(tok, &ev.in)) {
                fprintf(stderr, "%s:%d: unknown button '%s'\n", path, lineno, tok);
                fclose(f); return -1;
            }
        s_script = (script_ev_t *)realloc(s_script, (size_t)(s_nscript + 1) * sizeof(*s_script));
        s_script[s_nscript++] = ev;
    }
    fclose(f);
    return 0;
}

static void script_input(long frame, ng_input_t *in) {
    for (int i = 0; i < s_nscript; i++) {
        const script_ev_t *e = &s_script[i];
        if (frame < e->start || frame > e->end) continue;
        in->p1 |= e->in.p1; in->p2 |= e->in.p2;
        in->start1 |= e->in.start1; in->start2 |= e->in.start2; in->select1 |= e->in.select1;
        in->coin1 |= e->in.coin1; in->coin2 |= e->in.coin2;
        in->service |= e->in.service; in->test |= e->in.test;
    }
}

/* ---- frame loop ---- */

static void run_until(int64_t t) {
    while (ng_cycles < t) {
        int64_t target = t, d = lspc_timer_deadline();
        if (d < target) target = d;
        if (target > ng_cycles) exec_run(target);
        if (ng_cycles >= lspc_timer_deadline()) lspc_timer_fire();
    }
}

static void run_frame(void) {
    int64_t fs = ng_frame_start;
    for (int line = 0; line < NG_LINES_PER_FRAME; line++) {
        int64_t ls = fs + (int64_t)line * NG_CLOCKS_PER_LINE;
        run_until(ls);
        if (line >= NG_FIRST_VISIBLE && line < NG_VBLANK_LINE)
            video_render_line(line - NG_FIRST_VISIBLE, s_fb + (line - NG_FIRST_VISIBLE) * NG_SCREEN_W);
        if (line == NG_VBLANK_LINE) {
            run_until(ls + NG_VBLANK_HPOS * 2);
            lspc_vblank();
        }
    }
    ng_frame_start = fs + NG_CLOCKS_PER_FRAME;
    run_until(ng_frame_start);
    audio_sync();
}

static void power_on(void) {
    ng_cycles = 0;
    ng_frame_start = 0;
    bus_reset();
    lspc_reset();
    pal_select_bank(0);
    video_set_fix_bios(1);
    audio_select_bios_rom(1);
    audio_reset();
    exec_reset();
    ng_irq_pending = 4;        /* IRQ3 is asserted at power-on until the BIOS acks it */
}

static int web_ready, web_paused, web_double_jump, web_level, web_start_ticks;
static unsigned web_previous_jump, web_extra_used;
static uint8_t *web_prom;
static uint8_t web_state_buffer[1024 * 1024];
static double web_next;
#include "mods.h"

static void apply_level(int level) {
    static const uint8_t scene[] = {0, 0, 1, 3, 2, 4, 5};
    static const uint32_t handler[] = {0x967fe,0x967fe,0x96840,0x968c4,0x96882,0x96906,0x96948};
    if (!web_prom) return;
    web_prom[0x1925] = scene[level];
    for (int i = 0; i < 4; i++) web_prom[0x1932+i] = (uint8_t)(handler[level] >> (24-i*8));
}
EMSCRIPTEN_KEEPALIVE void web_options(int level, int double_jump) {
    web_level = level >= 0 && level <= 6 ? level : 0;
    web_double_jump = !!double_jump;
    apply_level(web_level);
}
EMSCRIPTEN_KEEPALIVE void web_pause(int paused) {
    web_paused = !!paused;
    web_next = 0;
    window_flush_audio();
}
EMSCRIPTEN_KEEPALIVE int web_double_jump_enabled(void) { return web_double_jump; }
EMSCRIPTEN_KEEPALIVE int web_is_ready(void) { return web_ready; }
static void transfer_state(web_state_t *s) {
    FIELD(ng_frame_start);
    FIELD(s_fb);
    FIELD(web_level);
    FIELD(web_double_jump);
    FIELD(web_start_ticks);
    FIELD(web_previous_jump);
    FIELD(web_extra_used);
    FIELD(web_turbo_enabled);
    FIELD(web_mirror_enabled);
    FIELD(web_turbo_phase);
    FIELD(web_dash_enabled);
    FIELD(web_blood_mode);
    FIELD(web_previous_dash);
    FIELD(web_dash_ticks);
    FIELD(web_dash_cooldown);
    FIELD(web_dash_direction);
    state_bus(s); state_lspc(s); state_video(s); state_io(s);
    state_exec(s); state_audio(s); state_ym(s);
}
EMSCRIPTEN_KEEPALIVE uint8_t *web_state_buffer_ptr(void) { return web_state_buffer; }
EMSCRIPTEN_KEEPALIVE int web_state_size(void) {
    web_state_t count = {0};
    transfer_state(&count);
    return (int)(count.offset + 16);
}
static uint32_t state_hash(const uint8_t *bytes, size_t size) {
    uint32_t hash = 2166136261u;
    for (size_t i = 0; i < size; i++) hash = (hash ^ bytes[i]) * 16777619u;
    return hash;
}
EMSCRIPTEN_KEEPALIVE int web_save_state(void) {
    if (!web_ready) return 0;
    size_t size = (size_t)web_state_size();
    if (size > sizeof web_state_buffer) return 0;
    web_state_t s = {web_state_buffer, size, 16, 0, 0};
    transfer_state(&s);
    if (s.failed) return 0;
    uint32_t header[] = {0x4d535331, 1, (uint32_t)s.offset, state_hash(web_state_buffer+16,s.offset-16)};
    memcpy(web_state_buffer, header, sizeof header);
    return (int)s.offset;
}
EMSCRIPTEN_KEEPALIVE int web_load_state(int size) {
    if (!web_ready || size != web_state_size() || (size_t)size > sizeof web_state_buffer) return 0;
    uint32_t header[4];
    memcpy(header, web_state_buffer, sizeof header);
    if (header[0] != 0x4d535331 || header[1] != 1 || header[2] != (uint32_t)size ||
        header[3] != state_hash(web_state_buffer+16,(size_t)size-16)) return 0;
    web_state_t s = {web_state_buffer, (size_t)size, 16, 1, 0};
    transfer_state(&s);
    apply_level(web_level);
    apply_blood_palette();
    apply_dash_speed();
    window_flush_audio();
    web_next = 0;
    return !s.failed;
}
static int at_title(void) {
    static const char text[] = "Metal Slug port by Bardock";
    for (unsigned i = 0; i < sizeof text-1; i++)
        if (lspc_vram[0x70fa+i*32] != (0x2300 | (uint8_t)text[i])) return 0;
    return 1;
}
static void double_jump(ng_input_t *in) {
    const uint32_t player = 0x100440;
    uint32_t handler = ng_r32(player);
    int airborne = handler >= 0x36914 && handler <= 0x36c8a;
    unsigned pressed = !!(in->p1 & NG_B);
    if (!airborne) web_extra_used = 0;
    if (web_double_jump && airborne && pressed && !web_previous_jump && !web_extra_used) {
        ng_w16(player+0x2a, 0x9cd);
        ng_w16(player+0x2e, 0xff3f);
        ng_w8(player+0x90, 5);
        web_extra_used = 1;
    }
    web_previous_jump = pressed;
}

/* The Neo Geo clock is independent of the display refresh rate. */
static EM_BOOL web_frame(double now, void *data) {
    (void)data;
    static int16_t samples[4096 * 2];
    if (web_paused) { web_next = 0; return EM_TRUE; }
    if (!web_ready) {
        for (int i = 0; i < 45 && !web_ready; i++) {
            ng_input_t empty = {0};
            io_set_inputs(&empty);
            run_frame();
            audio_take_samples(samples, 4096);
            /* BIOS_USER_REQUEST=2 is the handoff to the cartridge demo.
             * Stop before its tank sequence, rather than waiting for the title. */
            if ((ng_r8(0x10fdae) == 2 && ng_cpu.pc < 0x100000) ||
                ng_frame_start > (int64_t)NG_CLOCKS_PER_FRAME * 1400) {
                web_ready = 1;
                web_start_ticks = web_level ? -1 : 0;
            }
        }
        if (!web_ready) return EM_TRUE;
        web_next = 0;
    }
    const double period = 1000.0 / 59.185606;
    if (!web_next || now - web_next > 4 * period) web_next = now;
    if (now + 0.25 < web_next) return EM_TRUE;
    ng_input_t in = {0};
    platform_frame(s_fb, &in);
    do {
        if (web_start_ticks == -1 && at_title()) web_start_ticks = 1;
        if (web_start_ticks > 0) {
            if (web_start_ticks < 12) in.coin1 = 1;
            if (web_start_ticks >= 35 && web_start_ticks < 48) in.start1 = 1;
            if (++web_start_ticks >= 55) web_start_ticks = 0;
        }
        ng_input_t frame_in = in;
        extra_input(&frame_in);
        dash(&frame_in, (unsigned)web_dash_pressed());
        if (ng_r8(0x10fdae) == 2 && ng_cpu.pc < 0x100000) ng_w8(0x10fd8f, web_blood_mode ? 1 : 0);
        double_jump(&frame_in);
        io_set_inputs(&frame_in);
        run_frame();
        platform_audio(samples, audio_take_samples(samples, 4096));
        web_next += period;
    } while (web_next <= now);
    return EM_TRUE;
}
#ifdef WEB_REGRESSION_TEST
#include "state-regression.h"
#endif

int ng_main(int argc, char **argv, const ng_game_t *game,
            const ng_func_entry_t *funcs, size_t nfuncs) {
    options_t o;
    platform_early_init();
    if (parse_args(argc, argv, &o)) return 2;
    if (o.input && load_script(o.input)) return 1;

    size_t sz, bios_sz, sfix_sz, sm1_sz, lo_sz, srom_sz, m1_sz;
    uint8_t *prom = ng_load_prom(o.rom_path, game);
    uint8_t *bios = ng_read_file(o.bios_path, o.bios_name, &bios_sz);
    uint8_t *sfix = ng_read_file(o.bios_path, "sfix.sfix", &sfix_sz);
    uint8_t *sm1 = ng_read_file(o.bios_path, "sm1.sm1", &sm1_sz);
    uint8_t *lo = ng_read_file(o.bios_path, "000-lo.lo", &lo_sz);
    uint8_t *crom = ng_load_crom(o.rom_path, game);
    uint8_t *srom = ng_read_file(o.rom_path, game->srom, &srom_sz);
    uint8_t *m1 = ng_read_file(o.rom_path, game->m1, &m1_sz);
    if (!prom || !bios || !sfix || !sm1 || !lo || !crom || !srom || !m1) {
        fprintf(stderr, "error: missing ROM files; see docs/running.md for the expected set\n");
        return 1;
    }
    if (bios_sz < 0x20000) { fprintf(stderr, "error: %s is not a 128 KB system ROM\n", o.bios_name); return 1; }
    ng_swap16(bios, 0x20000);
    (void)sz;

    const uint8_t *vroms[NG_MAX_PARTS];
    size_t vsizes[NG_MAX_PARTS];
    int nv = 0;
    for (; nv < NG_MAX_PARTS && game->vrom[nv]; nv++) {
        uint8_t *v = ng_read_file(o.rom_path, game->vrom[nv], &vsizes[nv]);
        if (!v) return 1;
        vroms[nv] = v;
    }

    ng_board_t board = {prom, game->prom_size, bios, 1};
    web_prom = prom;
    apply_blood_palette();
    apply_level(web_level);
    bus_init(&board);
    io_reset(1);
    video_load(crom, game->crom_size, srom, srom_sz, sfix, lo);
    free(crom);
    audio_init(m1, m1_sz, sm1, vroms, vsizes, nv);
    exec_init(funcs, nfuncs, o.interp || nfuncs == 0);
    exec_set_verify(o.verify);
    if (platform_init(game->title, o.scale, o.headless, o.record)) return 1;
    if (o.mute) platform_mute();
    if (o.wav && platform_wav(o.wav)) return 1;

    fprintf(stderr, "[neogeorecomp] %s: %zu recompiled entry points%s\n", game->name, nfuncs,
            (o.interp || nfuncs == 0) ? ", interpreter only" : "");
    power_on();
    if (!o.headless) {
        emscripten_request_animation_frame_loop(web_frame, NULL);
        return 0;
    }

    static int16_t samples[4096 * 2];
    for (long frame = 0; o.frames < 0 || frame < o.frames; frame++) {
        ng_input_t in;
        memset(&in, 0, sizeof(in));
        if (!platform_frame(frame == 0 ? NULL : s_fb, &in)) break;
        script_input(frame, &in);
        if (ng_r8(0x10fdae) == 2 && ng_cpu.pc < 0x100000) ng_w8(0x10fd8f, web_blood_mode ? 1 : 0);
        io_set_inputs(&in);
        run_frame();
        platform_audio(samples, audio_take_samples(samples, 4096));
        for (int i = 0; i < o.nshots; i++)
            if (o.shots[i].frame == frame) {
#ifdef WEB_REGRESSION_TEST
                char dump_path[512]; snprintf(dump_path, sizeof dump_path, "%s.vram", o.shots[i].path);
                FILE *dump = fopen(dump_path, "wb");
                if (dump) { fwrite(lspc_vram, sizeof lspc_vram, 1, dump); fclose(dump); }
                fprintf(stderr, "capture mode request=%u p1=%u scene=%u\n", ng_r8(0x10fdae),ng_r8(0x10fdb6),ng_r8(0x106ece));
#endif
                if (write_png(o.shots[i].path, s_fb, NG_SCREEN_W, NG_SCREEN_H))
                    fprintf(stderr, "error: cannot write %s\n", o.shots[i].path);
                else
                    fprintf(stderr, "[neogeorecomp] frame %ld -> %s\n", frame, o.shots[i].path);
            }
    }
#ifdef WEB_REGRESSION_TEST
    if (!o.nshots) return regression();
    return 0;
#endif
    platform_frame(s_fb, &(ng_input_t){0});

    exec_report();
    if (o.dump_misses) exec_dump_misses(o.dump_misses);
    platform_shutdown();
    video_shutdown();
    audio_shutdown();
    return 0;
}
