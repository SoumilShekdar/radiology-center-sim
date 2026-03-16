# Radiology Department Simulator

This app is a radiology operations simulator built with Next.js, Prisma, and Prisma Postgres. It lets you define staffing, machine capacity, operating hours, demand weights, and service mix, then run seeded stochastic simulations over 1 day, 7 days, 30 days, or 365 days.

## Stack

- Next.js App Router
- TypeScript
- Prisma
- Prisma Postgres
- Vitest

## Running locally

1. Use the pinned Node version:

```bash
nvm use
```

2. Install dependencies:

```bash
npm install
```

3. Create your environment file:

```bash
cp .env.example .env
```

4. Set `DATABASE_URL` to your Prisma Postgres connection string.

5. Apply the schema:

```bash
npm run db:migrate
```

6. Start the app:

```bash
npm run dev
```

7. Useful checks:

```bash
npm run lint
npm test
npm run test:coverage
npm run build
```

CI runs the same verification steps on every push and pull request through GitHub Actions.

## Deployment on Vercel

The recommended deployment path is Prisma Postgres on Vercel.

1. Create a Prisma Postgres database in Vercel Storage.
2. Add the provided connection string as `DATABASE_URL` in your Vercel project.
3. Set the Vercel build command to:

```bash
npm run vercel-build
```

4. Deploy.

Notes:

- The repository includes `.env.example` for the required database variable.
- The home page is forced dynamic so the app can deploy even before the database is fully configured.
- If the app cannot reach the database yet, the home page will show a setup message instead of failing at build time.

## What the simulator models

Each scenario stores:

- Scenario metadata: name, description, currency, default seed, downtime rate
- Infrastructure: X-Ray, Portable X-Ray, CT, MRI, Ultrasound, procedure rooms, changing rooms
- Staff totals: technicians, support staff, radiologists
- Operating hours by day of week
- Hourly on-shift staffing coverage
- Demand profile:
  - base daily patients
  - hourly arrival weights
  - day-of-week demand multipliers
  - inpatient fraction
  - urgent fraction
  - no-show rate
  - unexpected leave rate
  - repeat scan rate
  - result communication time
- Service mix weights by modality
- Service configuration by modality:
  - charge
  - prep time
  - exam time
  - cleanup time
  - reporting time

## Core simulation flow

The simulator is implemented in [`./lib/simulator.ts`](./lib/simulator.ts).

Each patient moves through these stages:

1. Arrival
2. Registration with support staff
3. Prep
4. Exam
5. Reporting by radiologist
6. Result communication by support staff

The main outputs are:

- Wait to perform service
- Time from completed service to results
- Revenue outcomes

## How randomness works

The simulator is stochastic and seed-driven.

- Same scenario + same seed = same result
- Same scenario + different seed = different result

Randomness is used for:

- how many patients arrive each day
- how those arrivals distribute across hours
- whether a patient is inpatient or outpatient
- whether a patient is urgent
- which modality is requested
- outpatient no-shows
- repeat scans
- unexpected leaves

## Detailed rules

### 1. Daily demand is probabilistic

For each simulated day, the model samples total patients from a Poisson distribution with mean:

- `baseDailyPatients * dayOfWeekMultiplier[day]`

This means the day-of-week values are weights, not fixed patient counts.

### 2. Hourly arrivals are probabilistic

Within each day, the simulator samples hourly arrivals from the daily total using the configured hourly weights. Those weights are also not fixed counts.

### 3. Service mix is probabilistic

Each arriving patient gets a modality sampled from the configured service mix weights.

### 4. Outpatient no-shows are modeled

If a sampled patient is outpatient, they may be removed before arrival using the configured `noShowRate`.

### 5. Repeat scans are probabilistic

Some patients generate an additional follow-up demand event later the same day based on `repeatScanRate`.

### 6. Unexpected leaves are probabilistic

After registration is scheduled, patients can still drop out using `unexpectedLeaveRate`. These cases are tracked as deferred and their revenue is counted as lost due to unexpected leave.

### 7. Operating hours gate capacity

Staff, rooms, changing rooms, and machines only have capacity during enabled operating hours for that day of week.

Outside those hours, capacity is zero.

### 8. Staff rotation is hourly coverage

The scenario stores total team size plus hourly on-shift counts. In the engine, those are converted into hourly coverage fractions and then into actual slot-level capacities.

### 9. Downtime reduces effective machine count

Machine capacity is reduced by:

- `effective machines = round(machine count * (1 - downtimeRate))`

