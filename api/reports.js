// /api/reports  (open to engineers - they can only SUBMIT, never read)
const crypto = require("crypto");
const { supabase, BUCKET } = require("./_lib");

const MAX_PHOTOS = 10; // per item
const MAX_PHOTO_BYTES = 1.5 * 1024 * 1024; // photos are shrunk in the browser first

// Delete photos that were uploaded for a report that then failed to save
async function removePhotos(names) {
  if (!names.length) return;
  try {
    await supabase.storage.from(BUCKET).remove(names);
  } catch (err) {
    console.error("Could not clean up photos:", err);
  }
}

async function handle(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const b = req.body || {};
  const item = String(b.item || "").trim().slice(0, 200);
  const site = String(b.site || "").trim().slice(0, 200);
  const reason = String(b.reason || "").trim().slice(0, 2000);
  const serial = String(b.serial_number || "").trim().slice(0, 100);
  const engineer = String(b.engineer_name || "").trim().slice(0, 100);
  const quantity = parseInt(b.quantity, 10);
  const returnDate = String(b.return_date || "");
  const photos = Array.isArray(b.photos) ? b.photos.slice(0, MAX_PHOTOS) : [];
  // Items sent together from one form share a "trip" id, so they can be signed together
  const batchId = /^[A-Za-z0-9-]{8,64}$/.test(String(b.batch_id || "")) ? String(b.batch_id) : null;

  if (!item || !site || !reason || !returnDate) {
    return res.status(400).json({ error: "Please fill in all required fields." });
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    return res.status(400).json({ error: "Quantity must be 1 or more." });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(returnDate)) {
    return res.status(400).json({ error: "Invalid date." });
  }

  // Check every photo first
  const buffers = [];
  for (const photo of photos) {
    const match = /^data:image\/jpeg;base64,(.+)$/.exec(String(photo));
    if (!match) return res.status(400).json({ error: "Photos must be images." });
    const buffer = Buffer.from(match[1], "base64");
    if (buffer.length > MAX_PHOTO_BYTES) return res.status(400).json({ error: "A photo is too large." });
    buffers.push(buffer);
  }

  // Upload them all at the same time to private storage (keeps 10 photos fast)
  const savedNames = buffers.map(() => `${crypto.randomBytes(12).toString("hex")}.jpg`);
  const uploads = await Promise.all(
    buffers.map((buffer, i) =>
      supabase.storage.from(BUCKET).upload(savedNames[i], buffer, { contentType: "image/jpeg" })
    )
  );
  const failedUpload = uploads.find((u) => u.error);
  if (failedUpload) {
    console.error("Photo upload failed:", failedUpload.error); // shows up in Vercel -> Logs
    await removePhotos(savedNames);
    return res.status(500).json({ error: "Could not save a photo. Try again." });
  }

  const row = {
    item,
    quantity,
    site,
    reason,
    return_date: returnDate,
    serial_number: serial || null,
    engineer_name: engineer || null,
    images: savedNames,
  };
  // Only mention batch_id when there is one, so a report without a trip id still saves
  // even if the database has not been updated yet
  let { error } = await supabase.from("reports").insert(batchId ? { ...row, batch_id: batchId } : row);
  if (error && batchId && /batch_id/.test(`${error.message || ""} ${error.details || ""}`)) {
    // The database has not been updated yet (supabase-update-trips.sql). Keep working without trips.
    console.error("The batch_id column is missing. Run supabase-update-trips.sql in Supabase. Saving without it.", error);
    ({ error } = await supabase.from("reports").insert(row));
  }
  if (error) {
    console.error("Saving the report failed:", error); // shows up in Vercel -> Logs
    await removePhotos(savedNames);
    return res.status(500).json({ error: "Could not save the report. Try again." });
  }

  res.json({ ok: true });
}

// Any unexpected crash becomes a readable message, and the real cause goes to the Vercel logs
module.exports = async (req, res) => {
  try {
    await handle(req, res);
  } catch (err) {
    console.error("Report submission crashed:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "The server had a problem. Please try again in a minute." });
    }
  }
};
