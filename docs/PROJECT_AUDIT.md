# Project review and redesign


## Analytical dashboard revision - November 2026

The UI now restores the detailed company-to-parent analytical workflow: a dashboard overview with a skill radar, chronological skill ratings, zone engagement, monthly activity, and behavioral scores; skill-level evidence tables and heatmaps; marked-test comparisons; activity pathways and mentor next steps; and a searchable project journal. Date and zone filters apply consistently across metrics, charts, and CSV export. Query-string student selection supports direct review links.

Company observers can save an optional marked test with a session, or record a test without inventing skill ratings. Test names, actual marks and maximum marks are preserved separately from rubric evidence. The API validates the score range and requires at least a skill observation or a test result. The family interface remains read-only; existing server-side parent assignments and write restrictions still apply.

Verification: nine Python tests and three JavaScript calculation/export tests pass. A real Chrome browser pass checked desktop and 390px mobile layouts, tabs, keyboard navigation, date/zone filtering, chart calculations against the backend, CSV downloads, journal search, and empty test states. A separate temporary database was used for a browser walkthrough of enrollment, test-only submission, and parent refresh. Screenshots are saved as `dashboard-desktop.png`, `dashboard-mobile.png`, and `dashboard-tests.png` in this directory. Earlier statements below about missing browser verification describe the previous version.

This is a custom web dashboard. Test comparisons group identical names and normalize marks to a percentage of the maximum, without claiming that test difficulty is calibrated. Cohort reporting and independently validated predictions remain outside the implemented scope.

## Scope and conclusion

Reviewed the original FastAPI service, both dashboard scripts and markup, dependency manifest and README. The original was a presentation prototype, not a reliable analytical system. The main risk was convincing output unsupported by recorded evidence. The redesign replaces its working UI and backend while preserving the original sources in `original-prototype.zip`. No existing database was present; no browser storage was migrated.

## Findings in the original

| Severity | Finding | User impact | Implemented response |
| --- | --- | --- | --- |
| Critical | Parent and observer use different localStorage keys; parent never fetches the API | Parent sees a different child history from the mentor | Both views use the same API and database |
| Critical | Observer mutates local state before save and reports success even on HTTP failure | Lost assessments appear successfully published | Save feedback follows the server response; failed forms remain available |
| Critical | Random telemetry mutates student scores | Progress changes without learning evidence | Removed simulated live packets |
| Critical | Training epochs, accuracy, F1 and retraining results are hardcoded or random | Families mistake animation for validated AI | Removed training simulation and accuracy claims |
| High | Unauthenticated endpoints expose every student and allow writes; wildcard credentialed CORS | No meaningful access boundary | Optional server-configured role and student-scoped keys; production mode requires configuration; same-origin requests |
| High | In-memory dictionary is the database | Restart loses all new records | SQLite persistence with transactions and foreign keys |
| High | Near-perfect seeded vectors and 60% floor in career scoring; three different algorithms | High affinity is effectively guaranteed and inconsistent | No synthetic priors; one backend model; exploratory pathways with evidence gates |
| High | API discards raw rubric and observed session date | Results cannot be reconstructed or chronologically reviewed | Preserve raw scores, session date, server timestamp and observer identity |
| High | Parent can enter mentor assessments directly | Unclear workflow ownership | Family UI is read-only; backend enforces observer write role when keys are configured |
| High | Free text interpolated into innerHTML | Stored script/markup injection | Escape all user-entered content before rendering |
| High | Lists validated only by length; age, duration, NaN, score ranges unconstrained | Impossible records distort analytics | Strict typed validation, finite numeric values, bounded fields and known zones |
| Medium | Hours computed as sessions times three; observer rounds hours to session counts | Incorrect attendance | Count records; sum actual hours independently |
| Medium | Duplicate requests increment scores and attendance twice | Inflated progress after retry | Unique request IDs, transactional replay and conflict detection |
| Medium | Observer behavior inputs not included in save | Report ignores the assessment | Behavior inputs stored and shown in journal |
| Medium | Enrollment creates assumed high performance and fake baseline session | New student looks assessed immediately | Empty baseline until observed |
| Medium | Random certificate IDs and abbreviated hashes presented as verification | Unsubstantiated credentials and IP claims | Project evidence journal; no issuance or verification claim |
| Medium | Hardcoded localhost API origin and CDN frontend dependencies | Hosting mismatch and network-dependent presentation | Relative API routes and local CSS/JS |
| Medium | Historical growth arrays updated by arbitrary increments | Misleading improvement chart | Per-skill chronological trend from saved ratings |

