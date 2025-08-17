import os
from os import path
from dotenv import load_dotenv

if path.exists(".env"):
    load_dotenv()

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") 
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

# Planner defaults
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "gemini")  # one of: gemini | openai | groq

if LLM_PROVIDER == "gemini":
    PLANNER_MODEL = os.getenv("PLANNER_MODEL", "gemini-2.5-pro")
    COARSE_PLAN_MODEL = os.getenv("COARSE_PLAN_MODEL", "gemini-2.5-flash")  # optional cheaper model for first turn / CoT
elif LLM_PROVIDER == "openai":
    PLANNER_MODEL = os.getenv("PLANNER_MODEL", "gpt-5")
    COARSE_PLAN_MODEL = os.getenv("COARSE_PLAN_MODEL", "gpt-5-mini")  # optional cheaper model for first turn / CoT
elif LLM_PROVIDER == "groq":
    PLANNER_MODEL = os.getenv("PLANNER_MODEL", "openai/gpt-oss-120b")
    # optional cheaper model for first turn / CoT
    COARSE_PLAN_MODEL = os.getenv("COARSE_PLAN_MODEL", "openai/gpt-oss-20b")
