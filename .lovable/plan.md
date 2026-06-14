## Shift campus due dates forward by 6 days

Update the `due_date` on all 36 currently-assigned campuses in the `campuses` table by adding 6 days. None of the new dates land on Sunday or Monday, so no skip logic is required.

### Date mapping

| Current (count) | New |
|---|---|
| Wed Jun 10 (5) | Tue Jun 16 |
| Thu Jun 11 (21) | Wed Jun 17 |
| Fri Jun 12 (5) | Thu Jun 18 |
| Sat Jun 13 (5) | Fri Jun 19 |

### Change

Single SQL update via the insert tool:

```sql
UPDATE public.campuses
SET due_date = due_date + INTERVAL '6 days'
WHERE due_date IS NOT NULL;
```

No code changes; the Outreach UI reads `due_date` directly and will reflect the new dates immediately.
