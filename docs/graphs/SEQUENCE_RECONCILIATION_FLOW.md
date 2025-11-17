sequenceDiagram
    participant CLI as Reconciliation CLI
    participant Service as Reconciliation Service
    participant HubDB as Hub Database
    participant Operator as Operator API
    participant CSV as CSV Generator
    participant FS as File System

    Note over CLI,FS: Daily Reconciliation Flow

    CLI->>CLI: Parse Arguments
    Note right of CLI: Default: Yesterday<br/>Custom: YYYY-MM-DD range

    CLI->>Service: reconcile(startDate, endDate)

    Note over Service,Operator: 1. Data Collection

    Service->>HubDB: SELECT * FROM transactions<br/>WHERE createdAt BETWEEN start AND end<br/>ORDER BY createdAt
    HubDB-->>Service: Hub transactions[]
    Note right of Service: Example: 150 transactions

    Service->>Operator: GET /v2/transactions?<br/>startDate=...&endDate=...&limit=1000
    Note right of Service: With retry logic for failures
    Operator-->>Service: Operator transactions[]
    Note right of Service: Example: 148 transactions

    Note over Service: 2. Transaction Matching

    Service->>Service: Build Maps
    Note right of Service: hubMap: Map<refId, Transaction><br/>operatorMap: Map<transactionId, OpTx>

    loop For each Hub transaction
        Service->>Service: Check if exists in Operator

        alt Missing in Operator
            Service->>Service: Add to mismatches[]
            Note right of Service: type: MISSING_IN_OPERATOR<br/>Only for COMPLETED txns
        end

        alt Exists but Amount Mismatch
            Service->>Service: Compare amounts
            Note right of Service: Hub: 1050 cents (10.50)<br/>Operator: 10.00<br/>→ AMOUNT_MISMATCH
            Service->>Service: Add to mismatches[]
        end

        alt Exists but Status Mismatch
            Service->>Service: Compare statuses
            Note right of Service: Hub: COMPLETED<br/>Operator: PENDING<br/>→ STATUS_MISMATCH
            Service->>Service: Add to mismatches[]
        end
    end

    loop For each Operator transaction
        Service->>Service: Check if exists in Hub

        alt Missing in Hub
            Service->>Service: Add to mismatches[]
            Note right of Service: type: MISSING_IN_HUB
        end
    end

    Note over Service: 3. Report Generation

    Service->>Service: Build Report DTO
    Note right of Service: {<br/>  totalHub: 150,<br/>  totalOperator: 148,<br/>  matched: 145,<br/>  mismatchCount: 5,<br/>  mismatches: [...]<br/>}

    Service-->>CLI: ReconciliationReport

    CLI->>CSV: generateReport(report)

    CSV->>CSV: Map mismatches to CSV rows
    Note right of CSV: Each row:<br/>refId, mismatchType,<br/>hubAmount, operatorAmount,<br/>hubStatus, operatorStatus,<br/>description

    CSV->>FS: Write CSV file
    Note right of CSV: Path:<br/>./reconciliation-reports/<br/>reconciliation-2024-01-15.csv

    CSV->>CSV: Generate summary text
    Note right of CSV: Statistics:<br/>- Total transactions<br/>- Matched count<br/>- Mismatch breakdown<br/>- PASS/FAIL result

    CSV->>FS: Write summary file
    Note right of CSV: reconciliation-2024-01-15-summary.txt

    CSV-->>CLI: File paths

    Note over CLI: 4. Display Results

    CLI->>CLI: Print to Console
    Note right of CLI: 📊 RECONCILIATION SUMMARY<br/>Total Hub: 150<br/>Total Operator: 148<br/>Matched: 145<br/>Mismatches: 5<br/><br/>Breakdown:<br/>- Missing in Operator: 2<br/>- Amount Mismatch: 2<br/>- Status Mismatch: 1

    alt Mismatches Found
        CLI->>CLI: Print FAIL message
        Note right of CLI: ❌ RECONCILIATION FAILED<br/>📄 Report: path/to/report.csv
        CLI->>CLI: Exit code 1
    else No Mismatches
        CLI->>CLI: Print PASS message
        Note right of CLI: ✅ RECONCILIATION PASSED<br/>All transactions match!
        CLI->>CLI: Exit code 0
    end

    Note over CLI,FS: Exit codes used for CI/CD automation
