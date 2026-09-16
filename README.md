# CallScout AI 🎙️📞
### Autonomous Goal-Driven Voice Agent & Real Telephony Dispatcher

CallScout AI is an enterprise-grade AI voice platform built for hackathons and production workflows. Users specify an E.164 phone number, high-level objectives, structured questions, and context notes. CallScout AI dispatches real goal-driven outbound telephone calls using the official **CALL-E Developer SDK** (`@call-e/calle`), engages in adaptive natural speech, extracts answers, and persists structured JSON results into Neon PostgreSQL via Prisma ORM.

---

## Architecture & Data Flow

```text
[ React 19 + Vite ] (UI / Dashboard / Real-Time Telemetry)
         │
         ▼
[ JWT + Bcrypt Auth ] (Email/Password Registration & Login, Session Storage)
         │  Bearer JWT Token
         ▼
[ Node.js + Express API ] (Token Verification via JSON Web Token Middleware)
         │
    ┌────┴──────────────────────────┐
    ▼                               ▼
[ CALL-E Engine ]           [ Neon PostgreSQL ]
(@call-e/calle SDK)         (Prisma ORM - Models: User, Call)
 - Outbound PSTN Dialing     - id, email, password (bcrypt)
 - Real Natural Voice        - userId (Foreign Key -> User.id)
 - Structured Schema Parser  - calleTaskId, status, transcript
 - Webhooks & Event Polling  - structuredResult, duration
```

---

## Key Features

1. **Official CALL-E SDK Integration (`@call-e/calle`)**:
   - Outbound phone calls with goal-driven tasks.
   - Idempotency key protection (`idempotencyKey`).
   - Automated structured data extraction via JSON Schema (`resultSchema`).
   - Turn-by-turn conversational transcript capture.
   - Status polling and manual sync (`waitForResult`, `get`, `listEvents`).
   - Automated retry with fresh idempotency keys.

2. **Neon PostgreSQL with Prisma ORM**:
   - Production relational database schema (`prisma/schema.prisma`).
   - `User` and `Call` models with foreign-key cascading deletion.
   - Indexed on `[userId, createdAt]` and `[calleTaskId]` for high performance.
   - Includes graceful, zero-crash fallback to local persistent file store (`.data/calls.json`) if connection is pending.

3. **Self-Hosted JWT + Bcrypt Authentication (Zero Firebase)**:
   - Email and password registration (`/api/auth/register`).
   - Email and password login (`/api/auth/login`).
   - Authenticated user profile verification (`/api/auth/me`).
   - Passwords hashed with bcrypt salt rounds (10).
   - Bearer JWT token verification protecting all `/api/calls/*` routes.
   - Strict user ownership validation and session management.

4. **Modern AI SaaS Dashboard**:
   - Metric analytics: Total Calls, Successful Calls, Active Calls, Failed Calls, Success Rate.
   - Active call banner with live animated pulse and auto-polling.
   - Pre-configured quick-start templates (Clinic/Dental Appointment, Restaurant Reservation, Auto Service, Retail Store Inventory).
   - E.164 phone number formatter and validator.
   - Multi-tab inspection drawer: Structured Results, Turn-by-Turn Audio Transcript, Raw JSON viewer, Call Setup.

---

## Environment Configuration

Create a `.env` file in the root directory (refer to `.env.example`):

```bash
# Server Configuration
PORT=3000

# CALL-E API (Get from https://heycall-e.com or https://docs.heycall-e.com)
CALL_E_API_KEY="your_calle_api_key_here"
CALL_E_BASE_URL="https://api.heycall-e.com"
CALL_E_DEFAULT_LOCALE="en-US"

# Neon PostgreSQL Database Connection (Prisma ORM)
DATABASE_URL="postgresql://neondb_owner:<password>@ep-xyz.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require"

# JWT Authentication Secret Key
JWT_SECRET="your-secure-jwt-secret-key-at-least-32-characters"

# Frontend API Base URL (leave empty for same-origin proxy)
VITE_API_URL=""
```

---

## Local Development & Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Push Prisma Database Schema
Synchronize your Neon PostgreSQL schema:
```bash
npx prisma db push
```

### 3. Start Full-Stack Dev Server
The development script launches Express and Vite middleware simultaneously on port `3000`:
```bash
npm run dev
```

Visit `http://localhost:3000` in your browser.

---

## Real-Call Testing Guide

To test real outbound phone calls:

1. **Obtain CALL-E API Key**:
   - Sign in to [heycall-e.com](https://heycall-e.com) or access the developer portal at [docs.heycall-e.com](https://docs.heycall-e.com).
   - Generate a developer API key with outbound calling permissions.
   - Add `CALL_E_API_KEY="<your-key>"` to `.env`.

2. **Verify Credentials**:
   - Click the **CALL-E Connected / Setup** pill in the top navbar.
   - Click **Test API** to ping the CALL-E API servers and verify authorization.

3. **Dispatch a Call**:
   - Navigate to the **New Call** tab.
   - Enter your personal phone number in E.164 format (e.g., `+14155552671`).
   - Select a template or write a custom objective:
     - Objective: *"Call to verify teeth cleaning slot availability and pricing."*
     - Question 1: *"What is your earliest appointment slot this week?"*
     - Question 2: *"What is the out-of-pocket cost?"*
   - Click **Start Real Phone Call**.

4. **Receive and Converse**:
   - Your physical phone will ring within seconds.
   - Answer and speak naturally to the CALL-E agent. Test interruptions, answers, and questions.
   - Once you hang up, the dashboard will update the status to **Completed**.
   - Click **Inspect** on the call card to view the structured results and conversation transcript.

---

## Production Deployment & Build

To compile both the Vite client bundle and the bundled Node.js backend:
```bash
npm run build
```

This generates:
- `dist/`: Client assets (`index.html`, JS, CSS).
- `dist/server.cjs`: Self-contained bundled Express backend.

To start the production server:
```bash
npm start
```

---

## License
MIT License. Built for hackathon innovation with CALL-E.
