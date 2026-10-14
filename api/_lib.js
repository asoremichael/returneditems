// Shared helpers for the API functions.
// (Files starting with "_" are not turned into API routes by Vercel.)

const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

const BUCKET = "report-images";

// The service key stays on the server only. It is never sent to the browser.
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

// ---------- Password check ----------
function passwordMatches(given, expected) {
  if (!given || !expected) return false;
  const a = crypto.createHash("sha256").update(String(given)).digest();
  const b = crypto.createHash("sha256").update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

function isAllowed(req, role) {
  const expected = role === "supervisor" ? process.env.SUPERVISOR_PASSWORD : process.env.MANAGER_PASSWORD;
  return passwordMatches(req.headers["x-password"], expected);
}

// ---------- Photos: give staff temporary viewing links (1 hour) ----------
async function addPhotoLinks(rows) {
  const allPaths = rows.flatMap((r) => r.images || []);
  const urlByPath = {};
  if (allPaths.length) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(allPaths, 3600);
    (data || []).forEach((x) => {
      if (x.signedUrl) urlByPath[x.path] = x.signedUrl;
    });
  }
  return rows.map((r) => ({
    ...r,
    photo_urls: (r.images || []).map((p) => urlByPath[p]).filter(Boolean),
  }));
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

// ---------- One handler used by both the supervisor and the manager ----------
// GET  -> list reports
// POST -> sign a report with a name and date
function staffHandler(role) {
  const nameCol = `${role}_name`;
  const dateCol = `${role}_date`;

  return async (req, res) => {
    if (!isAllowed(req, role)) return res.status(401).json({ error: "Wrong password" });

    if (req.method === "GET") {
      let query = supabase.from("reports").select("*").order("created_at", { ascending: false });
      // The manager only sees reports the supervisor has already signed
      if (role === "manager") query = query.not("supervisor_name", "is", null);

      const { data, error } = await query;
      if (error) return res.status(500).json({ error: "Could not load reports" });
      return res.json(await addPhotoLinks(data));
    }

    if (req.method === "POST") {
      const { id, name, date } = req.body || {};
      const cleanName = String(name || "").trim().slice(0, 100);
      if (!cleanName) return res.status(400).json({ error: "Please type your name." });
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: "Invalid date." });
      }

      let query = supabase
        .from("reports")
        .update({ [nameCol]: cleanName, [dateCol]: date || todayString() })
        .eq("id", id)
        .is(nameCol, null); // can only sign once
      if (role === "manager") query = query.not("supervisor_name", "is", null);

      const { data, error } = await query.select();
      if (error) return res.status(500).json({ error: "Could not save" });
      if (!data.length) return res.status(400).json({ error: "Already signed, or not ready to sign." });
      return res.json({ ok: true });
    }

    res.status(405).json({ error: "Method not allowed" });
  };
}

module.exports = { supabase, BUCKET, staffHandler };
