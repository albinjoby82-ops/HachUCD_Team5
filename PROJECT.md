# Commons: project brief

## The problem

Student engineering teams, societies and early-stage startups all share one pattern: **many people across several departments buy things from one shared account.** Because nothing connects those purchases to the team's structure, the same problems keep appearing:

- **Nobody knows who approves what.** Requests go through chat messages and verbal OKs, with no record of who decided or why.
- **Money is a black box.** Department leads can't see what's left, and the treasurer reconciles a messy bank export by hand each month.
- **Teams buy things they already own.** Parts sit in a bin or in a neighbouring team's lab while someone orders a duplicate.
- **Nobody knows who has the kit.** Shared tools go missing, and returns are chased by DM.
- **Admin software assumes a company.** Tools like Expensify or Procurify expect fixed roles and approval limits that a rotating student committee doesn't have.

## The idea

> Build your team's structure once, and Commons routes every purchase to the right person, keeps the money organised, and tracks every item your team (and the teams around you) own.

The org chart isn't a picture. **It is the engine.** It decides who approves whose requests, how budgets split by department, and who can see which records. Change the chart and everything re-routes.

## Scope

### In the prototype

| Application | What it does |
|---|---|
| **Team structure** | A drag-and-drop flowchart builder. A new team registers, picks a template or starts blank, builds its hierarchy, invites people into boxes, and gets a live workspace. |
| **Purchase requests** | Requests flow up the chart: approve, pass up, send back or reject, with a full activity trail. A "before you buy" check searches your inventory and your cluster. Receipts are read by (simulated) OCR, and bought items are added to inventory. |
| **Finance** | Budgets by department (informational, never blocking), spend tracking, and bank CSV import. Known payees match by rule, unclear lines get an AI suggestion with a confidence score, low-confidence lines go to review, and anomalies are flagged (duplicates, refunds, unusual amounts, missing receipts, spend with no request). |
| **Inventory** | What the team owns, where it is, who holds it, and its condition. Items are added by hand, CSV import or from bought requests. |
| **Cluster** | Nearby teams share chosen items. Borrow requests are approved by the owning department's lead, and the system tracks which person from which team has what, including overdue returns. |
| **Onboarding & access** | Landing, sign-up, org creation, module toggles, invite codes, a join flow that shows your approval route, a multi-org switcher, settings, and a role switcher for demos. |

### Principles built in

- **Any AI output is a labelled suggestion with a confidence score. A person confirms it.**
- **AI never calculates.** Totals are computed in code. AI may only explain them.
- **"Left to spend" is never called a bank balance.**
- **Status is never colour alone.** Every status chip shows a glyph and a word.

### Not in scope

Live bank connections, real payments, native mobile apps, email delivery, Google sign-in and billing. The OCR and AI categoriser are simulated so the demo runs offline, and are labelled that way in the UI.

## How it's built

React 18 + TypeScript + Vite, Zustand for state (persisted to browser localStorage). There is no backend: each visitor gets their own copy of the demo data. Deployed as static assets on Cloudflare.

The suggested production stack from the design handoff is Next.js, Supabase (Postgres, Auth, Row Level Security by `org_id`), and a server-side LLM API for categorisation, OCR and summaries.

## Who it's for

- **Primary:** student engineering teams (robotics, Formula Student, rocketry)
- **Also:** student societies running several events, and early-stage startups
- **Where it hurts most:** teams with 10 to 50 members, 3+ departments, a shared budget, and a lab or workshop with shared equipment

## Where to look

- [README.md](README.md): run it, feature table, 3-minute judging script
- `src/lib/org.ts`: the rules (approval chain, visibility, spend)
- `src/components/FlowChart.tsx`: the chart editor
