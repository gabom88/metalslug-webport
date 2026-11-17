static int regression(void) {
    static const unsigned scenes[] = {0,0,1,3,2,4,5};
    fprintf(stderr,"Mission %d: scene %u, player handler %06x\n", web_level, ng_r8(0x106ece), ng_r32(0x100440));
    if (web_level && ng_r8(0x106ece) != scenes[web_level]) return 30;
    fprintf(stderr, "Mode gate: request=%u p1=%u p2=%u scene=%u\n", ng_r8(0x10fdae), ng_r8(0x10fdb6), ng_r8(0x10fdb7), ng_r8(0x106ece));
    web_extra_options(1, 1);
    if (!web_mirror_active()) return 40;
    uint8_t scene = ng_r8(0x106ece);
    for (int excluded = 6; excluded <= 13; excluded++) {
        ng_w8(0x106ece, excluded);
        if (web_mirror_active()) return 41;
    }
    ng_w8(0x106ece, scene);
    uint8_t player1 = ng_r8(0x10fdb6), player2 = ng_r8(0x10fdb7);
    ng_w8(0x10fdb6, 2); ng_w8(0x10fdb7, 0);
    if (!web_mirror_active() || mission_active()) return 46;
    ng_w8(0x10fdb6, 0);
    if (!web_mirror_active()) return 47;
    ng_w8(0x10fdae, 2);
    if (web_mirror_active()) return 48;
    ng_w8(0x10fdae, 3); ng_w8(0x10fdb6, player1); ng_w8(0x10fdb7, player2);
    fprintf(stderr, "PASS mirror retained during continue and no-live-player transitions; intro excluded\n");
    int shots = 0;
    for (int frame = 0; frame < 12; frame++) {
        ng_input_t input = {0}; input.p1 = NG_RIGHT | NG_A; input.p2 = NG_LEFT | NG_B;
        extra_input(&input);
        if (!(input.p1 & NG_LEFT) || (input.p1 & NG_RIGHT) || !(input.p2 & NG_RIGHT) || !(input.p2 & NG_B)) return 42;
        shots += !!(input.p1 & NG_A);
    }
    if (shots != 6) return 43;
    ng_input_t released = {0}; extra_input(&released);
    if (web_turbo_phase) return 44;
    web_extra_options(0, 0);
    released.p1 = NG_LEFT | NG_A; extra_input(&released);
    if (released.p1 != (NG_LEFT | NG_A) || web_mirror_active()) return 45;
    web_extra_options(1, 1);
    fprintf(stderr, "PASS mission-only mirror, both direction mappings, turbo pulse/release and disabled mods\n");
    web_ready = 1;
    int size = web_save_state();
    if (size <= 0) return 21;
    uint8_t *original = malloc((size_t)size), *expected = malloc((size_t)size);
    memcpy(original, web_state_buffer, (size_t)size);
    for (int pass = 0; pass < 2; pass++) {
        if (pass) {
            memcpy(web_state_buffer, original, (size_t)size);
            if (!web_load_state(size)) return 22;
        }
        int16_t samples[8192];
        int observed_extra = 0;
        for (int frame = 0; frame < 180; frame++) {
            ng_input_t in = {0};
            in.p1 = NG_RIGHT | ((frame % 7) ? NG_A : 0) | (((frame >= 20 && frame < 26) || (frame >= 40 && frame < 46)) ? NG_B : 0);
            dash(&in, frame == 5 || frame == 100);
            ng_w8(0x10fd8f, web_blood_mode ? 1 : 0);
            extra_input(&in);
            double_jump(&in);
            observed_extra |= web_extra_used;
            io_set_inputs(&in);
            run_frame();
            audio_take_samples(samples, 4096);
        }
        if (web_level == 1 && !observed_extra) return 31;
        if (web_save_state() != size) return 23;
        if (!pass) memcpy(expected, web_state_buffer, (size_t)size);
        else if (memcmp(expected, web_state_buffer, (size_t)size)) {
            for (int i = 16; i < size; i++) if (expected[i] != web_state_buffer[i]) {
                fprintf(stderr,"snapshot mismatch at %d: %d != %d\n",i,expected[i],web_state_buffer[i]); break;
            }
            return 24;
        }
    }
    /* Reject a corrupted state before changing any machine state. */
    memcpy(web_state_buffer, original, (size_t)size);
    web_state_buffer[100] ^= 1;
    if (web_load_state(size)) return 25;
    if (web_save_state() != size || memcmp(expected, web_state_buffer, (size_t)size)) return 26;

    ng_w32(0x100440, 0x36a70);
    ng_w16(0x10046a, 0xff00);
    web_extra_used = web_previous_jump = 0;
    web_double_jump = 1;
    ng_input_t in = {0}; in.p1 = NG_B;
    double_jump(&in);
    if (!web_extra_used || ng_r16(0x10046a) != 0x9cd) return 27;
    in.p1 = 0; double_jump(&in);
    ng_w16(0x10046a, 0x100);
    in.p1 = NG_B; double_jump(&in);
    if (ng_r16(0x10046a) != 0x100) return 28;
    ng_w32(0x100440, 0x33ede); double_jump(&in);
    if (web_extra_used) return 29;
    web_dash_enabled = 1;
    web_previous_dash = web_dash_cooldown = web_dash_ticks = 0;
    in.p1 = NG_RIGHT; dash(&in, 1);
    if (web_dash_ticks != 11 || web_prom[0x34ba6] != 8) return 32;
    for (int i = 0; i < 12; i++) dash(&in, 0);
    if (web_dash_ticks || web_prom[0x34ba6] != 3) return 33;
    dash(&in, 1); if (web_dash_ticks) return 34;
    web_blood_mode = 2; apply_blood_palette();
    int purple = 0;
    for (unsigned i = 0; i < 6; i++) for (int c = 1; c < 16; c++) {
        const uint8_t *before = blood_original[i] + c*4;
        const uint8_t *after = web_prom + 0x14e00 + blood_palettes[i]*64 + c*4;
        if (before[0] >= 8 && before[0] >= 2*before[1] && before[0] >= 2*before[2]) {
            if (after[2] != before[0] || after[0] != before[0]*3/4) return 35;
            purple++;
        } else if (memcmp(before, after, 4)) return 36;
    }
    if (purple != 16) return 37;
    web_blood_mode = 1; apply_blood_palette();
    for (unsigned i = 0; i < 6; i++)
        if (memcmp(blood_original[i], web_prom + 0x14e00 + blood_palettes[i]*64, 64)) return 38;
    fprintf(stderr, "PASS dash duration/cooldown, purple palettes and red restoration\n");
    fprintf(stderr, "PASS deterministic CPU/video/audio restore (%d bytes), corrupt-state rejection, second-jump limit\n", size);
    free(original); free(expected);
    return 0;
}
