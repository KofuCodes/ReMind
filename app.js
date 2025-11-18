// -------------------------
// Simple in-memory store
// -------------------------

let baseline = {
    accuracy: 0.9, // expected fraction of correct rounds
    meanReactionMs: 1800 // expected average reaction time
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
  // Risk computation
  // -------------------------
  // Deviation score = 0 (no deviation) to 100 (very large deviation)
  
  function computeDeviationScore({ accuracy, avgReactionMs }) {
    const accDiff = Math.max(0, baseline.accuracy - accuracy); // worse than baseline => positive
    const rtDiffRatio = Math.max(
      0,
      (avgReactionMs - baseline.meanReactionMs) / Math.max(baseline.meanReactionMs, 1)
    );
  
    // Weight accuracy a bit more than reaction time
    const raw = (accDiff * 1.4 + rtDiffRatio * 0.6) * 100;
    return clamp(raw, 0, 100);
  }
  
  function classifyRisk(score) {
    if (score < 25) return "low";
    if (score < 60) return "medium";
    return "high";
  }
  
  function describeRiskLevel(score) {
    const risk = classifyRisk(score);
    if (risk === "low") {
      return "Performance is close to baseline. Monitor routinely.";
    } else if (risk === "medium") {
      return "Noticeable deviation from baseline. Consider closer monitoring and clinical context.";
    } else {
      return "Marked deviation from baseline. Review the patient clinically and consider formal delirium screening.";
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
  
    const { deviationScore, riskLevel, accuracy, avgReactionMs, patient } = latest;
  
    const riskLabel =
      riskLevel === "low"
        ? "Low"
        : riskLevel === "medium"
        ? "Medium"
        : "High";
  
    const pillClass = `risk-pill ${riskLevel}`;
  
    riskSummaryEl.innerHTML = `
      <div class="risk-header">
        <div>
          <div class="risk-label">Cognitive deviation score</div>
          <div class="risk-score">${deviationScore.toFixed(0)} / 100</div>
        </div>
        <span class="${pillClass}">${riskLabel} risk</span>
      </div>
  
      <div class="small muted">
        <strong>Accuracy:</strong> ${(accuracy * 100).toFixed(1)}% &nbsp;·&nbsp;
        <strong>Reaction:</strong> ${avgReactionMs.toFixed(0)} ms
        ${
          patient && patient.id
            ? `&nbsp;·&nbsp;<strong>Patient ID:</strong> ${patient.id}`
            : ""
        }
      </div>
  
      <div class="risk-meter" aria-label="Cognitive deviation score meter">
        <div class="risk-meter-fill" style="width: ${deviationScore.toFixed(
          0
        )}%;"></div>
      </div>
  
      <p class="small">${describeRiskLevel(deviationScore)}</p>
      <p class="tiny muted">
        This score is a research heuristic only. Always interpret in the context of clinical assessment,
        medications, and baseline cognitive function.
      </p>
    `;
  }
  
  function renderHistoryTable() {
    if (!sessions.length) {
      historyBodyEl.innerHTML = `
        <tr>
          <td colspan="6" class="muted small">No sessions yet.</td>
        </tr>
      `;
      return;
    }
  
    const rows = sessions
      .map((session) => {
        const {
          timestamp,
          deviationScore,
          riskLevel,
          accuracy,
          avgReactionMs,
          patient
        } = session;
  
        const riskText =
          riskLevel === "low"
            ? "Low"
            : riskLevel === "medium"
            ? "Medium"
            : "High";
  
        return `
          <tr>
            <td>${formatDateTime(timestamp)}</td>
            <td>${patient && (patient.id || patient.name) ? (patient.id || patient.name) : "—"}</td>
            <td>${(accuracy * 100).toFixed(1)}%</td>
            <td>${avgReactionMs.toFixed(0)}</td>
            <td>${deviationScore.toFixed(0)}</td>
            <td>${riskText}</td>
          </tr>
        `;
      })
      .join("");
  
    historyBodyEl.innerHTML = rows;
  }
  
  // -------------------------
  // Core data ingest
  // -------------------------
  
  /**
   * Ingest a result (from manual entry, ESP32, or server)
   * shape:
   * {
   *   sequenceLength: number,
   *   roundsPlayed: number,
   *   roundsCorrect: number,
   *   avgReactionMs: number,
   *   patient: { id, name, age, location, notes }
   * }
   */
  function ingestResult(result) {
    const { roundsPlayed, roundsCorrect, avgReactionMs } = result;
  
    const accuracy =
      roundsPlayed > 0 ? roundsCorrect / roundsPlayed : 0;
  
    const deviationScore = computeDeviationScore({
      accuracy,
      avgReactionMs
    });
  
    const riskLevel = classifyRisk(deviationScore);
  
    const record = {
      ...result,
      accuracy,
      deviationScore,
      riskLevel,
      timestamp: new Date()
    };
  
    sessions.unshift(record);
    renderRiskSummary(record);
    renderHistoryTable();
  
    // TODO: when backend exists, send this record to the server.
    // Example:
    // sendResultToServer(record);
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
      alert("Please enter valid numeric values for the game result.");
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
    });
  
    resultForm.reset();
  });
  
  baselineForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const accVal = Number(baselineAccuracyInput.value);
    const rtVal = Number(baselineReactionInput.value);
  
    if (!Number.isNaN(accVal) && accVal > 0 && accVal <= 1) {
      baseline.accuracy = accVal;
    }
    if (!Number.isNaN(rtVal) && rtVal > 0) {
      baseline.meanReactionMs = rtVal;
    }
  
    // Recompute latest risk with new baseline
    if (sessions[0]) {
      const latest = sessions[0];
      latest.deviationScore = computeDeviationScore({
        accuracy: latest.accuracy,
        avgReactionMs: latest.avgReactionMs
      });
      latest.riskLevel = classifyRisk(latest.deviationScore);
      renderRiskSummary(latest);
      renderHistoryTable();
    }
  });
  
  // Fill baseline inputs with defaults
  baselineAccuracyInput.value = baseline.accuracy;
  baselineReactionInput.value = baseline.meanReactionMs;
  
  // Demo button (for testing UI quickly)
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
      patient
    });
  });
  
  // -------------------------
  // ESP32 / backend integration hooks
  // -------------------------
  
  /**
   * When you have an ESP32 + backend:
   *
   * Option 1 (recommended):
   * - ESP32 posts to a backend REST API, e.g.:
   *   POST https://your-server/api/results
   *   body: { patientId, roundsPlayed, roundsCorrect, avgReactionMs, ... }
   * - This dashboard fetches data from that server, or listens via WebSocket.
   *
   * Option 2:
   * - Direct ESP32 -> WebSocket endpoint consumed by this page.
   */
  
  async function sendResultToServer(record) {
    // Placeholder. Uncomment + adapt when your API exists.
    /*
    try {
      const res = await fetch("https://your-server/api/results", {
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
    */
  }
  
  /**
   * Example structure for a live connection.
   * Replace this with WebSocket / SSE / polling as needed.
   */
  function connectToEsp32() {
    // PSEUDO-CODE EXAMPLE:
    //
    // const ws = new WebSocket("wss://your-server/remind-stream");
    // ws.onmessage = (event) => {
    //   const dataFromDevice = JSON.parse(event.data);
    //   ingestResultFromDevice(dataFromDevice);
    // };
    //
    // For now, this is intentionally left as a placeholder.
  }
  
  /**
   * shape of dataFromDevice is expected to match ingestResult:
   * {
   *   patientId, roundsPlayed, roundsCorrect, avgReactionMs, sequenceLength
   *   ...any additional fields...
   * }
   */
  function ingestResultFromDevice(dataFromDevice) {
    const patient = {
      id: dataFromDevice.patientId || "",
      name: dataFromDevice.patientName || "",
      age: dataFromDevice.patientAge || "",
      location: dataFromDevice.patientLocation || "",
      notes: dataFromDevice.notes || ""
    };
  
    ingestResult({
      sequenceLength: dataFromDevice.sequenceLength ?? 0,
      roundsPlayed: dataFromDevice.roundsPlayed ?? 0,
      roundsCorrect: dataFromDevice.roundsCorrect ?? 0,
      avgReactionMs: dataFromDevice.avgReactionMs ?? 0,
      patient
    });
  }
  
  // If you want to auto-init any live connection later:
  // connectToEsp32();
  