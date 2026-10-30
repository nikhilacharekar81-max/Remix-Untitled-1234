# Controllers Directory

This directory contains the business logic for the application.

Controllers are the "brains" of the request lifecycle. They receive request data from the router, process that data (calling services or database models as needed), and return the appropriate response to the client.

**Design Principles:**
- **Single Responsibility**: Each controller function should do one thing well (e.g., `signup`, `getGigDetails`).
- **Data Integrity**: Controllers are responsible for validating request data before proceeding to the service layer.
- **Independence**: Controllers should be easy to unit test without requiring the full server context.
