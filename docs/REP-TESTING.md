# Testing the campus-rep flow (for King, or anyone)

The rep flow is real: applying creates a rep account, a phone code signs it in, and approval
opens the live workspace. So you test it **in Test Mode**, which tags everything you do as
`is_test`, replaces the text-message code with `000000`, and never texts a real phone.

## The whole thing

1. Open **surviveaccounting.com/rep/test** on your phone or PC.
   That's it for setup — it turns Test Mode on for the tab and lands you on the test campus's
   apply page. (Lee: `/rep/test?who=lee`. Anyone else: `/rep/test?email=you@example.com&t=You`,
   once Lee has added the email to the tester list.)
2. The brown **TEST MODE** bar at the top has **Show steps**. Follow it — eight steps, each
   says what to do, what should happen, and every value you have to type. Tap **Done · next**
   as you go.
3. Your tester phone is already filled in on the form. The code is **000000**.
4. In steps 5 and 6 you play Lee: the links Lee would get by text are shown on screen instead.
   Tap them, confirm, and the applicant's texts appear on the page.

That's the whole test. Roughly ten minutes.

## Report back

Use the **🧪 Beta — what was confusing here?** box at the bottom of any screen. One line, Send.
For a test rep it's recorded but not texted; still write it — Lee reads the run afterwards. Or
just text Lee.

## Running it again

Sign out from the dashboard (or close the tab) and open `/rep/test` again — you get a new
tester phone and a fresh application. Old test runs are harmless; Lee purges test data from the
Test Mode bar.

## For Lee

- Test Mode needs `TEST_MODE_ENABLED=1` on Vercel; testers other than you and King need their
  email in `TEST_MODE_EMAILS`.
- What you see with a real applicant that a tester doesn't: the founder alert at apply, the
  review text, the post-invite links, rep replies, the daily one-liner — all real texts.
- Where the run shows up: `/admin/reps` roster (test reps marked), and the Test Mode bar's
  activity log.
