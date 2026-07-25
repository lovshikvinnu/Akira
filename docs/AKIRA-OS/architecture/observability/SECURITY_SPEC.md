# AKIRA OS Observability Security Specification

This document defines the security parameters, access controls, tamper-resistance strategies, and privacy safeguards for telemetry data within AKIRA OS.

---

## 1. Access Control Matrix

Observability data contains sensitive execution details and audit paths. Access to this data is managed under the principle of least privilege:

| Access Path | Role | Operation | Security Guard |
| :--- | :--- | :--- | :--- |
| **Instrumentation API** | Subsystems (Core & Domain) | Write-Only | Exposed via pure interfaces, no read methods available. |
| **Dashboard Service** | Presentation / UI | Read-Only | Restricted database connection, cannot write to telemetry tables. |
| **Storage Exporters** | System Exporter | Read-Only | Exporters read structured logs and transmit them securely. |
| **Direct File System** | Local OS User | None / Read-Write | Database file permission locked to current OS user account. |

---

## 2. Audit Trail Integrity (Tamper Resistance)

Audit records track compliance and authorization changes. To prevent a malicious process or user from retroactively altering the audit trail, the `AuditFacade` enforces cryptographic chaining:

```text
Audit Record N-1 ──> Hash N-1
                       │
                       ├─► Record N Hash = SHA256(Audit Record N + Hash N-1)
                       │
Audit Record N   ──> Hash N = HMAC-SHA256(Record N Hash, SecretKey)
```

* **Cryptographic Chaining**: Every new audit record includes a `chainHash` computed by hashing the current record payload appended to the hash of the preceding record. This creates an immutable hash chain (equivalent to a local block chain).
* **Detecting Tampering**: If any record is modified, inserted out-of-order, or deleted, the subsequent hash validation checks will fail, triggering a security alert to the system dashboard.
* **Secret Key Storage**: The HMAC key is managed by the secure host OS keychain (via node-keytar or credential vault APIs), keeping it hidden from the database files.

---

## 3. Sensitive Data Scrubbing (PII Masking)

Telemetry records must never write credentials, tokens, passwords, or personally identifiable information (PII) to database files. The logging and tracing facades execute inline masking:

```typescript
// Core Masking Rules: Regex scanning of metadata values
const MASK_PATTERNS = [
  /authorization/i,
  /password/i,
  /token/i,
  /secret/i,
  /api_?key/i,
  /email/i
];

function sanitizeMetadata(metadata: Record<string, any>): Record<string, any> {
  const sanitized = { ...metadata };
  for (const key of Object.keys(sanitized)) {
    if (MASK_PATTERNS.some(pattern => pattern.test(key))) {
      sanitized[key] = "[MASKED]";
    }
  }
  return sanitized;
}
```

* **Automated Key Scrutiny**: High-priority metadata parameters containing strings resembling JWT tokens or database connection passwords are replaced with `[MASKED]` during the serialization step.

---

## 4. Telemetry Privacy
* **Local Isolation**: By default, no telemetry data leaves the host computer. Outbound exports are disabled.
* **Consent Boundaries**: Users must explicitly opt-in to forward anonymous telemetry stats to help improve the software. No tracking payload is synchronized without a valid encryption token.

---

## 5. Export Security
* **Transport Layer Security**: Telemetry data sent to remote exporters (e.g. OTLP collectors) must navigate exclusively over HTTPS with TLS v1.3.
* **Encrypted Storage (Future Roadmap)**: Future releases will implement local SQLite encryption (using SQLCipher) to encrypt the entire `telemetry.db` database at rest using keys derived from the user's login session.
