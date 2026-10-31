# Nexus assisted form workflow: Paytm account support

## Purpose

This document describes a safe, realistic direction for adapting Nexus to help people complete account-related forms. The initial example is a user who needs help updating a profile or adding a bank account.

The product should be positioned as an **assisted form-completion experience**: Nexus explains the task, extracts suitable information from a user-selected document, helps fill permitted fields, and leaves sensitive verification and final submission to the user.

## Important integration boundary

Paytm's publicly available developer material reviewed for this proposal describes merchant payment products and integrations. It does not establish that a public API or SDK is available for a third-party application to read or edit a consumer's Paytm profile or link a bank account to that profile.

Therefore:

- Do not claim Nexus is integrated with a real Paytm consumer account.
- Do not collect or store a user's Paytm password, OTP, UPI PIN, card PIN, or login session.
- Do not automate a private or authenticated Paytm account page without explicit Paytm authorization and an approved integration method.
- Ask the Paytm mentor/contact whether an approved consumer-account API, SDK, app link, or partner flow exists for the exact task.
- Until that is confirmed, demonstrate the experience using a mock Paytm-style form and clearly labeled synthetic documents.

Paytm's merchant Payment Gateway APIs and SDKs are for merchant payment acceptance; they should not be represented as consumer profile or bank-linking APIs.

## User experience and end-to-end workflow

### 1. User chooses a task

The user opens a Nexus assistance flow and chooses a clear goal, such as:

- “Help me update my profile.”
- “Help me understand how to add a bank account.”
- “Help me complete this form from my document.”

Nexus should restate the request in simple language and ask the user to confirm the intended task. It should not infer permission to perform an account change from an uploaded file.

### 2. User selects a document

The user uploads a document they choose. The upload screen explains:

- What information Nexus will try to read.
- That the document may contain sensitive personal information.
- Whether processing is local or sent to a service.
- How long the file and extracted data will be retained.

For the first prototype, use synthetic documents. Do not request real Aadhaar, PAN, bank statements, or account documents until the project has approved storage, access, deletion, and privacy controls.

### 3. Nexus extracts and previews eligible details

Nexus extracts candidate fields and shows each one before using it. For every candidate, show:

- The extracted value, masked where appropriate.
- The source page or location in the document when available.
- A confidence or “needs checking” state.
- An edit/confirm option.

Example: “Name found: Alex Demo — please confirm.” Nexus must not silently treat OCR or document text as authoritative; documents can be old, ambiguous, or incorrectly read.

### 4. Nexus identifies fields that must remain user-controlled

Sensitive fields should be left blank in the form and visibly labeled **“You enter this directly in Paytm.”**

At minimum, Nexus must never collect, extract for submission, store, or enter:

- Paytm or bank passwords.
- OTPs or verification codes.
- UPI PINs, card PINs, or CVV.
- Authentication tokens, cookies, or session credentials.

For an initial prototype, also leave full bank account numbers and government identity numbers for direct entry by the user. If a future approved workflow needs these fields, it requires a separate security, privacy, and consent review; do not make that a default capability.

### 5. Nexus fills only approved, non-sensitive fields

After the user confirms the preview, Nexus may fill permitted ordinary fields in a mock form or an explicitly approved integration. The UI should distinguish:

- **Ready to fill** — user-confirmed, non-sensitive data.
- **Check this** — uncertain or conflicting data.
- **You fill this yourself** — sensitive data.

The user must be able to edit or remove any proposed value before it is entered.

### 6. User reviews and submits

Nexus stops before the final submit or account-changing action. The user reviews the page, enters any sensitive values directly in Paytm's official interface, completes any authentication themselves, and submits.

If Paytm later provides an approved API or SDK for the operation, keep user confirmation and any required strong authentication in the Paytm-controlled flow. Do not bypass these controls with browser automation.

### 7. Confirmation and history

Nexus asks the user whether the task completed and can show a simple completion checklist. History should store only minimal operational metadata, such as:

- Task category and run time.
- Whether extraction, review, and user confirmation occurred.
- Non-sensitive completion status and error category.

History must not include the uploaded document, extracted sensitive values, passwords, OTPs, UPI PINs, account numbers, or page screenshots containing personal information.

## Example scenarios

### Example A: Profile address update

1. User asks for help updating an address.
2. User uploads a synthetic proof-of-address document.
3. Nexus proposes the address and asks the user to confirm it.
4. Nexus fills the address in a mock profile form.
5. User reviews and submits the form in the official application.

### Example B: Adding a bank account

1. User asks how to add a bank account.
2. Nexus explains the steps in simple language and, if approved by Paytm, directs the user into the official bank-linking flow.
3. Nexus does not read or enter the account number, OTP, or UPI PIN.
4. The user completes account selection and verification inside Paytm.
5. Nexus asks whether the user finished and records only a minimal completion status.

### Example C: Conflicting details in a document

1. The uploaded document contains two possible addresses or an unreadable name.
2. Nexus marks the field “Check this” and explains the uncertainty.
3. It does not fill the form until the user corrects or confirms the value.

## What Nexus already has

The current application provides useful building blocks:

- A React/Next.js dashboard for entering tasks and displaying plans.
- A backend planner and separate plan reviewer.
- An execution service and browser engine with multiple browser-recovery strategies.
- WebSocket updates for live progress.
- A Cron-based scheduler and a History interface.

