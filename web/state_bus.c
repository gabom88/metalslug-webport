#include "bus.c"
#include "state.h"
void state_bus(web_state_t *s) {
    FIELD(s_wram);
    FIELD(s_backup);
    FIELD(s_bios_vectors);
    FIELD(s_backup_locked);
    FIELD(s_bank);
    if (s->load) { map_bank(); bus_select_bios_vectors(s_bios_vectors); bus_set_backup_lock(s_backup_locked); }
}
