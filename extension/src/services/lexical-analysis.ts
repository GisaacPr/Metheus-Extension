import type { LexicalAnalysisResult } from './language-intelligence';

const PRIORITY_LANGUAGES = new Set(['en', 'es', 'fr', 'de', 'it']);

type LemmaProfile = {
    irregular: Record<string, string>;
    derive: (word: string) => string[];
};

const sanitizeText = (value?: string | null): string =>
    (value || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const normalizeLanguageCode = (value?: string | null): string =>
    sanitizeText(value || 'auto')
        .toLowerCase()
        .replace(/^ln_/i, '')
        .split('-')[0] || 'auto';

const normalizeLookupText = (value?: string | null): string =>
    sanitizeText(value || '')
        .replace(/[.,!?;:()[\]{}]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const isSingleToken = (value: string) => !/\s/.test(value.trim());

const unique = (items: Array<string | null | undefined>) =>
    Array.from(new Set(items.map((item) => normalizeLookupText(item || '')).filter(Boolean)));

const removeDoubleTrailingConsonant = (value: string) => value.replace(/([b-df-hj-np-tv-z])\1$/i, '$1');

const englishProfile: LemmaProfile = {
    irregular: {
        am: 'be',
        is: 'be',
        are: 'be',
        was: 'be',
        were: 'be',
        been: 'be',
        being: 'be',
        has: 'have',
        had: 'have',
        having: 'have',
        does: 'do',
        did: 'do',
        done: 'do',
        doing: 'do',
        better: 'good',
        best: 'good',
        worse: 'bad',
        worst: 'bad',
        went: 'go',
        gone: 'go',
        saw: 'see',
        seen: 'see',
        took: 'take',
        taken: 'take',
        ran: 'run',
        running: 'run',
    },
    derive(word) {
        const candidates = new Set<string>();
        if (word.endsWith('ies') && word.length > 4) candidates.add(`${word.slice(0, -3)}y`);
        if (word.endsWith('ing') && word.length > 5) {
            const stem = word.slice(0, -3);
            candidates.add(removeDoubleTrailingConsonant(stem));
            candidates.add(`${stem}e`);
        }
        if (word.endsWith('ed') && word.length > 4) {
            const stem = word.slice(0, -2);
            candidates.add(removeDoubleTrailingConsonant(stem));
            candidates.add(`${stem}e`);
        }
        if (word.endsWith('es') && word.length > 4) candidates.add(word.slice(0, -2));
        if (word.endsWith('s') && word.length > 3 && !word.endsWith('ss')) candidates.add(word.slice(0, -1));
        return Array.from(candidates);
    },
};

const spanishProfile: LemmaProfile = {
    irregular: {
        soy: 'ser',
        eres: 'ser',
        es: 'ser',
        somos: 'ser',
        son: 'ser',
        fui: 'ser',
        fue: 'ser',
        fueron: 'ser',
        era: 'ser',
        eran: 'ser',
        estoy: 'estar',
        estas: 'estar',
        esta: 'estar',
        estan: 'estar',
        estaba: 'estar',
        estaban: 'estar',
        tengo: 'tener',
        tiene: 'tener',
        tienen: 'tener',
        tuve: 'tener',
        hizo: 'hacer',
        hecho: 'hacer',
        dicho: 'decir',
        visto: 'ver',
    },
    derive(word) {
        const candidates = new Set<string>();
        if (word.endsWith('ando') && word.length > 6) candidates.add(`${word.slice(0, -4)}ar`);
        if (word.endsWith('iendo') && word.length > 7) {
            const stem = word.slice(0, -5);
            candidates.add(`${stem}er`);
            candidates.add(`${stem}ir`);
        }
        if (word.endsWith('ados') || word.endsWith('adas')) candidates.add(`${word.slice(0, -4)}ar`);
        if (word.endsWith('idos') || word.endsWith('idas')) {
            const stem = word.slice(0, -4);
            candidates.add(`${stem}er`);
            candidates.add(`${stem}ir`);
        }
        if (word.endsWith('es') && word.length > 4) candidates.add(word.slice(0, -2));
        if (word.endsWith('os') && word.length > 4) candidates.add(word.slice(0, -1));
        if (word.endsWith('as') && word.length > 4) candidates.add(word.slice(0, -1));
        if (word.endsWith('s') && word.length > 3) candidates.add(word.slice(0, -1));
        return Array.from(candidates);
    },
};

const frenchProfile: LemmaProfile = {
    irregular: {
        suis: 'etre',
        est: 'etre',
        sommes: 'etre',
        sont: 'etre',
        etais: 'etre',
        avait: 'avoir',
        ont: 'avoir',
        eu: 'avoir',
        fait: 'faire',
        allait: 'aller',
    },
    derive(word) {
        const candidates = new Set<string>();
        if (word.endsWith('ees') || word.endsWith('es') || word.endsWith('ee')) {
            candidates.add(word.replace(/ees$|es$|ee$/i, 'er'));
        }
        if (word.endsWith('ant') && word.length > 5) candidates.add(`${word.slice(0, -3)}er`);
        if (word.endsWith('es') && word.length > 4) candidates.add(word.slice(0, -2));
        if (word.endsWith('s') && word.length > 3) candidates.add(word.slice(0, -1));
        return Array.from(candidates);
    },
};

const germanProfile: LemmaProfile = {
    irregular: {
        ist: 'sein',
        sind: 'sein',
        war: 'sein',
        waren: 'sein',
        gewesen: 'sein',
        hat: 'haben',
        hatten: 'haben',
        hatte: 'haben',
        gemacht: 'machen',
    },
    derive(word) {
        const candidates = new Set<string>();
        if (word.endsWith('en') && word.length > 4) candidates.add(word.slice(0, -2));
        if (word.endsWith('er') && word.length > 4) candidates.add(word.slice(0, -2));
        if (word.endsWith('e') && word.length > 4) candidates.add(word.slice(0, -1));
        if (word.endsWith('n') && word.length > 4) candidates.add(word.slice(0, -1));
        return Array.from(candidates);
    },
};

const italianProfile: LemmaProfile = {
    irregular: {
        sono: 'essere',
        sei: 'essere',
        era: 'essere',
        erano: 'essere',
        stato: 'essere',
        stata: 'essere',
        fatto: 'fare',
        detto: 'dire',
        visto: 'vedere',
        avuto: 'avere',
    },
    derive(word) {
        const candidates = new Set<string>();
        if (word.endsWith('ando') && word.length > 6) candidates.add(`${word.slice(0, -4)}are`);
        if (word.endsWith('endo') && word.length > 6) {
            candidates.add(`${word.slice(0, -4)}ere`);
            candidates.add(`${word.slice(0, -4)}ire`);
        }
        if (word.endsWith('ati') || word.endsWith('ata') || word.endsWith('ato')) candidates.add(`${word.slice(0, -3)}are`);
        if (word.endsWith('uti') || word.endsWith('uta') || word.endsWith('uto')) candidates.add(`${word.slice(0, -3)}ere`);
        if (word.endsWith('iti') || word.endsWith('ita') || word.endsWith('ito')) candidates.add(`${word.slice(0, -3)}ire`);
        if (word.endsWith('i') && word.length > 3) {
            candidates.add(`${word.slice(0, -1)}o`);
            candidates.add(`${word.slice(0, -1)}a`);
        }
        return Array.from(candidates);
    },
};

const lemmaProfiles: Record<string, LemmaProfile> = {
    en: englishProfile,
    es: spanishProfile,
    fr: frenchProfile,
    de: germanProfile,
    it: italianProfile,
};

const toTitleCase = (value: string) => (value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value);

export function analyzeLexicalUnit(params: {
    text: string;
    language?: string;
    contextText?: string;
    pos?: string | null;
}): LexicalAnalysisResult {
    const sourceLanguage = normalizeLanguageCode(params.language || 'auto');
    const surface = (params.text || '').trim();
    const normalizedSurface = normalizeLookupText(surface);
    const profile = lemmaProfiles[sourceLanguage];

    if (!normalizedSurface) {
        return {
            sourceLanguage,
            surface,
            normalizedSurface: '',
            lemma: null,
            lookupVariants: [],
            languageConfidence: 'low',
            usedRuleBasedFallback: false,
        };
    }

    const lookupVariants = new Set<string>([
        normalizedSurface,
        normalizeLookupText(normalizedSurface.toLowerCase()),
        normalizeLookupText(toTitleCase(normalizedSurface.toLowerCase())),
    ]);

    let lemma: string | null = null;
    let usedRuleBasedFallback = false;

    if (profile && isSingleToken(normalizedSurface)) {
        const lower = normalizedSurface.toLowerCase();
        lemma = normalizeLookupText(profile.irregular[lower] || '');

        if (!lemma) {
            const derived = unique(profile.derive(lower));
            if (derived.length > 0) {
                lemma = derived[0];
                usedRuleBasedFallback = true;
            }
        }

        if (lemma) {
            lookupVariants.add(lemma);
            lookupVariants.add(toTitleCase(lemma));
        }
    }

    return {
        sourceLanguage,
        surface,
        normalizedSurface,
        lemma,
        lookupVariants: Array.from(lookupVariants).filter(Boolean),
        languageConfidence: PRIORITY_LANGUAGES.has(sourceLanguage) ? (lemma ? 'high' : 'medium') : 'low',
        usedRuleBasedFallback,
    };
}
