# Core Architecture

## Style

Modular monolith + background workers. Không dùng microservice/Kubernetes trong Version 1.

## Logical architecture

```mermaid
flowchart LR
  WEB[Next.js] --> API[NestJS API]
  API --> DB[(PostgreSQL)]
  API --> Q[(Redis/BullMQ)]
  API --> S[(S3 Storage)]
  Q --> AIW[AI Worker]
  Q --> MW[Media Worker]
  Q --> CW[Composer]
  AIW --> CLAUDE[Claude]
  AIW --> NB[Nano Banana 2]
  AIW --> VIDEO[Video Providers]
  AIW --> VOICE[Voice Provider]
  AIW --> MUSIC[Music/SFX Library]
  MW --> FFMPEG[FFmpeg]
  CW --> REMOTION[Remotion]
```

## Source of truth

- PostgreSQL: trạng thái, version, cost, QC.
- Redis: queue/cache/locks.
- S3: binary assets.
- API sở hữu state transition.
- Workers báo kết quả về API.
- Provider URLs chỉ là tạm thời.

## Core modules

Identity, Project, Brief, Creative, Production Brain, Scene, Asset, Provider Registry, Cost Ledger, Composer, QC, Admin/Debug.

## Reliability

- idempotency key;
- transaction/outbox;
- provider job ID lưu ngay sau submit;
- retry/backoff;
- circuit breaker;
- dead-letter;
- reconciliation;
- checksum;
- immutable versions;
- cost reserve;
- cancellation.
