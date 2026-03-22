const STORAGE_KEY = "privateclawRelayAdminToken";

const elements = {
  refreshButton: document.getElementById("refreshButton"),
  tokenButton: document.getElementById("tokenButton"),
  lastUpdatedLabel: document.getElementById("lastUpdatedLabel"),
  summaryGrid: document.getElementById("summaryGrid"),
  requestStats: document.getElementById("requestStats"),
  activeSessionsTableBody: document.getElementById("activeSessionsTableBody"),
  historySessionsTableBody: document.getElementById("historySessionsTableBody"),
  instancesTableBody: document.getElementById("instancesTableBody"),
  sessionDetailContent: document.getElementById("sessionDetailContent"),
  detailHint: document.getElementById("detailHint"),
  sessionSearchInput: document.getElementById("sessionSearchInput"),
  tokenModal: document.getElementById("tokenModal"),
  tokenInput: document.getElementById("tokenInput"),
  tokenError: document.getElementById("tokenError"),
  saveTokenButton: document.getElementById("saveTokenButton"),
};

const state = {
  token: localStorage.getItem(STORAGE_KEY) || "",
  selectedSessionId: null,
  searchQuery: "",
  refreshTimer: null,
};

function formatNumber(value) {
  return new Intl.NumberFormat().format(value ?? 0);
}

