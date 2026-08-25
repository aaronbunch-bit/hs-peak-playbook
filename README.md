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

The clone also filters Looker **Work Group = High School** (dashboard 7699’s Work Group field). K12 Test Prep is an Audience, not a work group.

There is no Overall. Total pGC is Supergroup.

The **WTD** tab is day grain: Call Created At Date = this Sunday → today, same audience pivot, same High School work-group filter, plus dashboard 7699 defaults (Business = International, VT Core; Expert Type ≠ Dropped Expert; Consultant cc90 = Yes). DoD is that day’s pGC minus the prior calendar day.

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
