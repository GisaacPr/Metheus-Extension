import { createTheme as createMuiTheme, PaletteMode } from '@mui/material/styles';
import { red } from '@mui/material/colors';

export const createTheme = (themeType: PaletteMode) =>
    createMuiTheme({
        palette: {
            primary: {
                // Match Metheus web app (Tailwind cyan-500)
                main: '#06b6d4',
            },
            error: {
                main: red.A400,
            },
            background: {
                default: 'rgba(0, 0, 0, 0)',
                paper: themeType === 'dark' ? '#000000' : '#ffffff',
            },
            mode: themeType as PaletteMode,
        },
    });
