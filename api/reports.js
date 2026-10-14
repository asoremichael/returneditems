// /api/reports  (open to engineers - they can only SUBMIT, never read)
const crypto = require("crypto");
const { supabase, BUCKET } = require("./_lib");

const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 1.5 * 1024 * 1024; // photos are shrunk in the browser first

module.exports = async (req, res) => {
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

  if (!item || !site || !reason || !returnDate) {
    return res.status(400).json({ error: "Please fill in all required fields." });
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    return res.status(400).json({ error: "Quantity must be 1 or more." });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(returnDate)) {
    return res.status(400).json({ error: "Invalid date." });
  }

  // Upload photos to private storage
  const savedNames = [];
  for (const photo of photos) {
    const match = /^data:image\/jpeg;base64,(.+)$/.exec(String(photo));
    if (!match) return res.status(400).json({ error: "Photos must be images." });
    const buffer = Buffer.from(match[1], "base64");
    if (buffer.length > MAX_PHOTO_BYTES) return res.status(400).json({ error: "A photo is too large." });

    const fileName = `${crypto.randomBytes(12).toString("hex")}.jpg`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, buffer, { contentType: "image/jpeg" });
    if (error) return res.status(500).json({ error: "Could not save a photo. Try again." });
    savedNames.push(fileName);
  }

  const { error } = await supabase.from("reports").insert({
    item,
    quantity,
    site,
    reason,
    return_date: returnDate,
    serial_number: serial || null,
    engineer_name: engineer || null,
    images: savedNames,
  });
  if (error) return res.status(500).json({ error: "Could not save the report. Try again." });

  res.json({ ok: true });
};
