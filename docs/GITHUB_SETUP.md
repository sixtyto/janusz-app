# GitHub App Deployment Guide

This document outlines the required configuration for deploying the GitHub App integration. The application relies on specific permissions and events to perform automated code reviews and status reporting.

## 1. Permission Scopes

Configure the application with the following **Repository Permissions** to ensure full operational capability:

| Scope             | Access Level   | Operational Justification                                                                                   |
|-------------------|----------------|-------------------------------------------------------------------------------------------------------------|
| **Pull Requests** | `Read & Write` | Required for analyzing diffs, publishing inline code reviews, managing PR descriptions, and review threads. |
| **Checks**        | `Read & Write` | Required for initializing "Janusz Review" check runs and reporting execution status/results.                |
| **Contents**      | `Read-only`    | Required for fetching raw file content to determine context and precise line numbers.                       |
| **Issues**        | `Read & Write` | Fallback mechanism for posting general comments when inline annotations cannot be applied.                  |
| **Metadata**      | `Read-only`    | Mandatory scope for accessing basic repository information.                                                 |

## 2. Event Subscription (Webhooks)

Enable the **Webhook** integration in the GitHub App settings.
**Payload URL:** `https://your-domain.com/api/webhook`

Subscribe to the following events to trigger the analysis pipeline:

### Pull Request
- `opened`: Triggers initial review for new Pull Requests.
- `synchronize`: Triggers re-analysis when new commits are pushed to the source branch.
- `reopened`: Resumes analysis for previously closed Pull Requests.

### Check Run
- `rerequested`: Enables manual re-execution of the review process via the GitHub UI.

## 3. Authentication & Identity (OAuth)

Configure the **"Identifying and authorizing users"** section to enable dashboard access and secure session management.

1. **Callback URL:** Set to `https://your-domain.com/api/auth/github`.
2. **Authorization Flow:** Enable **"Request user authorization (OAuth) during installation"**.
3. **Token Security:** Enable **"User-to-server token rotation"** in the "Optional features" section.
   * **Critical:** This setting is mandatory for the backend's automated token refresh mechanism to function. Disabling it will result in session termination after 8 hours.

## 4. Credential Provisioning

Populate the `.env` file with the credentials generated during the App creation process:

- `GITHUB_APP_ID`: Application Identifier.
- `GITHUB_CLIENT_ID`: OAuth Client Identifier.
- `GITHUB_CLIENT_SECRET`: OAuth Client Secret (ensure secure storage).
- `GITHUB_PRIVATE_KEY`: RSA Private Key. (Format: PEM. Ensure newlines are correctly handled in the environment variable string).
- `WEBHOOK_SECRET`: The secret key defined in the Webhook configuration for payload signature verification.
