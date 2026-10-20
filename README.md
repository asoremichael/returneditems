# Returned Items App - Setup and Testing Guide

Engineers report spoilt items that were returned to the office, from their phone or laptop.
A supervisor reviews and signs each report, then the manager signs it.

| Who | Page | What they can do |
|---|---|---|
| Engineers | `/` | Fill in the form and submit (no login; they cannot read anything back) |
| Supervisor | `/supervisor` | Log in, see **all** reports and photos, sign with name + date |
| Manager | `/manager` | Log in, see only reports the supervisor has signed, sign with name + date |

```
public/        the three web pages (HTML + a little JavaScript)
api/           small server functions (submit, supervisor, manager)
supabase.sql   creates the database table and the private photo bucket (first-time setup)
supabase-update-trips.sql   one-time update for a database that was set up earlier: adds the "trip" column
```

---

## What you need first
- A free **GitHub** account (github.com)
- A free **Vercel** account (vercel.com) - sign up with "Continue with GitHub"
- A free **Supabase** account (supabase.com)
- **Git** installed on your computer (check by typing `git --version` in a terminal; get it from git-scm.com if missing)

Button names on these websites change now and then. If something is worded differently, look for the closest match.

---

## Step 1 - Set up the database (Supabase)

1. Log in to supabase.com and click **New project**. Give it a name (e.g. `returned-items`), set a database password (save it somewhere), pick the region closest to you, click **Create new project**. Wait 1-2 minutes.
2. In the left menu open **SQL Editor** -> **New query**.
3. Open the file `supabase.sql` from this project, copy everything, paste it into the editor, click **Run**. You should see "Success".
4. Check it worked:
   - **Table Editor** (left menu) should show a table called `reports` (empty).
   - **Storage** (left menu) should show a bucket called `report-images`, marked private.
5. Copy two values (you need them in Step 4):
   - **Project URL**: Project Settings -> **API** (or "Data API"). Looks like `https://abcdxyz.supabase.co`.
   - **Service key**: Project Settings -> **API Keys**. Copy the **service_role** key. If your dashboard shows a **secret** key (starts with `sb_secret_`) instead, copy that one - it works the same way.
   - Never share this key and never paste it into the web pages. It only goes into Vercel.

---

## Step 2 - Put the code on GitHub

1. Unzip the project and open a terminal inside the `returns-app` folder.
2. On github.com click **+** -> **New repository**. Name it `returned-items-app`, choose **Private**, do NOT tick "Add a README", click **Create repository**.
3. In the terminal run these commands one by one (replace `YOUR-USERNAME`):
   ```bash
   git init
   git add .
   git commit -m "First version"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/returned-items-app.git
   git push -u origin main
   ```
4. When asked to log in, follow the prompt (a browser window opens, or use a GitHub Personal Access Token as the password).
5. Refresh the repository page on github.com. You should see the folders `api` and `public` and the other files.
6. Check that **`.env` is NOT in the repository** (it is ignored on purpose; passwords must never be on GitHub).

---

## Step 3 - (Optional) Try it on your own computer first

Skip this if you want to go straight to the live site.

1. Install Node.js 20 or newer from nodejs.org.
2. In the project folder, create a file named `.env.local` with:
   ```
   SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   SUPABASE_SERVICE_KEY=your-service-key
   SUPERVISOR_PASSWORD=sup-test-123
   MANAGER_PASSWORD=mgr-test-123
   ```
3. Run:
   ```bash
   npm install
   npx vercel dev
   ```
   The first time, it asks you to log in to Vercel and link a project. Accept the defaults.