function formatDateTime(value) {
  if (!value) {
    return "—";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDuration(ms) {
  if (!ms || ms <= 0) {
    return "0s";
  }
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds || parts.length === 0) parts.push(`${seconds}s`);
  return parts.slice(0, 3).join(" ");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setModalVisible(visible) {
  elements.tokenModal.classList.toggle("hidden", !visible);
  if (visible) {
    elements.tokenInput.value = state.token;
    elements.tokenInput.focus();
  }
}

async function fetchJson(path) {
  const response = await fetch(path, {
    headers: {
      Authorization: `Bearer ${state.token}`,
    },
  });
  if (response.status === 401) {
    setModalVisible(true);
    throw new Error("Unauthorized");
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(payload.error || response.statusText);
  }
  return response.json();
}

function renderSummary(overview) {
  const cards = [
    ["Sessions", overview.totals.sessions],
    ["Active sessions", overview.totals.activeSessions],
    ["Known participants", overview.totals.knownParticipants],
    ["Active participants", overview.totals.activeParticipants],
    ["Instances", overview.totals.instances],
    ["App requests", overview.requestStats.appRequests],
    ["Provider requests", overview.requestStats.providerRequests],
    ["Relay errors", overview.requestStats.appErrors + overview.requestStats.providerErrors],
  ];
  elements.summaryGrid.innerHTML = cards
    .map(
      ([label, value]) => `
        <article class="summary-card">
          <span class="muted">${escapeHtml(label)}</span>
          <strong>${escapeHtml(formatNumber(value))}</strong>
        </article>
      `,
    )
    .join("");
  elements.lastUpdatedLabel.textContent = `Updated ${formatDateTime(overview.generatedAt)}`;
}

function renderRequestStats(overview) {
  const requestTypes = overview.requestStats.requestTypes
    .slice(0, 10)
    .map(
      (entry) => `
        <div class="request-type">
          <div class="muted">${escapeHtml(entry.actor)} · ${escapeHtml(entry.type)}</div>
          <strong>${escapeHtml(formatNumber(entry.ok + entry.error))}</strong>
          <div class="muted">ok ${escapeHtml(formatNumber(entry.ok))} · err ${escapeHtml(formatNumber(entry.error))}</div>
        </div>
      `,
    )
    .join("");

  const errorCodes = overview.requestStats.errorCodes.length
    ? overview.requestStats.errorCodes
        .map(
          (entry) => `
            <div class="error-chip">
              <div>${escapeHtml(entry.code)}</div>
              <strong>${escapeHtml(formatNumber(entry.count))}</strong>
            </div>
          `,
        )
        .join("")
    : '<div class="muted">No relay errors recorded.</div>';

  elements.requestStats.innerHTML = `
    <div class="stat-chip-row">
      <div class="stat-chip">App success<strong>${escapeHtml(formatNumber(overview.requestStats.appSuccesses))}</strong></div>
      <div class="stat-chip">App errors<strong>${escapeHtml(formatNumber(overview.requestStats.appErrors))}</strong></div>
      <div class="stat-chip">Provider success<strong>${escapeHtml(formatNumber(overview.requestStats.providerSuccesses))}</strong></div>
      <div class="stat-chip">Provider errors<strong>${escapeHtml(formatNumber(overview.requestStats.providerErrors))}</strong></div>
      <div class="stat-chip">App frames<strong>${escapeHtml(formatNumber(overview.requestStats.appFrames))}</strong></div>
      <div class="stat-chip">Provider frames<strong>${escapeHtml(formatNumber(overview.requestStats.providerFrames))}</strong></div>
    </div>
    <div>
      <h3>Top request types</h3>
      <div class="chip-list">${requestTypes || '<div class="muted">No request traffic yet.</div>'}</div>
    </div>
    <div>
      <h3>Top error codes</h3>
      <div class="chip-list">${errorCodes}</div>
    </div>
  `;
}

function statusPill(status) {
  return `<span class="status-pill ${escapeHtml(status)}">${escapeHtml(status)}</span>`;
}

function renderSessions(tableBody, sessions) {
  if (!sessions.length) {
    tableBody.innerHTML = '<tr><td colspan="7" class="muted">No sessions found.</td></tr>';
    return;
  }
  tableBody.innerHTML = sessions
    .map(
      (session) => `
        <tr class="session-row" data-session-id="${escapeHtml(session.sessionId)}">
          <td>${statusPill(session.status)}</td>
          <td><code>${escapeHtml(session.sessionId)}</code></td>
          <td>
            <div><code>${escapeHtml(session.providerId)}</code></div>
            <div class="provider-state ${session.providerOnline ? "online" : "offline"}">
              ${session.providerOnline ? "provider online" : "provider offline"}
            </div>
          </td>
          <td>${escapeHtml(formatNumber(session.activeParticipantCount))} / ${escapeHtml(formatNumber(session.distinctParticipantCount))}</td>
          <td>${escapeHtml(formatNumber(session.appMessageCount + session.providerMessageCount))}</td>
          <td>${escapeHtml(formatDateTime(session.expiresAt))}</td>
          <td>${escapeHtml(formatDateTime(session.updatedAt))}</td>
        </tr>
      `,
    )
    .join("");
  tableBody.querySelectorAll("tr[data-session-id]").forEach((row) => {
    row.addEventListener("click", () => {
      state.selectedSessionId = row.getAttribute("data-session-id");
      void refreshSessionDetail();
    });
  });
}

function renderInstances(instances) {
  if (!instances.length) {
    elements.instancesTableBody.innerHTML = '<tr><td colspan="5" class="muted">No live relay instances.</td></tr>';
    return;
  }
  elements.instancesTableBody.innerHTML = instances
    .map(
      (instance) => `
        <tr>
          <td>
            <div><code>${escapeHtml(instance.instanceId)}</code></div>
            <div class="muted">RSS ${escapeHtml(formatNumber(instance.memoryUsage.rss))} B</div>
          </td>
          <td>${escapeHtml(formatNumber(instance.activeProviders))}</td>
          <td>${escapeHtml(formatNumber(instance.activeApps))}</td>
          <td>${escapeHtml(formatNumber(instance.localSessions))}</td>
          <td>${escapeHtml(formatDateTime(instance.lastSeenAt))}</td>
        </tr>
      `,
    )
    .join("");
}

function renderSessionDetail(detail) {
  if (!detail) {
    elements.sessionDetailContent.className = "detail-content empty-state";
    elements.sessionDetailContent.textContent = "No session selected.";
    elements.detailHint.textContent = "Select a session to inspect participants and activity.";
    return;
  }

  const participantRows = detail.participants.length
    ? detail.participants
        .map(
          (participant) => `
            <tr>
              <td><code>${escapeHtml(participant.appId)}</code></td>
              <td>
                <div class="participant-state ${participant.isOnline ? "online" : "offline"}">
                  ${participant.isOnline ? "online" : "offline"}
                </div>
                <div class="muted">${escapeHtml(formatDuration(participant.currentConnectedMs))}</div>
              </td>
              <td>${escapeHtml(formatNumber(participant.connectionCount))}</td>
              <td>${escapeHtml(formatNumber(participant.messageCount))}</td>
              <td>${escapeHtml(formatDateTime(participant.lastSeenAt))}</td>
              <td>${escapeHtml(participant.lastDisconnectReason || "—")}</td>
            </tr>
          `,
        )
        .join("")
    : '<tr><td colspan="6" class="muted">No participants recorded for this session.</td></tr>';

  elements.detailHint.textContent = `Session ${detail.session.sessionId}`;
  elements.sessionDetailContent.className = "detail-content";
  elements.sessionDetailContent.innerHTML = `
    <div class="detail-grid">
      <article class="detail-metric"><span class="muted">Provider</span><strong>${escapeHtml(detail.session.providerId)}</strong></article>
      <article class="detail-metric"><span class="muted">Status</span><strong>${escapeHtml(detail.session.status)}</strong></article>
      <article class="detail-metric"><span class="muted">Group mode</span><strong>${detail.session.groupMode ? "yes" : "no"}</strong></article>
      <article class="detail-metric"><span class="muted">Participants</span><strong>${escapeHtml(formatNumber(detail.session.activeParticipantCount))} / ${escapeHtml(formatNumber(detail.session.distinctParticipantCount))}</strong></article>
      <article class="detail-metric"><span class="muted">App messages</span><strong>${escapeHtml(formatNumber(detail.session.appMessageCount))}</strong></article>
      <article class="detail-metric"><span class="muted">Provider messages</span><strong>${escapeHtml(formatNumber(detail.session.providerMessageCount))}</strong></article>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Participant</th>
            <th>Online time</th>
            <th>Joins</th>
            <th>Messages</th>
            <th>Last seen</th>
            <th>Last disconnect</th>
          </tr>
        </thead>
        <tbody>${participantRows}</tbody>
      </table>
    </div>
  `;
}

async function refreshSessionDetail() {
  if (!state.selectedSessionId) {
    renderSessionDetail(null);
    return;
  }
  try {
    renderSessionDetail(
      await fetchJson(`/api/admin/sessions/${encodeURIComponent(state.selectedSessionId)}`),
    );
  } catch (error) {
    if (String(error) !== "Error: Unauthorized") {
      elements.sessionDetailContent.className = "detail-content empty-state";
      elements.sessionDetailContent.textContent = `Failed to load session detail: ${error.message}`;
    }
  }
}

async function refreshDashboard() {
  if (!state.token) {
    setModalVisible(true);
    return;
  }

  try {
    const [overview, activeSessions, historySessions, instances] = await Promise.all([
      fetchJson("/api/admin/overview"),
      fetchJson("/api/admin/sessions?status=active&pageSize=100"),
      fetchJson(
        `/api/admin/sessions?status=all&pageSize=100&query=${encodeURIComponent(state.searchQuery)}`,
      ),
      fetchJson("/api/admin/instances"),
    ]);
    renderSummary(overview);
    renderRequestStats(overview);
    renderSessions(elements.activeSessionsTableBody, activeSessions.sessions);
    renderSessions(elements.historySessionsTableBody, historySessions.sessions);
    renderInstances(instances.instances);
    await refreshSessionDetail();
  } catch (error) {
    if (String(error) === "Error: Unauthorized") {
      return;
    }
    elements.requestStats.innerHTML = `<div class="error-chip">${escapeHtml(error.message)}</div>`;
  }
}

function scheduleRefresh() {
  if (state.refreshTimer) {
    clearInterval(state.refreshTimer);
  }
  state.refreshTimer = setInterval(() => {
    void refreshDashboard();
  }, 15000);
}

elements.refreshButton.addEventListener("click", () => {
  void refreshDashboard();
});

elements.tokenButton.addEventListener("click", () => {
  setModalVisible(true);
});

elements.saveTokenButton.addEventListener("click", async () => {
  const nextToken = elements.tokenInput.value.trim();
  if (!nextToken) {
    elements.tokenError.textContent = "Token is required.";
    return;
  }
  state.token = nextToken;
  localStorage.setItem(STORAGE_KEY, nextToken);
  elements.tokenError.textContent = "";
  setModalVisible(false);
  await refreshDashboard();
});

elements.sessionSearchInput.addEventListener("input", () => {
  state.searchQuery = elements.sessionSearchInput.value.trim();
  void refreshDashboard();
});

setModalVisible(!state.token);
scheduleRefresh();
void refreshDashboard();
