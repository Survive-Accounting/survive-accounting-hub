# Survive — Strategy & Culture Document

*Captured from brainstorming sessions, September 2026*

---

## Core Operating Principles

### Use Your Words
Lee thinks out loud. The best strategy in this business has come from talking, not
from silent planning. Brainstorming aloud — with the AI assistant, with partners —
is the primary mechanism for surfacing ideas, not a supplement to it.

Desk artifact: vintage dictation machine + plaque reading **"Use Your Words."**

### Feed the Machine
Strategy content is energizing. Accounting content is the business. The rule:
**no strategy short gets made until accounting shorts have shipped.** Dreaming is
allowed; it just doesn't come first.

### Human First
The AI assistant catches Lee's ideas — it does not generate them. Its only
license to suggest is a better *phrasing* of Lee's idea for short-form delivery.
The wisdom comes from ten years of tutoring; the AI is a transcriber, editor,
and producer.

---

## Product Strategy

### Short-form is the format, not a channel
Everything is built around short-form attention. Two-minute cram videos, not
lectures. The pitch to chapters: *"YouTube Shorts that explain my practice exams."*
The practice exams are the ten-year asset; the shorts are how they get taught.

### Conversion model
- **Easy Points** topic is free on every exam. It delivers real points while
  demonstrating that harder material is still behind the wall.
- Exam 1: rest of the exam gated by **email capture** + exam-date-timed reminder
  sequence (3 emails).
- Exams 2–4: rest gated by **payment** ($50).
- Chapter members: provisioned with access, but **email capture still applies** —
  chapter-level email volume is the demand signal that tells reps which chapters
  to pursue.

### Why the email gate is correct
If a student won't submit an email after receiving genuine value, they were never
going to convert. The hoops filter for customers. Emails from a single chapter
(e.g. 18 from one house) are a direct signal to activate a rep.

### Course roadmap
- **Now through spring 2027:** intro accounting, deepening quality
- **Summer 2027 — workshop mode:** build out remaining accounting courses
  (Intro 2, Intermediate 1, Intermediate 2) plus 1–2 new subjects
  (organic chemistry, finance)
- **Target:** ~6 courses, covering a large share of what any Greek chapter needs

Accounting is the way in, not the ceiling.

### Easy Points, simplified

*2026-09-08.* The free topic is being cut back to the two things that actually
earn the points, so the free tier is unmistakably useful and fast to produce:

