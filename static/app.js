/* ═══════════════════════════════════════════════════════════════════
   AI Resume Analyzer — Frontend Logic
   ═══════════════════════════════════════════════════════════════════ */

const API_BASE = "";  // Same origin — Flask serves static files

// ── DOM References ─────────────────────────────────────────────────
const form            = document.getElementById("analyze-form");
const resumeInput     = document.getElementById("resume-input");
const uploadZone      = document.getElementById("upload-zone");
const uploadLabel     = document.getElementById("upload-label");
const analyzeBtn      = document.getElementById("analyze-btn");
const jobDesc         = document.getElementById("job-description");

const uploadSection   = document.getElementById("upload-section");
const loadingSection  = document.getElementById("loading-section");
const errorSection    = document.getElementById("error-section");
const resultsSection  = document.getElementById("results-section");
const errorMessage    = document.getElementById("error-message");

const scoreCircle     = document.getElementById("score-circle");
const scoreValue      = document.getElementById("score-value");
const scoreLabel      = document.getElementById("score-label");
const breakdownGrid   = document.getElementById("breakdown-grid");
const keywordTags     = document.getElementById("keyword-tags");
const weakPhrasesList = document.getElementById("weak-phrases-list");
const feedbackList    = document.getElementById("section-feedback-list");
const improvementsList= document.getElementById("improvements-list");
const improveBtn      = document.getElementById("improve-btn");

const stepExtract     = document.getElementById("step-extract");
const stepCompare     = document.getElementById("step-compare");
const stepScore       = document.getElementById("step-score");

// ── State ──────────────────────────────────────────────────────────
let selectedFile = null;
let lastJobDescription = "";
let lastWeakPhrases = [];

// ── File Upload Handling ───────────────────────────────────────────
uploadZone.addEventListener("click", () => resumeInput.click());

uploadZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadZone.classList.add("dragover");
});

uploadZone.addEventListener("dragleave", () => {
  uploadZone.classList.remove("dragover");
});

uploadZone.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadZone.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  if (file && file.type === "application/pdf") {
    handleFileSelect(file);
  }
});

resumeInput.addEventListener("change", () => {
  if (resumeInput.files.length > 0) {
    handleFileSelect(resumeInput.files[0]);
  }
});

function handleFileSelect(file) {
  selectedFile = file;
  uploadZone.classList.add("has-file");
  uploadLabel.innerHTML = `<strong>${file.name}</strong> <span style="color:var(--accent-green)">✓</span>`;
  validateForm();
}

jobDesc.addEventListener("input", validateForm);

function validateForm() {
  analyzeBtn.disabled = !(selectedFile && jobDesc.value.trim().length > 10);
}

// ── Form Submission ────────────────────────────────────────────────
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (analyzeBtn.disabled) return;

  const formData = new FormData();
  formData.append("resume", selectedFile);
  formData.append("job_description", jobDesc.value.trim());

  lastJobDescription = jobDesc.value.trim();

  showLoading();

  try {
    // Animate steps
    setTimeout(() => activateStep(stepCompare), 3000);
    setTimeout(() => activateStep(stepScore), 7000);

    // 5 minute timeout to allow for rate-limit retries on the server
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000);

    const res = await fetch(`${API_BASE}/api/analyze`, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Server error");
    }

    renderResults(data);
  } catch (err) {
    let msg = err.message || "Failed to analyze resume. Please try again.";
    if (msg.includes("429") || msg.toLowerCase().includes("quota")) {
      msg = "API rate limit reached. Please wait 1-2 minutes and try again.";
    } else if (err.name === "AbortError") {
      msg = "Request timed out. The server may be busy — please try again.";
    }
    showError(msg);
  }
});

// ── UI State Transitions ───────────────────────────────────────────
function showLoading() {
  uploadSection.hidden = true;
  loadingSection.hidden = false;
  errorSection.hidden = true;
  resultsSection.hidden = true;

  // Reset steps
  [stepExtract, stepCompare, stepScore].forEach((s) => {
    s.classList.remove("active", "done");
  });
  stepExtract.classList.add("active");
}

