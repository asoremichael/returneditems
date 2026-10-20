// Used by both the supervisor page and the manager page.
// The page says which role it is with <body data-role="supervisor"> (or "manager").

const role = document.body.dataset.role;
const $ = (id) => document.getElementById(id);

let password = sessionStorage.getItem("pw-" + role) || "";
let reports = [];
let filter = "waiting"; // waiting | done | all

// Stops report text from being treated as HTML
function esc(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function todayLocal() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

async function api(method, body) {
  const res = await fetch("/api/" + role, {
    method,
    headers: { "Content-Type": "application/json", "X-Password": password },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Something went wrong");
    err.status = res.status;
    throw err;
  }
  return data;
}

// ---------- Login ----------
$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  password = $("password").value;
  $("login-error").textContent = "";
  try {
    await loadReports();
    sessionStorage.setItem("pw-" + role, password);
  } catch (err) {
    $("login-error").textContent = err.status === 401 ? "Wrong password." : err.message;
  }
});

$("logout").addEventListener("click", () => {
  sessionStorage.removeItem("pw-" + role);
  location.reload();
});

// ---------- Loading and showing reports ----------
async function loadReports() {
  reports = await api("GET");
  fillMonths();
  $("login").hidden = true;
  $("main").hidden = false;
  render();
}

function isDone(r) { return !!(r.supervisor_name && r.manager_name); }

function waitingForMe(r) {
  return role === "supervisor" ? !r.supervisor_name : r.supervisor_name && !r.manager_name;
}

function badge(r) {
  if (isDone(r)) return '<span class="badge done">Completed</span>';
  if (!r.supervisor_name) return '<span class="badge wait-sup">Waiting for supervisor</span>';
  return '<span class="badge wait-mgr">Waiting for manager</span>';
}

function signedLine(label, name, date) {
  return name ? `<div class="signed">✔ ${label}: <b>${esc(name)}</b> on ${esc(date)}</div>` : "";
}

// The sign-off form. For one report: signBox({ id }). For a whole trip: signBox({ batch, count }).
function signBox(opts) {
  const trip = !!opts.batch;
  const who = role === "supervisor" ? "Supervisor" : "Manager";
  const title = trip ? `${who} sign-off for all ${opts.count} items` : `${who} sign-off`;
  const target = trip ? `data-batch="${esc(opts.batch)}"` : `data-id="${esc(opts.id)}"`;
  return `
    <div class="signbox" ${target}>
      <label>${title} - your name</label>
      <input class="sign-name" maxlength="100" />
      <label>Date</label>
      <input class="sign-date" type="date" value="${todayLocal()}" />
      <button class="full sign-btn" type="button">${trip ? `Sign all ${opts.count} items` : "Sign and submit"}</button>
      <div class="message sign-msg"></div>
    </div>`;
}

