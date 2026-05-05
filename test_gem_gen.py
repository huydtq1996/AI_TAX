import sys
import os
from dotenv import load_dotenv

sys.path.append(os.path.abspath('backend'))
load_dotenv('backend/.env')

from services.gemini_service import GeminiService

gs = GeminiService()
res = gs.generate_response("say hello")
print("Response:", res)
