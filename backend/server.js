// server.js
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());                 // allow browser frontend
app.use(express.json());         // parse JSON bodies

// In-memory store (for dev)
// Replace with a real DB later (Mongo, Postgres, etc.)
let sessions = [];

// Helper: compute deviation score (same idea as in frontend)
const baseline = {
  accuracy: 0.9,
  meanReactionMs: 1800
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function computeDeviationScore({ accuracy, avgReactionMs }) {
  const accDiff = Math.max(0, baseline.accuracy - accuracy);
  const rtDiffRatio = Math.max(
    0,
    (avgReactionMs - baseline.meanReactionMs) / Math.max(baseline.meanReactionMs, 1)
  );
  const raw = (accDiff * 1.4 + rtDiffRatio * 0.6) * 100;
  return clamp(raw, 0, 100);
}

function classifyRisk(score) {
  if (score < 25) return "low";
  if (score < 60) return "medium";
  return "high";
}

// ---------------------------
// 1) ESP endpoint: POST /score
// ---------------------------
// Expected JSON: { score: number, roundsPlayed?, roundsCorrect?, avgReactionMs?, patientId? }

app.post("/score", (req, res) => {
  const { score, roundsPlayed, roundsCorrect, avgReactionMs, patientId } = req.body;

  if (typeof score !== "number") {
    return res.status(400).json({ error: "score must be a number" });
  }

  // For now, if ESP only sends score, we treat it as a minimal record.
  // You can upgrade this once the microcontroller sends more fields.
  const computedRoundsPlayed = roundsPlayed ?? 10;
  const computedRoundsCorrect = roundsCorrect ?? Math.max(0, Math.min(score, computedRoundsPlayed));
  const computedAvgReaction = avgReactionMs ?? 2000;

  const accuracy =
    computedRoundsPlayed > 0 ? computedRoundsCorrect / computedRoundsPlayed : 0;

  const deviationScore = computeDeviationScore({
    accuracy,
    avgReactionMs: computedAvgReaction
  });

  const riskLevel = classifyRisk(deviationScore);

  const record = {
    id: `esp-${Date.now()}`,
    source: "esp",
    patient: {
      id: patientId || "",
      name: "",
      age: "",
      location: "",
      notes: ""
    },
    score,
    sequenceLength: null,          // unknown from ESP-only score
    roundsPlayed: computedRoundsPlayed,
    roundsCorrect: computedRoundsCorrect,
    avgReactionMs: computedAvgReaction,
    accuracy,
    deviationScore,
    riskLevel,
    timestamp: new Date().toISOString()
  };

  sessions.unshift(record); // add to top

  res.json({
    status: "ok",
    storedId: record.id,
    deviationScore,
    riskLevel
  });
});

// --------------------------------------
// 2) Full results from frontend: POST /api/results
// --------------------------------------
// Expected: same shape you use in app.js's `ingestResult` call.

app.post("/api/results", (req, res) => {
  const {
    sequenceLength,
    roundsPlayed,
    roundsCorrect,
    avgReactionMs,
    patient
  } = req.body;

  if (
    typeof roundsPlayed !== "number" ||
    typeof roundsCorrect !== "number" ||
    typeof avgReactionMs !== "number"
  ) {
    return res.status(400).json({ error: "Invalid payload numbers" });
  }

  const accuracy = roundsPlayed > 0 ? roundsCorrect / roundsPlayed : 0;
  const deviationScore = computeDeviationScore({ accuracy, avgReactionMs });
  const riskLevel = classifyRisk(deviationScore);

  const record = {
    id: `web-${Date.now()}`,
    source: "web",
    patient: patient || {},
    sequenceLength: sequenceLength ?? null,
    roundsPlayed,
    roundsCorrect,
    avgReactionMs,
    accuracy,
    deviationScore,
    riskLevel,
    timestamp: new Date().toISOString()
  };

  sessions.unshift(record);

  res.json({ status: "ok", record });
});

// --------------------------------------
// 3) Get recent sessions: GET /api/results
// --------------------------------------

app.get("/api/results", (req, res) => {
  // You could add query params like ?limit=50 or ?patientId=...
  res.json({ sessions });
});

// --------------------------------------
// Start server
// --------------------------------------

app.listen(PORT, () => {
  console.log(`Remind backend listening on port ${PORT}`);
});
