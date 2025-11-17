# Integration Hub - Integration Documentation

## Overview

The Integration Hub is a service that normalizes the Operator's wallet API to our internal contract, providing reliable transaction processing with idempotency, webhook delivery, and reconciliation capabilities.

## Architecture

### Components

- **Integration Hub**: Main service exposing our internal wallet API
- **Operator Wallet API**: External operator's wallet system (mock provided)
- **RGS (Remote Gaming Server)**: Receives webhooks about transaction events
- **PostgreSQL**: Transaction persistence and idempotency tracking
- **Redis + Bull**: Webhook queue for reliable delivery

### Data Flow

See sequence diagrams in:
- `sequence-debit-flow.mmd` - Debit transaction flow
- `sequence-credit-flow.mmd` - Credit transaction flow
- `sequence-webhook-flow.mmd` - Webhook delivery flow
- `sequence-reconciliation-flow.mmd` - Reconciliation flow

## API Contracts

### Internal Wallet Contract (Our API)

#### POST /wallet/debit

Withdraw funds from a player's account.

**Request Headers:**
```
Content-Type: application/json
Idempotency-Key: <unique-key>
X-Signature: <hmac-signature>
X-Timestamp: <unix-timestamp-seconds>
```

**Request Body:**
```json
{
  "playerId": "string",
  "amountCents": 1000,
  "currency": "USD|EUR|GBP",
  "refId": "string",
  "meta": {
    "gameId": "string",
    "roundId": "string"
  }
}
```

**Response:**
```json
{
  "status": "OK|REJECTED",
  "balanceCents": 9000,
  "reason": "string (optional)"
}
```

**Status Codes:**
- `201` - Success
- `400` - Bad Request (validation error)
- `401` - Unauthorized (invalid signature)
- `409` - Conflict (duplicate refId or processing)
- `422` - Unprocessable Entity (invalid currency)
- `502` - Bad Gateway (operator unavailable)

---

#### POST /wallet/credit

Deposit funds to a player's account.

**Request Headers:**
```
Content-Type: application/json
Idempotency-Key: <unique-key>
X-Signature: <hmac-signature>
X-Timestamp: <unix-timestamp-seconds>
```

**Request Body:**
```json
{
  "playerId": "string",
  "amountCents": 2000,
  "currency": "USD|EUR|GBP",
  "refId": "string",
  "meta": {
    "gameId": "string",
    "roundId": "string"
  }
}
```

**Response:**
```json
{
  "status": "OK|REJECTED",
  "balanceCents": 11000,
  "reason": "string (optional)"
}
```

**Status Codes:** Same as debit

---

### Operator Wallet API (External)

#### POST /v2/players/{playerExternalId}/withdraw

**Request:**
```json
{
  "amount": 10.00,
  "currency": "USD",
  "transactionId": "string",
  "description": "string"
}
```

**Response:**
```json
{
  "status": "SUCCESS|FAILED|INSUFFICIENT_FUNDS|PLAYER_NOT_FOUND|INVALID_CURRENCY",
  "transactionId": "string",
  "balance": 90.00,
  "currency": "USD",
  "message": "string"
}
```

#### POST /v2/players/{playerExternalId}/deposit

Same structure as withdraw.

#### GET /v2/transactions

For reconciliation.

**Query Parameters:**
- `startDate`: ISO 8601 date
- `endDate`: ISO 8601 date
- `limit`: number (default 1000)

---

## Security

### HMAC Signature Scheme

All requests to our wallet API must include HMAC-SHA256 signature for authentication.

**Signature Generation:**

1. Create payload string: `JSON.stringify(body) + timestamp`
2. Generate HMAC: `HMAC-SHA256(payload, secret)`
3. Convert to hex string

**Example (Node.js):**
```javascript
const crypto = require('crypto');

function generateSignature(payload, timestamp, secret) {
  const data = JSON.stringify(payload) + timestamp.toString();
  return crypto.createHmac('sha256', secret)
    .update(data)
    .digest('hex');
}

const timestamp = Math.floor(Date.now() / 1000);
const signature = generateSignature(payload, timestamp, 'your-secret');
```

