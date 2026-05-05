import os
import requests
import json
from dotenv import load_dotenv

load_dotenv('backend/.env')
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_ANON_KEY")

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json"
}

res = requests.get(f"{SUPABASE_URL}/rest/v1/tax_documents?select=id,title", headers=headers)
with open("docs.json", "w", encoding="utf-8") as f:
    json.dump(res.json(), f, ensure_ascii=False, indent=2)
