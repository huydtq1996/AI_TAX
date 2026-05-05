import fitz

def extract(pdf_path, out_path):
    doc = fitz.open(pdf_path)
    text = ""
    for page in doc:
        text += page.get_text() + "\n"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(text)

extract("documents/68_2026_ND-CP.pdf", "documents/68_text.txt")
extract("documents/141_2026_ND-CP.pdf", "documents/141_text.txt")
