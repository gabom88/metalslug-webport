/*
 * window_sdl.c — the SDL2 window: presentation, sound, keyboard, gamepads,
 * frame pacing. Only built when SDL2 is found; see platform.c for the
 * headless stubs.
 *
 * Keys: arrows, Z/X/C/V = A/B/C/D, 1/2 = start P1/P2, 3 = select,
 * 5/6 = coin 1/2, 9 = service, F2 = test switch, Esc = quit.
 *
 * Gamepads (SDL's GameController layout, so any pad SDL knows): the first
 * connected is player 1, the second player 2, plugged in at any time.
 * D-pad or left stick; south/east/west/north (Xbox A/B/X/Y) = Neo Geo
 * A/B/C/D; Start = start; Back = coin; left shoulder = select. Keyboard
 * and pads work together. A pad SDL doesn't know can be described with the
 * SDL_GAMECONTROLLERCONFIG environment variable.
 */
#include "ng_internal.h"
#define SDL_MAIN_HANDLED
#include <SDL.h>
#include <stdio.h>
#include <emscripten.h>

static SDL_Window *s_win;
static SDL_Renderer *s_ren;
static SDL_Texture *s_tex;
/* Hide the eight edge pixels on each side of the arcade image. */
enum { WEB_VISIBLE_WIDTH = 304, WEB_EDGE = (NG_SCREEN_W - WEB_VISIBLE_WIDTH) / 2 };
static unsigned web_buttons;
EMSCRIPTEN_KEEPALIVE void web_input(unsigned buttons) {
    web_buttons = buttons;
}
static SDL_AudioDeviceID s_audio;
static SDL_GameController *s_pad[2];     /* player 1, player 2 */

/* ponytail: a fixed layout; remapping belongs to the frontend (ROADMAP.md) */
static void pad_added(int index) {
    for (int i = 0; i < 2; i++)
        if (!s_pad[i]) {
            s_pad[i] = SDL_GameControllerOpen(index);
            if (s_pad[i]) fprintf(stderr, "gamepad: %s is player %d\n", SDL_GameControllerName(s_pad[i]), i + 1);
            return;
        }
}

static void pad_removed(SDL_JoystickID id) {
    for (int i = 0; i < 2; i++)
        if (s_pad[i] && SDL_JoystickInstanceID(SDL_GameControllerGetJoystick(s_pad[i])) == id) {
            SDL_GameControllerClose(s_pad[i]);
            s_pad[i] = NULL;
        }
}

int window_open(const char *title, int scale) {
    if (SDL_Init(SDL_INIT_VIDEO) != 0) {
        fprintf(stderr, "error: SDL_Init: %s\n", SDL_GetError());
        return -1;
    }
    s_win = SDL_CreateWindow(title, SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED,
                             WEB_VISIBLE_WIDTH * scale, NG_SCREEN_H * scale, SDL_WINDOW_RESIZABLE);
    if (s_win) s_ren = SDL_CreateRenderer(s_win, -1, SDL_RENDERER_ACCELERATED);
    if (s_ren) SDL_RenderSetLogicalSize(s_ren, WEB_VISIBLE_WIDTH, NG_SCREEN_H);
    if (s_ren) s_tex = SDL_CreateTexture(s_ren, SDL_PIXELFORMAT_ARGB8888, SDL_TEXTUREACCESS_STREAMING,
                              NG_SCREEN_W, NG_SCREEN_H);
    if (!s_win || !s_ren || !s_tex) {
        fprintf(stderr, "error: cannot initialize the canvas: %s\n", SDL_GetError());
        window_close();
        return -1;
    }
    /* Sound at the YM2610's own rate; SDL converts it for the device. A
     * missing audio device leaves the game silent, not stopped. */
    SDL_AudioSpec want = {0};
    want.freq = NG_AUDIO_RATE; want.format = AUDIO_S16SYS; want.channels = 2; want.samples = 1024;
    if (SDL_InitSubSystem(SDL_INIT_AUDIO) == 0)
        s_audio = SDL_OpenAudioDevice(NULL, 0, &want, NULL, 0);
    if (!s_audio) fprintf(stderr, "warning: no sound: %s\n", SDL_GetError());
    /* Pads already connected arrive as SDL_CONTROLLERDEVICEADDED events. */
    if (SDL_InitSubSystem(SDL_INIT_GAMECONTROLLER) != 0)
        fprintf(stderr, "warning: no gamepads: %s\n", SDL_GetError());
    return 0;
}

/* The frame loop and the sound card both run at the board's rates, so the
 * queue stays level; it is kept between about 30 and 120 ms, dropping a
 * frame's samples when it runs long (after a stall) and padding with
 * silence when it runs dry. */