1. **What type of account is this?** — cheat codes already in hand: prepaids are
   assets, receivables are assets, payables are liabilities. Dividends is the
   tricky one. (**It is contra-EQUITY, not contra-asset** — `account-registry.ts`
   has it right: "Retained earnings paid back to owners — it REDUCES equity. Not
   an expense.")
2. **A = L + E transactions** — the harder one. It may have to split into two
   sets, or deliberately cover the basics rather than every case. Deciding which
   is part of the work. A natural seam: transactions where cash moves, then the
   ones that trip people up (on account, adjusting).

**The cheat code for A = L + E is the whole video-two opener.** Lee: *"the cheat
code is to have the internal company perspective. You're doing the accounting
from inside of a company. What happened to that company? Not what happened
outside the company… If you think from the owner's perspective, you're gonna get
it wrong."* Issuing stock is the case that proves it. Lead with the wrong way,
then the fix — "the wrong thing to do would be this."

A fourth callout kind is wanted: **memorize this · cheat code · tricky · deep
question**. `distractor` already exists in `CalloutCard.tsx` (red) and is the
closest fit; either relabel it or add "tricky" beside it.

> **Built 2026-09-08.** Lee: *"Also, I'm not seeing a '+Tricky' type slide.
> Haven't we discussed this?"* We had — here — and it had not been built.
> Relabelled rather than added: the callout key stays `distractor` everywhere,
> its label reads **TRICKY**, and a `tricky` frame kind now sits in the insert
> row beside Memorize this / Cheat code / Deep question. Same reasoning as
> "deeper-idea" → DEEP QUESTION two days earlier: *distractor* is what a test
> writer calls it, *tricky* is what a student needs to hear.

## The Slogans, and where each one lives

Settled 2026-09-08, after the cold open started leading with the wrong words.

- **"Cram what's on your exam."** — the site tagline. **Outro card only, for
  now.** Lee: *"Cram what's on your exam is an outro card only for now."* It was
  the cold open's default line and is retired from there.
- **"Like YT shorts for exam prep."** — the positioning line, said word for word
  in outros. Lee: *"That slogan just fucking rocks. I love it. It is perfect.
  So, I don't want it to lose its spirit."* Available as the outro's other
  version, so a video can end on either.
- **"I'll take you from a B to an A."** — the sales line, its own slide, with an
  illustration.
- **"Found on your exam"** — retired as a default. (It had already been cut once
  — `plan.ts`: *"forget found on your exam, it's wrong"* — and had crept back as
  the chip on note-only set cards.)

**The cold open leads with the TOPICS, not a slogan.** Lee: *"It needs to start
on the slide with the topics."* The assembly's centre stack is the chapter, the
site, and the set name; the slogan slot is empty unless Lee types one.

**The outro assembles too.** Lee: *"THAT is the slide that needs entrance
animation too."* Bookend to the cold open, same rule — everything eases in, one
thing lands hard — except at this end the hard landing is the CTA pill, because
that is the thing being asked for (`blastoff/outro-entrance.ts`).

**What Lee actually says over the outro** (2026-09-08, correcting an assumption
that had been made in the other direction): *"I don't say the outro out loud. I
say — Hope this helped. Thanks for using Survive."* The slogan on the outro card
is **read, not spoken**. Nothing in the audio names it.

**Which makes per-destination slogans genuinely possible — as a post step, not a
film one.** Lee asked whether *"Like YT shorts for exam prep."* could be the
default while *"Cram what's on your exam."* is what goes to YouTube — *"a quick
way to change what that slogan says by pasting something over it and
re-exporting."* Because the words are never spoken, one take can serve both
destinations: the audio is identical and only the last card's pixels differ. So
the job is to re-render the outro card with the other slogan and splice it over
the tail of the uploaded MP4 — one still, one ffmpeg overlay, per destination.
That is real work and it belongs to the posting tool
(`docs/PROMPT-POSTING-YOUTUBE.md`), which is already where the per-destination
title, caption and hashtags are composed (`lib/caption-brief.ts`) — not to the
film surface, which should stay one take, one pass. Lee: *"It's not super
mission critical."* Until it is built, the outro's slogan is a per-video choice
made in the Editor before filming.

Internal vs. external users is effectively done — every slide is made.

---

## Vertical Integration

Lee has built the full production chain himself:

1. **AI teaching assistant** — talk through how to teach a topic; it captures the
   good ideas and suggests short-form phrasing
2. **AI producer** — converts the finished idea into slides
3. **Teleprompter + script bank** — randomized intros/outros, ad-libbed body
4. **Filming** — one take, minimal editing
5. **Distribution** — YouTube Shorts, Reels, TikTok

This is the "big ideas guy who learned to build with AI" story. It is the most
compelling narrative Survive has — for hires, for investors, for the ENT course.
It is *not* for students.

---

## The Cold Open — the machine assembles

*Added 2026-09-08, from Lee out loud. Starts subtle and grows; this is the brand
on screen.*

The first seconds of every Short are the brand, and right now they are a
placeholder: the boiling bolt sits in the camera ring while the Sony A7 III wakes
up, so the viewer gets something alive instead of a black rectangle. That was a
patch. The real idea is bigger.

**The picture.** Nothing on screen but the bolt in the background. Then the slide
*assembles itself*, piece by piece, each part flying in from where it lives:

- the camera slides in from the right
- the question drops from the top
- the Survive watermark comes in top-left, moving left to right
- the topic lines arrive as a pair — top line from the left, bottom line from
  the right

Lee: *"like this assemblance. Like, this is a machine being put together, and
we're about to dive into this."* The reference is **How It's Made** — the
pleasure of watching parts become a thing that works.

**The feeling.** Strip it back and there are only two elements: *"there's just
kind of the bolt, and there's electricity. And that's really it."* What it should
feel like to the student: *"you're about to get your system shocked. It's like a
defibrillator."* Not a logo animation. A jolt before the cram.

**The practical half.** It also solves a real problem Lee named in the same
breath: *"it's hard to start the video."* A countdown gives him a beat to settle
into before the take begins, and the assembly gives the viewer something
deliberate to watch during it — the same seconds doing two jobs.

**Where it stands.** The 10-second countdown exists in the film pop-out today
(press **C**): black screen, the count in League Spartan, cream turning gold for
the last three, the wordmark small beneath. The assembly is not built. Build it
as one subtle pass first — one or two elements flying in — and add pieces over
time rather than shipping a whole title sequence at once.

---

## The Intro, and the Tutoring Language

*2026-09-08, from Lee out loud.*

**Every cram video opens the same way, and the promise is speed.** The shape:
this shows up on exams · we're going to cram it, not teach it · I'm only going to
show you what you need to know · let's do it. Lee: *"internal versus external
users. It shows up on exams and it's easy points. I'm only gonna show you what
you need to know. I'm not gonna go too deep. Let's do it."*

**Rehearse for time, not for polish.** He is deliberately cutting rehearsal down:
*"I'm really gonna try to not rehearse it as long. I wanna just practice getting
it within a certain time frame. So I can just run them until I get it in the
right time frame."* Free-flowing, no cuts. Longer formats (walking a practice
exam question, sometimes 90 seconds each) can earn cuts later; the cram videos do
not.

