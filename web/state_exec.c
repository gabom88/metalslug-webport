#include "exec.c"
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
    if (s->load) { m68k_set_context(context); s_in_musashi = 0; }
}