These are general workflow and automation capabilities. They do not, by themselves, provide a secure document-to-form product or an approved connection to consumer Paytm account management.

## What needs to be added

### User-facing capabilities

- A dedicated assisted-form flow rather than a generic automation prompt.
- File upload with file type/size checks, clear consent, and retention/deletion information.
- Document text extraction and structured field preview.
- Field-level source, confidence, correction, and confirmation controls.
- A sensitive-field policy that prevents prohibited values from reaching the browser executor, model prompts, logs, or History.
- An explicit stop-before-submit handoff and clear user instructions.
- Accessible language, large controls, and plain-language explanations; consider voice or regional-language support after the basic flow is reliable.

### Backend and integration capabilities

- A document-processing service with an explicit data-handling policy.
- A typed field schema and validation layer between extraction and execution.
- A field allowlist for values Nexus may fill; sensitive fields must be denied by default.
- A mock form provider for development and demos.
- A separate provider interface for any future Paytm-approved integration.
- Authentication, authorization, consent, audit, retention, and deletion controls appropriate to the data.
- Redaction before telemetry, error reporting, execution logs, and trace persistence.

Do not treat a browser extension, DOM access, or a seven-layer recovery engine as authorization to interact with Paytm. Browser automation is suitable for the synthetic demo and, later, only for a workflow explicitly approved by the service owner.

### Existing features to adapt

- **Planner/reviewer:** produce a constrained checklist, identify uncertainty, and block prohibited actions.
- **Seven browser-recovery layers:** explain these as robustness for approved forms, not a way around authentication or access restrictions.
- **Cron:** not needed for a one-time profile update or bank-linking task. Keep it out of the main demo; a consented reminder could be considered later.
- **History:** redesign around privacy-safe status and minimal metadata; do not persist document content or sensitive field values.

## Suggested implementation sequence

### Phase 1 — Safe, convincing prototype

- Build a mock Paytm-style form and synthetic PDF.
- Support a small set of non-sensitive fields, such as a fictional name and address.
- Preview extracted values and let the user correct them.
- Demonstrate a sensitive field as blank with “You fill this yourself.”
- Fill the mock form, then stop for user review before submission.
- Show a privacy-safe run record in History.

### Phase 2 — Validate with Paytm

- Ask the mentor or Paytm contact which exact user workflow is in scope.
- Request written confirmation of an approved API/SDK/app-link/browser method.
- Confirm what sandbox, test credentials, data formats, and consent rules are available.
- Validate the process with a de-identified sample or test environment.

### Phase 3 — Controlled integration, only if approved

- Implement the approved integration with least-privilege access.
- Keep account authentication and sensitive verification in Paytm's own trusted flow.
- Run security/privacy review and test that secrets cannot enter logs, prompts, traces, or stored documents.
- Start with a supervised pilot and retain a human review/confirmation step.

## Demo plan

Use a mock page and a fictional document. Tell the audience explicitly that the data and form are synthetic and that the demo is not connected to Paytm.

1. Ask Nexus to help update a profile from the document.
2. Show the extracted fields, their source, and the user's confirmation.
3. Show Nexus filling only the permitted fields.
4. Show the sensitive field intentionally left blank and labeled for the user.
5. Stop before submission and explain that the user completes the official verification and submit action.
6. Show History containing the task status but no document or sensitive values.
7. Explain that Cron is for recurring operational checks, not for automatically changing personal account details.

## Success measures

Do not claim a percentage reduction before measuring it. In a pilot, compare against the existing process and measure:

- Time for a user to complete the supported task.
- Percentage of extracted fields accepted without correction.
- Incorrectly filled fields and prevented sensitive-field attempts.
- User completion rate and points where users need help.
- Privacy/security test results, including whether sensitive values appear in logs or History.

Any reduction target should be described as a hypothesis until validated with representative users and an agreed baseline.

## Questions for the Paytm mentor

1. Is the target user a consumer, a merchant, or a support/operations employee?
2. Which exact profile or bank-linking task should the prototype support?
3. Does Paytm provide an approved API, SDK, app-to-app flow, or test environment for this exact task?
4. If not, is an assisted guide that keeps all changes inside the official Paytm app an acceptable product direction?
5. What documents and fields may be processed, where may they be processed, and what retention/deletion rules apply?
6. Which steps must always be completed or approved by the user?

## Pitch summary

> “Nexus helps people who find digital forms difficult. It reads a document the user chooses, previews and verifies ordinary details, fills only approved fields, and leaves authentication and sensitive financial information in the user's hands. The first demo uses synthetic data. A real Paytm account workflow requires an explicitly approved Paytm integration.”

## Public references

- [Paytm Payment Gateway](https://www.paytmpayments.com/payment-gateway) — public merchant payment product information.
- [Paytm UPI for merchants](https://www.paytmpayments.com/upi) — public merchant payment acceptance and UPI integration information.
- [Paytm Instant Refunds](https://www.paytmpayments.com/instant-refunds) — public merchant refund product information.
- [Paytm developer documentation](https://www.paytmpayments.com/docs) — official developer documentation entry point.

These references describe public products; they do not confirm a consumer profile-update or bank-account-linking API for Nexus.