function activateStep(stepEl) {
  // Mark previous active as done
  const allSteps = [stepExtract, stepCompare, stepScore];
  const idx = allSteps.indexOf(stepEl);
  for (let i = 0; i < idx; i++) {
    allSteps[i].classList.remove("active");
    allSteps[i].classList.add("done");
  }
  stepEl.classList.add("active");
}

function showError(msg) {
  loadingSection.hidden = true;
  errorSection.hidden = false;
  errorMessage.textContent = msg;
}

function resetUI() {
  uploadSection.hidden = false;
  loadingSection.hidden = true;
  errorSection.hidden = true;
  resultsSection.hidden = true;

  // Reset form state
  selectedFile = null;
  resumeInput.value = "";
  uploadZone.classList.remove("has-file");
  uploadLabel.innerHTML = 'Drop your resume here or <span class="browse-link">browse</span>';
  analyzeBtn.disabled = true;

  // Reset button states
  const btnText = analyzeBtn.querySelector(".btn-text");
  const btnLoader = analyzeBtn.querySelector(".btn-loader");
  btnText.hidden = false;
  btnLoader.hidden = true;

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ── Render Results ─────────────────────────────────────────────────
function renderResults(data) {
  loadingSection.hidden = true;
  resultsSection.hidden = false;

  // Scroll to results
  setTimeout(() => {
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 100);

  // 1. Overall Score
  animateScore(data.overall_score || 0);

  // 2. Score Breakdown
  renderBreakdown(data.score_breakdown || {});

  // 3. Missing Keywords
  renderKeywords(data.missing_keywords || []);

  // 4. Weak Phrases
  lastWeakPhrases = data.weak_phrases || [];
  renderWeakPhrases(lastWeakPhrases);

  // 5. Section Feedback
  renderFeedback(data.section_feedback || {});

  // 6. Key Improvements
  renderImprovements(data.key_improvements || []);
}

// ── Score Animation ────────────────────────────────────────────────
function animateScore(score) {
  const circumference = 2 * Math.PI * 70; // r=70
  const target = circumference - (score / 100) * circumference;

  // Animate circle
  scoreCircle.style.strokeDashoffset = circumference;
  requestAnimationFrame(() => {
    scoreCircle.style.transition = "stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)";
    scoreCircle.style.strokeDashoffset = target;
  });

  // Animate number
  let current = 0;
  const duration = 1500;
  const start = performance.now();

  function tick(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    current = Math.round(eased * score);
    scoreValue.textContent = current;

    if (progress < 1) {
      requestAnimationFrame(tick);
    }
  }
  requestAnimationFrame(tick);

  // Label
  if (score >= 80) {
    scoreLabel.textContent = "Excellent — Your resume is well-aligned!";
    scoreLabel.className = "score-label excellent";
  } else if (score >= 60) {
    scoreLabel.textContent = "Good — Some improvements would help.";
    scoreLabel.className = "score-label good";
  } else if (score >= 40) {
    scoreLabel.textContent = "Average — Significant gaps detected.";
    scoreLabel.className = "score-label average";
  } else {
    scoreLabel.textContent = "Needs Work — Major revisions recommended.";
    scoreLabel.className = "score-label poor";
  }
}

// ── Breakdown ──────────────────────────────────────────────────────
function renderBreakdown(breakdown) {
  breakdownGrid.innerHTML = "";

  Object.values(breakdown).forEach((item, i) => {
    const score = item.score || 0;
    const barClass = score >= 70 ? "high" : score >= 45 ? "mid" : "low";

    const el = document.createElement("div");
    el.className = "breakdown-item";
    el.innerHTML = `
      <div class="breakdown-label">${escapeHTML(item.label || "Category")}</div>
      <div class="breakdown-bar-bg">
        <div class="breakdown-bar ${barClass}" style="width:0%" data-target="${score}"></div>
      </div>
      <div class="breakdown-score">${score}<span style="font-size:0.8rem;color:var(--text-muted)">/100</span></div>
    `;
    breakdownGrid.appendChild(el);

    // Animate bar
    setTimeout(() => {
      el.querySelector(".breakdown-bar").style.width = `${score}%`;
    }, 200 + i * 150);
  });
}

// ── Keywords ───────────────────────────────────────────────────────
function renderKeywords(keywords) {
  keywordTags.innerHTML = "";
  keywords.forEach((kw, i) => {
    const tag = document.createElement("span");
    tag.className = "keyword-tag";
    tag.textContent = kw;
    tag.style.animationDelay = `${i * 0.08}s`;
    keywordTags.appendChild(tag);
  });
}

// ── Weak Phrases ───────────────────────────────────────────────────
function renderWeakPhrases(phrases) {
  weakPhrasesList.innerHTML = "";
  improveBtn.hidden = phrases.length === 0;

  phrases.forEach((wp, i) => {
    const card = document.createElement("div");
    card.className = "weak-phrase-card";
    card.style.animationDelay = `${i * 0.1}s`;
    card.innerHTML = `
      <div class="wp-row">
        <span class="wp-badge original">Original</span>
        <span class="wp-text">${escapeHTML(wp.original)}</span>
      </div>
      <div class="wp-row">
        <span class="wp-badge issue">Issue</span>
        <span class="wp-text">${escapeHTML(wp.issue)}</span>
      </div>
      <div class="wp-row improved-row">
        <span class="wp-badge improved">Improved</span>
        <span class="wp-text">${escapeHTML(wp.improved)}</span>
      </div>
    `;
    weakPhrasesList.appendChild(card);
  });
}

// ── Section Feedback ───────────────────────────────────────────────
function renderFeedback(feedback) {
  feedbackList.innerHTML = "";

  const sectionOrder = ["summary", "skills", "experience", "projects", "education"];
  const labels = {
    summary: "Summary / Objective",
    skills: "Skills",
    experience: "Work Experience",
    projects: "Projects",
    education: "Education",
  };

  sectionOrder.forEach((key, i) => {
    if (!feedback[key]) return;
    const item = document.createElement("div");
    item.className = "feedback-item";
    item.style.animationDelay = `${i * 0.1}s`;
    item.innerHTML = `
      <div class="feedback-section-name">${labels[key] || key}</div>
      <div class="feedback-text">${escapeHTML(feedback[key])}</div>
    `;
    feedbackList.appendChild(item);
  });
}

// ── Key Improvements ───────────────────────────────────────────────
function renderImprovements(improvements) {
  improvementsList.innerHTML = "";
  improvements.forEach((imp, i) => {
    const li = document.createElement("li");
    li.textContent = imp;
    li.style.animationDelay = `${i * 0.1}s`;
    improvementsList.appendChild(li);
  });
}

// ── Improve My Resume Button ───────────────────────────────────────
improveBtn.addEventListener("click", async () => {
  const btnText = improveBtn.querySelector(".btn-text");
  const btnLoader = improveBtn.querySelector(".btn-loader");

  btnText.hidden = true;
  btnLoader.hidden = false;
  improveBtn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/api/improve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job_description: lastJobDescription,
        weak_phrases: lastWeakPhrases,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Improvement failed");
    }

    // Update weak phrases with improved versions
    const improved = data.improved || [];
    renderImprovedPhrases(improved);
  } catch (err) {
    alert("⚠️ " + (err.message || "Failed to improve resume"));
  } finally {
    btnText.hidden = false;
    btnLoader.hidden = true;
    improveBtn.disabled = false;
  }
});

function renderImprovedPhrases(improved) {
  weakPhrasesList.innerHTML = "";
  improveBtn.hidden = true;

  improved.forEach((item, i) => {
    const card = document.createElement("div");
    card.className = "weak-phrase-card";
    card.style.animationDelay = `${i * 0.1}s`;
    card.innerHTML = `
      <div class="wp-row">
        <span class="wp-badge original">Before</span>
        <span class="wp-text" style="text-decoration:line-through;opacity:0.6">${escapeHTML(item.original)}</span>
      </div>
      <div class="wp-row improved-row">
        <span class="wp-badge improved">After ✨</span>
        <span class="wp-text">${escapeHTML(item.improved)}</span>
      </div>
    `;
    weakPhrasesList.appendChild(card);
  });
}

// ── Helpers ─────────────────────────────────────────────────────────
function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
