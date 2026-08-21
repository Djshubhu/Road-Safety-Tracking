const list = document.querySelector("#authority-list");
const form = document.querySelector("#authority-form");
const selectedText = document.querySelector("#selected-report");
const message = document.querySelector("#authority-message");
let reports = [], selected = null;

loadReports();
form.addEventListener("submit", updateReport);

async function loadReports() {
  try {
    const response = await fetch("/api/reports");
    const data = await response.json();
    reports = data.reports || [];
    renderList();
  } catch { list.innerHTML = "<p class='field-hint'>Could not load reports.</p>"; }
}
function renderList() {
  if (!reports.length) { list.innerHTML = "<p class='field-hint'>No public reports have been submitted yet.</p>"; return; }
  list.innerHTML = "";
  reports.forEach(report => {
    const row = document.createElement("button"); row.type = "button"; row.className = `authority-row ${selected?.id === report.id ? "active" : ""}`;
    row.innerHTML = `<strong>${esc(report.locationName)}</strong><small>${label(report.severity)} · ${status(report.status)} · ${report.upvotes} public support</small>`;
    row.addEventListener("click", () => selectReport(report)); list.appendChild(row);
  });
}
function selectReport(report) {
  selected = report; selectedText.textContent = `${report.locationName} — ${report.description}`;
  document.querySelector("#authority-status").value = report.status;
  document.querySelector("#assigned-to").value = report.assignedTo || "";
  document.querySelector("#resolution-note").value = report.resolutionNote || "";
  renderList();
}
async function updateReport(event) {
  event.preventDefault(); clearMessage();
  if (!selected) return showMessage("Choose a report first.", "error");
  const button = form.querySelector("button[type=submit]"); button.disabled = true; button.textContent = "Publishing…";
  try {
    const response = await fetch(`/api/reports/${encodeURIComponent(selected.id)}/status`, {
      method: "PATCH", headers: { "content-type": "application/json", "X-Admin-Token": document.querySelector("#admin-token").value },
      body: JSON.stringify({ status: document.querySelector("#authority-status").value, assignedTo: document.querySelector("#assigned-to").value, resolutionNote: document.querySelector("#resolution-note").value })
    });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not update report.");
    selected = data.report; showMessage("Status update is live in the public register.", "success"); await loadReports();
  } catch (error) { showMessage(error.message, "error"); }
  finally { button.disabled = false; button.textContent = "Publish status update"; }
}
function label(value) { return ({critical:"Critical",moderate:"Moderate",low:"Low"})[value] || value; }
function status(value) { return ({new:"New",in_review:"In review",assigned:"Assigned",in_progress:"Repair in progress",resolved:"Resolved"})[value] || value; }
function showMessage(text, type) { message.className = `authority-message ${type}`; message.textContent = text; message.hidden = false; }
function clearMessage() { message.hidden = true; }
function esc(value) { return String(value || "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char])); }
