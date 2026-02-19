import pdf from 'pdf-parse';

export async function extractText(buffer) {
    try {
        const data = await pdf(buffer);
        const text = data.text;

        if (!text || text.trim().length === 0) {
            throw new Error('No text content found in PDF');
        }

        // Clean and normalize text
        const cleaned = text
            .replace(/\r\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .replace(/\s{2,}/g, ' ')
            .replace(/[^\S\n]+/g, ' ')
            .trim();

        return cleaned;
    } catch (error) {
        console.error('PDF extraction error:', error);
        throw new Error('Failed to extract text from PDF');
    }
}
