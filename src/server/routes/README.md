# Routes Directory

This directory defines the API endpoint structures for the application.

Routes act as the entry point for API requests, mapping incoming HTTP requests (GET, POST, PUT, DELETE) to the appropriate controller functions.

**Design Principles:**
- **Separation**: Each module has its own route file (e.g., `authRoutes.ts`, `reviewRoutes.ts`).
- **Clarity**: The routes file should be a clean index of endpoints, with business logic residing strictly in controllers.
- **Naming**: Route files should correspond to their feature area.
