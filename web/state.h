#ifndef WEB_STATE_H
#define WEB_STATE_H
#include <stdint.h>
#include <stddef.h>
#include <string.h>
typedef struct { uint8_t *bytes; size_t size, offset; int load, failed; } web_state_t;
static inline void state_bytes(web_state_t *s, void *data, size_t n) {
    if (s->bytes) {
        if (s->offset > s->size || n > s->size - s->offset) { s->failed = 1; return; }
        if (s->load) memcpy(data, s->bytes + s->offset, n);
        else memcpy(s->bytes + s->offset, data, n);
    }
    s->offset += n;
}
#define FIELD(v) state_bytes(s, &(v), sizeof(v))
#ifdef __cplusplus
extern "C" {
#endif
void state_bus(web_state_t *s);
void state_lspc(web_state_t *s);
void state_video(web_state_t *s);
void state_io(web_state_t *s);
void state_audio(web_state_t *s);
void state_exec(web_state_t *s);
void state_ym(web_state_t *s);
void window_flush_audio(void);
#ifdef __cplusplus
}
#endif
#endif
