# King's funnel test — council to dashboard

Built 2026-09-13. The same 13 steps are in the orange **Test mode** bar on the site ("Show steps").

## Before you start

- **Test mode must be on in production:** `TEST_MODE_ENABLED=1` in Vercel. `jking.cim@gmail.com` is on the tester allow-list in code (`src/lib/test-mode.server.ts`).
- **Everything uses the fixture:** Test University · IFC · Test Chapter (letters ΤΕΣΤ). Nothing touches a real chapter, count or inbox.
  - Every email goes to the tester, stamped `[TEST]`.
  - No texts are sent.

## Start links

Open the start link on each device once. That puts the device in test mode.

| Device | Start link |
|---|---|
| Laptop | `https://surviveaccounting.com/go/test-university/council/ifc?testmode=1&feedback=1&t=King&email=jking.cim@gmail.com` |
| Phone | `https://surviveaccounting.com/learn/test-university/test-chapter?testmode=1&feedback=1&t=King&email=jking.cim@gmail.com` |

Stay in the same tab. Links opened in a new tab can drop the test bar, although the test cookie still routes mail to you.

## Test accounts

| Role | Use |
|---|---|
| IFC scholarship chair (Test University) | You, on the council page |
| Test Chapter scholarship chair | You. The activation form's email is pre-filled with `jking.cim@gmail.com` |
| Member 1 | `jking.cim+member1@gmail.com` |
| Member 2 | `jking.cim+member2@gmail.com` |

## The run

1. **Council chair: open the IFC page.**
   - Expect "Boost every chapter's GPA in TEST 101."
2. **Council chair: Share with chapter chairs.** Copy the link and the GroupMe post, then download the slide.
   - The link is `/chapters?school=test-university&c=ifc`.
   - A `[TEST] Council chair click` email arrives.
3. **Chapter chair: open that link and pick Test Chapter.**
   - The school is pre-filled and only IFC chapters are listed.
   - Picking one lands on the chapter chair page.
4. **Chapter chair: Share with members.** Try all five actions: copy link, GroupMe post, print flyer, download flyer image, slide.
   - A `[TEST] Chapter chair click` email says the chair came "from the IFC link".
5. **Member (phone): open the members' link or scan the flyer. Join as member1.**
   - "Join ΤΕΣΤ's page" asks for an email before anything else.
   - After joining you're straight into Exam 1, with no second email ask.
6. **Student (laptop): open `/learn/test-university`.** Choose "In a fraternity or sorority?", then IFC → Test Chapter. Join as member2.
   - The same join ask appears, and the count reaches 2.
7. **Member (laptop): tap "Forget this device", open the members' link, and join as member1 again.**
   - You're back in and the count stays at 2.
8. **Chapter chair: on the chapter page, tap "Activate your chapter dashboard".**
   - Expect "Activation received" plus a test-mode note that in real life Lee texts the chair first.
   - A `[TEST]` activation email arrives.
9. **Skip ahead: approve it and open the dashboard.**
   - This stands in for Lee's call. Later a campus rep will do it.
10. **Sign in with the emailed link.**
    - Members joined shows 2, and "Who joined" lists both emails.
11. **Mark all three steps done.**
    - Each step gets a `[TEST]` email.
12. **Request 20 seats.**
    - Expect "Request sent — Lee will reach out", and a `[TEST]` seat request email.
13. **Reset fixture, then Start over.**

## Variant

The member-side "On exec?" form on `/learn` also activates the dashboard. It asks for an email and gets the same "Skip ahead" button.
