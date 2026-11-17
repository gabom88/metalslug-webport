/*
 * Overclock: the 68000 runs `web_overclock` times as many clocks as the
 * system clock (ng_cycles) advances. Video, timers and the Z80 keep their
 * original timing, so the game runs at normal speed but finishes each
 * frame's work in time: the original slowdown disappears. Same idea as
 * the CPU overclock option in arcade emulators.
 *
 * m68k.h has an include guard, so the macro below only redirects the
 * calls inside exec.c (the native file stays untouched).
 */
#include <emscripten.h>
#include <stdint.h>
#include "m68k.h"

static int web_overclock = 1;
static int64_t web_overclock_carry;

EMSCRIPTEN_KEEPALIVE void web_overclock_set(int factor) {
    web_overclock = factor < 1 ? 1 : factor > 4 ? 4 : factor;
    web_overclock_carry = 0;
}
EMSCRIPTEN_KEEPALIVE int web_overclock_get(void) { return web_overclock; }

static int web_m68k_execute(int budget) {
    if (web_overclock == 1) return m68k_execute(budget);
    web_overclock_carry += m68k_execute(budget * web_overclock);
    int charged = (int)(web_overclock_carry / web_overclock);
    web_overclock_carry -= (int64_t)charged * web_overclock;
    return charged;
}
#define m68k_execute web_m68k_execute
#include "exec.c"
#undef m68k_execute

#include "state.h"
void state_exec(web_state_t *s) {
    FIELD(ng_cpu);
    FIELD(ng_cycles);
    FIELD(ng_next_event);
    FIELD(ng_irq_pending);
    uint8_t context[4096];
    unsigned n = m68k_get_context(NULL);
    if (n > sizeof context) { s->failed = 1; return; }
    if (!s->load) m68k_get_context(context);
    state_bytes(s, context, n);
    if (s->load) { m68k_set_context(context); s_in_musashi = 0; web_overclock_carry = 0; }
}
