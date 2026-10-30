# Middleware Directory

This directory contains reusable middleware functions for the Express server.

Middleware serves as the gatekeeper for API requests, handling tasks such as:
- **Authentication**: Verifying user identities (e.g., `requireAuth`, `requireAdmin`).
- **Validation**: Checking request parameters before they reach the controller.
- **Logging**: Capturing request/response metadata.
- **Error Handling**: Standardizing error responses.

Each middleware should be a focused, testable function.
