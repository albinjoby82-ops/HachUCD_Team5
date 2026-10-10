# Commons: Hack UCD prototype

Build your team's structure once as a flowchart. Commons routes every purchase to the right person, keeps the money organised, and tracks what your team (and the teams around you) own.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173. Everything runs offline. All data lives in this browser's localStorage. To start over, go to **Settings → Demo data → Reset**.

> On this Windows machine, Application Control blocks Rollup's native binary, so `package.json` overrides `rollup` with `@rollup/wasm-node`. Leave that override in place.

## What's working

| Area | What you can show |
|---|---|
| **Register a team** | Sign up → org details → modules → **flowchart builder** → invite → live workspace with a setup checklist |
| **Flowchart builder** | Templates (Engineering, Society, Startup, Other, Blank). Drag boxes to move them. **Drop a box onto another to change who it reports to.** Drag people between boxes. Use the hover **+** to add a role below. The inspector lets you rename a box, toggle "starts a department" (with a colour), add, remove or promote people, and change "Reports to". **Trace approvals** animates a person's route. There's also Tidy up, zoom (ctrl+scroll) and pan. |
| **Chart drives everything** | Approval chain, who sees which requests, department budgets, who can lend which items. Edits take effect immediately. If an edit strands an open request, the Team page offers to re-route it. |
| **Join flow** | Invite code → account → role confirmation that shows your approval route. If your email was invited, you claim that spot. |
| **Requests** | Before-you-buy check against your own inventory and the cluster. Auto duplicate flag. Approve, pass up, send back (requester updates and resends) or reject. Full activity trail. |
| **Mark bought** | Upload or snap a receipt photo → OCR fields with confidence (editable) → add to inventory, optionally shared with the cluster |
| **Finance** | Spend vs budget per department, a summary templated from computed totals, flags, budget split |
| **Bank import** | A real CSV parser (upload your own or use the 150-row sample). Columns are auto-mapped and you can change them. Known payees match by rule; unclear lines get a suggestion with confidence, and anything under 80% goes to review. Flags: duplicate, refund, unusual amount, no matching request, missing receipt. Bank lines are matched to approved requests. |
| **Inventory** | Filters, take/return, condition, share with cluster, add by hand |
| **Cluster** | Cross-org lending between real workspaces (Ironclad, Volt FS, SkyLab, plus any team you register). The owning department lead approves incoming requests. Overdue tracking. |
| **Multi-org** | The org switcher keeps workspaces separate. You can switch into Volt FS or SkyLab too. |

## 3-minute judging script

The **Demo · view as** bar (bottom right) has a **Script** button. Each step switches to the right person and screen.

1. **Tom needs a part.** Fill the example. "Before you buy" finds 140 M3 bolts already in the parts bin.
2. **Daniel decides.** He sees budget context, similar past purchases and the duplicate flag, then passes it up to Aoife.
3. **Aoife** sees only what was passed up to her, with Daniel's note.
4. **Tom marks R-102 bought.** Sample receipt → OCR → it lands in Mechanical inventory.
5. **Bank import.** 150 lines: 125 by rules, 21 AI, 4 for review, 6 flags. It matches R-102, R-100 and R-099.
6. **Cluster.** Tom borrows SkyLab's 3D printer.
7. **Daniel** approves Volt FS's request to borrow the torque wrench. The chart makes him the approver.
8. **Edit the chart as Maya.** Hover Mechanical captain → **+** → "Pneumatics lead". Drag Sam in (he becomes lead), then drag Tom in. Trace Tom: Sam → Daniel → Aoife → Maya.
9. **Register a brand-new team** from scratch, invite someone, then join as them with the generated code.

## Honest labelling

The receipt OCR and the "AI" categoriser are simulated so the demo runs offline. They're labelled in the UI, and the categoriser returns `{category, confidence, reason}` the way an LLM call would. Email, Google sign-in and billing aren't connected. Totals are always computed in code, never by AI.

## Code map

- `src/lib/org.ts`: business rules (chain, visibility, departments, spend)
- `src/components/FlowChart.tsx`: the chart editor
- `src/lib/csv.ts`: bank import engine
- `src/lib/cluster.ts`: before-you-buy, lending, holdings
- `src/lib/seed.ts`: sample orgs
- `src/pages/Wizard.tsx`, `Join.tsx`: onboarding
- `src/pages/app/*`: app screens