4. Open the address it prints (usually http://localhost:3000) and go to the testing checklist below.

---

## Step 4 - Put it online (Vercel)

1. Log in to vercel.com -> **Add New...** -> **Project**.
2. Find `returned-items-app` in the list and click **Import** (if it is missing, click "Adjust GitHub App Permissions" and allow access to that repository).
3. Leave "Framework Preset" as **Other**. Leave build settings empty.
4. Open **Environment Variables** and add these four (name on the left, value on the right):

   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | your Project URL from Step 1 |
   | `SUPABASE_SERVICE_KEY` | your service key from Step 1 |
   | `SUPERVISOR_PASSWORD` | a strong password for the supervisor |
   | `MANAGER_PASSWORD` | a different strong password for the manager |

5. Click **Deploy** and wait about a minute. Click the preview image or **Visit** to open your live site (address like `https://returned-items-app.vercel.app`).
6. From now on, every `git push` to GitHub updates the live site automatically.

---

## Step 5 - Test everything

Do these in order. Use your phone for tests 1-3 if you can, because that is how engineers will use it.

| # | What to do | What you should see |
|---|---|---|
| 1 | Open the main link. Submit a report: item "Router", quantity 2, site "Lekki", reason "Water damage", serial "SN123", add 1-2 photos. | Green message "Report submitted. Thank you!" and the form clears. |
| 2 | Submit with the **Item** field empty. | Browser asks you to fill the required field (nothing is sent). |
| 3 | Add 4 photos. | Only 3 are accepted; a message says the limit is 3. |
| 4 | Go to Supabase -> Table Editor -> `reports`. | Your report is there. Under Storage -> `report-images` the photos are there. |
| 5 | Open `/supervisor` and type a **wrong** password. | "Wrong password." |
| 6 | Log in with the supervisor password. | Your report shows as "Waiting for supervisor", with photos you can tap to enlarge. |
| 7 | Open `/manager` in a **different browser tab** and log in with the manager password. | "0 report(s) waiting". The report is **not** visible yet. |
| 8 | Try the **supervisor** password on the manager page. | "Wrong password." (and the same the other way round) |
| 9 | Back on the supervisor page, leave name empty and click **Sign and submit**. | "Please type your name." |
| 10 | Type a name, keep today's date, click **Sign and submit**. | Report moves to the "Signed" tab; badge says "Waiting for manager". |
| 11 | Refresh the manager page. | The report now appears, showing the supervisor's name and date. |
| 12 | Type the manager's name and date, click **Sign and submit**. | Badge becomes "Completed" with both signatures. |
| 13 | Check Table Editor again. | `supervisor_name`, `supervisor_date`, `manager_name`, `manager_date` are filled in. |
| 14 | Security check: visit `https://YOUR-SITE/api/supervisor` directly in the browser. | `{"error":"Wrong password"}` - no data is shown. |
| 15 | Security check: in Supabase Storage, try opening a photo's plain link (not a signed one). | It is refused (the bucket is private). |
| 16 | On the supervisor page, pick the current month in the month box and click **Download Excel**. | A file named like `returned-items-2026-10.xlsx` downloads. It opens in Excel with one row for every report of that month, including a **Status** column. |
| 17 | Submit two more reports (on different days, if you can change the date field), then download the same month again. | The new reports are in the same sheet. |
| 18 | Submit a report with a date in a different month (e.g. next month), then look at the month box. | That month now appears in the list, and its sheet contains only that report. |
| 19 | Choose a month with no reports and click **Download Excel**. | A message says there are no reports for that month. |

| 20 | On the engineers' form, click **+ Add another item** twice. Fill in three different items (different location, serial number and reason for each) and add photos to some. Submit. | Message "All 3 items were submitted". The form resets to one empty item. |
| 21 | On the supervisor page. | The 3 items appear together in ONE card headed "Trip: 3 items", each item with its own location, serial number, reason and photos. At the bottom there is one sign-off box with a button **Sign all 3 items**. |
| 22 | Add 3 items but switch your phone to airplane mode before pressing Submit. | A red message says it could not reach the server. Nothing is lost. Turn the internet back on, press Submit again, and the items go through. |
| 23 | On the supervisor page, type your name in the trip's box and click **Sign all 3 items**. | The trip moves to the **Signed** tab with the badge "Waiting for manager", and shows your name once. |
| 24 | On the manager page, open the **Waiting** tab. | The same trip appears, with **Sign all 3 items**. Reports the supervisor has not signed yet are not shown. |
| 25 | Type the manager's name and click **Sign all 3 items**. | The trip shows "Completed" with both signatures. In the Excel download, all 3 rows say Completed. |

If all 25 pass, the app is working.

## Reporting several items at once
The engineers' form lets an engineer add as many as 20 items in one go (button **+ Add another item**).

- Name and date are entered once at the top. Each item has its **own** item name, quantity, location (site),
  serial number, reason for return and up to 10 photos.
- Every item is saved as its **own report** (so the Excel sheet has one row per item), but all the items sent from the
  form in one go form a **trip**. The supervisor and manager see a trip as one card and sign the **whole trip with one
  button** ("Sign all 3 items"). A report sent on its own, or an old report from before trips existed, is
  shown and signed by itself, as before.
- If more items are added to a trip after it was signed (for example the rest were sent later after a failure),
  the card shows "Partly signed" and the button says "Sign all 2 items": it signs only the items that are still
  waiting. Earlier signatures are never changed.
- The form sends the items one by one ("Sending item 3 of 10..."). If something goes wrong part-way (for example
  the internet drops), the items already sent are saved and removed from the form, the rest stay on the screen,
  and pressing Submit again sends only the rest.
- Very rarely, if the internet drops at the exact moment the server is replying, an item can be saved even though
  the form did not hear about it, and sending it again creates a duplicate. If the supervisor sees a duplicate,
  it is harmless; just sign one of them or tell the admin.
- Photos are shrunk in the browser before sending. If an item has so many photos that they would be too big
  to send together, they are shrunk a little more automatically.

---

## Troubleshooting

- **Site shows 404 on the main page:** Vercel -> your project -> Settings -> Build & Development Settings -> set **Output Directory** to `public`, then redeploy.
- **"Could not save the report" / "Could not load reports":** the Supabase URL or key in Vercel is wrong or missing. Check Settings -> Environment Variables (no extra spaces), then **Deployments -> Redeploy**. Environment variable changes only apply to new deployments.
- **Still failing:** Vercel -> your project -> **Logs** shows the real error message.
- **Photos do not show for the supervisor:** make sure the bucket is named exactly `report-images`.
- **Login always says "Wrong password":** passwords are case-sensitive; if you just changed them in Vercel, redeploy.
- **Supabase project paused:** free projects pause after about a week of no use. Open the Supabase dashboard and click **Restore**.

## Separate addresses for each section
The project answers on three addresses (added in Vercel -> Settings -> Domains), and `vercel.json`
makes each one open only its own section:

| Address | Who uses it | What it opens |
|---|---|---|
| `returneditems.vercel.app` | Engineers | The report form. `/supervisor` and `/manager` send people back to the form. |
| `returns-supervisor.vercel.app` | Supervisor | The supervisor login. Anything else sends them to it. |
| `returns-manager-main.vercel.app` | Manager | The manager login. Anything else sends them to it. |

- This keeps things tidy, but the **passwords** are what protect the data, not the addresses.
- Any other address of this project (for example the original one Vercel created) still opens all three
  sections. You can leave it alone, or remove it in Settings -> Domains.
- If you add or rename a domain, update the host names in `vercel.json` to match.

## Monthly Excel sheets
Both the supervisor page and the manager page have a **month box** and a **Download Excel** button.

- One sheet = one month. It contains every report whose **date** (the date field on the form) falls in
  that month, from every engineer and every day, in the order they were reported.
- A **Status** column shows where each report is: *Waiting for supervisor*, *Waiting for manager* or *Completed*,
  together with the supervisor and manager names and dates once they have signed. Download again later and the
  sheet is up to date.
- A new month starts a new sheet automatically (nothing to reset). Old months are never deleted:
  every report stays in the database, so pick any earlier month in the box and download it again whenever you need it.
- The manager's sheet only contains reports the supervisor has already signed, because that is all the manager can see.
- The database is the master record; the Excel file is a copy made when you click. Photos stay in the app
  (they are not placed inside the spreadsheet; the sheet shows how many photos each report has).
- Tip: to keep a permanent copy of a finished month, download it at the start of the next month and save it in your
  company folder.
- Supabase's free plan has limited space (database 500 MB, file storage 1 GB at the time of writing). Photos use the most;
  check Supabase -> Storage now and then.

## Everyday use
- **Change a password:** Vercel -> Settings -> Environment Variables -> edit -> Redeploy.
- **Export the data:** Supabase -> Table Editor -> `reports` -> Export to CSV.
- **Change the form:** edit `public/index.html`, then `git add . && git commit -m "Update form" && git push`.
