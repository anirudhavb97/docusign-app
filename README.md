# DocuSign Healthcare Automation Platform

Automates the payer→provider fax workflow:

**Fax received → AI OCR + Classification → Envelope Creation → E-Signature → Payer Notified**

## 8 Document Buckets
1. Durable Medical Equipment Orders (DME)
2. Home Health Orders
3. Plan of Care
4. Prior Authorizations
5. Medical Record Requests
6. Attestations & Audit Requests
7. Other — Needs Physician Signature
8. Informational — No Signature Required

## Stack
- **Frontend**: Next.js 14, TypeScript, Tailwind CSS (DocuSign-like UI)
- **Backend**: Node.js + Express
- **AI**: Claude API (claude-sonnet-4-6) — OCR, classification, tag placement
- **DocuSign**: eSign API + Agreement Desk
- **DB**: PostgreSQL + Prisma
- **Queue**: BullMQ + Redis

## Getting Started
```bash
# Backend
cd backend && cp .env.example .env && npm run dev

# Frontend
cd frontend && npm run dev
```
