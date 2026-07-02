# SEC Active-Roster — DRY RUN (no writes yet)

Source: `data/sec_faculty_batch1.csv` · 544 usable rows · 32 distinct schools.
**Nothing has been written to campuses or campus_lead_suggestions.** Migration 0045 (additive columns) IS applied.

## MATCHED CAMPUSES (29)

CSV school → campuses.id → campuses.name

- University of Mississippi → `7b92a320-b196-43f2-a241-77a0805816fe` → University of Mississippi
- University of Arkansas → `e631c8de-37a3-4aae-a948-a64bd20ea4c5` → University of Arkansas
- Louisiana State University → `698dd98f-dd92-46c1-8f28-e930568cb15d` → Louisiana State University
- Mississippi State University → `95246fc8-1ce6-409e-b454-d03c82766719` → Mississippi State University
- University of Alabama → `b3af67c6-99a5-4677-83d5-aa7d11a89c17` → University of Alabama
- Vanderbilt University → `972451c3-bc5e-48d7-9f88-868a55378efa` → Vanderbilt University
- University of Tennessee, Knoxville → `9c4775be-7d82-4a3e-840c-349c5e15d8e8` → University of Tennessee, Knoxville
- University of Georgia → `3f570e37-5394-4058-baab-508948befedb` → University of Georgia
- University of Florida → `4c5126b1-3fe0-48fe-a1db-1e41d06e4642` → University of Florida
- University of South Carolina → `5f5bd18d-b92f-4d56-aced-23bce4c983d5` → University of South Carolina
- University of Kentucky → `ae339230-577e-4569-a7d1-d1e45d1cfe91` → University of Kentucky
- Texas A&M University → `92e4a5d9-eeb3-4065-ac8a-5a4390fbc584` → Texas A&M University
- University of Missouri → `f16686c2-edc6-43f8-9638-6890f52c829a` → University of Missouri
- University of Oklahoma → `91e62f9c-43b0-41f3-a84d-002824754da6` → University of Oklahoma
- University of Texas at Austin → `faad6039-be72-4f5c-8ad5-ca7b95e2889f` → University of Texas at Austin
- University of Southern Mississippi → `2dedca50-1bac-4bb5-9820-9aa41c1617fb` → University of Southern Mississippi
- University of Memphis → `fcff0e7b-1366-4dec-ad3b-0e2b82361b10` → University of Memphis
- University of South Alabama → `19cec263-576b-4358-a420-390ac8264399` → University of South Alabama
- Troy University → `4d5deb87-3fe2-4437-9c93-4830ca167366` → Troy University
- Samford University → `3d119fd6-9b90-4969-9c6f-65d34faad03f` → Samford University
- University of North Alabama → `d37a8470-046b-439a-9185-53b027865f35` → University of North Alabama
- Belmont University → `ed9776cb-5afc-42f5-8dd3-e246cf6334f7` → Belmont University
- Lipscomb University → `d96605dc-58bc-4e44-acd4-1fa9f666d1cc` → Lipscomb University
- Arkansas State University → `78604ee3-811c-4b88-8bdd-3f198fa7df10` → Arkansas State University
- University of Louisiana at Lafayette → `24265ab0-ff8f-4428-8bd9-7a60ba5a39c2` → University of Louisiana at Lafayette
- Louisiana Tech University → `dd5430a5-c829-494a-b772-0c413e4d9f51` → Louisiana Tech University
- Kennesaw State University → `3888d1aa-8bf8-4ca7-9b42-6e1528b5972f` → Kennesaw State University
- Florida State University → `63662ceb-5770-4dad-8c3f-0021f3924b98` → Florida State University
- Georgia State University → `fea35ec6-5a55-4e27-9fe0-021c0a583253` → Georgia State University

## UNMATCHED CAMPUSES (3) — need your call (no campus will be created)

- **University of Alabama at Birmingham**
    best guesses: Uof Alabama at Birmingham (a348048e-fc82-46b7-a488-22b20e51e009) · University of North Alabama (d37a8470-046b-439a-9185-53b027865f35) · Uof Alabama in Huntsville (7a5d59b8-53d3-47a6-983c-c3009234af1a) · Alabama A&M University (695149ba-2389-45e3-8164-f29a9f46de55)
- **University of Central Arkansas**
    best guesses: Univ of Central Arkansas (964be11f-f306-4df2-9671-835a053ace33) · Arkansas Tech University (963c6010-45d8-4773-8e03-ea282d7124aa) · Arkansas State University State (eb4a7667-96ea-4e54-a592-0c3d516926f2) · Central Michigan University Mt. (706dd741-cfb2-4ca6-bd3c-897471067515)
