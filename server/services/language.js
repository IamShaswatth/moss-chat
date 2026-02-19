import { franc } from 'franc';

const languageMap = {
    eng: 'English',
    hin: 'Hindi',
    spa: 'Spanish',
    fra: 'French',
    deu: 'German',
    por: 'Portuguese',
    ita: 'Italian',
    jpn: 'Japanese',
    kor: 'Korean',
    zho: 'Chinese',
    ara: 'Arabic',
    rus: 'Russian'
};

export function detectLanguage(text) {
    try {
        // franc is unreliable with short text, default to English
        if (!text || text.length < 50) return 'eng';
        const detected = franc(text, { minLength: 30 });
        if (detected === 'und') return 'eng';
        return detected;
    } catch {
        return 'eng';
    }
}

export function getLanguageName(code) {
    return languageMap[code] || 'English';
}
