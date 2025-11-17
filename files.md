integration-hub/
├── src/
│   ├── common/
│   │   ├── enums/
│   │   │   ├── index.ts
│   │   │   ├── idempotency.enum.ts
│   │   │   ├── transaction.enum.ts
│   │   │   ├── webhook.enum.ts
│   │   │   └── operator.enum.ts
│   │   ├── security/
│   │   │   ├── hmac.service.ts
│   │   │   └── hmac.guard.ts
│   │   ├── interceptors/
│   │   │   ├── correlation-id.interceptor.ts
│   │   │   └── logging.interceptor.ts
│   │   └── common.module.ts
│   ├── database/
│   │   ├── entities/
│   │   │   ├── idempotency-key.entity.ts
│   │   │   ├── transaction.entity.ts
│   │   │   └── webhook-outbox.entity.ts
│   │   ├── database.module.ts
│   │   └── data-source.ts
│   ├── wallet/
│   │   ├── dto/
│   │   │   ├── wallet-request.dto.ts
│   │   │   └── wallet-response.dto.ts
│   │   ├── wallet.controller.ts
│   │   ├── wallet.service.ts
│   │   └── wallet.module.ts
│   ├── operator/
│   │   ├── dto/
│   │   │   └── operator.dto.ts
│   │   ├── operator.client.ts
│   │   ├── operator.mapper.ts
│   │   └── operator.module.ts
│   ├── webhooks/
│   │   ├── dto/
│   │   │   └── webhook.dto.ts
│   │   ├── webhook.processor.ts
│   │   ├── webhook.consumer.ts
│   │   ├── webhook.controller.ts
│   │   └── webhooks.module.ts
│   ├── reconciliation/
│   │   ├── dto/
│   │   │   └── reconciliation.dto.ts
│   │   ├── reconciliation.service.ts
│   │   ├── csv-generator.service.ts
│   │   ├── reconciliation.cli.ts
│   │   └── reconciliation.module.ts
│   ├── app.module.ts
│   └── main.ts
├── mock-operator/
│   └── src/
│       ├── main.ts
│       ├── mock-operator.module.ts
│       ├── mock-operator.controller.ts
│       ├── mock-operator.service.ts
│       └── rate-limit.guard.ts
├── mock-rgs/
│   └── src/
│       ├── main.ts
│       ├── mock-rgs.module.ts
│       ├── mock-rgs.controller.ts
│       └── mock-rgs.service.ts
├── test/
│   ├── wallet.e2e-spec.ts
│   └── jest-e2e.json
├── docs/
│   ├── INTEGRATION.md
│   ├── RUNBOOK.md
│   ├── POSTMAN_GUIDE.md
│   ├── TEST_SETUP.md
│   ├── sequence-debit-flow.mmd
│   ├── sequence-credit-flow.mmd
│   ├── sequence-webhook-flow.mmd
│   └── sequence-reconciliation-flow.mmd
├── .env.example
├── .dockerignore
├── docker-compose.yml
├── docker-compose.dev.yml
├── Dockerfile
├── postman-collection.json
├── postman-environment.json
└── README.md
