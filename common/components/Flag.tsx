import React from 'react';
import * as Flags from 'country-flag-icons/react/3x2';
import Box from '@mui/material/Box';

interface FlagProps {
    code: string;
    className?: string;
    style?: React.CSSProperties;
}

// Map language codes to Country Codes (ISO 3166-1 alpha-2)
const LANG_TO_COUNTRY: Record<string, keyof typeof Flags> = {
    en: 'US',
    es: 'ES',
    fr: 'FR',
    de: 'DE',
    it: 'IT',
    pt: 'PT',
    ru: 'RU',
    zh: 'CN',
    ja: 'JP',
    ko: 'KR',
    ar: 'SA',
    hi: 'IN',
    tr: 'TR',
    pl: 'PL',
    nl: 'NL',
    sv: 'SE',
    no: 'NO',
    da: 'DK',
    fi: 'FI',
    el: 'GR',
    vi: 'VN', // Vietnamese
    id: 'ID', // Indonesian
    hu: 'HU', // Hungarian
    la: 'VA', // Latin (Vatican)
    he: 'IL', // Hebrew
    th: 'TH', // Thai
    cs: 'CZ', // Czech
    ro: 'RO', // Romanian
    bg: 'BG', // Bulgarian
    uk: 'UA', // Ukrainian
    ms: 'MY', // Malay
    hr: 'HR', // Croatian
    sk: 'SK', // Slovak
    sl: 'SI', // Slovenian
    et: 'EE', // Estonian
    lv: 'LV', // Latvian
    lt: 'LT', // Lithuanian
    fa: 'IR', // Persian
};

export function Flag({ code, className, style }: FlagProps) {
    const countryCode = LANG_TO_COUNTRY[code.toLowerCase()] || 'GB';
    // @ts-ignore - Index signature for Flags
    const FlagComponent = Flags[countryCode];

    if (!FlagComponent) return null;

    return (
        <Box
            component="div"
            sx={{
                position: 'relative',
                overflow: 'hidden',
                borderRadius: '4px', // rounded-md
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)', // shadow-md
                border: '1px solid rgba(255, 255, 255, 0.1)', // ring-1 ring-white/10 (sort of)
                width: '100%',
                height: '100%',
                aspectRatio: '3/2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                ...style,
            }}
            className={className}
        >
            <FlagComponent style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            {/* Glass shine effect */}
            <Box
                sx={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(to top right, rgba(255,255,255,0.2), transparent)',
                    pointerEvents: 'none',
                }}
            />
        </Box>
    );
}
