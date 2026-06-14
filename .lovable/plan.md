# Shift VA Campus Assignment Dates +6 Days

## What's wrong

The previous shift updated `campuses.due_date` (now Jun 16–19), but the Outreach Dashboard's week strip and Today checklist read from a different table: `outreach_va_campus_assignments`. That table still has the old dates:

```
2026-06-10  5
2026-06-11  5
2026-06-12  5
2026-06-13  5
```

So the UI still shows assignments on Wed Jun 10 → Sat Jun 13.

## Fix

Run one data update on `outreach_va_campus_assignments`:

```sql
UPDATE outreach_va_campus_assignments
SET assigned_for_date = assigned_for_date + INTERVAL '6 days';
```

Resulting schedule (all land on Tue–Fri, skipping Mon/Sun as desired):

```
Tue 2026-06-16  5
Wed 2026-06-17  5
Thu 2026-06-18  5
Fri 2026-06-19  5
```

This matches the existing `campuses.due_date` values already shifted in the prior step, and makes the dashboard's checklist + week counts start on Tue Jun 16.

## Scope

- Data-only update via the insert tool. No schema change, no code change.
- No frontend files need editing — `WeekNavigator` and `TodayChecklist` will reflect the new dates immediately once the query refetches.
