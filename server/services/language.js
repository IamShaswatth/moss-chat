import { franc } from 'franc';

// Unicode script ranges for reliable short-text detection
const scriptPatterns = [
    { script: 'Devanagari', regex: /[\u0900-\u097F]/, lang: 'hin' },
    { script: 'Bengali', regex: /[\u0980-\u09FF]/, lang: 'ben' },
    { script: 'Tamil', regex: /[\u0B80-\u0BFF]/, lang: 'tam' },
    { script: 'Telugu', regex: /[\u0C00-\u0C7F]/, lang: 'tel' },
    { script: 'Kannada', regex: /[\u0C80-\u0CFF]/, lang: 'kan' },
    { script: 'Malayalam', regex: /[\u0D00-\u0D7F]/, lang: 'mal' },
    { script: 'Gujarati', regex: /[\u0A80-\u0AFF]/, lang: 'guj' },
    { script: 'Gurmukhi', regex: /[\u0A00-\u0A7F]/, lang: 'pan' },
    { script: 'Arabic', regex: /[\u0600-\u06FF\u0750-\u077F]/, lang: 'ara' },
    { script: 'CJK', regex: /[\u4E00-\u9FFF\u3400-\u4DBF]/, lang: 'zho' },
    { script: 'Hiragana/Katakana', regex: /[\u3040-\u30FF]/, lang: 'jpn' },
    { script: 'Hangul', regex: /[\uAC00-\uD7AF\u1100-\u11FF]/, lang: 'kor' },
    { script: 'Cyrillic', regex: /[\u0400-\u04FF]/, lang: 'rus' },
    { script: 'Thai', regex: /[\u0E00-\u0E7F]/, lang: 'tha' },
];

const languageMap = {
    eng: 'English',
    hin: 'Hindi',
    ben: 'Bengali',
    tam: 'Tamil',
    tel: 'Telugu',
    kan: 'Kannada',
    mal: 'Malayalam',
    guj: 'Gujarati',
    pan: 'Punjabi',
    mar: 'Marathi',
    spa: 'Spanish',
    fra: 'French',
    deu: 'German',
    por: 'Portuguese',
    ita: 'Italian',
    jpn: 'Japanese',
    kor: 'Korean',
    zho: 'Chinese',
    ara: 'Arabic',
    rus: 'Russian',
    tha: 'Thai',
    tur: 'Turkish',
    vie: 'Vietnamese',
    ind: 'Indonesian',
    msa: 'Malay',
};

export function detectLanguage(text) {
    if (!text || text.trim().length === 0) return 'eng';

    // Step 1: Check Unicode script patterns (works for even 1-word queries)
    for (const { regex, lang } of scriptPatterns) {
        if (regex.test(text)) return lang;
    }

    // Step 2: For Latin-script text, use franc (needs longer text)
    try {
        if (text.length >= 30) {
            const detected = franc(text, { minLength: 20 });
            if (detected !== 'und') return detected;
        }
    } catch {
        // franc failed, fall through
    }

    // Step 3: Default to English for Latin-script text
    return 'eng';
}

export function getLanguageName(code) {
    return languageMap[code] || 'English';
}
