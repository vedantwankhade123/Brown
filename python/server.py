import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from inference import LocalInferenceEngine
from scraper import scrape_local_url

app = FastAPI(title="Ultron Local Engine Server", description="Offline Local AI Helper")

# Initialize default local inference engine
engine = LocalInferenceEngine(model_name="phi4")

class QueryRequest(BaseModel):
  prompt: str
  model: str = "phi4"

class ScrapeRequest(BaseModel):
  url: str

@app.get("/status")
def get_status():
  return {
    "status": "online",
    "host": "127.0.0.1",
    "loopback": True,
    "model": engine.model_name
  }

@app.post("/query")
def execute_query(payload: QueryRequest):
  # Update engine model if client requests a different one
  if payload.model != engine.model_name:
    engine.model_name = payload.model
    
  try:
    reply = engine.query_ollama(payload.prompt)
    return {
      "success": True,
      "response": reply,
      "context_words": engine.estimate_word_count()
    }
  except Exception as e:
    raise HTTPException(status_code=500, detail=f"Inference Loop Failed: {str(e)}")

@app.post("/scrape")
async def execute_scrape(payload: ScrapeRequest):
  # Ensure we only scrape local loopbacks or local files for offline security guidelines
  if not (payload.url.startswith("http://127.0.0.1") or payload.url.startswith("http://localhost") or payload.url.startswith("file://")):
    raise HTTPException(
      status_code=403, 
      detail="Security Boundary Check: Remote domain web scraping is restricted in offline privacy containment."
    )
    
  try:
    text = await scrape_local_url(payload.url)
    return {
      "success": True,
      "data": text
    }
  except Exception as e:
    raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
  # Run strictly bound to 127.0.0.1 loopback
  uvicorn.run(app, host="127.0.0.1", port=8000)
