import sys
import os
from dotenv import load_dotenv

sys.path.append(os.path.abspath('backend'))
load_dotenv('backend/.env')

from services.gemini_service import GeminiService

gs = GeminiService()
res = gs.embed_text("test")
print("Embed result type:", type(res), "Length:", len(res) if res else "None")
