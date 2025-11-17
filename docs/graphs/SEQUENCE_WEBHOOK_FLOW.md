sequenceDiagram
    participant Tx as Transaction Service
    participant DB as PostgreSQL
    participant Cron as Webhook Processor (Cron)
    participant Queue as Bull Queue
    participant Consumer as Webhook Consumer
    participant HMAC as HMAC Service
    participant RGS as RGS Webhook Endpoint

    Note over Tx,RGS: Webhook Delivery Flow (Outbox Pattern)

    Note over Tx,DB: 1. Webhook Creation
    Tx->>DB: INSERT INTO webhook_outbox
    Note right of Tx: eventType: transaction.completed<br/>payload: {...}<br/>status: PENDING<br/>nextRetryAt: now()<br/>retryCount: 0

    Note over Cron,Queue: 2. Polling & Queueing (Every 10 seconds)
    Cron->>DB: SELECT * FROM webhook_outbox<br/>WHERE status IN (PENDING, FAILED)<br/>AND nextRetryAt <= NOW()
    DB-->>Cron: Pending webhooks

    loop For each webhook
        Cron->>DB: UPDATE status = PROCESSING
        Cron->>Queue: Add job to Bull queue
        Note right of Cron: jobData: {<br/>  webhookId,<br/>  attempt: retryCount + 1<br/>}
    end

    Note over Queue,RGS: 3. Webhook Delivery
    Queue->>Consumer: Process job
    Consumer->>DB: SELECT webhook by ID
    DB-->>Consumer: Webhook record

    Consumer->>HMAC: Generate signature
    Note right of Consumer: payload + timestamp
    HMAC-->>Consumer: HMAC-SHA256 signature

    Consumer->>RGS: POST /webhooks
    Note right of Consumer: Headers:<br/>X-Signature<br/>X-Timestamp<br/>X-Correlation-ID<br/>X-Event-Type<br/><br/>Body:<br/>{eventType, data, ...}

    alt Success (200 OK)
        RGS-->>Consumer: 200 OK
        Consumer->>DB: UPDATE webhook_outbox
        Note right of Consumer: status: DELIVERED<br/>deliveredAt: now()<br/>lastAttemptAt: now()

    else Failure (5xx, Timeout, Network Error)
        RGS-->>Consumer: Error
        Consumer->>DB: UPDATE webhook_outbox
        Note right of Consumer: status: FAILED<br/>retryCount: retryCount + 1<br/>lastError: {...}<br/>lastAttemptAt: now()

        alt Retry Count < Max Retries
            Consumer->>Consumer: Calculate next retry
            Note right of Consumer: Delays:<br/>1s, 5s, 15s, 60s, 300s
            Consumer->>DB: UPDATE nextRetryAt
            Note right of Consumer: nextRetryAt = now() + delay<br/>Will be picked up by next cron run

        else Max Retries Exceeded
            Consumer->>DB: UPDATE status = DEAD_LETTER
            Note right of Consumer: Manual intervention required
        end
    end

    Note over Cron,RGS: 4. Retry Flow
    Cron->>DB: Poll failed webhooks (nextRetryAt <= NOW)
    DB-->>Cron: Failed webhook (ready for retry)
    Cron->>Queue: Add retry job
    Queue->>Consumer: Process retry
    Consumer->>RGS: POST /webhooks (Attempt 2)

    alt Still Fails
        RGS-->>Consumer: Error
        Consumer->>Consumer: Exponential backoff
        Note right of Consumer: Wait 5 seconds (attempt 2)<br/>Wait 15 seconds (attempt 3)<br/>etc.
    else Success
        RGS-->>Consumer: 200 OK
        Consumer->>DB: UPDATE status = DELIVERED
    end

    Note over Cron,DB: 5. Cleanup (Daily at Midnight)
    Cron->>DB: DELETE FROM webhook_outbox<br/>WHERE status = DELIVERED<br/>AND deliveredAt < NOW() - 7 days
