#ifndef WEB_MODS_H
#define WEB_MODS_H
static int web_dash_enabled, web_blood_mode;
static int web_turbo_enabled, web_mirror_enabled;
static unsigned web_turbo_phase;
static unsigned web_previous_dash, web_dash_ticks, web_dash_cooldown;
static int web_dash_direction = 1;
static const uint32_t dash_immediates[] = {
    0x34ba6,0x34bde,0x34da0,0x34dd8,0x35252,0x3528a,
    0x3556c,0x355a4,0x35b30,0x35b68,0x35c74,0x35cac
};
static const unsigned blood_palettes[] = {0x0e,0x154,0x17a,0x19f,0x183,0x1d5};
static uint8_t blood_original[6][64];
static int blood_original_ready;
extern int web_dash_pressed(void);

static void apply_dash_speed(void) {
    if (!web_prom) return;
    for (unsigned i = 0; i < sizeof dash_immediates / sizeof dash_immediates[0]; i++) {
        int left = i == 2 || i == 3 || i == 6 || i == 7 || i == 10 || i == 11;
        int speed = web_dash_ticks ? 0x800 : 0x300;
        uint16_t value = (uint16_t)(left ? -speed : speed);
        web_prom[dash_immediates[i]] = (uint8_t)(value >> 8);
        web_prom[dash_immediates[i]+1] = (uint8_t)value;
    }
}
static void apply_blood_palette(void) {
    if (!web_prom) return;
    for (unsigned i = 0; i < sizeof blood_palettes / sizeof blood_palettes[0]; i++) {
        uint8_t *palette = web_prom + 0x14e00 + blood_palettes[i] * 64;
        if (!blood_original_ready) memcpy(blood_original[i], palette, 64);
        else memcpy(palette, blood_original[i], 64);
        if (web_blood_mode == 2) {
            for (unsigned color = 1; color < 16; color++) {
                uint8_t *rgb = palette + color * 4;
                if (rgb[0] >= 8 && rgb[0] >= 2 * rgb[1] && rgb[0] >= 2 * rgb[2]) {
                    rgb[2] = rgb[0];
                    rgb[0] = (uint8_t)(rgb[0] * 3 / 4);
                }
            }
        }
    }
    blood_original_ready = 1;
}
EMSCRIPTEN_KEEPALIVE void web_mod_options(int dash, int blood) {
    web_dash_enabled = !!dash;
    web_blood_mode = blood >= 0 && blood <= 2 ? blood : 0;
    apply_blood_palette();
}
EMSCRIPTEN_KEEPALIVE int web_dash_enabled_get(void) { return web_dash_enabled; }
EMSCRIPTEN_KEEPALIVE int web_blood_mode_get(void) { return web_blood_mode; }

static void dash(ng_input_t *in, unsigned pressed) {
    uint32_t handler = ng_r32(0x100440);
    int on_foot = handler >= 0x33ede && handler < 0x36000;
    if (web_dash_cooldown) web_dash_cooldown--;
    if (!web_dash_enabled || !on_foot) web_dash_ticks = 0;
    if (web_dash_enabled && on_foot && pressed && !web_previous_dash && !web_dash_cooldown) {
        web_dash_ticks = 12;
        web_dash_cooldown = 48;
        web_dash_direction = (in->p1 & NG_LEFT) ? -1 :
                             (in->p1 & NG_RIGHT) ? 1 : (ng_r8(0x10047a) & 1) ? -1 : 1;
    }
    apply_dash_speed();
    if (web_dash_ticks) {
        in->p1 &= (uint8_t)~(NG_LEFT | NG_RIGHT);
        in->p1 |= web_dash_direction < 0 ? NG_LEFT : NG_RIGHT;
        web_dash_ticks--;
    }
    web_previous_dash = pressed;
}
EMSCRIPTEN_KEEPALIVE void web_extra_options(int turbo, int mirror) {
    web_turbo_enabled = !!turbo; web_mirror_enabled = !!mirror; web_turbo_phase = 0;
}
EMSCRIPTEN_KEEPALIVE int web_turbo_get(void) { return web_turbo_enabled; }
EMSCRIPTEN_KEEPALIVE int web_mirror_get(void) { return web_mirror_enabled; }
/* Scene IDs 0..5 are missions; BIOS player status 1 means a live game. */
static int mission_active(void) {
    return ng_r8(0x10fdae) == 3 && ng_r8(0x106ece) <= 5 &&
        (ng_r8(0x10fdb6) == 1 || ng_r8(0x10fdb7) == 1);
}
EMSCRIPTEN_KEEPALIVE int web_mirror_active(void) { return web_mirror_enabled && ng_r8(0x10fdae) == 3 && ng_r8(0x106ece) <= 5; }
static uint8_t mirror_directions(uint8_t buttons) {
    return (buttons & ~(NG_LEFT | NG_RIGHT)) |
        ((buttons & NG_LEFT) ? NG_RIGHT : 0) | ((buttons & NG_RIGHT) ? NG_LEFT : 0);
}
static void extra_input(ng_input_t *in) {
    if (web_mirror_active()) { in->p1 = mirror_directions(in->p1); in->p2 = mirror_directions(in->p2); }
    if (web_turbo_enabled && mission_active() && (in->p1 & NG_A)) {
        if (web_turbo_phase % 6 >= 3) in->p1 &= (uint8_t)~NG_A;
        web_turbo_phase = (web_turbo_phase + 1) % 6;
    } else web_turbo_phase = 0;
}
#endif
