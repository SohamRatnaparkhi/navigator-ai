from google import genai
from src.config import GEMINI_API_KEY

gemini_client = genai.Client(api_key=GEMINI_API_KEY)

def get_gemini_client():
    return gemini_client