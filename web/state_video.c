/* Compose the mirror before the Neo Geo FIX interface layer. */
#define video_render_line native_video_render_line
#include "video.c"
#undef video_render_line
extern int web_mirror_active(void);
#include "video_mirror.h"
void video_render_line(int line, uint32_t *row) {
    if (!web_mirror_active()) { native_video_render_line(line, row); return; }
    const int scanline = line + NG_FIRST_VISIBLE;
    const uint32_t backdrop = s_pens[s_pal_bank][0xFFF];
    for (int x = 0; x < NG_SCREEN_W; x++) row[x] = backdrop;
    draw_mirror_sprites(scanline, row);
    /* HUD, scores, credits, life bars and animated mission banners stay readable. */
    draw_fix(scanline, row);
}
#include "state.h"
void state_video(web_state_t *s) {
    FIELD(s_palram);
    FIELD(s_pens);
    FIELD(s_pal_bank);
    FIELD(s_fix_use_bios);
}
