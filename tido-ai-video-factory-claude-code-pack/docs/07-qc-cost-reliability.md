# QC, Cost and Reliability

## QC layers

### Technical
File, codec, resolution, duration, corrupt/black/freeze frames, audio corruption.

### Product
Packaging, label, color, shape, count, proportion, no invented text.

### Cinematography
Shot size, angle, movement, lens feel, composition, focus.

### Lighting
Direction, contrast, temperature, highlights, reflections, consistency.

### Physics/action
Gravity, liquids, hands, interaction, timing, continuity.

### Audio
Pronunciation, content, emotion, pace, clipping/noise, mix, ducking.

### Commercial
Product visibility, appetite appeal, message, CTA, brand fit.

### Profile-specific
- Short: first frame, hook, retention, mobile, sound-off, loop, safe zones.
- TVC: cinematic continuity, brand world, hero, title safe, delivery.

## QC decisions

- accept
- retry same provider
- retry revised prompt
- fallback provider
- fallback production method
- manual review
- reject

## Retry

Default: initial attempt + one prompt/reference revision + one provider fallback. Không retry vô hạn.

## Cost ledger

Lưu estimate, reserve, actual, retry, failed attempt, provider/model, pricing snapshot, usable seconds.

Primary metrics:
- cost per usable second
- cost per approved project

## Reliability

- idempotency;
- provider job ID persisted immediately;
- transaction/outbox;
- backoff/circuit breaker;
- dead-letter;
- reconciliation;
- checksum;
- immutable versions;
- provider URL ingestion;
- resume after restart;
- cancellation;
- cost reservation.

## Metrics

First-pass rate, fallback pass rate, image pass rate, voice/music first-choice rate, cost/usable second, latency, provider errors, manual review, approval within two versions.
