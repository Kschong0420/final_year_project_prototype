"""Explicit test-only Ollama HTTP fixture for browser tests; never used in production."""
import json

from fastapi import FastAPI

app = FastAPI()


@app.get("/api/tags")
def tags():
    return {"models": [{"name": "phi3:mini"}]}


@app.post("/api/generate")
def generate(body: dict):
    if '"source_quote"' in body.get('prompt', ''):
        return {"response": json.dumps({
            "explanation": "Plants use photosynthesis to turn light energy into chemical energy. Chlorophyll absorbs light in the chloroplast. Carbon dioxide and water are used to produce glucose and oxygen.",
            "source_quote": "Chlorophyll absorbs light in the chloroplast.",
        }), "done": True}
    questions = [
        {"type": "mcq", "prompt": "Which pigment absorbs light in the chloroplast?",
         "options": ["Chlorophyll", "Oxygen", "Water", "Glucose"], "correct_index": 0},
        {"type": "mcq", "prompt": "Which product do plants produce during photosynthesis?",
         "options": ["Glucose", "Chloroplast", "Light", "Carbon dioxide"], "correct_index": 0},
        {"type": "fill_blank", "prompt": "Plants use carbon dioxide and water to produce ____ and oxygen.",
         "expected_answer": "glucose"},
    ]
    return {"response": json.dumps({"questions": questions}), "done": True}
