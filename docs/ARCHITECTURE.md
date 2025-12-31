# System Architecture

## Authentication & Security

The system implements a robust **OAuth 2.0** authentication flow via GitHub Apps to secure access to the dashboard and operational data.

### Stateless Session Management
- **Security Model:** Sessions are managed via `nuxt-auth-utils` using **encrypted, sealed cookies**.
- **Architecture:** This stateless approach eliminates the need for a centralized session database, significantly reducing latency and infrastructure complexity while maintaining high scalability (serverless-native design).

### Proactive Token Rotation
GitHub App user-to-server access tokens have a strict Time-To-Live (TTL) of **8 hours**. To ensure a seamless user experience without frequent re-authentication, the system implements an automated refresh token rotation strategy:

1. **Secure Storage:** Upon successful authentication, `access_token`, `refresh_token`, and `expiresAt` timestamps are encrypted within the user session.
2. **Intercepting Middleware:** Dedicated server middleware (`server/middleware/auth-refresh.ts`) validates the token's TTL before processing any request.
3. **Preemptive Refresh:** If the token is within a **5-minute expiration window**, the system proactively requests a new token set from GitHub's OAuth endpoint.
4. **Transparent Update:** The session is atomically updated with fresh credentials, ensuring uninterrupted service availability.

**Configuration Note:** This mechanism relies on "User-to-server token rotation" being enabled in the GitHub App configuration.

## Asynchronous Processing (BullMQ)

The system utilizes **BullMQ** (Redis-backed message queue) to decouple webhook ingestion from heavy computational tasks (AI analysis). This architecture prevents HTTP timeouts and ensures reliable processing under high load.

### Processing Lifecycle
1. **Event Ingestion:** The webhook endpoint (`/api/webhook`) receives GitHub events (e.g., `pull_request.opened`) and immediately acknowledges receipt.
2. **Job Scheduling:** A job payload is constructed and pushed to the persistent `pr-review` queue.
3. **Worker Execution:** An isolated worker process (`server/plugins/worker.ts`):
   - **Consumes** the job from the queue.
   - **Retrieves** the Pull Request diff via the GitHub API.
   - **Analyzes** code changes using the configured AI Engine (Google Gemini).
   - **Synthesizes** feedback and posts actionable reviews back to GitHub.

## Real-time Observability

The dashboard provides real-time visibility into the review process via a secure event streaming architecture.

1. **Server-Sent Events (SSE):** The `/api/jobs/stream` endpoint establishes a persistent connection for pushing updates to the client.
2. **Pub/Sub Distribution:** Redis Pub/Sub acts as the message bus, broadcasting log events from isolated worker processes to the API layer.
3. **Strict Authorization:** Every stream request undergoes a strict authorization check. The system verifies that the authenticated user possesses explicit read access to the target repository before establishing the subscription, ensuring data isolation.
