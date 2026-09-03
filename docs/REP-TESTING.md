# Testing the campus-rep flow (for King)

The rep flow is real: a sign-up creates a rep account, a phone code activates it, and the
dashboard is the live workspace. So you test it **in Test Mode**, which tags everything you do as
`is_test` and lets a fixed code stand in for the text message.

## 1. Arm Test Mode (one link, once per browser session)

Open this first — replace the name and email with yours:

```
https://surviveaccounting.com/rep/join?feedback=1&testmode=1&t=King&email=you@example.com
```

Both `feedback=1` and `testmode=1` have to be present, and the email has to be a real-looking
address. The bar at the top of the page tells you Test Mode is on. It stays on for the tab
(sessionStorage), so you can keep clicking around without the params.

> Lee: this only works while `TEST_MODE_ENABLED` is set on the server (Vercel env). If King sees a
> real text instead of the test hint, that flag is off.

## 2. Sign up as a rep

1. Fill in name, email, phone (use your own real number — it's the login key, nothing is sent
   while Test Mode is on), and pick a campus.
2. Submit. Because the tab is in Test Mode the account is created as a **test rep** and the page
   says a code was "sent".
3. **The code is `000000`.** Type it and you land on `/rep/dashboard`.

Signing in later: `/rep/join` again, same phone, same `000000`.

## 3. What to try on the dashboard

- Your share link and the campus materials.
- Copy the DM templates and check they read right for that campus.
- Anything that looks like it would email or text someone: in Test Mode it goes to the tester
  email from step 1, tagged `[TEST]`, never to a real student or chair.

## 4. Where Lee sees what you did

- `/growth` — the growth dashboard you already have (contacts, DMs sent, replies, link clicks).
- `/outreach/test-mode` — the Test Mode activity feed, grouped by session, so "step 4 broke"
  is findable.

## 5. Turning it off

Visit any page with `?testmode=0`, or click **Exit Test Mode** in the drawer. Test rows never
count toward real numbers either way.

## Things to report back

- Any screen where you weren't sure what to do next.
- Copy that reads wrong for a campus that isn't Ole Miss.
- Anything on the dashboard you'd want as a rep and don't see.
