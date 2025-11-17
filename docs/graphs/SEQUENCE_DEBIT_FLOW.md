sequenceDiagram
    participant RGS as RGS (Client)
    participant Hub as Integration Hub
    participant DB as PostgreSQL
    participant Operator as Operator Wallet API
    participant Queue as Webhook Queue

    Note over RGS,Queue: Debit Transaction Flow (Withdraw from Player)

    RGS->>Hub: POST /wallet/debit
    Note right of RGS: Headers:<br/>Idempotency-Key<br/>X-Signature<br/>X-Timestamp

    Hub->>Hub: Validate HMAC Signature
    alt Invalid Signature
        Hub-->>RGS: 401 Unauthorized
    end

    Hub->>Hub: Generate Correlation ID

    Hub->>DB: Check Idempotency Key
    alt Key Exists (Completed)
        DB-->>Hub: Return Cached Response
        Hub-->>RGS: 201 OK (Cached)
    end

    alt Key Exists (Processing)
        DB-->>Hub: Status = PROCESSING
        Hub-->>RGS: 409 Conflict
    end

    Hub->>DB: Check Duplicate refId
    alt Duplicate refId
        Hub-->>RGS: 409 Conflict
    end

    Hub->>DB: BEGIN TRANSACTION
    Hub->>DB: INSERT idempotency_key (PROCESSING)
    Hub->>DB: INSERT transaction (PENDING)
    Hub->>DB: COMMIT

    Hub->>Operator: POST /v2/players/{id}/withdraw
    Note right of Hub: Convert cents to decimal<br/>Retry on 5xx errors

    alt Operator Returns 500/502/503
        Operator-->>Hub: 5xx Error
        Hub->>Hub: Wait (exponential backoff)
        Hub->>Operator: Retry Request
        Operator-->>Hub: 5xx Error
        Hub->>Hub: Wait (exponential backoff)
        Hub->>Operator: Retry Request (final)
    end

    alt Operator Returns 429 (Rate Limit)
        Operator-->>Hub: 429 + Retry-After
        Hub->>Hub: Wait (Retry-After seconds)
        Hub->>Operator: Retry Request
    end

    Operator-->>Hub: 200 OK
    Note right of Operator: status: SUCCESS<br/>balance: 9000<br/>transactionId: xyz

    Hub->>Hub: Map Response to Wallet Format

    Hub->>DB: UPDATE transaction
    Note right of Hub: status: COMPLETED<br/>balanceCents: 9000<br/>operatorTransactionId: xyz

    Hub->>DB: INSERT webhook_outbox
    Note right of Hub: eventType: transaction.completed<br/>status: PENDING

    Hub->>DB: UPDATE idempotency_key (COMPLETED)

    Hub-->>RGS: 201 OK
    Note left of Hub: status: OK<br/>balanceCents: 9000

    Note over Queue: Async Webhook Processing

    Queue->>DB: Poll pending webhooks (every 10s)
    DB-->>Queue: Webhook records

    Queue->>Queue: Add to Bull Queue

    Queue->>RGS: POST /webhooks
    Note right of Queue: Headers:<br/>X-Signature<br/>X-Timestamp<br/>X-Correlation-ID

    alt RGS Returns Error
        RGS-->>Queue: 500 Error
        Queue->>DB: UPDATE webhook (FAILED, nextRetryAt)
        Note right of Queue: Retry with backoff:<br/>1s, 5s, 15s, 60s, 300s
        Queue->>Queue: Wait for next retry
        Queue->>RGS: Retry POST /webhooks
    end

    RGS-->>Queue: 200 OK
    Queue->>DB: UPDATE webhook (DELIVERED)
