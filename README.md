# HS Peak Playbook

pGC week-over-week tracker for High School Peak. Live data comes from Looker look **26564** (HS Peak Playbook). Local `npm run dev` can fall back to a committed seed extract if Looker is not configured.

```bash
npm install
npm run dev
```

Open http://localhost:5173/. Local Vite does not require Google sign-in. The Netlify deploy does.

## Looker grain

One row per **Consultant** per **Sunday week**, pivoted by **Audience**:

| Field | Slice |
| --- | --- |
| HS-STEM CC90 / pGC / CC90 Mix | HS-STEM |
| K12 Test Prep CC90 / pGC / CC90 Mix | K12TP |
| **Total pGC** | **Supergroup** (volume-weighted HS + K12) |

The clone filters Looker **Rep Name** to the High School Peak list and does **not** filter Rep Manager, Work Group, or Super Group — those employee fields lag HR. K12 Test Prep is an Audience, not a work group. People on that list still appear if they have no HS/K12 volume yet.

There is no Overall. Total pGC is Supergroup.

The **WTD** week on the Playbook pager is day grain: Call Created At Date = this Sunday → today, same audience pivot, plus dashboard 7699 defaults (Business = International, VT Core; Expert Type ≠ Dropped Expert; Consultant cc90 = Yes). DoD is that day’s pGC minus the prior calendar day. Team blocks on WTD are WTD pGC, latest-day pGC, at target, improving DoD, and focus.

Team KPIs use CC90-weighted pGC so they match Looker rollups.

Ingest a new extract (can include several weeks):

```bash
python3 scripts/ingest-looker-playbook.py "/path/to/HS Peak Playbook.csv"
```

WTD uses the same look with Call Created At = this Sunday through today.

## Secrets (never commit)

Copy `.env.example` to `.env` locally. Put the same keys in **Netlify → Site configuration → Environment variables**. Do not put Looker credentials in the browser, in git, or in this README.

| Variable | Where | Purpose |
| --- | --- | --- |
| `LOOKER_BASE_URL` | Netlify + local `.env` | `https://varsitytutors.looker.com` |
| `LOOKER_CLIENT_ID` | Netlify + local `.env` | Looker API3 client |
| `LOOKER_CLIENT_SECRET` | Netlify + local `.env` | Looker API3 secret |
| `LOOKER_LOOK_ID` | Netlify + local `.env` | `26564` |
| `ALLOWED_EMAIL_DOMAINS` | Netlify + local `.env` | Function allowlist, default `varsitytutors.com` |
| `VITE_ALLOWED_EMAIL_DOMAINS` | Netlify (build) + local `.env` | Login-wall allowlist; must be present at **build** time |

If a Looker API3 secret was ever pasted into chat, rotate it in Looker and update Netlify / `.env`.

## Google SSO on Netlify

The login wall and the Looker function both require a Varsity Tutors Google account on the deployed site. Netlify Identity has to be turned on in the dashboard (this cannot be done from the repo):

1. Deploy the site (or connect the GitHub repo) so the Netlify site exists.
2. **Site configuration → Identity → Enable Identity**.
3. **Identity → Registration**: prefer **Invite only** so only people you invite can create an account.
4. **Identity → External providers → Google**: enable it. Netlify’s built-in Google app is enough; you do not need a custom Google Cloud OAuth client unless you want branded consent.
5. Invite `@varsitytutors.com` users (Identity → Users → Invite), or have them sign in with Google after you switch registration to Open *and* keep the domain allowlist.
6. Confirm env vars above are set, then trigger a redeploy so `VITE_ALLOWED_EMAIL_DOMAINS` is in the client bundle.

After that, opening the Netlify URL shows **Continue with Google**. Live Looker data is only returned if the request has a valid Identity JWT from that Google session. A client-only wall is not enough on its own; the function is the data perimeter.

Build: `npm run build`.

### Cross-workgroup comparison

The College → HS/K12 tab also supports HS → COL/GTP. Each comparison uses the latest employee-directory roster (`rownum = 1`), requires `is_termed = No`, and joins call data by manager ID. Before and After have independent inclusive Central dates, with a maximum of 366 days per range. The 7-day and 28-day presets use completed days; a range ending today is marked partial. Date/audience edits take effect with **Apply ranges**.

- **pGC:** `closed_client_count_this_call / cc90_count`.
- **ESCVR:** closed clients in the selected first-transfer / first-inbound cohort divided by `contact_count_first_transferred_or_inbound`. The numerator's prebuilt Looker field is currently a NULL placeholder. A query-local distinct-count measure reconstructs its documented rule: converted first transfer with no expert drop, or converted Single Consultant first inbound attempt. Later conversions update the first-connect cohort. This reconstruction is labeled in the report; full dashboard reconciliation remains pending.
- Qualifying short calls remain in the first-connect denominator. The CC90 measure applies its own eligibility filter. Both metrics use VT Core / International and exclude dropped experts.
- Overall, audience, rep, and daily groupings are queried separately. Period distinct counts are never made by summing daily distinct counts. Rep totals can exceed overall distinct totals when credit overlaps.
- Switch the table between pGC and ESCVR, then click any column header to sort. Unknown values stay last in either direction.
- Bottom quartile uses the selected metric, ranking period, and minimum denominator (20 by default). It selects the lowest `ceil(eligible reps / 4)`, including boundary ties. At least four reps must qualify. Search and the bottom-only filter do not change the ranking population. The displayed weighted quartile rate uses the sum of rep numerators divided by the sum of rep denominators.

Checks: `node --experimental-strip-types --test scripts/college.test.mjs` and `npm run build`.
