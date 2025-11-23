// -------------------------
// Simple in-memory store
// -------------------------

let baseline = {
  accuracy: 0.9,          // still kept, but not used in deviation now
  meanReactionMs: 1800    // still kept, but not used in deviation now
};

let sessions = [];

// -------------------------
// Utility functions
// -------------------------

function formatDateTime(date) {
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// -------------------------
// Risk computation (score‑based)
// -------------------------
//
// Average / expected score ≈ 9–10.
// Below that => higher deviation (higher delirium risk).
// At or above that => low deviation (good / excellent).

function computeDeviationScoreFromScore(score) {
  const baselineScore = 9.5; // center of 9–10
  const worstScore = 0;

  if (typeof score !== "number" || !Number.isFinite(score)) return 0;

  // Only penalize when below baseline; above baseline is excellent (0 deviation)
  const diff = Math.max(0, baselineScore - score);
  const maxDiff = Math.max(baselineScore - worstScore, 1);

  // 0 = at/above baseline, 100 = extremely low score
  return clamp((diff / maxDiff) * 100, 0, 100);
}

function classifyRisk(score) {
  if (score < 25) return "low";    // near / above typical score
  if (score < 60) return "medium"; // moderately below
  return "high";                   // far below typical score
}

function describeRiskLevel(score) {
  const risk = classifyRisk(score);
  if (risk === "low") {
    return "Score is within or above the typical 9–10 range. Performance is reassuring.";
  } else if (risk === "medium") {
    return "Score is moderately below the typical range. Consider closer monitoring and context.";
  } else {
    return "Score is markedly below the typical range. Review clinically and consider delirium screening.";
  }
}

// -------------------------
// DOM references
// -------------------------

const riskSummaryEl = document.getElementById("risk-summary");
const historyBodyEl = document.getElementById("history-body");

const baselineForm = document.getElementById("baseline-form");
const baselineAccuracyInput = document.getElementById("baselineAccuracy");
const baselineReactionInput = document.getElementById("baselineReaction");

const resultForm = document.getElementById("result-form");
const demoBtn = document.getElementById("demo-btn");

const patientForm = document.getElementById("patient-form");

// -------------------------
// Rendering
// -------------------------

function renderRiskSummary(latest) {
  if (!latest) {
    riskSummaryEl.classList.add("empty-state");
    riskSummaryEl.innerHTML =
      "<p>No data yet. Enter a result to see the cognitive deviation score.</p>";
    return;
  }

  riskSummaryEl.classList.remove("empty-state");

  const {
    deviationScore,
    riskLevel,
    score,
    patient
  } = latest;

  const pillClass = `risk-pill ${riskLevel}`;
  const riskLabel =
    riskLevel === "low"
      ? "Low"
      : riskLevel === "medium"
      ? "Medium"
      : "High";

  riskSummaryEl.innerHTML = `
    <div class="risk-header">
      <div>
        <div class="risk-label">Cognitive deviation score</div>
        <div class="risk-score">${deviationScore.toFixed(0)} / 100</div>
      </div>
      <span class="${pillClass}">${riskLabel} risk</span>
    </div>

    <div class="small muted">
      <strong>Score:</strong> ${
        typeof score === "number" ? score : "—"
      }
      ${
        patient && patient.id
          ? `&nbsp;·&nbsp;<strong>Patient ID:</strong> ${patient.id}`
          : ""
      }
    </div>

    <div class="risk-meter">
      <div class="risk-meter-fill" style="width:${deviationScore.toFixed(
        0
      )}%;"></div>
    </div>

    <p class="small">${describeRiskLevel(deviationScore)}</p>
    <p class="tiny muted">
      Research heuristic only. Always interpret with clinical judgment.
    </p>
  `;
}

function renderHistoryTable() {
  if (!sessions.length) {
    historyBodyEl.innerHTML = `
      <tr><td colspan="5" class="muted small">No sessions yet.</td></tr>
    `;
    return;
  }

  historyBodyEl.innerHTML = sessions
    .map((s) => {
      const riskLabel =
        s.riskLevel === "low"
          ? "Low"
          : s.riskLevel === "medium"
          ? "Medium"
          : "High";

      const scoreCell =
        typeof s.score === "number" ? s.score : "—";

      return `
        <tr>
          <td>${formatDateTime(s.timestamp)}</td>
          <td>${
            s.patient && (s.patient.id || s.patient.name)
              ? s.patient.id || s.patient.name
              : "—"
          }</td>
          <td>${scoreCell}</td>
          <td>${s.deviationScore.toFixed(0)}</td>
          <td>${riskLabel}</td>
        </tr>
      `;
    })
    .join("");
}

// -------------------------
// Ingest result
// -------------------------

function ingestResult(result) {
  const { roundsPlayed, roundsCorrect, avgReactionMs } = result;

  // Score = "how far they got"
  // If result.score is set (e.g. from ESP), use that; otherwise fall back to roundsCorrect
  const score =
    typeof result.score === "number" ? result.score : roundsCorrect;

  const accuracy = roundsPlayed > 0 ? roundsCorrect / roundsPlayed : 0;

  const deviationScore = computeDeviationScoreFromScore(score);
  const riskLevel = classifyRisk(deviationScore);

  const record = {
    ...result,
    score,
    accuracy,
    deviationScore,
    riskLevel,
    timestamp: new Date()
  };

  sessions.unshift(record);

  renderRiskSummary(record);
  renderHistoryTable();

  // Send to backend once
  sendResultToServer(record);
}

// -------------------------
// Forms
// -------------------------

resultForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const patientData = new FormData(patientForm);
  const resultData = new FormData(resultForm);

  const sequenceLength = Number(resultData.get("sequenceLength"));
  const roundsPlayed = Number(resultData.get("roundsPlayed"));
  const roundsCorrect = Number(resultData.get("roundsCorrect"));
  const avgReactionMs = Number(resultData.get("avgReaction"));

  if (
    !Number.isFinite(sequenceLength) ||
    !Number.isFinite(roundsPlayed) ||
    !Number.isFinite(roundsCorrect) ||
    !Number.isFinite(avgReactionMs)
  ) {
    alert("Please enter valid numeric values.");
    return;
  }

  if (roundsCorrect > roundsPlayed) {
    alert("Rounds correct cannot be greater than rounds played.");
    return;
  }

  const patient = {
    id: patientData.get("patientId") || "",
    name: patientData.get("patientName") || "",
    age: patientData.get("patientAge") || "",
    location: patientData.get("patientLocation") || "",
    notes: patientData.get("notes") || ""
  };

  ingestResult({
    sequenceLength,
    roundsPlayed,
    roundsCorrect,
    avgReactionMs,
    patient
    // score will be inferred from roundsCorrect in ingestResult()
  });

  resultForm.reset();
});

