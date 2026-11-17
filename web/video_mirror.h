/* LSPC sprite renderer adapted from neogeorecomp video.c. */
static void draw_mirror_sprites(int scanline, uint32_t *row) {
    const uint32_t *pens = s_pens[s_pal_bank];
    int x = 0, y = 0, rows = 0, zoom_y = 0, zoom_x = 0, drawn = 0;

    for (int n = 0; n < 381; n++) {
        uint16_t ctl = lspc_vram[0x8200 + n];
        uint16_t zoom = lspc_vram[0x8000 + n];
        if (ctl & 0x40) {
            x = (x + zoom_x + 1) & 0x1FF;
            zoom_x = (zoom >> 8) & 0x0F;
        } else {
            y = 0x200 - (ctl >> 7);
            x = lspc_vram[0x8400 + n] >> 7;
            zoom_y = zoom & 0xFF;
            zoom_x = (zoom >> 8) & 0x0F;
            rows = ctl & 0x3F;
        }
        if (rows == 0 || !on_line(scanline, y, rows)) continue;
        if (++drawn > 96) break;
        if (x >= 0x140 && x <= 0x1F0) continue;

        int sprite_line = (scanline - y) & 0x1FF;
        int zoom_line = sprite_line & 0xFF;
        int invert = sprite_line & 0x100;
        if (invert) zoom_line ^= 0xFF;
        if (rows > 0x20) {
            /* Height 33+: the shrunk sprite repeats down the screen. */
            zoom_line %= (zoom_y + 1) << 1;
            if (zoom_line > zoom_y) {
                zoom_line = ((zoom_y + 1) << 1) - 1 - zoom_line;
                invert = !invert;
            }
        }
        int yt = s_zoom_rom[(zoom_y << 8) | zoom_line];
        int tile = yt >> 4, tile_row = yt & 0x0F;
        if (invert) { tile_row ^= 0x0F; tile ^= 0x1F; }

        uint32_t tm = (uint32_t)(n << 6) | (uint32_t)(tile << 1);
        uint16_t attr = lspc_vram[tm + 1];
        uint32_t code = lspc_vram[tm] | (((uint32_t)attr << 12) & 0xF0000u);
        if (attr & 0x0008) code = (code & ~7u) | (lspc_anim_counter & 7);
        else if (attr & 0x0004) code = (code & ~3u) | (lspc_anim_counter & 3);
        if (attr & 0x0002) tile_row ^= 0x0F;

        const uint8_t *gfx = s_spr + ((size_t)(code & s_spr_tiles_mask) << 8) + (tile_row << 4);
        const uint32_t *pal = pens + ((attr >> 8) << 4);
        const uint8_t *zx = s_zoom_x[zoom_x];
        int px = x;
        for (int i = 0; i < 16; i++) {
            if (!zx[i]) continue;
            int c = (attr & 1) ? gfx[15 - i] : gfx[i];
            if (c && px < NG_SCREEN_W) {
                /* Banner letter/digit maps $25427C..$2543A3 use C tiles $1087..$10CB.
                 * Preserve their positions and per-frame animated flips. */
                int target = code >= 0x1087 && code <= 0x10cb ? px : NG_SCREEN_W - 1 - px;
                row[target] = pal[c];
            }
            px = (px + 1) & 0x1FF;
        }
    }
}