**Headers:**
```
X-Signature: <hex-signature>
X-Timestamp: <unix-timestamp-seconds>
```

**Validation:**
- Timestamp must be within ±5 minutes (configurable)
- Signature must match expected HMAC
- Uses `crypto.timingSafeEqual()` to prevent timing attacks

---

## Idempotency

### How It Works

The `Idempotency-Key` header ensures requests are processed exactly once.

**Rules:**
1. First request with a key → Process transaction
2. Duplicate request (same key) → Return cached response
3. Concurrent requests (same key) → Return 409 Conflict
4. Keys expire after 24 hours

**Database:**
```sql
CREATE TABLE idempotency_keys (
  id UUID PRIMARY KEY,
  key VARCHAR(255) NOT NULL,
  scope ENUM('DEBIT', 'CREDIT') NOT NULL,
  status ENUM('PROCESSING', 'COMPLETED', 'FAILED'),
  request JSONB,
  response JSONB,
  transaction_id VARCHAR(255),
  created_at TIMESTAMP,
  expires_at TIMESTAMP,
  UNIQUE(key, scope)
);
```

**Best Practices:**
- Use UUID v4 for keys
- Include scope/context in key: `debit-{gameId}-{roundId}-{timestamp}`
- Store keys for audit trail
- Retry with same key on network errors

---

## Webhook System

### Outbox Pattern

Webhooks are stored in a database outbox table before delivery, ensuring reliability.

**Flow:**
1. Transaction completes → Insert webhook into outbox
2. Cron job (every 10s) → Fetch pending webhooks
3. Add to Bull queue → Process delivery
4. HTTP POST to RGS → Mark as delivered
5. On failure → Retry with exponential backoff

### Retry Logic

**Retry Delays (configurable):**
- Attempt 1: Immediate
- Attempt 2: +1 second
- Attempt 3: +5 seconds
- Attempt 4: +15 seconds
- Attempt 5: +60 seconds
- Attempt 6: +300 seconds (5 minutes)

**Max Retries:** 5 (configurable)

After max retries → Status = `DEAD_LETTER` (requires manual intervention)

### Webhook Payload

```json
{
  "eventType": "transaction.completed|transaction.failed|transaction.rejected",
  "eventId": "uuid",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "transactionId": "uuid",
    "refId": "string",
    "playerId": "string",
    "type": "DEBIT|CREDIT",
    "amountCents": 1000,
    "currency": "USD",
    "status": "COMPLETED|FAILED|REJECTED",
    "balanceCents": 9000,
    "reason": "string",
    "meta": {}
  }
}
```

**Headers:**
```
Content-Type: application/json
X-Signature: <hmac-signature>
X-Timestamp: <unix-timestamp>
X-Correlation-ID: <uuid>
X-Event-Type: <event-type>
```

---

## Rate Limiting

### Operator Rate Limits

- **Limit:** 60 requests per minute
- **Response:** 429 Too Many Requests
- **Header:** `Retry-After: <seconds>`

**Handling:**
- Hub respects `Retry-After` header
- Exponential backoff on retry
- Circuit breaker pattern (future enhancement)

---

## Error Handling

### Error Mapping

| Operator Error | Hub Response | Status Code |
|----------------|--------------|-------------|
| SUCCESS | OK | 201 |
| INSUFFICIENT_FUNDS | REJECTED | 201 |
| PLAYER_NOT_FOUND | Error | 404 |
| INVALID_CURRENCY | Error | 422 |
| Rate limit (429) | Retry | - |
| 5xx errors | Retry → Error | 502 |

### Transaction States

```
PENDING → PROCESSING → COMPLETED
                    → REJECTED
                    → FAILED
```

- **PENDING**: Created, waiting for operator
- **PROCESSING**: Calling operator API
- **COMPLETED**: Success
- **REJECTED**: Business rule rejection (e.g., insufficient funds)
- **FAILED**: Technical failure (e.g., operator down)