// -------------------------
// Baseline form
// -------------------------

baselineForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const accVal = Number(baselineAccuracyInput.value);
  const rtVal = Number(baselineReactionInput.value);

  // Keep these in case you want them later for other heuristics
  if (!Number.isNaN(accVal) && accVal > 0 && accVal <= 1) {
    baseline.accuracy = accVal;
  }
  if (!Number.isNaN(rtVal) && rtVal > 0) {
    baseline.meanReactionMs = rtVal;
  }

  // Recompute latest risk, but now based on score
  if (sessions[0]) {
    const latest = sessions[0];
    const score =
      typeof latest.score === "number" ? latest.score : 0;
    latest.deviationScore = computeDeviationScoreFromScore(score);
    latest.riskLevel = classifyRisk(latest.deviationScore);
    renderRiskSummary(latest);
    renderHistoryTable();
  }
});

// Baseline defaults (still shown, even though score drives risk now)
baselineAccuracyInput.value = baseline.accuracy;
baselineReactionInput.value = baseline.meanReactionMs;

// -------------------------
// Sync with backend
// -------------------------

async function sendResultToServer(record) {
  try {
    const res = await fetch("/api/results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record)
    });

    if (!res.ok) {
      console.error("Failed to sync with server", await res.text());
    }
  } catch (err) {
    console.error("Error syncing with server", err);
  }
}

async function loadInitialSessions() {
  try {
    const res = await fetch("/api/results");
    if (!res.ok) {
      console.error("Failed to load sessions", await res.text());
      renderHistoryTable();
      return;
    }

    const data = await res.json();
    sessions = (data.sessions || []).map((s) => ({
      ...s,
      timestamp: new Date(s.timestamp)
    }));

    if (sessions[0]) renderRiskSummary(sessions[0]);
    else renderRiskSummary(null);

    renderHistoryTable();
  } catch (err) {
    console.error("Error loading sessions", err);
    renderHistoryTable();
  }
}

// Initial load
loadInitialSessions();

// Auto-refresh every 3 seconds for ESP updates
setInterval(loadInitialSessions, 3000);

// -------------------------
// Demo button
// -------------------------

demoBtn.addEventListener("click", () => {
  const patientData = new FormData(patientForm);

  const patient = {
    id: patientData.get("patientId") || "DEMO-01",
    name: patientData.get("patientName") || "Demo patient",
    age: patientData.get("patientAge") || "70",
    location: patientData.get("patientLocation") || "Ward A",
    notes: patientData.get("notes") || "Auto-generated demo data."
  };

  const rnd = (min, max) => Math.random() * (max - min) + min;

  const roundsPlayed = Math.floor(rnd(8, 15));
  const roundsCorrect = Math.floor(roundsPlayed * rnd(0.6, 1));
  const avgReactionMs = rnd(1500, 3500);
  const sequenceLength = Math.floor(rnd(4, 8));

  ingestResult({
    sequenceLength,
    roundsPlayed,
    roundsCorrect,
    avgReactionMs,
    patient,
    // for demo, treat roundsCorrect as "score"
    score: roundsCorrect
  });
});