void window_audio(const int16_t *samples, size_t frames) {
    if (!s_audio) return;
    const Uint32 bytes_per_ms = NG_AUDIO_RATE * 4 / 1000;
    Uint32 queued = SDL_GetQueuedAudioSize(s_audio);
    if (queued > 120 * bytes_per_ms) return;
    if (queued < 30 * bytes_per_ms) {
        static const int16_t silence[2 * 2048];   /* 37 ms */
        SDL_QueueAudio(s_audio, silence, (Uint32)(30 * bytes_per_ms - queued) & ~3u);
    }
    SDL_QueueAudio(s_audio, samples, (Uint32)(frames * 4));
    SDL_PauseAudioDevice(s_audio, 0);
}

static void read_pad(SDL_GameController *c, uint8_t *bits, uint8_t *start, uint8_t *coin, uint8_t *select) {
    enum { DEAD = 12000 };   /* about a third of the stick's travel */
    int x = SDL_GameControllerGetAxis(c, SDL_CONTROLLER_AXIS_LEFTX);
    int y = SDL_GameControllerGetAxis(c, SDL_CONTROLLER_AXIS_LEFTY);
#define PAD(b) SDL_GameControllerGetButton(c, SDL_CONTROLLER_BUTTON_##b)
    if (PAD(DPAD_UP) || y < -DEAD) *bits |= NG_UP;
    if (PAD(DPAD_DOWN) || y > DEAD) *bits |= NG_DOWN;
    if (PAD(DPAD_LEFT) || x < -DEAD) *bits |= NG_LEFT;
    if (PAD(DPAD_RIGHT) || x > DEAD) *bits |= NG_RIGHT;
    if (PAD(A)) *bits |= NG_A;
    if (PAD(B)) *bits |= NG_B;
    if (PAD(X)) *bits |= NG_C;
    if (PAD(Y)) *bits |= NG_D;
    *start |= PAD(START);
    *coin |= PAD(BACK);
    *select |= PAD(LEFTSHOULDER);
#undef PAD
}

EM_JS(void, set_title_link, (int visible), {
    const link = document.getElementById("title-credit-link");
    if (link) link.hidden = !visible;
});

static bool title_credit_present(void) {
    /* Check the title's actual FIX tile entries, using the native font page. */
    static const char credit[] = "Metal Slug port by Bardock";
    static const char url[] = "https://x.com/bardock_dev";
    for (size_t i = 0; i < sizeof credit - 1; ++i) {
        if (lspc_vram[0x70fa + i * 32] != (0x2300 | (uint8_t)credit[i]))
            return false;
    }
    for (size_t i = 0; i < sizeof url - 1; ++i) {
        if (lspc_vram[0x70fb + i * 32] != (0x2300 | (uint8_t)url[i]))
            return false;
    }
    return true;
}

bool window_frame(const uint32_t *fb, ng_input_t *in) {
    SDL_Event e;
    while (SDL_PollEvent(&e)) {
        if (e.type == SDL_QUIT) return false;
        if (e.type == SDL_CONTROLLERDEVICEADDED) pad_added(e.cdevice.which);
        if (e.type == SDL_CONTROLLERDEVICEREMOVED) pad_removed(e.cdevice.which);
    }
    in->p1 |= web_buttons & 255;
    in->start1 |= (web_buttons >> 8) & 1;
    in->coin1 |= (web_buttons >> 9) & 1;
    in->start2 |= (web_buttons >> 10) & 1;
    in->coin2 |= (web_buttons >> 11) & 1;
    in->select1 |= (web_buttons >> 12) & 1;
    in->service |= (web_buttons >> 13) & 1;
    in->test |= (web_buttons >> 14) & 1;
    if (s_pad[0]) read_pad(s_pad[0], &in->p1, &in->start1, &in->coin1, &in->select1);
    if (s_pad[1]) read_pad(s_pad[1], &in->p2, &in->start2, &in->coin2, &in->select2);
    if (fb) {
        static bool link_visible;
        const bool title = title_credit_present();
        if (title != link_visible) {
            link_visible = title;
            set_title_link(title);
        }
        SDL_UpdateTexture(s_tex, NULL, fb, NG_SCREEN_W * 4);
        SDL_RenderClear(s_ren);
        const SDL_Rect visible = {WEB_EDGE, 0, WEB_VISIBLE_WIDTH, NG_SCREEN_H};
        SDL_RenderCopy(s_ren, s_tex, &visible, NULL);
        SDL_RenderPresent(s_ren);
    }
    return true;
}

void window_close(void) {
    for (int i = 0; i < 2; i++)
        if (s_pad[i]) SDL_GameControllerClose(s_pad[i]);
    if (s_audio) SDL_CloseAudioDevice(s_audio);
    if (s_tex) SDL_DestroyTexture(s_tex);
    if (s_ren) SDL_DestroyRenderer(s_ren);
    if (s_win) SDL_DestroyWindow(s_win);
    SDL_Quit();
}
