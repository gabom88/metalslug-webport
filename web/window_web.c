/*
 * window_sdl.c — the SDL2 window: presentation, sound, keyboard, gamepads,
 * frame pacing. Only built when SDL2 is found; see platform.c for the
 * headless stubs.
 *
 * Keys: arrows, Z/X/C/V = A/B/C/D, 1/2 = start P1/P2, 3 = select,
 * 5/6 = coin 1/2, 9 = service, F2 = test switch, Esc = quit.
 *
 * Keyboard, touch and gamepads (Gamepad API, remappable) are read by the
 * page, which sends player 1 through web_input() and player 2 through
 * web_input2().
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
static int web_stretch, s_duo;
static unsigned web_buttons, web_buttons2;
EMSCRIPTEN_KEEPALIVE void web_input(unsigned buttons) {
    web_buttons = buttons;
}
/* Player 2: bits 0-7 = joystick and A-D, bit 8 = start, bit 9 = coin. */
EMSCRIPTEN_KEEPALIVE void web_input2(unsigned buttons) {
    web_buttons2 = buttons;
}
/* Split-screen two-player mode: the page draws the frame twice itself. */
EMSCRIPTEN_KEEPALIVE void web_duo(int on) {
    s_duo = !!on;
}
static SDL_AudioDeviceID s_audio;
/* Gamepads are read by the page (Gamepad API) so players can remap them. */

EMSCRIPTEN_KEEPALIVE void web_display_mode(int stretch) {
    web_stretch = !!stretch;
    if (s_ren) SDL_RenderSetLogicalSize(s_ren, web_stretch ? 0 : WEB_VISIBLE_WIDTH, web_stretch ? 0 : NG_SCREEN_H);
}
int web_dash_pressed(void) {
    return !!(web_buttons & 0x8000);
}

int window_open(const char *title, int scale) {
    if (SDL_Init(SDL_INIT_VIDEO) != 0) {
        fprintf(stderr, "error: SDL_Init: %s\n", SDL_GetError());
        return -1;
    }
    s_win = SDL_CreateWindow(title, SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED,
                             WEB_VISIBLE_WIDTH * scale, NG_SCREEN_H * scale, SDL_WINDOW_RESIZABLE);
    if (s_win) s_ren = SDL_CreateRenderer(s_win, -1, SDL_RENDERER_ACCELERATED);
    if (s_ren) SDL_RenderSetLogicalSize(s_ren, web_stretch ? 0 : WEB_VISIBLE_WIDTH, web_stretch ? 0 : NG_SCREEN_H);
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

EM_JS(void, duo_present, (const uint32_t *fb), {
    if (Module.duoFrame) Module.duoFrame(fb);
});

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
    }
    in->p1 |= web_buttons & 255;
    in->start1 |= (web_buttons >> 8) & 1;
    in->coin1 |= (web_buttons >> 9) & 1;
    in->start2 |= (web_buttons >> 10) & 1;
    in->coin2 |= (web_buttons >> 11) & 1;
    in->select1 |= (web_buttons >> 12) & 1;
    in->service |= (web_buttons >> 13) & 1;
    in->test |= (web_buttons >> 14) & 1;
    in->p2 |= web_buttons2 & 255;
    in->start2 |= (web_buttons2 >> 8) & 1;
    in->coin2 |= (web_buttons2 >> 9) & 1;
    if (fb && s_duo) {
        duo_present(fb);
    } else if (fb) {
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
    if (s_audio) SDL_CloseAudioDevice(s_audio);
    if (s_tex) SDL_DestroyTexture(s_tex);
    if (s_ren) SDL_DestroyRenderer(s_ren);
    if (s_win) SDL_DestroyWindow(s_win);
    SDL_Quit();
}

void window_flush_audio(void) { if (s_audio) SDL_ClearQueuedAudio(s_audio); }