**More sales language in the intros.** The strategy doc's own voice belongs in
the content: *"I wanna take you from a B to an A. That's, like, killer."* The
intros should be redone with that in them, and the canonical set should live on a
page on the site — not only in the app.

**"What's your tutoring language?"** The page exists for a second reason: the
next tutor will need their own. Lee: *"we're gonna dissect how I tutor, what's my
strategy, what am I really good at"* — and eventually tie it to data. The framing
he wants to chase: *"How do I become the Iron Man of tutoring?"* — build the suit,
then hand the suit to other tutors. This is a Survive Studios asset, not an
Accounting one.

---

## The Positioning Line

> **"Like YT shorts for exam prep."**

*2026-09-08. Lee: "That slogan just fucking rocks… I will say it word for word in
outros." Say it verbatim; do not paraphrase it into "short-form content for
students" or anything else.*

The longer form, for when there's room to carry the vision:

> Survive is like YT shorts for exam prep — becoming available at universities
> nationwide, with more courses coming.

**Cadence: roughly every fifth video, or once per topic.** Not every outro — a
line said constantly stops being heard. Lee's reason for saying it at all: *"I
want someone who watches from another university to care. I want to go for the
big vision."*

**Is it too lofty?** No, on one condition: it has to be said next to something
concrete. "Nationwide, more courses coming" on its own is a claim; the same line
over a visible list of the courses that are actually coming is a roadmap. Pair it
with the course list, or with the campuses already live, every time.

**It is also a recruiting line.** Lee: *"I want to make this a mission where
others can help. This is the type of content I want former students to see and go
wow, he's doing it, I want in."* At least one video should name the job
opportunity — the rep program for now.

---

## Pitch Slides

*2026-09-08. Lee's name for it: "any video that's directed at selling the student
on something." A pitch slide is a production kind, distinct from a cram slide.*

The model underneath: **keep the videos incredibly crammable, and leave seeds of
curiosity lying around.** The seed, in its shortest form:

> With Survive, the first exam is completely free — just share your email. All
> other exams are $50 each. We partner with sororities and fraternities, so your
> whole chapter can get this. Helps boost a lot of GPAs.

Two scripts, written 2026-09-08. Keep the closing lines exactly — *"I'll take it
from there"* and *"I'll walk you through it personally"* are doing real work.

### Script 1 — Easy Points outro (~60 sec, one take)

> Alright, that's Easy Points. Those are yours now — you'll see some version of
> them on every exam you take in this course.
>
> Here's how I think about this whole thing. These cram videos aren't me teaching
> you accounting. I'm showing you what's on the test and giving you every trick
> I've got. Do these, practice on your own, you're solidly in B territory. Do all
> of them and I think you make an A.
>
> But some of this stuff you actually have to understand, not just memorize. So I
> make longer videos for that too, and I'll point out where you need them.
>
> And honestly? Some of it's just fun. Everybody's least favorite chapter is bonds
> payable. It's my favorite one to teach. I'll show you why when we get there.
>
> Drop your email and I'll show you what else is on Exam 1. And if your chapter
> does academic support — tell your scholarship chair about this. I'll take it
> from there.

*Cut anything that makes you rush. The bonds line needs room to land.*

### Script 2 — Scholarship chair (~90 sec)

