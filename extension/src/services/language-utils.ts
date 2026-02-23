import LanguageDetect from 'languagedetect';

const detector = new LanguageDetect();

export const normalizeLangCode = (s?: string | null): string | undefined => {
    if (!s) return undefined;
    const raw = s.trim();
    if (!raw) return undefined;

    // 1) Direct BCP-47-ish values (take primary subtag)
    // e.g. "en", "en-US", "ja-JP"
    const lower = raw.toLowerCase();
    const direct = lower.match(/^(?<code>[a-z]{2,3})(-[a-z0-9]{2,8})*$/)?.groups?.code;
    if (direct) {
        return direct;
    }

    // 2) Heuristic mapping from common visible names
    const map: Array<[RegExp, string]> = [
        [/\b(japanese|日本語|にほんご)\b/i, 'ja'],
        [/\b(english|inglés|ingles|anglais|englisch)\b/i, 'en'],
        [/\b(spanish|español|espanol)\b/i, 'es'],
        [/\b(french|français|francais)\b/i, 'fr'],
        [/\b(german|deutsch)\b/i, 'de'],
        [/\b(italian|italiano)\b/i, 'it'],
        [/\b(portuguese|português|portugues)\b/i, 'pt'],
        [/\b(chinese|中文|汉语|漢語|國語|国语|普通话|普通話|mandarin)\b/i, 'zh'],
        [/\b(korean|한국어|조선말)\b/i, 'ko'],
        [/\b(vietnamese|tiếng việt|tieng viet)\b/i, 'vi'],
        [/\b(russian|русский)\b/i, 'ru'],
        [/\b(arabic|العربية)\b/i, 'ar'],
        [/\b(hindi|हिन्दी|हिंदी)\b/i, 'hi'],
        [/\b(turkish|türkçe|turkce)\b/i, 'tr'],
        [/\b(polish|polski)\b/i, 'pl'],
        [/\b(dutch|nederlands)\b/i, 'nl'],
        [/\b(swedish|svenska)\b/i, 'sv'],
        [/\b(indonesian|bahasa indonesia)\b/i, 'id'],
        [/\b(greek|ελληνικά|ελληνικα)\b/i, 'el'],
        [/\b(hungarian|magyar)\b/i, 'hu'],
        [/\b(latin|latina)\b/i, 'la'],
    ];

    for (const [re, code] of map) {
        if (re.test(raw)) return code;
    }

    return undefined;
};

export const detectLanguage = (text: string): string | undefined => {
    if (!text || text.length < 10) return undefined;

    // Japanese/Chinese/Korean Check (Library is weak with shorts CJK)
    if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return 'ja';
    if (/[\uAC00-\uD7AF]/.test(text)) return 'ko';

    // Use Library
    const results = detector.detect(text, 1);
    if (results && results.length > 0) {
        // Map library output (e.g. "spanish") to code ("es")
        return normalizeLangCode(results[0][0]);
    }

    return undefined;
};
