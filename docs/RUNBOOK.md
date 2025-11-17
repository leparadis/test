# Integration Hub - Operational Runbook

## Overview

This runbook provides procedures for monitoring, troubleshooting, and maintaining the Integration Hub in production.

**Target Audience:** DevOps, SRE, Support Engineers

---

## Table of Contents

1. [System Health Checks](#system-health-checks)
2. [Common Issues & Solutions](#common-issues--solutions)
3. [Error Code Reference](#error-code-reference)
4. [Monitoring & Alerts](#monitoring--alerts)
5. [Recovery Procedures](#recovery-procedures)
6. [Maintenance Tasks](#maintenance-tasks)
7. [Escalation Procedures](#escalation-procedures)

---

## System Health Checks

### Quick Health Check

```bash
# Check Integration Hub
curl http://localhost:3000/health

# Check PostgreSQL
docker exec integration-hub-postgres pg_isready -U postgres

# Check Redis
docker exec integration-hub-redis redis-cli ping

# Check Mock Operator (if applicable)
curl http://localhost:3001/health

# Check Mock RGS (if applicable)
curl http://localhost:3002/health
```

### Database Connection

```bash
# Connect to PostgreSQL
docker exec -it integration-hub-postgres psql -U postgres -d integration_hub

# Check active connections
SELECT count(*) FROM pg_stat_activity;

# Check table sizes
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Queue Status

```bash
# Connect to Redis
docker exec -it integration-hub-redis redis-cli

# Check queue length
LLEN bull:webhooks:wait
LLEN bull:webhooks:active
LLEN bull:webhooks:failed

# Check failed jobs
LRANGE bull:webhooks:failed 0 -1
```

### Application Logs

```bash
# View live logs
docker logs -f integration-hub

# View last 100 lines
docker logs --tail 100 integration-hub

# Search for errors
docker logs integration-hub 2>&1 | grep -i error

# Filter by correlation ID
docker logs integration-hub 2>&1 | grep "correlation-id-here"
```

---

## Common Issues & Solutions

### Issue 1: Transaction Stuck in PENDING Status

**Symptoms:**
- Transaction created but never completes
- Status remains PENDING
- No error logs

**Root Causes:**
- Operator API timeout
- Network connectivity issue
- Application crashed mid-transaction

**Resolution:**

```sql
-- 1. Find stuck transactions (older than 5 minutes)
SELECT id, ref_id, player_id, status, created_at
FROM transactions
WHERE status = 'PENDING'
  AND created_at < NOW() - INTERVAL '5 minutes'
ORDER BY created_at DESC;

-- 2. Check corresponding idempotency key
SELECT id, key, status, created_at
FROM idempotency_keys
WHERE transaction_id = '<transaction-id>';

-- 3. Manual intervention (if needed)
-- Option A: Mark as FAILED
UPDATE transactions
SET status = 'FAILED',
    reason = 'Manual intervention: timeout',
    updated_at = NOW()
WHERE id = '<transaction-id>';

-- Option B: Retry manually via API
-- Use original request with same idempotency key
```

**Prevention:**
- Implement request timeout monitoring
- Add alert for transactions in PENDING > 5 minutes

---

### Issue 2: Webhook Delivery Failures

**Symptoms:**
- Webhooks stuck in FAILED status
- RGS not receiving events
- Dead letter queue growing

**Root Causes:**
- RGS endpoint down
- Network issues
- Invalid webhook payload
- Signature validation failure

**Resolution:**

```sql
-- 1. Check failed webhooks
SELECT id, event_type, status, retry_count, next_retry_at, last_error
FROM webhook_outbox
WHERE status IN ('FAILED', 'DEAD_LETTER')
ORDER BY created_at DESC
LIMIT 20;

-- 2. View specific webhook details
SELECT *
FROM webhook_outbox
WHERE id = '<webhook-id>';

-- 3. Inspect last error
SELECT last_error
FROM webhook_outbox
WHERE id = '<webhook-id>';

-- 4. Reset webhook for retry
UPDATE webhook_outbox
SET status = 'PENDING',
    retry_count = 0,
    next_retry_at = NOW(),
    last_error = NULL
WHERE id = '<webhook-id>';

-- 5. Bulk reset dead letter webhooks (use carefully)
UPDATE webhook_outbox
SET status = 'PENDING',
    retry_count = 0,
    next_retry_at = NOW()
WHERE status = 'DEAD_LETTER'
  AND created_at > NOW() - INTERVAL '24 hours';
```

**Manual Replay:**

```bash
# Get webhook payload
psql -U postgres -d integration_hub -c \
  "SELECT payload FROM webhook_outbox WHERE id = '<webhook-id>'"

# Manual POST to RGS (generate new signature)
curl -X POST http://rgs-endpoint/webhooks \
  -H "Content-Type: application/json" \
  -H "X-Signature: <generate-new-signature>" \
  -H "X-Timestamp: $(date +%s)" \
  -H "X-Correlation-ID: <correlation-id>" \
  -d '<webhook-payload>'
```

**Prevention:**
- Monitor webhook delivery success rate
- Alert on dead letter queue growth
- Regular RGS health checks

---

### Issue 3: Rate Limiting from Operator

**Symptoms:**
- Many 429 responses in logs
- Slow transaction processing
- Backlog of pending transactions

**Root Causes:**
- Traffic spike exceeding 60 RPM
- Operator rate limit reduced
- Multiple instances hitting same limit

**Resolution:**

```bash
# 1. Check recent 429 errors
docker logs integration-hub 2>&1 | grep "429" | tail -20

# 2. Check transaction backlog
psql -U postgres -d integration_hub -c \
  "SELECT COUNT(*) FROM transactions WHERE status = 'PENDING'"

# 3. Temporary: Reduce concurrent requests
# Scale down instances or implement circuit breaker
```

**SQL Analysis:**

```sql
-- Transaction rate (last hour)
SELECT
  DATE_TRUNC('minute', created_at) AS minute,
  COUNT(*) AS transaction_count
FROM transactions
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY minute
ORDER BY minute DESC;

-- Check for bursts
SELECT
  DATE_TRUNC('second', created_at) AS second,
  COUNT(*) AS count
FROM transactions
WHERE created_at > NOW() - INTERVAL '5 minutes'
GROUP BY second
HAVING COUNT(*) > 1
ORDER BY count DESC;
```

**Mitigation:**
- Implement request queuing
- Add circuit breaker
- Contact operator to increase limit

---

### Issue 4: Idempotency Key Conflicts

**Symptoms:**
- 409 Conflict responses
- Users reporting "already processing" errors
- Duplicate idempotency keys

**Root Causes:**
- Client retry without same key
- Key collision (unlikely with UUID)
- Stale keys not expired

**Resolution:**

```sql
-- 1. Find processing keys older than 1 hour
SELECT id, key, scope, status, created_at
FROM idempotency_keys
WHERE status = 'PROCESSING'
  AND created_at < NOW() - INTERVAL '1 hour';

-- 2. Check specific key
SELECT ik.*, t.status AS transaction_status
FROM idempotency_keys ik
LEFT JOIN transactions t ON ik.transaction_id = t.id
WHERE ik.key = '<idempotency-key>';

-- 3. Force complete stuck key (if transaction is done)
UPDATE idempotency_keys
SET status = 'COMPLETED',
    updated_at = NOW()
WHERE id = '<idempotency-key-id>'
  AND status = 'PROCESSING';

-- 4. Cleanup expired keys (should run automatically)
DELETE FROM idempotency_keys
WHERE expires_at < NOW();
```

**Prevention:**
- Monitor stuck PROCESSING keys
- Ensure cleanup job is running
- Verify key expiration logic

---

### Issue 5: Database Connection Pool Exhausted

**Symptoms:**
- "too many connections" errors
- Slow queries
- Application hangs

**Root Causes:**
- Connection leak
- Pool size too small
- Long-running transactions

**Resolution:**

```sql
-- 1. Check current connections
SELECT
  datname,
  usename,
  application_name,
  state,
  COUNT(*)
FROM pg_stat_activity
GROUP BY datname, usename, application_name, state;

-- 2. Kill idle connections (use carefully)
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'integration_hub'
  AND state = 'idle'
  AND state_change < NOW() - INTERVAL '10 minutes';

-- 3. Check long-running queries
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE state = 'active'
  AND now() - pg_stat_activity.query_start > INTERVAL '5 minutes';
```

**TypeORM Configuration Check:**

```typescript
// Verify pool settings in database.module.ts
{
  type: 'postgres',
  poolSize: 10, // Increase if needed
  extra: {
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  }
}
```

---

### Issue 6: Reconciliation Mismatches

**Symptoms:**
- Daily reconciliation fails
- Mismatches in transaction counts
- Amount discrepancies

**Root Causes:**
- Operator data inconsistency
- Network errors during transaction
- Timing issues (transaction in-flight)

**Resolution:**

```bash
# 1. Run reconciliation for specific date
npm run reconcile:custom 2024-01-15 2024-01-15

# 2. Review generated report
cat ./reconciliation-reports/reconciliation-*.csv

# 3. Investigate specific mismatch
psql -U postgres -d integration_hub -c \
  "SELECT * FROM transactions WHERE ref_id = '<mismatched-ref-id>'"
```

**Investigation Steps:**

```sql
-- Find transaction details
SELECT
  id,
  ref_id,
  player_id,
  type,
  amount_cents,
  currency,
  status,
  operator_transaction_id,
  created_at,
  completed_at
FROM transactions
WHERE ref_id = '<ref-id>';

-- Check if webhook was sent
SELECT *
FROM webhook_outbox
WHERE transaction_id = '<transaction-id>';

-- Compare with operator (manual API call)
-- GET /v2/transactions?transactionId=<ref-id>
```

**Resolution Patterns:**

1. **Missing in Operator:**
   - Transaction COMPLETED in Hub but not in Operator
   - Check if operator call actually succeeded
   - May need to replay transaction

2. **Missing in Hub:**
   - Transaction in Operator but not in Hub
   - Investigate if request ever reached Hub
   - Check for dropped requests or network issues

3. **Amount Mismatch:**
   - Check cents/decimal conversion
   - Verify currency exchange rates (if applicable)

4. **Status Mismatch:**
   - Transaction may still be processing
   - Re-run reconciliation after delay

---

## Error Code Reference

### HTTP Status Codes

| Code | Meaning | Cause | Action |
|------|---------|-------|--------|
| 200 | Success | Request processed | None |
| 201 | Created | Transaction created | None |
| 400 | Bad Request | Invalid payload | Check request format |
| 401 | Unauthorized | Invalid signature | Verify HMAC secret |
| 404 | Not Found | Player not found | Verify player ID |
| 409 | Conflict | Duplicate refId or idempotency key | Check for duplicates |
| 422 | Unprocessable | Invalid currency or validation error | Check business rules |
| 429 | Too Many Requests | Rate limit exceeded | Respect Retry-After |
| 500 | Internal Server Error | Application error | Check logs |
| 502 | Bad Gateway | Operator unavailable | Check operator status |
| 503 | Service Unavailable | Service down | Check health endpoints |

### Transaction Statuses

| Status | Description | Next Steps |
|--------|-------------|------------|
| PENDING | Created, waiting to process | Should transition quickly |
| PROCESSING | Calling operator API | Monitor for completion |
| COMPLETED | Successfully processed | None |
| REJECTED | Business rule rejection | Normal (e.g., insufficient funds) |
| FAILED | Technical failure | Investigate error |

### Webhook Statuses

| Status | Description | Action |
|--------|-------------|--------|
| PENDING | Queued for delivery | Wait for processor |
| PROCESSING | Currently delivering | Normal |
| DELIVERED | Successfully delivered | None |
| FAILED | Delivery failed, will retry | Monitor retries |
| DEAD_LETTER | Max retries exceeded | Manual intervention needed |

---

## Monitoring & Alerts

### Key Metrics to Monitor

**Application Metrics:**
- Transactions per minute (by type, status)
- Average transaction duration
- Error rate (5xx responses)
- Idempotency cache hit rate

**Database Metrics:**
- Connection pool utilization
- Query latency (p50, p95, p99)
- Table sizes (transactions, webhook_outbox)
- Index usage

**Queue Metrics:**
- Webhook queue length
- Processing rate
- Failed job count
- Dead letter queue size

**Operator Metrics:**
- API latency
- Error rate (by status code)
- Rate limit hits (429 count)
- Retry count

### Recommended Alerts

**Critical (PagerDuty):**
- Application down (health check fails)
- Database connection pool exhausted
- Webhook dead letter queue > 100
- Transactions stuck in PENDING > 5 minutes (count > 10)

**Warning (Slack/Email):**
- Transaction error rate > 5%
- Webhook retry rate > 20%
- Operator 5xx rate > 10%
- Reconciliation daily job failed

**Info:**
- Rate limit hits > 50/hour
- Long-running transactions (> 30s)
- Idempotency key collision

### Health Check Endpoints

```bash
# Application health
GET /health

# Response:
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00Z",
  "uptime": 3600,
  "database": "connected",
  "redis": "connected"
}
```

---

## Recovery Procedures

### Database Recovery

**Scenario: Database Corruption or Loss**

```bash
# 1. Stop application
docker-compose stop integration-hub

# 2. Restore from backup
docker exec integration-hub-postgres pg_restore \
  -U postgres -d integration_hub /backups/latest.dump

# 3. Verify data integrity
psql -U postgres -d integration_hub -c \
  "SELECT COUNT(*) FROM transactions"

# 4. Restart application
docker-compose start integration-hub
```

### Queue Recovery

**Scenario: Redis/Queue Failure**

```bash
# 1. Check Redis status
docker exec integration-hub-redis redis-cli ping

# 2. If down, restart
docker-compose restart redis

# 3. Verify queue jobs
docker exec integration-hub-redis redis-cli LLEN bull:webhooks:wait

# 4. If queue lost, webhooks will be reprocessed from outbox
# Cron job will pick up PENDING webhooks
```

### Webhook Replay

**Scenario: Need to Replay Failed Webhooks**

```sql
-- 1. Identify webhooks to replay
SELECT id, event_type, created_at
FROM webhook_outbox
WHERE status = 'DEAD_LETTER'
  AND created_at BETWEEN '2024-01-15' AND '2024-01-16';

-- 2. Reset for replay
UPDATE webhook_outbox
SET status = 'PENDING',
    retry_count = 0,
    next_retry_at = NOW(),
    last_error = NULL
WHERE status = 'DEAD_LETTER'
  AND created_at BETWEEN '2024-01-15' AND '2024-01-16';

-- 3. Monitor processing
SELECT status, COUNT(*)
FROM webhook_outbox
WHERE created_at BETWEEN '2024-01-15' AND '2024-01-16'
GROUP BY status;
```

### Transaction Replay

**Scenario: Need to Replay Failed Transaction**

⚠️ **CAUTION:** Only replay if you're certain the transaction didn't reach the operator.

```bash
# 1. Verify transaction status
psql -U postgres -d integration_hub -c \
  "SELECT * FROM transactions WHERE ref_id = '<ref-id>'"

# 2. Check operator (manual API call)
curl http://operator/v2/transactions?transactionId=<ref-id>

# 3. If confirmed safe, delete and retry
psql -U postgres -d integration_hub -c \
  "DELETE FROM transactions WHERE ref_id = '<ref-id>'"

psql -U postgres -d integration_hub -c \
  "DELETE FROM idempotency_keys WHERE transaction_id = '<transaction-id>'"

# 4. Retry via original API request
# Use original payload with SAME idempotency key
```

---

## Maintenance Tasks

### Daily Tasks

```bash
# 1. Check reconciliation results
ls -lht ./reconciliation-reports/ | head -5

# 2. Review error logs
docker logs integration-hub 2>&1 | grep -i error | tail -50

# 3. Check dead letter queue
psql -U postgres -d integration_hub -c \
  "SELECT COUNT(*) FROM webhook_outbox WHERE status = 'DEAD_LETTER'"

# 4. Monitor disk usage
df -h
```

### Weekly Tasks

```bash
# 1. Database vacuum (if not automatic)
docker exec integration-hub-postgres psql -U postgres -d integration_hub -c "VACUUM ANALYZE"

# 2. Review slow queries
psql -U postgres -d integration_hub -c \
  "SELECT query, calls, mean_exec_time, max_exec_time \
   FROM pg_stat_statements \
   ORDER BY mean_exec_time DESC LIMIT 10"

# 3. Cleanup old data
psql -U postgres -d integration_hub -c \
  "DELETE FROM idempotency_keys WHERE expires_at < NOW() - INTERVAL '7 days'"

psql -U postgres -d integration_hub -c \
  "DELETE FROM webhook_outbox WHERE status = 'DELIVERED' \
   AND delivered_at < NOW() - INTERVAL '30 days'"
```

### Monthly Tasks

- Review and rotate HMAC secrets
- Database backup verification
- Capacity planning review
- Performance optimization
- Security audit

---

## Escalation Procedures

### Level 1: Support Team
- Basic health checks
- Restart services
- Check known issues
- Review logs

### Level 2: Engineering Team
- Database investigations
- Complex query analysis
- Transaction replay
- Webhook replay

### Level 3: Senior Engineering
- Architecture changes
- Database recovery
- Security incidents
- Critical data loss

### External Escalation

**Operator Issues:**
- Contact: operator-support@example.com
- SLA: 4-hour response
- Provide: Correlation IDs, timestamps, error codes

**Infrastructure Issues:**
- Contact: devops@example.com
- Provide: Service logs, metrics, error traces

---

## Useful SQL Queries

### Transaction Analysis

```sql
-- Transactions by status (last 24 hours)
SELECT status, COUNT(*), AVG(amount_cents) AS avg_amount
FROM transactions
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY status;

-- Top players by transaction volume
SELECT player_id, COUNT(*), SUM(amount_cents) AS total_volume
FROM transactions
WHERE created_at > NOW() - INTERVAL '7 days'
  AND status = 'COMPLETED'
GROUP BY player_id
ORDER BY total_volume DESC
LIMIT 10;

-- Transaction duration analysis
SELECT
  AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) AS avg_duration_seconds,
  MIN(EXTRACT(EPOCH FROM (completed_at - created_at))) AS min_duration,
  MAX(EXTRACT(EPOCH FROM (completed_at - created_at))) AS max_duration
FROM transactions
WHERE completed_at IS NOT NULL
  AND created_at > NOW() - INTERVAL '24 hours';

-- Failed transactions
SELECT ref_id, player_id, status, reason, created_at
FROM transactions
WHERE status IN ('FAILED', 'REJECTED')
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 20;
```

### Webhook Analysis

```sql
-- Webhook delivery rate
SELECT
  status,
  COUNT(*) AS count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) AS percentage
FROM webhook_outbox
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY status;

-- Webhooks needing attention
SELECT id, event_type, retry_count, last_error
FROM webhook_outbox
WHERE status = 'DEAD_LETTER'
ORDER BY created_at DESC
LIMIT 20;

-- Average retry count
SELECT
  AVG(retry_count) AS avg_retries,
  MAX(retry_count) AS max_retries
FROM webhook_outbox
WHERE status = 'DELIVERED';
```

---

## Contact Information

**On-Call Engineer:** +1-XXX-XXX-XXXX
**Slack Channel:** #integration-hub-alerts
**Email:** integration-support@example.com
**Documentation:** https://docs.example.com/integration-hub
**Grafana Dashboard:** https://grafana.example.com/integration-hub
**PagerDuty:** https://example.pagerduty.com

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2024-01-15 | Initial runbook | DevOps Team |

---

## Additional Resources

- [INTEGRATION.md](./INTEGRATION.md) - Technical integration guide
- [Sequence Diagrams](./sequence-*.mmd) - Flow diagrams
- [TEST_SETUP.md](./TEST_SETUP.md) - Testing guide
- API Documentation - Swagger/OpenAPI (if available)