- **University of Louisiana Monroe**
    best guesses: Univ of Louisiana at Monroe (e10d4e7f-f243-4713-b21c-b4ac88b69205) · Louisiana St in Shreveport (9c52dc54-5fa9-41cf-8526-50501e74df46) · Southeastern Louisiana Univ (0b199f76-27de-48df-8995-829dd9b4269d) · Louisiana Tech University (dd5430a5-c829-494a-b772-0c413e4d9f51)

## NEW PROFESSORS TO CREATE — 184 total

- Texas A&M University: 52
- Kennesaw State University: 35
- University of Florida: 17
- University of Memphis: 16
- University of Louisiana at Lafayette: 10
- Louisiana Tech University: 10
- University of South Carolina: 9
- Samford University: 8
- University of Missouri: 7
- University of Alabama: 6
- University of Texas at Austin: 4
- University of Oklahoma: 3
- Belmont University: 3
- Troy University: 2
- Vanderbilt University: 1
- Lipscomb University: 1

## EXISTING PROFESSORS TO MERGE — 319 total

- University of Georgia: 37
- University of Mississippi: 30
- University of Arkansas: 28
- University of Oklahoma: 22
- University of Tennessee, Knoxville: 21
- University of Kentucky: 21
- Florida State University: 20
- University of Alabama: 18
- University of South Carolina: 18
- Louisiana State University: 17
- University of Southern Mississippi: 13
- University of Missouri: 11
- Arkansas State University: 9
- University of South Alabama: 8
- University of Florida: 7
- Troy University: 7
- Vanderbilt University: 6
- University of Texas at Austin: 6
- Mississippi State University: 5
- University of North Alabama: 4
- Georgia State University: 4
- Belmont University: 3
- Texas A&M University: 2
- Lipscomb University: 2

## EMAIL CONFLICTS (4) — default resolution: CSV wins

- Bryan Cataldi @ University of Tennessee, Knoxville: existing=bcataldi@utk.edu vs csv=bcataldi001@gmail.com
- Anita Hollander @ University of Tennessee, Knoxville: existing=ahollan5@utk.edu vs csv=ahollan5@tennessee.edu
- Linda Myers @ University of Tennessee, Knoxville: existing=lmyers16@utk.edu vs csv=lmyers16@tennessee.edu
- Scott Jackson @ University of South Carolina: existing=n@moore.sc.edu vs csv=scott.jackson@moore.sc.edu

## CSV ROWS WITH NO EMAIL (0) — still importable (name is valuable), flagged

(none)

## NON-FACULTY CONTACT TYPES (19) — staff/advisors/admin; you may want to exclude these from the student picker

- Jaemin Kwon — Graduate Assistant / Accounting Research @ University of Florida
- Yi Chen — Graduate Assistant / Accounting Research @ University of Florida
- Eashwar Nagaraj — Graduate Assistant / Accounting Research @ University of Florida
- Brandon Case — Academic Advisor @ University of Florida
- Danielle Katelyn Shu — Undergraduate Advising Coordinator @ University of Florida
- Tara Blasor — Assistant Department Head @ Texas A&M University
- Taylor Haynes — MS Accounting Program Manager @ Texas A&M University
- Sean McGuire — Department Head @ Texas A&M University
- Valeria Ortegon — Program Manager @ Texas A&M University
- Maria Ponce — Program Manager @ Texas A&M University
- Jan Nelson — Administrative Staff @ University of Oklahoma
- Katy Gordon — Program Coordinator @ Troy University
- Patrice Donnelly — Administrative Staff @ Samford University
- Juliana Alcantara — Administrative Staff @ Arkansas State University
- Mary Baudoin — Administrative Staff @ University of Louisiana at Lafayette
- Samantha Burke — Operations / Staff @ Kennesaw State University
- Alexander Goble — Program Manager @ Kennesaw State University
- Cynthia True — Graduate Programs @ Kennesaw State University
- Amanda York — Strategic Partnerships @ Kennesaw State University

## DUPLICATE CSV ROWS SKIPPED (0)

(none)

## NOTES
- `campus_lead_suggestions` has no `phone`/`office` columns — only `department` (from "Department / Unit") will be stored; phone/office would go to `notes` or be dropped. Confirm preference.
- Name is one CSV field; split heuristic = last token is surname, remainder is first name. Suffixes / multi-word surnames may split imperfectly (email match is primary).
- Non-faculty rows are INCLUDED in the counts above; say if you want them excluded before Step 3.