function photosHtml(r) {
  const photos = (r.photo_urls || [])
    .map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="Photo" loading="lazy"></a>`)
    .join("");
  return photos ? `<div class="photos">${photos}</div>` : "";
}

// A report on its own (not part of a trip)
function renderReport(r) {
  return `
    <div class="card report">
      ${badge(r)}
      <h3>${esc(r.item)} &times; ${esc(r.quantity)}</h3>
      <dl>
        <dt>Site</dt><dd>${esc(r.site)}</dd>
        <dt>Date</dt><dd>${esc(r.return_date)}</dd>
        <dt>Serial number</dt><dd>${esc(r.serial_number) || "-"}</dd>
        <dt>Reason</dt><dd>${esc(r.reason)}</dd>
        <dt>Reported by</dt><dd>${esc(r.engineer_name) || "-"}</dd>
      </dl>
      ${photosHtml(r)}
      ${signedLine("Supervisor", r.supervisor_name, r.supervisor_date)}
      ${signedLine("Manager", r.manager_name, r.manager_date)}
      ${waitingForMe(r) ? signBox({ id: r.id }) : ""}
    </div>`;
}

// ---------- Trips: items sent together from one form are shown together and signed together ----------
function buildGroups() {
  const map = new Map();
  for (const r of reports) { // newest first, as the server sends them
    const key = r.batch_id || "single-" + r.id;
    if (!map.has(key)) map.set(key, { batch_id: r.batch_id || null, items: [] });
    map.get(key).items.push(r);
  }
  const groups = [...map.values()];
  groups.forEach((g) => g.items.sort((a, b) => a.id - b.id)); // items in the order they were entered
  return groups;
}

// If every item in the trip was signed by the same person on the same date, show that once
function uniformSignature(items, who) {
  const first = items[0];
  if (!first[who + "_name"]) return null;
  const same = items.every((r) =>
    r[who + "_name"] === first[who + "_name"] && r[who + "_date"] === first[who + "_date"]);
  return same ? first : null;
}

function renderTripItem(r, showBadge, hideSupervisor, hideManager) {
  return `
    <div class="trip-item">
      ${showBadge ? badge(r) : ""}
      <h4>${esc(r.item)} &times; ${esc(r.quantity)}</h4>
      <dl>
        <dt>Site</dt><dd>${esc(r.site)}</dd>
        <dt>Serial number</dt><dd>${esc(r.serial_number) || "-"}</dd>
        <dt>Reason</dt><dd>${esc(r.reason)}</dd>
      </dl>
      ${photosHtml(r)}
      ${hideSupervisor ? "" : signedLine("Supervisor", r.supervisor_name, r.supervisor_date)}
      ${hideManager ? "" : signedLine("Manager", r.manager_name, r.manager_date)}
    </div>`;
}

function renderTrip(g) {
  const items = g.items;
  const by = items.map((r) => r.engineer_name).find(Boolean) || "-";
  const dates = [...new Set(items.map((r) => r.return_date))];
  const dateText = dates.length === 1 ? dates[0] : "various dates";
  const supervisor = uniformSignature(items, "supervisor");
  const manager = uniformSignature(items, "manager");
  const mixed = new Set(items.map(statusOf)).size > 1; // some items are further along than others
  const waiting = items.filter(waitingForMe);

  return `
    <div class="card trip">
      <div class="trip-head">
        <div>
          <h3>Trip: ${items.length} items</h3>
          <div class="trip-sub">Reported by ${esc(by)} &middot; ${esc(dateText)}</div>
        </div>
        ${mixed ? '<span class="badge partly">Partly signed</span>' : badge(items[0])}
      </div>
      ${items.map((r) => renderTripItem(r, mixed, !!supervisor, !!manager)).join("")}
      ${supervisor ? signedLine("Supervisor", supervisor.supervisor_name, supervisor.supervisor_date) : ""}
      ${manager ? signedLine("Manager", manager.manager_name, manager.manager_date) : ""}
      ${waiting.length ? signBox({ batch: g.batch_id, count: waiting.length }) : ""}
    </div>`;
}

function render() {
  const groups = buildGroups().filter((g) => {
    const waiting = g.items.some(waitingForMe);
    if (filter === "waiting") return waiting;
    if (filter === "done") return !waiting;
    return true;
  });
  const waitingCount = reports.filter(waitingForMe).length;

  document.querySelectorAll(".tabs button").forEach((b) => {
    b.classList.toggle("active", b.dataset.filter === filter);
  });
  $("waiting-count").textContent = waitingCount;

  $("list").innerHTML = groups.length
    ? groups.map((g) => (g.items.length > 1 ? renderTrip(g) : renderReport(g.items[0]))).join("")
    : '<div class="card">Nothing here.</div>';
}

document.querySelectorAll(".tabs button").forEach((b) => {
  b.addEventListener("click", () => { filter = b.dataset.filter; render(); });
});

// ---------- Monthly Excel sheet ----------
// Every report is kept in the database for good. A month's sheet is simply all the
// reports whose date falls in that month, so each new month starts a fresh sheet
// automatically, and older months can be downloaded again at any time.
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

function monthOf(r) { return String(r.return_date || "").slice(0, 7); } // e.g. "2026-10"

function monthLabel(ym) {
  const [year, month] = ym.split("-");
  return `${MONTH_NAMES[Number(month) - 1]} ${year}`;
}

function statusOf(r) {
  if (isDone(r)) return "Completed";
  if (!r.supervisor_name) return "Waiting for supervisor";
  return "Waiting for manager";
}

// Fill the month drop-down: every month that has reports, plus the current month
function fillMonths() {
  const select = $("month-select");
  const previous = select.value;
  const current = todayLocal().slice(0, 7);
  const months = new Set(reports.map(monthOf).filter(Boolean));
  months.add(current);
  const sorted = [...months].sort().reverse(); // newest first

  select.innerHTML = sorted
    .map((m) => `<option value="${m}">${monthLabel(m)}</option>`)
    .join("");
  select.value = sorted.includes(previous) ? previous : current;
}

$("download-xlsx").addEventListener("click", () => {
  const month = $("month-select").value;
  const list = reports
    .filter((r) => monthOf(r) === month)
    .sort((a, b) => a.id - b.id); // oldest first, like a log book

  if (!list.length) {
    alert(`There are no reports for ${monthLabel(month)} yet.`);
    return;
  }

  const header = [
    "Report ID", "Date returned", "Item", "Quantity", "Site", "Serial number",
    "Reason for return", "Reported by", "Photos", "Status",
    "Supervisor name", "Supervisor date", "Manager name", "Manager date",
  ];
  const rows = list.map((r) => [
    r.id, r.return_date, r.item, r.quantity, r.site, r.serial_number || "",
    r.reason, r.engineer_name || "", (r.images || []).length, statusOf(r),
    r.supervisor_name, r.supervisor_date, r.manager_name, r.manager_date,
  ]);
  const widths = [10, 14, 24, 10, 22, 18, 40, 18, 8, 22, 20, 16, 20, 16];

  window.XlsxExport.downloadXlsx(
    `returned-items-${month}.xlsx`,
    monthLabel(month),
    [header, ...rows],
    widths
  );
});

// ---------- Signing ----------
$("list").addEventListener("click", async (e) => {
  if (!e.target.classList.contains("sign-btn")) return;
  const box = e.target.closest(".signbox");
  const msg = box.querySelector(".sign-msg");
  const name = box.querySelector(".sign-name").value.trim();
  const date = box.querySelector(".sign-date").value;

  if (!name) { msg.textContent = "Please type your name."; msg.className = "message sign-msg error"; return; }

  e.target.disabled = true;
  try {
    // A trip box signs every item of the trip that is waiting for you; otherwise just this one report
    await api("POST", box.dataset.batch
      ? { batch_id: box.dataset.batch, name, date }
      : { id: Number(box.dataset.id), name, date });
    await loadReports();
  } catch (err) {
    msg.textContent = err.message;
    msg.className = "message sign-msg error";
    e.target.disabled = false;
  }
});

// ---------- Start: reuse the password for this browser tab if we have it ----------
if (password) {
  loadReports().catch(() => {
    sessionStorage.removeItem("pw-" + role);
    password = "";
  });
}
