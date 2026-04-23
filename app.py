"""
AI Resume Analyzer — Flask Backend
Handles PDF upload, text extraction, and AI-powered resume analysis.
"""

import os
import json
import re
import traceback
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename
import pdfplumber
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

# ── App Config ──────────────────────────────────────────────────────────────
app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app)

UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # 10 MB limit

ALLOWED_EXTENSIONS = {"pdf"}

# ── Groq Setup ──────────────────────────────────────────────────────────────
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def extract_text_from_pdf(filepath: str) -> str:
    """Extract all text from a PDF file using pdfplumber."""
    text_parts: list[str] = []
    with pdfplumber.open(filepath) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
    return "\n".join(text_parts)


# ── AI Analysis ─────────────────────────────────────────────────────────────

ANALYSIS_PROMPT = """You are an expert resume reviewer and career coach. Analyze the following resume against the provided job description.

RESUME TEXT:
\"\"\"
{resume_text}
\"\"\"

JOB DESCRIPTION:
\"\"\"
{job_description}
\"\"\"

Return your analysis as a **valid JSON object** with EXACTLY this structure (no markdown, no code fences, no extra text — ONLY the JSON object):

{{
  "overall_score": <integer 0-100>,
  "score_breakdown": {{
    "keyword_match": {{ "score": <int 0-100>, "label": "Keyword Match" }},
    "skills_alignment": {{ "score": <int 0-100>, "label": "Skills Alignment" }},
    "impact_metrics": {{ "score": <int 0-100>, "label": "Impact & Metrics" }},
    "action_verbs": {{ "score": <int 0-100>, "label": "Action Verbs" }},
    "structure_format": {{ "score": <int 0-100>, "label": "Structure & Format" }}
  }},
  "missing_keywords": ["keyword1", "keyword2", "..."],
  "weak_phrases": [
    {{
      "original": "original weak phrase from resume",
      "issue": "why it is weak",
      "improved": "improved version of the phrase"
    }}
  ],
  "section_feedback": {{
    "summary": "Feedback on the professional summary/objective section",
    "skills": "Feedback on the skills section",
    "experience": "Feedback on the work experience section",
    "projects": "Feedback on the projects section",
    "education": "Feedback on the education section"
  }},
  "key_improvements": [
    "Improvement suggestion 1",
    "Improvement suggestion 2",
    "Improvement suggestion 3"
  ]
}}

Rules:
- Provide at least 3 missing keywords and up to 10.
- Provide at least 2 weak phrases and up to 5.
- Provide at least 3 key improvements and up to 7.
- ALL scores must be integers between 0 and 100.
- Do NOT wrap the JSON in markdown code fences.
- Return ONLY the JSON object, nothing else.
"""

IMPROVE_PROMPT = """You are an expert resume writer. Rewrite the following weak bullet points from a resume to be more impactful, quantified, and action-oriented for the given job description.

JOB DESCRIPTION:
\"\"\"
{job_description}
\"\"\"

WEAK PHRASES TO IMPROVE:
{weak_phrases}

Return a **valid JSON array** where each element has this structure (no markdown, no code fences — ONLY the JSON array):

[
  {{
    "original": "the original weak phrase",
    "improved": "the improved, powerful version"
  }}
]

Rules:
- Use strong action verbs.
- Add quantified metrics where possible (even reasonable estimates).
- Align improvements with the job description keywords.
- Return ONLY the JSON array, nothing else.
"""


def call_ai(prompt: str) -> str:
    """Send a prompt to Groq (Llama 3.3 70B) and return the text response."""
    response = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=4096,
    )
    return response.choices[0].message.content.strip()


def parse_json_response(text: str):
    """Robustly parse JSON from an LLM response, stripping markdown fences."""
    # Strip markdown code fences if present
    cleaned = re.sub(r"^```(?:json)?\s*", "", text, flags=re.MULTILINE)
    cleaned = re.sub(r"```\s*$", "", cleaned, flags=re.MULTILINE)
    cleaned = cleaned.strip()
    return json.loads(cleaned)


# ── Routes ──────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/analyze", methods=["POST"])
def analyze():
    """Handle resume upload + job description, return AI analysis."""
    # --- Validate inputs ---
    if "resume" not in request.files:
        return jsonify({"error": "No resume file uploaded."}), 400

    file = request.files["resume"]
    job_description = request.form.get("job_description", "").strip()

    if file.filename == "":
        return jsonify({"error": "No file selected."}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": "Only PDF files are allowed."}), 400

    if not job_description:
        return jsonify({"error": "Job description is required."}), 400

    if not GROQ_API_KEY:
        return jsonify({"error": "Server is missing GROQ_API_KEY. Please configure it in .env"}), 500

    # --- Save & extract ---
    filename = secure_filename(file.filename)
    filepath = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    file.save(filepath)

    try:
        resume_text = extract_text_from_pdf(filepath)
        if not resume_text.strip():
            return jsonify({"error": "Could not extract text from the PDF. It may be image-based or empty."}), 400
    except Exception as e:
        return jsonify({"error": f"PDF processing failed: {str(e)}"}), 400
    finally:
        # Clean up uploaded file after extraction
        if os.path.exists(filepath):
            os.remove(filepath)

    # --- Call AI ---
    try:
        prompt = ANALYSIS_PROMPT.format(
            resume_text=resume_text,
            job_description=job_description,
        )
        raw = call_ai(prompt)
        result = parse_json_response(raw)
        return jsonify(result)
    except json.JSONDecodeError:
        return jsonify({"error": "AI returned invalid JSON. Please try again."}), 502
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"AI analysis failed: {str(e)}"}), 500


@app.route("/api/improve", methods=["POST"])
def improve():
    """Rewrite weak bullet points using AI."""
    data = request.get_json(force=True)
    job_description = data.get("job_description", "").strip()
    weak_phrases = data.get("weak_phrases", [])

    if not job_description or not weak_phrases:
        return jsonify({"error": "Job description and weak phrases are required."}), 400

    if not GROQ_API_KEY:
        return jsonify({"error": "Server is missing GROQ_API_KEY. Please configure it in .env"}), 500

    formatted = "\n".join(
        f"- {wp.get('original', wp) if isinstance(wp, dict) else wp}"
        for wp in weak_phrases
    )

    try:
        prompt = IMPROVE_PROMPT.format(
            job_description=job_description,
            weak_phrases=formatted,
        )
        raw = call_ai(prompt)
        result = parse_json_response(raw)
        return jsonify({"improved": result})
    except json.JSONDecodeError:
        return jsonify({"error": "AI returned invalid JSON. Please try again."}), 502
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Improvement failed: {str(e)}"}), 500


# ── Run ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    app.run(debug=True, port=5000)
