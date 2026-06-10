# Survive Accounting V3 Context

## Mission

SurviveAccounting.com helps college accounting students pass introductory and intermediate accounting exams through simple, practical, confidence-building exam prep.

The V3 app is a focused rebuild from scratch.

The goal is not to copy the old app.

The goal is to preserve only the useful parts and rebuild the product around a cleaner long-term architecture.

## V3 Core Pillars

The V3 app has three core pillars:

1. Public tutoring/sales homepage

2. Outreach dashboard for campus lead generation

3. CEQ content engine for accounting exam prep content

## Core Routes

Build around these routes:

- `/`

- `/outreach`

- `/ceq`

- `/ceq/create`

- `/ceq/:id/edit`

- `/ceq/:id/tutor`

Additional CEQ-related routes are acceptable if needed.

Avoid rebuilding unrelated old app pages.

## Pages To Preserve From Old App

Only these old app areas matter:

### 1. `/`

Public homepage / tutoring sales page.

Preserve:

- Brand style

- Hero section feel

- Lee profile element

- Tutoring CTA

- Review/credibility elements if present

- Clean, simple explanation of what Survive Accounting does

### 2. `/outreach`

Outreach dashboard for campus lead generation.

Preserve if working:

- Campus table/data structure

- Campus filters

- Tuition/student fields

- Assignment/review workflow

- Import leads workflow

- Export CSV workflow

- Email queue concepts

- Campus review process

### 3. `/CEQ` and `/CEQ/*`

CEQ content creation / teaching asset system.

Preserve:

- Useful CEQ-related routes

- Teaching assets data

- School/course/chapter relationships if tied to CEQ

- Existing useful CEQ UI ideas

- Any working study tools connected to CEQ

Everything else in the old app can be ignored unless it directly supports these pages.

## Old Repo vs New Repo

Old repo:

- Reference only

- Audit useful patterns/data

- Do not copy wholesale

- Do not inherit experimental architecture unless clearly useful

New repo:

- Build target

- Clean V3 architecture

- Simple, maintainable, focused

## Long-Term Product Vision

Survive Accounting should become a concept-tagged accounting learning platform.

The long-term goal is not to manually recreate content for every campus or textbook.

Instead:

- Accounting concepts are universal.

- Textbook chapters are not universal.

- Campuses, professors, syllabi, and textbooks organize the same accounting concepts in different sequences.

Eventually, students should be able to upload a syllabus and have the app extract:

- Course code

- Course title

- Professor

- Textbook

- Chapter schedule

- Exam dates

- Relevant learning path

Then the system should map Survive Accounting's existing CEQs and teaching blocks to that student's actual chapter schedule.

## Important Architecture Principle

Do not treat textbook chapter as the primary source of truth.

Preferred model:

Concept → CEQ → Textbook Chapter Mapping → Campus/Course/Syllabus Learning Path

Avoid relying only on:

Course → Chapter → Question

Chapter organization is useful for the student interface, but concept tagging should be the long-term foundation.

## CEQ System Vision

CEQs are the core content asset.

Each CEQ should eventually support:

- Question type

- Course type

- Primary concept

- Secondary concepts

- Difficulty

- Source textbook reference

- Original chapter/source

- Learning objective

- Explanation

- Student-facing tutor mode

- Optional journal entry block

- Optional T-account block

- Optional formula block

- Optional duplicate/clone functionality

The CEQ authoring tool should help Lee create content quickly.

The tutor mode should help students understand questions step-by-step.

## Future Systems

Future systems may include:

- Homework AI

- Journal Entry Builder

- T Account Builder

- Chapter organization

- Campus organization

- Greek organization portal

- Membership system

- Tutoring system

- Study Console

- Syllabus upload and learning path builder

Do not build all of these immediately.

Use the long-term vision to make better architecture decisions now.

## Textbook Mapping Vision

The same accounting concept may appear in different chapters across textbooks.

Example:

- Adjusting Entries might be Chapter 3 in one textbook

- Chapter 4 in another textbook

- Chapter 5 in another textbook

Therefore, CEQs should be tagged by concept first.

Later, textbook chapter maps can connect concepts to:

- McGraw-Hill

- Pearson

- Cengage

- Wiley

- Kieso

- Spiceland

- Other textbooks

## Campus Expansion Vision

The first 170 campuses can be researched manually over time.

Do not overbuild lead generation automation yet.

Future automation may help with:

- Course codes

- Course titles

- Professor emails

- Faculty pages

- Syllabus discovery

- Textbook identification

But the more important long-term automation is syllabus-driven content organization.

## Current Development Priority

Prioritize the content engine before growth automation.

Recommended build order:

1. Clean V3 shell

2. Homepage

3. Outreach dashboard shell

4. CEQ dashboard shell

5. Teaching assets migration

6. CEQ creation mode

7. Duplicate CEQ feature

8. CEQ tutor mode

9. Concept tagging

10. Journal entry block support

11. T-account block support

12. Study Console

13. Textbook/chapter mapping

14. Syllabus upload

15. Homework AI

16. Greek portal / memberships

## Engineering Rules

- Prefer simple, maintainable code.

- Do not add unnecessary features.

- Do not recreate old app bloat.

- Do not copy experimental code unless it clearly supports V3.

- Preserve useful data and teaching assets.

- Separate admin/content creation tools from student-facing tools.

- Favor reusable components.

- Keep routes clean.

- Explain database/schema changes before making them.

- Do not assume live Supabase access is available.

- Infer database structure from repository files, migrations, generated types, and Supabase client usage.

- Flag uncertainty instead of guessing.

- Before editing code, provide a plan.

- After editing code, provide a plain-English summary and testing checklist.

## First Claude Code Task

Before writing code, study the old repo and this context file.

Audit only:

- `/`

- `/outreach`

- `/CEQ`

- `/CEQ/*`

For each, identify:

- routes

- components

- database tables

- Supabase queries

- important files

- reusable UI

- data that must be migrated

- data that can be ignored

Do not write code until Lee approves a specific implementation step.

## Second Claude Code Task

After the audit, build the new app in the V3 repo only.

Use the old repo only as reference.

Start by creating:

- clean routing

- homepage

- outreach shell

- CEQ shell

- shared layout

- brand styling

Do not migrate database/data yet.

Do not build advanced CEQ logic yet.
