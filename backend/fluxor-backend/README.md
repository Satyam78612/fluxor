# Fluxor Backend (starter)

This folder contains the starter scaffolding for Fluxor backend services and quick start instructions to run the stack locally for development and testing.

Services included
- `solver-rust` — Rust-based solver (quote aggregation, route builder, scoring engine)
- `intent-api` — Node (TypeScript) API to accept intents and publish them to NATS
- `execution-orchestrator` — Node (TypeScript) service that accepts signed payloads and performs execution orchestration
- `infra` — placeholder folders for k8s / terraform artifacts

This repository started as a prototype scaffold. The code contains working stubs for each service and a minimal local runtime so you can iterate on integrations (aggregators, routing, NATS wiring).

Important: API keys (aggregator keys, QuickNode, Particle UA, etc.) are NOT included. The services are designed to run without them for local development, but feature behavior will be limited until keys are provided.

Quick local runtime (what I verified)
- Docker Compose brings up MongoDB, Redis and NATS (used by the solver and intent pipeline).
- `intent-api` (TypeScript) runs with `ts-node-dev` and responds to `/api/intents` and `/api/execute` stubs.
- `execution-orchestrator` (TypeScript) runs with `ts-node-dev` and responds to `/api/execute` stub.
- `solver-rust` builds and runs; it loads environment variables and starts a worker loop (heartbeat) — currently a stub awaiting NATS wiring and aggregator clients.

Prerequisites
- Docker & Docker Compose (to run MongoDB, Redis, NATS)
- Rust toolchain (cargo) to build the solver
- Node.js (18+) and npm for the Node services

Environment variables (minimum)
Create `.env.local` files in each service folder or export envs before running. Example `.env.example` files are provided for `solver-rust`.

Common variables (for local dev, no external API keys required):
- `MONGO_URI` (default: `mongodb://127.0.0.1:27017`)
- `REDIS_URL` (default: `redis://127.0.0.1:6379`)
- `NATS_URL` (default: `nats://127.0.0.1:4222`)
- `QUICKNODE_URLS` (comma-separated; can be left empty for local dev — solver falls back to `http://127.0.0.1:8545`)

Optional aggregator / external keys (place in `.env.local` when you have them):
- `RELAY_KEY`, `MAYAN_KEY`, `LIFI_KEY`, `BUNGEE_KEY`, `JUPITER_KEY`
- `PARTICLE_PROJECT_ID`, `PARTICLE_CLIENT_KEY`, `PARTICLE_APP_ID` (for UA integration)

Files you may want to create before running (examples):
- `solver-rust/.env.local` (copy `solver-rust/.env.example` and edit if you need custom values)
- `intent-api/.env.local` (set `MONGO_URI`, `NATS_URL`, `PORT` if different from defaults)
- `execution-orchestrator/.env.local` (set `NATS_URL`, `PORT`)

Step-by-step: bring up infra and run services

1) Start local infra (MongoDB, Redis, NATS)

```bash
cd fluxor-backend
docker compose up -d
```

2) Build and run Rust solver

```bash
# prepare env (create solver-rust/.env.local from .env.example)
cd fluxor-backend/solver-rust
cargo build --release
# run with .env.local loaded (bash)
set -o allexport
source .env.local
set +o allexport
./target/release/fluxor-solver
```

3) Start the Node services (development mode)

```bash
# Intent API
cd fluxor-backend/intent-api
npm install
npx ts-node-dev --respawn src/index.ts

# Execution Orchestrator (in another terminal)
cd fluxor-backend/execution-orchestrator
npm install
npx ts-node-dev --respawn src/index.ts
```

Smoke tests (after services are running)

```bash
curl -X POST http://localhost:3000/api/intents -H 'Content-Type: application/json' -d '{}' -v
curl -X POST http://localhost:3000/api/execute -H 'Content-Type: application/json' -d '{}' -v
curl -X POST http://localhost:3010/api/execute -H 'Content-Type: application/json' -d '{}' -v
```

What I validated in this environment
- Docker infra started successfully and is reachable on expected ports
- `intent-api` and `execution-orchestrator` both start under `ts-node-dev` (TypeScript types were installed as dev-deps)
- `solver-rust` builds (`cargo build --release`) and runs — it logs configuration and a heartbeat loop. The solver will process intents once NATS and aggregator wiring are implemented.

Limitations and next steps
- No aggregator API keys included — calls to vendor APIs (Li.Fi, Relay, Mayan, Bungee, Jupiter) will need keys and additional implementation.
- Intent API / Execution Orchestrator endpoints are currently stubs — they return placeholder responses and need to validate and persist intents, publish to NATS subjects, and verify signed payloads.
- Solver currently logs a heartbeat; implement NATS subscription, aggregator fetches, route builder, scoring and DB persistence to process real intents.

Suggested immediate priorities
1. Implement NATS publish from Intent API and NATS subscribe in Solver (intent.created subject).
2. Implement one aggregator client and normalize quotes.
3. Implement route builder & scoring; persist best quotes to MongoDB.
4. Add health & readiness endpoints plus basic metrics.

If you want, I can continue and implement the NATS pipeline (Intent API -> NATS -> Solver) next, with a small end-to-end test that demonstrates a published intent arriving at the solver and being logged/stored. Reply with which task to start and I'll proceed.

