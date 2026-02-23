import TutorialBubble from './TutorialBubble';
import Link from '@mui/material/Link';
import { Trans, useTranslation } from 'react-i18next';

const DeckFieldTutorialBubble: React.FC<{
    noDecks: boolean;
    show: boolean;
    disabled: boolean;
    onCreateDefaultDeck: () => void;
    children: React.ReactElement;
}> = ({ noDecks, show, disabled, children, onCreateDefaultDeck }) => {
    const { t } = useTranslation();

    return (
        <TutorialBubble
            show={show}
            placement="bottom"
            disabled={disabled}
            text={
                <>
                    <Trans i18nKey="ftue.deck" components={[<b key={0}>{t('settings.deck')}</b>]} />
                    {noDecks && (
                        <>
                            <p />
                            <Trans
                                i18nKey="ftue.defaultDeck"
                                components={[
                                    <Link key={0} href={'#'} onClick={onCreateDefaultDeck}>
                                        {t('ftue.createDefaultDeck', { defaultValue: 'create the default one' })}
                                    </Link>,
                                ]}
                            />
                        </>
                    )}
                </>
            }
        >
            {children}
        </TutorialBubble>
    );
};

export default DeckFieldTutorialBubble;
