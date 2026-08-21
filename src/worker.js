const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const SEVERITIES = new Set(["critical", "moderate", "low"]);
const STATUSES = new Set(["new", "in_review", "assigned", "in_progress", "resolved"]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      if (url.pathname === "/api/health" && request.method === "GET") return json({ ok: true });
      if (url.pathname === "/api/config" && request.method === "GET") return json({
        city: env.CITY_NAME || "Chhatrapati Sambhajinagar, Maharashtra",
        googleMapsApiKey: env.GOOGLE_MAPS_API_KEY || "",
        mapCenter: { lat: Number(env.MAP_CENTER_LAT || 19.8762), lng: Number(env.MAP_CENTER_LNG || 75.3433) }
      });
      if (url.pathname === "/api/reports" && request.method === "GET") return listReports(url, env);
      if (url.pathname === "/api/reports" && request.method === "POST") return createReport(request, env);

      const image = url.pathname.match(/^\/api\/reports\/([^/]+)\/image$/);
      if (image && request.method === "GET") return getImage(image[1], env);
      const vote = url.pathname.match(/^\/api\/reports\/([^/]+)\/vote$/);
      if (vote && request.method === "POST") return voteForReport(vote[1], request, env);
      const status = url.pathname.match(/^\/api\/reports\/([^/]+)\/status$/);
      if (status && request.method === "PATCH") return updateStatus(status[1], request, env);
      const report = url.pathname.match(/^\/api\/reports\/([^/]+)$/);
      if (report && request.method === "GET") return getReport(report[1], env);
      return json({ error: "Route not found." }, 404);
    } catch (error) {
      console.error(error);
      return json({ error: "The service could not complete this request. Please try again." }, 500);
    }
  }
};

