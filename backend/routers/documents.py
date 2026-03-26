import io
import docx
import PyPDF2
from fastapi import APIRouter, File, UploadFile, HTTPException

router = APIRouter(prefix="/api/documents", tags=["Documents"])

@router.post("/parse")
async def parse_document(file: UploadFile = File(...)):
    filename = file.filename.lower()
    try:
        content = await file.read()
        extracted_text = ""

        if filename.endswith(".pdf"):
            pdf_reader = PyPDF2.PdfReader(io.BytesIO(content))
            for page in pdf_reader.pages:
                text = page.extract_text()
                if text:
                    extracted_text += text + "\n"
        
        elif filename.endswith(".docx"):
            doc = docx.Document(io.BytesIO(content))
            for para in doc.paragraphs:
                extracted_text += para.text + "\n"
                
        elif filename.endswith(".txt") or filename.endswith(".csv"):
            extracted_text = content.decode("utf-8", errors="replace")
            
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format.")

        return {"filename": file.filename, "text": extracted_text.strip()}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error parsing document: {str(e)}")