---

## Reconciliation

### How It Works

Daily reconciliation job compares transactions between Hub and Operator.

**Run Reconciliation:**
```bash
# Yesterday (default)
npm run reconcile

# Custom date range
npm run reconcile:custom 2024-01-01 2024-01-31
```

**Process:**
1. Fetch Hub transactions (from database)
2. Fetch Operator transactions (via API)
3. Match by `refId` / `transactionId`
4. Detect mismatches
5. Generate CSV report
6. Exit with code 0 (pass) or 1 (fail)

**Mismatch Types:**
- `MISSING_IN_OPERATOR`: Transaction in Hub but not in Operator
- `MISSING_IN_HUB`: Transaction in Operator but not in Hub
- `AMOUNT_MISMATCH`: Different amounts
- `STATUS_MISMATCH`: Different statuses

**Output:**
```
./reconciliation-reports/
  ├── reconciliation-2024-01-15T10-30-00.csv
  └── reconciliation-2024-01-15T10-30-00-summary.txt
```

---

## Observability

### Logging

**Structured logging** with Winston:
```json
{
  "level": "info",
  "message": "Transaction completed",
  "transactionId": "uuid",
  "playerId": "player-001",
  "amountCents": 1000,
  "correlationId": "uuid",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

**Log Levels:**
- `error`: Failures, exceptions
- `warn`: Retries, rate limits
- `info`: Transaction lifecycle
- `debug`: Detailed flow

### Correlation IDs

Every request gets a correlation ID for tracing:
- Generated or extracted from `X-Correlation-ID` header
- Attached to all logs
- Passed to operator and webhooks
- Returned in response headers

### Metrics (Future Enhancement)

Recommended metrics:
- Transaction count (by type, status, currency)
- Transaction duration (p50, p95, p99)
- Operator API latency
- Webhook delivery success rate
- Retry count distribution
- Idempotency key hit rate

---

## Data Model

### Database Schema

**idempotency_keys:**
- Primary key: UUID
- Unique index: (key, scope)
- TTL: 24 hours

**transactions:**
- Primary key: UUID
- Unique index: refId
- Indexes: playerId, createdAt, status

**webhook_outbox:**
- Primary key: UUID
- Indexes: status, nextRetryAt, createdAt

See entity files for complete schema.

---

## Supported Currencies

- **USD** - US Dollar
- **EUR** - Euro
- **GBP** - British Pound

**Note:** TRY (Turkish Lira) is intentionally **NOT** supported and will return 422.

---

## Configuration

### Environment Variables

See `.env.example` for full list.

**Critical Settings:**
- `HMAC_SECRET`: Must be ≥32 characters
- `SIGNATURE_TIMESTAMP_TOLERANCE_SECONDS`: Default 300 (5 minutes)
- `WEBHOOK_MAX_RETRIES`: Default 5
- `WEBHOOK_RETRY_DELAYS`: Comma-separated milliseconds
- `OPERATOR_BASE_URL`: Operator API endpoint
- `RGS_WEBHOOK_URL`: Where to send webhooks

---

## Development Setup

See main README.md for complete setup instructions.

**Quick Start:**
```bash
# 1. Install dependencies
npm install

# 2. Start infrastructure
docker-compose -f docker-compose.dev.yml up -d

# 3. Configure environment
cp .env.example .env
# Edit .env with your settings

# 4. Run migrations (if needed)
npm run migration:run

# 5. Start app
npm run start:dev

# 6. Start mock services
cd mock-operator && npm run start:dev
cd mock-rgs && npm run start:dev
```

---

## Testing

### Unit Tests
```bash
npm run test
```

### Integration Tests
```bash
# Start all services first
npm run test:e2e
```

See `TEST_SETUP.md` for detailed testing instructions.

---

## Production Considerations

Current version: **v1** (implicit)

Future versions should use URL versioning:
- `/v1/wallet/debit`
- `/v2/wallet/debit`

---

## Support

For issues and questions, see `RUNBOOK.md`.

## License

Proprietary - All Rights Reserved
