// server.js
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000; // use 3000 for backend

// Middleware
app.use(cors());               // allow browser frontend
app.use(express.json());       // parse JSON bodies
app.use(express.static("public")); // serve frontend from /public

// In-memory store (for dev)
let sessions = [];

// Helper: compute deviation score (score-based, same as frontend)
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function computeDeviationScoreFromScore(score) {
  const baselineScore = 9.5; // typical 9–10
  const worstScore = 0;

  if (typeof score !== "number" || !Number.isFinite(score)) return 0;

  const diff = Math.max(0, baselineScore - score);
  const maxDiff = Math.max(baselineScore - worstScore, 1);

  return clamp((diff / maxDiff) * 100, 0, 100);
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

  console.log("Received ESP /score:", req.body);

  if (typeof score !== "number") {
    return res.status(400).json({ error: "score must be a number" });
  }

  const computedRoundsPlayed = roundsPlayed ?? 10;
  const computedRoundsCorrect =
    roundsCorrect ?? Math.max(0, Math.min(score, computedRoundsPlayed));
  const computedAvgReaction = avgReactionMs ?? 2000;

  const accuracy =
    computedRoundsPlayed > 0 ? computedRoundsCorrect / computedRoundsPlayed : 0;

  // Deviation driven by score
  const deviationScore = computeDeviationScoreFromScore(score);
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
    sequenceLength: null, // unknown from ESP-only score
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
// Expected: shape used in app.js's ingestResult()
app.post("/api/results", (req, res) => {
  const {
    sequenceLength,
    roundsPlayed,
    roundsCorrect,
    avgReactionMs,
    patient,
    score: incomingScore
  } = req.body;

  console.log("Received from WEB /api/results:", req.body);

  if (
    typeof roundsPlayed !== "number" ||
    typeof roundsCorrect !== "number" ||
    typeof avgReactionMs !== "number"
  ) {
    return res.status(400).json({ error: "Invalid payload numbers" });
  }

  const accuracy =
    roundsPlayed > 0 ? roundsCorrect / roundsPlayed : 0;

  // Use score from body if present, otherwise derive from roundsCorrect
  const score =
    typeof incomingScore === "number" ? incomingScore : roundsCorrect;

  const deviationScore = computeDeviationScoreFromScore(score);
  const riskLevel = classifyRisk(deviationScore);

  const record = {
    id: `web-${Date.now()}`,
    source: "web",
    patient: patient || {},
    sequenceLength: sequenceLength ?? null,
    roundsPlayed,
    roundsCorrect,
    avgReactionMs,
    score,
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
  res.json({ sessions });
});

// --------------------------------------
// Start server
// --------------------------------------
app.listen(PORT, () => {
  console.log(`Remind backend listening on port ${PORT}`);
});
