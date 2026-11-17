#include "lspc.c"
#include "state.h"
void state_lspc(web_state_t *s) {
    FIELD(lspc_vram);
    FIELD(lspc_anim_counter);
    FIELD(s_addr);
    FIELD(s_mod);
    FIELD(s_anim_speed);
    FIELD(s_anim_frames);
    FIELD(s_anim_disabled);
    FIELD(s_timer_ctrl);
    FIELD(s_timer_reload);
    FIELD(s_timer_deadline);
}