This is applied per modality during open hours.

### 10. Support staff handle registration and result communication

Every patient needs support staff capacity to:

- be acknowledged and routed at registration
- receive result communication after reporting

Prep also uses support staff.

### 11. Only CT requires changing rooms

Prep for CT consumes:

- support staff
- changing rooms

Other modalities use support staff for prep but do not consume changing room capacity.

### 12. Technicians do one scan at a time

Every exam requires one technician for the full exam plus cleanup duration. A technician cannot work two exams at once.

### 13. Portable X-Ray and standard X-Ray are related but not identical

- `PORTABLE_XRAY` requests require portable X-Ray machines
- `XRAY` requests can use either:
  - standard X-Ray machines
  - portable X-Ray machines

This captures the fallback behavior where portable units can still perform standard X-Rays.

### 14. Exams also require rooms

All exams consume:

- one procedure room
- one technician
- one machine resource

### 15. Inpatient and urgent patients get queue priority

Priority is higher for:

- urgent patients
- then inpatients
- then routine outpatients

That priority affects prep, exam, and reporting queue order.

### 16. Wait tolerance is probabilistic but capped

Each patient gets a patience deadline:

- minimum wait threshold starts after 15 minutes
- the exact deadline is randomized up to 2 hours total wait

If the exam cannot start before the patient’s patience deadline, the patient is lost due to wait.

### 17. Same-day exam completion is required for revenue

Each patient’s exam must finish before the end of the arrival day. If the scan cannot be completed by then, the patient is deferred and the revenue is lost.

### 18. Reporting time is modality-specific

Radiologist reporting uses the configured `reportingMinutes` for each modality. This makes CT, MRI, Ultrasound, X-Ray, and Portable X-Ray report queues behave differently.

### 19. Results communication happens after reporting

After the report is completed, the patient still needs support staff time for result communication. That duration is controlled by `resultCommunicationMinutes`.

### 20. Results must be available within 24 hours of arrival

If results are not communicated within 24 hours of the patient’s arrival, revenue is treated as lost because the patient would need to redo the study.

### 21. Maximum revenue is a machine-only ceiling

`Maximum Revenue` is not a full operational optimum. It is a machine-capacity ceiling based on:

- effective machine slots
- modality cycle time = exam time + cleanup time
- service charge

It does not separately optimize around staff, rooms, or changing rooms.

### 22. Possible revenue is demand-based

`Possible Revenue` is the sum of charges for all simulated demand events that were created for the run, before losses.

### 23. Actual revenue only counts completed patients

Revenue is counted only when:

- the exam completes in time
- the result is communicated in time
- the patient is not otherwise lost

### 24. Lost revenue is split by cause

The simulator separately tracks:

- lost due to wait
- lost due to result delay
- lost due to unexpected leave

The headline `Lost Revenue` metric is:

- `Possible Revenue - Actual Revenue`

## Reported metrics

The results pages and persisted run summaries include:

- possible revenue
- maximum revenue
- actual revenue
- lost revenue
- lost due to wait
- lost due to result delay
- lost due to unexpected leave
- completed patients
- deferred patients
- wait time p50, p90, p95
- result time p50, p90
- average waits
- average result times
- machine utilization
- technician utilization
- radiologist utilization
- room utilization
- changing room utilization
- modality throughput and revenue
- daily snapshots for charts

## Known simplifications

This is intentionally a planning simulator, not a clinical workflow engine.

Current simplifications include:

- all prep/report/communication durations are deterministic once configured
- downtime is modeled as reduced effective capacity, not explicit outage events
- all rooms are treated as pooled generic procedure rooms
- all radiologists are pooled together
- all technicians are pooled together
- patient transport, sedation, contrast, and modality subtypes are out of scope
- queue peak is tracked globally and reused in daily snapshots
- operating hours also gate reporting capacity

## Persistence

The app saves:

- scenarios
- simulation runs
- run-level summary metrics
- daily snapshots

Data is stored in PostgreSQL through Prisma.

## UI structure

- `/` home page with scenarios and recent runs
- `/scenarios/new` basic scenario setup
- `/scenarios/new/advanced` advanced configuration
- `/scenarios/[id]` saved scenario basic view
- `/scenarios/[id]/advanced` saved scenario advanced view
- `/runs/[id]` result details
- `/how-it-works` simulator documentation inside the app

## Seed behavior

The UI supports:

- `Run w/ Seed`
- `Run w/ Random Seed`

Every saved run stores the exact seed used, and the results page shows that seed so a run can be reproduced later.