## Real-world use and design decisions

**Parent or guardian:** Before a mentor meeting, check completed attendance, which skills have repeated evidence, what the student actually built and what support to provide next. Read the latest mentor action, avoid treating an unobserved skill as a weakness, print the report for discussion. Families cannot submit scores in the new interface.

**Student:** Review the project journal with a parent or mentor, identify an activity to try next and discuss feedback. The present version shares the family view; it does not implement independent student accounts, self-reflection or uploads.

**Mentor / lab observer:** After a session, select the learner, actual date and duration, capture a learning intention, score only demonstrated skills, describe evidence and choose a next action. Optional behavioral observations and SDG tags are recorded. The family can refresh its dashboard after the save. No polling or automatic push synchronization is claimed.

**Programme coordinator:** Inspect individual zone exposure and repeated-skill coverage to identify assessment gaps. Cohort reporting, attendance scheduling, follow-up ownership and cross-mentor calibration remain future work; the current UI does not pretend to supply them.

These workflows support formative assessment and actionable feedback. EEF guidance recommends using assessment to identify learning gaps and directing feedback toward next learning steps: https://educationendowmentfoundation.org.uk/education-evidence/guidance-reports/feedback . This evidence supports the workflow, not the specific scoring algorithm or any claimed predictive accuracy.

## Analytical model specification

For skill j and observed rating x at age d days, weight w = 2^(-d/90). Score = sum(w*x)/sum(w), calculated only over non-null ratings. A zero is a recorded non-demonstration; null means not assessed. Duration does not increase score weight, so a longer session does not automatically count as stronger assessment evidence. Recalculation includes backdated records sorted by session date, creation time and ID.

The API also returns weighted score spread and effective sample size, (sum w)^2 / sum(w^2). These are descriptive diagnostics, not confidence intervals: correlated observations and rater effects violate assumptions required for straightforward statistical inference. The family UI uses understandable counts instead.

Trend = average of latest three observed ratings minus average of the preceding three, per skill. Fewer than six ratings yield no trend. The displayed note warns that changes in task difficulty and observer may affect comparisons. Dates and raw ratings are available in the journal.

Pathway alignment is the equal-weight mean of relevant skill scores; three ratings in every relevant skill are required. The curated mappings and threshold are design heuristics, not learned parameters. Ties sort by title. Pathways are deliberately named as broad interests and accompanied by activities. There are no career probabilities, diagnoses, cohort percentiles, intelligence labels or predictive accuracy claims.

Limitations: the 90-day half-life is not calibrated; old evidence remains in the model and uniform aging alone does not lower a score. Last-observed dates are shown. Ratings are not adjusted for age, task difficulty or observer bias. Three ratings do not establish reliability. The original programme taxonomy is retained for continuity and has not been independently validated.

## Data and access design

Students and observations are persisted separately; a student foreign key prevents orphan records. Observations are immutable through the exposed API. This makes reconstruction straightforward but requires a future superseding-correction workflow for genuine assessment errors. Personal details and observations are currently JSON records in SQLite, not a full institutional student information system.

Authentication uses externally configured opaque bearer keys. Parent records are scoped on every student endpoint. Observer keys have access to the full local roster. No keys means explicit local development mode. No real records should be entered in that mode. This scope is suited to a local pilot; production needs managed identities, organization-level boundaries, TLS, backup/restore drills and retention/deletion workflows.

## Verification and remaining validation

Automated tests cover empty baselines, durable writes across database initialization, real duration totals, null skills, concurrent retry idempotency, conflicting replays, invalid values, future dates, backdated trends, pathway evidence gates, duplicate enrollment, missing records and parent authorization. JavaScript syntax is checked with Node. Browser layout, keyboard operation and end-to-end form interaction still need an actual browser pass; no browser automation package was available in the environment.

Before training a predictive model: define the actual outcome (for example, independently demonstrated skill at a later assessment), gather consented longitudinal rubric data, have multiple mentors score a common sample and measure agreement, standardize task difficulty and scoring anchors, then evaluate simple baselines using student-separated and time-separated holdouts. Compare errors by age group, zone and observer; quantify calibration and uncertainty. Only promote a learned model if it improves a decision over this transparent baseline. No accuracy target can be honestly guaranteed from the supplied prototype data.

Recommended pilot acceptance: observe a sample student in one dashboard, verify the same dated feedback and exact hours in the other, restart the service and verify persistence, interrupt a save and retry the same request, verify a parent cannot access another student, and have mentors review whether the suggested next actions are useful. Conduct these with sample data first.