> Hey — you're probably here because someone in your chapter sent you this. Give
> me ninety seconds.
>
> I'm Lee. I've tutored over a thousand students in intro accounting since 2015.
> Ole Miss accounting degree, and I teach there now. Before this I ran a tutoring
> company — the pandemic ended that, so I rebuilt it as something that actually
> scales.
>
> Survive Accounting is short cram videos for intro accounting. Three to five
> minutes each, covering exactly what shows up on your exams. It's the class that
> wrecks GPAs, and it's the one I've spent a decade teaching.
>
> For chapters it's a hundred dollars a member, ten member minimum. Everyone gets
> the full semester — every exam, every video. Compare that to one tutor for one
> student for a few sessions.
>
> Setup takes about five minutes. You get a chapter page, your members claim
> access with a link, and I handle everything after that.
>
> If your chapter has a scholarship budget and members in accounting, this is one
> of the cleaner ways to spend it. Hit the button below and I'll walk you through
> it personally.

---

## The Sample Video — how tutors get hired

*2026-09-08. Lee, on the OBS wiring tool: "that was REALLY freaking cool
honestly. Great thing to share with tutors later."*

The hiring funnel for the next tutor is not a résumé. It is:

> Download OBS. I'll walk you through setup. Now try making a sample video.

Lee: *"SAMPLE VIDEO is the key for hiring tutors. Give them a nosedive into the
platform. If they love it, then they're in for an interview. Otherwise, don't
waste my time."*

Why it works: the thing that makes Survive hard to copy is the production line,
so the audition should be *using the production line*. Someone who enjoys the
tool will enjoy the job; someone who doesn't self-selects out before either party
spends an hour on a call. It also produces an artifact Lee can judge — their
teaching, in the house format, at the house length.

The same walkthrough doubles as onboarding for whoever passes. Build it once.

---

## Review Videos on Demand

*2026-09-08. Demand-led, so Lee doesn't build a library nobody asked for.*

**80% of the energy stays on cram videos.** Review videos — walking a specific
problem in depth — are made on request, first come, first served, weekly, with no
promised number.

**The ask, inside the cram videos.** Interspersed, in Lee's voice: *"Ask
questions. I'm not your professor. You're not gonna have to do it in front of a
room of two hundred people. And every question's a good question for me, because
a lot of times all you need is someone to break a misconception for you. You're
smart, you're studying, you get this stuff — but there's one misconception making
everything else not make sense. I love to answer those."*

**"Go deeper" is the link.** When a cram video runs out of time, it points
somewhere: *"if you wanna go deeper on any of these topics, hit this link."* Two
destinations, one slide:

- the **YouTube** cut carries a call to action to come to the site
- the **on-site** cut carries a baked-in link straight to the review video

If the review video doesn't exist yet, the link becomes the request form. The
publishing step should have a slot for these buttons per destination.

**THE ASK IS FREE.** Settled 2026-09-08 — this is the rule, not a starting
position. Requesting a video costs nothing and is never gated behind a price;
**money is only ever discussed privately, over email, after the request comes
in.** Lee: *"We take in the requests for free. FOR FREE. We only discuss price
privately over email. Love it love it love it."* A public price list on the
request form would suppress the exact signal the form exists to measure.

**What the private reply looks like.** Not a quote out of nowhere — an honest
estimate: I can make this, it'll take me about two hours, here's a link if you
want to make it happen. The request form still asks **cram style or long form**,
because the two cost very different amounts of Lee's time. His own framing: a
tutoring session is $180 for 90 minutes; a video that lives on the site forever
serves everyone, so it is worth less per hour to him — roughly **$50 for a
cram-style answer, ~$100–150 for long form**, paid only on delivery, with a
shareable link so several students can pitch in $20 each. *"I kinda like that
everything could be fifty bucks on this site."* And the promise is honest about
what gets made: *"I'm gonna teach you what you need to know to go get the answer
and understand it"* — never a copy of the exact question.

**Why it matters beyond the money:** a paid or crowdsourced request is the
strongest possible intent signal, and it is the natural moment to ask for a
syllabus. Demand tells Lee which syllabi to prioritise.

**Guardrails needed before filming these.** They are flow-state videos; they need
a short bullet list of rules so they stay on track.

---

## The September 15 Commitment

*2026-09-08.* More Exam 1 videos land by **September 15** — the same date the new
reps come on. Deliberately no number attached; the topics get laid out instead.
The reps' pitch and the students' expectation both point at that date.

---

## Marketing Video Production — the third line

