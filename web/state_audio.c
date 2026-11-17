#include "audio.c"
#include "state.h"
void state_audio(web_state_t *s) {
    FIELD(s_z);
    FIELD(s_use_bios_rom);
    FIELD(s_ram);
    FIELD(s_bank);
    FIELD(s_cmd);
    FIELD(s_reply);
    FIELD(s_nmi_enabled);
    FIELD(s_nmi_pending);
    FIELD(s_nmi_line);
    FIELD(s_z80_clock);
    FIELD(s_ring);
    FIELD(s_ring_head);
    FIELD(s_ring_count);
    FIELD(s_samples_done);
    FIELD(s_ym);
    if (s->load) { s_z.read_byte = z_read; s_z.write_byte = z_write; s_z.port_in = z_in; s_z.port_out = z_out; s_z.userdata = NULL; }
}
