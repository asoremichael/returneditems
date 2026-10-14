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

function signBox(r) {
  const title = role === "supervisor" ? "Supervisor sign-off" : "Manager sign-off";
  return `
    <div class="signbox" data-id="${r.id}">
      <label>${title} - your name</label>
      <input class="sign-name" maxlength="100" />
      <label>Date</label>
      <input class="sign-date" type="date" value="${todayLocal()}" />
      <button class="full sign-btn" type="button">Sign and submit</button>
      <div class="message sign-msg"></div>
    </div>`;
}

function renderReport(r) {
  const photos = (r.photo_urls || [])
    .map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="Photo" loading="lazy"></a>`)
    .join("");

  const myTurn = waitingForMe(r);
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
      ${photos ? `<div class="photos">${photos}</div>` : ""}
      ${signedLine("Supervisor", r.supervisor_name, r.supervisor_date)}
      ${signedLine("Manager", r.manager_name, r.manager_date)}
      ${myTurn ? signBox(r) : ""}
    </div>`;
}

function render() {
  const list = reports.filter((r) => {
    if (filter === "waiting") return waitingForMe(r);
    if (filter === "done") return !waitingForMe(r);
    return true;
  });
  const waitingCount = reports.filter(waitingForMe).length;

  document.querySelectorAll(".tabs button").forEach((b) => {
    b.classList.toggle("active", b.dataset.filter === filter);
  });
  $("waiting-count").textContent = waitingCount;

  $("list").innerHTML = list.length
    ? list.map(renderReport).join("")
    : '<div class="card">Nothing here.</div>';
}

document.querySelectorAll(".tabs button").forEach((b) => {
  b.addEventListener("click", () => { filter = b.dataset.filter; render(); });
});

// ---------- Download Excel (fully signed reports only) ----------
$("download-xlsx").addEventListener("click", () => {
  const completed = reports
    .filter(isDone)
    .sort((a, b) => a.id - b.id); // oldest first, like a log book

  if (!completed.length) {
    alert("There are no fully signed reports to download yet.");
    return;
  }

  const header = [
    "Report ID", "Date returned", "Item", "Quantity", "Site", "Serial number",
    "Reason for return", "Reported by", "Photos",
    "Supervisor name", "Supervisor date", "Manager name", "Manager date",
  ];
  const rows = completed.map((r) => [
    r.id, r.return_date, r.item, r.quantity, r.site, r.serial_number || "",
    r.reason, r.engineer_name || "", (r.images || []).length,
    r.supervisor_name, r.supervisor_date, r.manager_name, r.manager_date,
  ]);
  const widths = [10, 14, 24, 10, 22, 18, 40, 18, 8, 20, 16, 20, 16];

  window.XlsxExport.downloadXlsx(
    `returned-items-${todayLocal()}.xlsx`,
    "Completed reports",
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
    await api("POST", { id: Number(box.dataset.id), name, date });
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