async function listReports(url, env) {
  const conditions = [], bindings = [];
  const status = url.searchParams.get("status"), severity = url.searchParams.get("severity");
  const search = clean(url.searchParams.get("search") || "", 80);
  if (status && STATUSES.has(status)) { conditions.push("status = ?"); bindings.push(status); }
  if (severity && SEVERITIES.has(severity)) { conditions.push("severity = ?"); bindings.push(severity); }
  if (search) { conditions.push("(location_name LIKE ? OR address LIKE ? OR description LIKE ?)"); const q = `%${search}%`; bindings.push(q, q, q); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await env.DB.prepare(`
    SELECT id, location_name, address, latitude, longitude, description, severity, status, is_anonymous,
           image_key, assigned_to, resolution_note, upvotes, created_at, updated_at
    FROM reports ${where}
    ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'moderate' THEN 2 ELSE 3 END,
             CASE status WHEN 'new' THEN 1 WHEN 'in_review' THEN 2 WHEN 'assigned' THEN 3 WHEN 'in_progress' THEN 4 ELSE 5 END,
             created_at DESC LIMIT 200`).bind(...bindings).all();
  const stats = await env.DB.prepare(`SELECT COUNT(*) total,
      COALESCE(SUM(CASE WHEN severity='critical' AND status!='resolved' THEN 1 ELSE 0 END), 0) critical,
      COALESCE(SUM(CASE WHEN status IN ('assigned','in_progress') THEN 1 ELSE 0 END), 0) active,
      COALESCE(SUM(CASE WHEN status='resolved' THEN 1 ELSE 0 END), 0) resolved FROM reports`).first();
  return json({ reports: (result.results || []).map(publicReport), stats: stats || { total: 0, critical: 0, active: 0, resolved: 0 } });
}

async function createReport(request, env) {
  const form = await request.formData();
  if (String(form.get("website") || "").trim()) return json({ error: "Submission rejected." }, 400);
  const latitude = Number(form.get("latitude")), longitude = Number(form.get("longitude"));
  const severity = String(form.get("severity") || ""), description = clean(form.get("description"), 1000);
  const anonymous = form.get("isAnonymous") !== null;
  const reporterName = anonymous ? null : clean(form.get("reporterName"), 80);
  const locationName = clean(form.get("locationName"), 160), address = clean(form.get("address"), 240);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return json({ error: "Allow location access or select the road location on the map." }, 400);
  if (!SEVERITIES.has(severity)) return json({ error: "Select a valid severity level." }, 400);
  if (description.length < 10) return json({ error: "Describe the road damage in at least 10 characters." }, 400);
  const image = form.get("image");
  if (!image || typeof image === "string" || !image.size) return json({ error: "A road-damage photo is required." }, 400);
  const max = (Number(env.MAX_IMAGE_SIZE_MB) || 5) * 1024 * 1024;
  if (!IMAGE_TYPES.has(image.type) || image.size > max) return json({ error: `Use a JPG, PNG, or WEBP image under ${Number(env.MAX_IMAGE_SIZE_MB) || 5} MB.` }, 400);

  const id = crypto.randomUUID(), now = new Date().toISOString();
  const extension = image.type === "image/png" ? "png" : image.type === "image/webp" ? "webp" : "jpg";
  const imageKey = `reports/${id}.${extension}`;
  await env.ROAD_IMAGES.put(imageKey, image.stream(), { httpMetadata: { contentType: image.type, cacheControl: "public, max-age=31536000, immutable" }, customMetadata: { reportId: id, uploadedAt: now } });
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO reports (id, location_name, address, latitude, longitude, description, severity, status, reporter_name, is_anonymous, image_key, image_content_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, ?)`)
      .bind(id, locationName || null, address || null, latitude, longitude, description, severity, reporterName, anonymous ? 1 : 0, imageKey, image.type, now, now),
    env.DB.prepare(`INSERT INTO report_events (id, report_id, event_type, status, message, actor, created_at) VALUES (?, ?, 'created', 'new', ?, ?, ?)`)
      .bind(crypto.randomUUID(), id, "Road damage reported by the public.", anonymous ? "Anonymous public reporter" : (reporterName || "Public reporter"), now)
  ]);
  return json({ report: publicReport(await env.DB.prepare("SELECT * FROM reports WHERE id=?").bind(id).first()) }, 201);
}

async function getReport(id, env) {
  const report = await env.DB.prepare("SELECT * FROM reports WHERE id=?").bind(id).first();
  if (!report) return json({ error: "Report not found." }, 404);
  const events = await env.DB.prepare("SELECT id,event_type,status,message,actor,created_at FROM report_events WHERE report_id=? ORDER BY created_at ASC").bind(id).all();
  return json({ report: publicReport(report), events: events.results || [] });
}

async function getImage(id, env) {
  const report = await env.DB.prepare("SELECT image_key FROM reports WHERE id=?").bind(id).first();
  if (!report?.image_key) return new Response("Image not found", { status: 404 });
  const object = await env.ROAD_IMAGES.get(report.image_key);
  if (!object) return new Response("Image not found", { status: 404 });
  const headers = new Headers(); object.writeHttpMetadata(headers); headers.set("etag", object.httpEtag); headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
}

async function voteForReport(id, request, env) {
  const visitorId = clean(request.headers.get("X-Visitor-ID"), 100);
  if (!visitorId) return json({ error: "Visitor ID missing." }, 400);
  const exists = await env.DB.prepare("SELECT id FROM reports WHERE id=?").bind(id).first();
  if (!exists) return json({ error: "Report not found." }, 404);
  const now = new Date().toISOString();
  const insert = await env.DB.prepare("INSERT OR IGNORE INTO votes (report_id,visitor_id,created_at) VALUES (?, ?, ?)").bind(id, visitorId, now).run();
  if (insert.meta?.changes) await env.DB.prepare("UPDATE reports SET upvotes=upvotes+1,updated_at=? WHERE id=?").bind(now, id).run();
  const row = await env.DB.prepare("SELECT upvotes FROM reports WHERE id=?").bind(id).first();
  return json({ upvotes: row?.upvotes || 0, counted: Boolean(insert.meta?.changes) });
}

async function updateStatus(id, request, env) {
  if (!env.ADMIN_TOKEN) return json({ error: "Authority controls are not configured. Set ADMIN_TOKEN as a Worker secret." }, 503);
  if (request.headers.get("X-Admin-Token") !== env.ADMIN_TOKEN) return json({ error: "Authority access denied." }, 401);
  const body = await request.json(), status = String(body.status || "");
  const assignedTo = clean(body.assignedTo, 120), resolutionNote = clean(body.resolutionNote, 500);
  if (!STATUSES.has(status)) return json({ error: "Invalid status." }, 400);
  const previous = await env.DB.prepare("SELECT id,status FROM reports WHERE id=?").bind(id).first();
  if (!previous) return json({ error: "Report not found." }, 404);
  const now = new Date().toISOString(), note = resolutionNote || `Status changed from ${previous.status.replaceAll("_", " ")} to ${status.replaceAll("_", " ")}.`;
  await env.DB.batch([
    env.DB.prepare("UPDATE reports SET status=?,assigned_to=?,resolution_note=?,updated_at=? WHERE id=?").bind(status, assignedTo || null, resolutionNote || null, now, id),
    env.DB.prepare("INSERT INTO report_events (id,report_id,event_type,status,message,actor,created_at) VALUES (?, ?, 'status_update', ?, ?, ?, ?)").bind(crypto.randomUUID(), id, status, note, assignedTo || "Government / tender authority", now)
  ]);
  return json({ report: publicReport(await env.DB.prepare("SELECT * FROM reports WHERE id=?").bind(id).first()) });
}

function publicReport(row) { if (!row) return null; return { id: row.id, locationName: row.location_name || "Pinned road location", address: row.address || "", latitude: Number(row.latitude), longitude: Number(row.longitude), description: row.description, severity: row.severity, status: row.status, anonymous: Boolean(row.is_anonymous), imageUrl: row.image_key ? `/api/reports/${row.id}/image` : null, assignedTo: row.assigned_to || "", resolutionNote: row.resolution_note || "", upvotes: Number(row.upvotes || 0), createdAt: row.created_at, updatedAt: row.updated_at }; }
function clean(value, limit) { return String(value || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, limit); }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=UTF-8", "cache-control": "no-store" } }); }