*2026-09-08. Named, not yet built.*

Two production lines exist: **Blast Offs** (cram shorts, /v3) and **rep
onboarding** (the four steps). A third is needed for everything that sells rather
than teaches: the Greek chapter video, the scholarship chair video, the campus rep
pitch, a homepage video, and the "explain a Lee idea" video — the one that pitches
the request system itself.

**The line to keep, exactly:** *"I'm building the YouTube Shorts of exam prep."*
And the credibility line beside it: *"I've spent the past six months building a
production system to crank these out fast — I want to test its limits."*

The pitch video for the request system, in Lee's words: *"I want to try doing this
request system. You could be some of the first people to try it."* Plus the
expansion note — *"I'm expanding this to schools all over the country, starting
at the SEC"* — kept brief and unspecific, pointing at a page that shows Survive is
a platform, not one tutor. Several places on the site need to say that louder.

---

## Content Verticals

| Vertical | Audience | Purpose |
|---|---|---|
| **Cram shorts** | Students | The product. Revenue. |
| **Onboarding shorts** | Reps, chairs, IFC | Explain the role, put a face to the name |
| **Strategy shorts** | ENT students, hires, partners | Vision, behind-the-scenes, recruiting |

**Onboarding shorts (3 to start):**
1. What Survive is
2. What a rep actually does, week to week
3. How you get paid

Chairs get a shorter cut of #1.

**Strategy shorts — themes:**
- Building a national platform solo with AI
- No-code / Claude Code development
- Hiring and managing a distributed team
- Making genuinely good content in a narrow niche
- Why intro accounting matters more than people think

**Bank these before posting.** Accumulate, then decide. If accounting shorts
underperform over a real time horizon, strategy shorts become the traffic
strategy that drives people back to the site.

---

## The Rep Program

### Application flow
1. Student applies to express interest
2. Lee gets a text notification
3. Approve or deny

### Denial matters
Casual, warm, human. Application held for future semesters. Offer of resume
feedback if wanted. The denial is a brand moment — it raises the perceived bar
of the role and leaves a good taste.

### The bar is deliberately high
Easy-to-join is available later as a referral program. The rep role stays
selective so that reps take it seriously and the right person can go crush it
with everything already built for them.

### Teaching, not just commission
Reps get taught how to sell. This is a genuine passion, not a perk —
entrepreneurship and startup mechanics, taught through real work. The role
should feel like an education with a commission attached.

### Signals to reps
The app tells reps where to act: *"ATO at your campus just signed up 18 people —
check in with the scholarship chair. Here's what I'd suggest saying."* Reps
don't just connect; they close.

### Growth path
Do well at your campus and get plugged into nearby campuses. Target is 200+
campuses with Greek systems, large and small. All remote.

### First test
**Slater** (family friend, Mississippi State) — first rep, and the person to
build the MVP experience for. Her friend **Smith** at Alabama is the second.
Goal: Slater's reaction to the onboarding is *"holy shit."*

---

## The Scholarship Chair Pitch

Position as partnership, not vendor:

- *"I'm building the YouTube Shorts of exam prep."*
- *"I want you to be incredible at your job."*
- *"Help me understand what a chapter actually needs — which courses, what the
  experience should be for you as manager and for your members."*
- Build a real academic culture in the house by partnering with something built
  for this generation.
- Everyone knows how hard it is to pay attention in a long video. A two-minute
  short that gets you extra points is different.

Chairs get a short onboarding video too — quick, personal, face to the name.

---

## Longer-Horizon Ideas

*Not now. Revisit when there's national traction.*

- **Interview former professors** — starting with Dr. Davis (Ole Miss), the
  professor whose intro course Lee thrived in and whose story is worth telling
- **Dr. Wilder** (dean, accountancy) and **Dr. Gentry** (dean, business school) —
  conversations about their programs and the future of higher education
- **Tutor community** — Lee's edge is hanging out with tutors and teachers,
  vibing about great teaching in the subjects students panic about most.
  The AI assistant is a tool for teachers to mine their own experience; the
  community is the human version of that.
- **FSI testimonial** — exists, needs pulling out and using

---

## Why This Matters

For a lot of students, the intro accounting exam is the hardest thing they've
faced. College is otherwise an incredible experience, and this one course is
where it stops being fun. Ten years of tutoring, 1,000+ students. This product
can change how that goes for people.
