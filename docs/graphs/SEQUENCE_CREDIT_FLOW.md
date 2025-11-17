sequenceDiagram
    participant RGS as RGS (Client)
    participant Hub as Integration Hub
    participant DB as PostgreSQL
    participant Operator as Operator Wallet API
    participant Queue as Webhook Queue

    Note over RGS,Queue: Credit Transaction Flow (Deposit to Player)

    RGS->>Hub: POST /wallet/credit
    Note right of RGS: Headers:<br/>Idempotency-Key<br/>X-Signature<br/>X-Timestamp

    Hub->>Hub: Validate HMAC Signature
    Hub->>Hub: Generate Correlation ID

    Hub->>DB: Check Idempotency Key
    alt Already Processed
        DB-->>Hub: Cached Response
        Hub-->>RGS: 201 OK (Cached)
    end

    Hub->>DB: BEGIN TRANSACTION
    Hub->>DB: INSERT idempotency_key (PROCESSING)
    Hub->>DB: INSERT transaction (PENDING)
    Hub->>DB: COMMIT

    Hub->>Operator: POST /v2/players/{id}/deposit
    Note right of Hub: amount: 20.00 (converted from cents)<br/>currency: USD<br/>transactionId: refId

    Operator-->>Hub: 200 OK
    Note right of Operator: status: SUCCESS<br/>balance: 11000<br/>currency: USD

    Hub->>Hub: Map Operator Response
    Note right of Hub: Convert balance to cents<br/>Map status to OK

    Hub->>DB: UPDATE transaction (COMPLETED)
    Hub->>DB: INSERT webhook_outbox (PENDING)
    Hub->>DB: UPDATE idempotency_key (COMPLETED)

    Hub-->>RGS: 201 OK
    Note left of Hub: status: OK<br/>balanceCents: 11000

    Note over Queue: Async Webhook Delivery

    Queue->>DB: Poll webhooks
    Queue->>RGS: POST /webhooks (transaction.completed)
    RGS-->>Queue: 200 OK
    Queue->>DB: UPDATE webhook (DELIVERED)
