import PyPDF2
import glob

files = glob.glob('d:\\Pre-Sales Agent\\presales-v8\\*.pdf')

for f in files:
    try:
        with open(f, 'rb') as pdf_file:
            reader = PyPDF2.PdfReader(pdf_file)
            print(f"--- CONTENT OF {f} ---")
            for page in reader.pages:
                print(page.extract_text())
    except Exception as e:
        print(f"Error reading {f}: {e}")
