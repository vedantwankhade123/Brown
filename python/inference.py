import json
import requests

OLLAMA_BASE_URL = "http://127.0.0.1:11434"
CONTEXT_LIMIT_WORDS = 3000  # Limit for offline token approximation

class LocalInferenceEngine:
  def __init__(self, model_name: str = "phi4"):
    self.model_name = model_name
    self.chat_history = []  # List of dicts: {"role": "user"/"assistant", "content": "..."}

  def estimate_word_count(self) -> int:
    """Approximates context size using token/word count heuristic."""
    return sum(len(message["content"].split()) for message in self.chat_history)

  def add_message(self, role: str, content: str):
    self.chat_history.append({"role": role, "content": content})
    
    # Context threshold check
    word_count = self.estimate_word_count()
    if word_count > CONTEXT_LIMIT_WORDS:
      self.trigger_recursive_summarization()

  def trigger_recursive_summarization(self):
    """
    Compresses early chat history elements to prevent Ollama context crash.
    Fuses the first 4 elements into a single condensed summary bubble.
    """
    if len(self.chat_history) < 6:
      return

    print("[INFERENCE] Context limit approached. Running recursive summarization...")
    
    # Extract historical segments to condense
    history_to_condense = self.chat_history[:4]
    remaining_history = self.chat_history[4:]

    text_to_summarize = "\n".join(
      f"{msg['role'].upper()}: {msg['content']}" for msg in history_to_condense
    )

    summarization_prompt = (
      "Condense the following conversation history into a concise, detailed "
      "bullet-point summary keeping important file paths and constraints:\n\n"
      f"{text_to_summarize}"
    )

    try:
      response = requests.post(
        f"{OLLAMA_BASE_URL}/api/generate",
        json={
          "model": self.model_name,
          "prompt": summarization_prompt,
          "stream": False
        },
        timeout=60
      )
      
      if response.status_code == 200:
        summary_text = response.json().get("response", "").strip()
        # Create summary replacement message
        fused_summary = {
          "role": "system",
          "content": f"Summary of early thread history: {summary_text}"
        }
        # Re-assemble history
        self.chat_history = [fused_summary] + remaining_history
        print("[INFERENCE] Successfully compressed early context records.")
      else:
        # Fallback if Ollama fails: truncate oldest 4 messages
        self.chat_history = remaining_history
        print("[INFERENCE] Ollama summarization failed. Falling back to oldest block deletion.")
        
    except Exception as e:
      self.chat_history = remaining_history
      print(f"[INFERENCE] Exception during summarization, falling back to truncation: {str(e)}")

  def query_ollama(self, prompt: str) -> str:
    """Queries local Ollama using current chat history."""
    self.add_message("user", prompt)
    
    payload = {
      "model": self.model_name,
      "messages": self.chat_history,
      "stream": False
    }

    try:
      response = requests.post(
        f"{OLLAMA_BASE_URL}/api/chat",
        json=payload,
        timeout=90
      )
      
      if response.status_code == 200:
        result = response.json()
        reply = result.get("message", {}).get("content", "").strip()
        self.add_message("assistant", reply)
        return reply
      else:
        return f"Ollama Connection Error (Status {response.status_code}): Ensure Ollama is running locally."
        
    except requests.exceptions.RequestException as e:
      return f"Offline Engine Offline: Local loopback connection failed ({str(e)}). Verify Ollama installation."
