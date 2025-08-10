from google import genai
from src.config import GEMINI_API_KEY, OPENAI_API_KEY, GROQ_API_KEY

# Optional providers; import lazily where possible
try:
    from openai import OpenAI  # type: ignore
except Exception:  # pragma: no cover
    OpenAI = None  # type: ignore

try:
    from groq import Groq  # type: ignore
except Exception:  # pragma: no cover
    Groq = None  # type: ignore


gemini_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None
openai_client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None
groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None


def get_gemini_client():
    return gemini_client


def get_openai_client():
    return openai_client


def get_groq_client():
    return groq_client