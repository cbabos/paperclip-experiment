# Weekly Delivery and KPI Cadence

## Objective
Create a predictable weekly operating system for delivery, pipeline, and quality so leadership can identify risk early and make fast decisions.

## Weekly Rhythm (Operating Cadence)

| Day | Meeting | Duration | Owner | Outcome |
| --- | --- | --- | --- | --- |
| Monday | Delivery Plan and Commit | 45 min | CEO | Confirm this week's committed scope, owners, and dependencies. |
| Wednesday | Mid-Week Risk Review | 30 min | CEO | Surface slips, unblock bottlenecks, adjust priorities. |
| Friday | KPI Review and Retro | 45 min | CEO | Review KPI deltas, complete weekly scorecard, decide one process improvement for next week. |

## KPI Scorecard

### 1) Product Delivery

| KPI | Definition | Target | Alert Threshold | Owner | Source |
| --- | --- | --- | --- | --- | --- |
| Weekly Commit Accuracy | % of committed items completed by Friday | >= 85% | < 70% | Delivery owner | Weekly plan vs. completed items |
| Lead Time | Median days from `todo` to `done` | <= 5 days | > 8 days | Engineering owner | Issue timestamps |
| Throughput | Number of items moved to `done` per week | Baseline + 10%/month | -20% vs trailing 3-week avg | Engineering owner | Issue board |

### 2) Pipeline

| KPI | Definition | Target | Alert Threshold | Owner | Source |
| --- | --- | --- | --- | --- | --- |
| Pipeline Coverage | Weighted pipeline / next-quarter target | >= 3.0x | < 2.0x | CEO | CRM or pipeline sheet |
| Stage Conversion | Qualified to proposal conversion rate | >= 30% | < 20% | GTM owner | CRM stages |
| Sales Cycle Time | Median days from qualified to close | <= 45 days | > 60 days | CEO | CRM timestamps |

### 3) Quality

| KPI | Definition | Target | Alert Threshold | Owner | Source |
| --- | --- | --- | --- | --- | --- |
| Escaped Defects | Production defects found after release per week | <= 2 | > 4 | Engineering owner | Incident tracker |
| Reopen Rate | % of done items reopened | < 10% | > 15% | Engineering owner | Issue history |
| SLA Breach Rate | % of incidents breaching response SLA | 0% | > 5% | On-call owner | Incident log |

## Execution Rules
- Keep weekly commitments explicit and capacity-constrained.
- Do not increase scope mid-week unless a KPI alert threshold is breached.
- If two or more alert thresholds are breached in one week, trigger a 60-minute corrective action session the following Monday.
- Every Friday retro must produce exactly one named process change owner with a due date.

## Weekly Reporting Template

### Weekly Summary (send Friday)
- Delivery: commit accuracy, throughput, lead time trend.
- Pipeline: coverage, conversion trend, cycle time trend.
- Quality: escaped defects, reopen rate, SLA breaches.
- Risks: top 3 blockers and owner for each.
- Actions: 3 decisions for next week.

## 4-Week Rollout Plan

### Week 1
- Baseline all KPIs from current data.
- Run all three recurring meetings on schedule.
- Publish first weekly summary.

### Week 2
- Set directional targets where baseline data is noisy.
- Add alert threshold ownership and escalation path.

### Week 3
- Tighten definitions where metric interpretation differed.
- Start trend view (week-over-week deltas).

### Week 4
- Evaluate KPI usefulness; retire one low-signal KPI if needed.
- Lock a stable scorecard for next quarter.

## Ownership
- CEO: cadence owner, KPI review facilitation, escalation decisions.
- Engineering owner: delivery and quality metric integrity.
- GTM owner (when hired): pipeline metric integrity.
