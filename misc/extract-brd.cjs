const PDFParser = require('pdf2json');
const fs = require('fs');
const file = 'SFSL_BRD_Comprehensive_Summary_Final_Aligned.pdf';
const pdfParser = new PDFParser(this, 1);
pdfParser.on('pdfParser_dataError', errData => console.error(errData.parserError));
pdfParser.on('pdfParser_dataReady', pdfData => {
    fs.writeFileSync('brd_output.txt', pdfParser.getRawTextContent());
    console.log('Extracted ' + file);
});
pdfParser.loadPDF(file);
