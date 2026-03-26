import zipfile
import xml.etree.ElementTree as ET
import sys

def get_docx_text(path):
    with zipfile.ZipFile(path) as docx:
        tree = ET.XML(docx.read('word/document.xml'))
    text = []
    for paragraph in tree.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p'):
        p_text = [node.text for node in paragraph.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t') if node.text]
        if p_text:
            text.append(''.join(p_text))
    return '\n'.join(text)

try:
    print(get_docx_text(r"d:\Proposal Format\presales-fixed\docs\Copy of Non-Commercials-CCMS-Zoho-CRM-Plus-Implementation-Proposal-Fristine-Infotech.docx"))
except Exception as e:
    print("Error:", e)
