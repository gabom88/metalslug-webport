#include "ym2610.cpp"
#include "state.h"
#include <vector>
extern "C" void state_ym(web_state_t *s) {
    std::vector<uint8_t> bytes;
    ymfm::ymfm_saved_state saved(bytes, true);
    s_chip->chip.save_restore(saved);
    state_bytes(s, bytes.data(), bytes.size());
    if (s->load) {
        ymfm::ymfm_saved_state restored(bytes, false);
        s_chip->chip.save_restore(restored);
    }
}
