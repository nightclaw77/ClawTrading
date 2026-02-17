# Kakuzu Observer (Rust Indexer)

Phase 1 Base for the Kakuzu Observer.

## Setup

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
2. Edit `.env` and provide a valid `ETH_RPC_URL` (e.g. Alchemy, Infura, or local node).

## Running

```bash
cargo run
```

## Dependencies
- `alloy`
- `tokio`
- `sqlx`
- `dotenv`
- `serde`

## Notes
- The application will panic if `ETH_RPC_URL` is missing.
