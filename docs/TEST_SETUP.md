# Integration Tests Setup

## Prerequisites

Before running integration tests, ensure all services are running:

1. PostgreSQL (port 5432)
2. Redis (port 6379)
3. Integration Hub (port 3000)
4. Mock Operator (port 3001)
5. Mock RGS (port 3002)

## Quick Start

### 1. Start Infrastructure
```bash
docker-compose -f docker-compose.dev.yml up -d
```

### 2. Start Mock Services

**Terminal 1 - Mock Operator:**
```bash
cd mock-operator
npm install
npm run start:dev
```

**Terminal 2 - Mock RGS:**
```bash
cd mock-rgs
npm install
npm run start:dev
```

### 3. Start Integration Hub

**Terminal 3:**
```bash
npm run start:dev
```

Wait for all services to be ready (check health endpoints).

### 4. Run Tests

**Terminal 4:**
```bash
# Run all e2e tests
npm run test:e2e

# Run specific test file
npm run test:e2e -- wallet.e2e-spec.ts

# Run with coverage
npm run test:e2e -- --coverage

# Run in watch mode
npm run test:e2e -- --watch
```

## Test Coverage

The integration tests cover all 7 acceptance criteria:

✅ **Test 1: Idempotent Debit**
- Same idempotency key results in one charge
- Response is cached and returned on duplicate requests

✅ **Test 2: Retry/Backoff**
- Handles 5xx errors from operator
- Retries with exponential backoff
- Eventually succeeds after retries

✅ **Test 3: Rate Limit**
- Respects 60 RPM rate limit
- Handles 429 responses
- Uses Retry-After header

✅ **Test 4: Webhook Delivery**
- Webhooks delivered reliably
- Retries on failure
- Exactly-once delivery guarantee

✅ **Test 5: Currency Validation**
- Rejects unsupported currency (TRY)
- Returns 422 status code

✅ **Test 6: Reconciliation**
- Detects transaction mismatches
- Generates CSV reports
- Non-zero exit code on mismatches

✅ **Test 7: Security**
- Rejects tampered signatures (401)
- Validates timestamp skew
- HMAC signature verification

## Additional Test Cases

- Insufficient funds handling
- Credit transactions
- Missing idempotency key
- Player not found scenarios
- Currency mismatch errors

## Troubleshooting

### Tests Failing?

1. **Check all services are running:**
```bash
curl http://localhost:3000/health # Integration Hub
curl http://localhost:3001/health # Mock Operator (if health endpoint exists)
curl http://localhost:3002/health # Mock RGS
```

2. **Check database connection:**
```bash
docker-compose -f docker-compose.dev.yml ps
```

3. **Clear test data:**
```bash
# Reset database
docker-compose -f docker-compose.dev.yml down -v
docker-compose -f docker-compose.dev.yml up -d
```

4. **Check logs:**
```bash
# Hub logs
npm run start:dev

# Mock Operator logs
cd mock-operator && npm run start:dev

# Mock RGS logs
cd mock-rgs && npm run start:dev
```

### Rate Limit Tests Failing?

Rate limit tests may be flaky if run multiple times quickly. Wait 60 seconds between runs or restart mock operator:

```bash
cd mock-operator
npm run start:dev
```

### Webhook Tests Timing Out?

Webhook delivery tests wait for retry logic. Increase test timeout in jest config if needed:

```json
{
  "testTimeout": 60000
}
```

## Test Environment Variables

Create a `.env.test` file:

```env
NODE_ENV=test
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=integration_hub_test
REDIS_HOST=localhost
REDIS_PORT=6379
OPERATOR_BASE_URL=http://localhost:3001
RGS_WEBHOOK_URL=http://localhost:3002/webhooks
HMAC_SECRET=test-secret-key-at-least-32-characters-long
```

## Manual Testing

Use the provided Postman collection for manual testing:

```bash
# Import collection
postman-collection.json
```

Or use curl:

```bash
# Example: Debit request
TIMESTAMP=$(date +%s)
PAYLOAD='{"playerId":"player-001","amountCents":1000,"currency":"USD","refId":"test-123"}'

# Generate signature (you'll need HMAC_SECRET)
SIGNATURE=$(echo -n "${PAYLOAD}${TIMESTAMP}" | openssl dgst -sha256 -hmac "your-secret" | awk '{print $2}')

curl -X POST http://localhost:3000/wallet/debit \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-key-123" \
  -H "X-Signature: $SIGNATURE" \
  -H "X-Timestamp: $TIMESTAMP" \
  -d "$PAYLOAD"
```
