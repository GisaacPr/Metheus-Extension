import { Command, CopyMessage, Message, PublishCardMessage, PostMineAction } from '@metheus/common';
import { CardPublisher } from '../../services/card-publisher';

export default class PublishCardHandler {
    private readonly _cardPublisher: CardPublisher;

    constructor(cardPublisher: CardPublisher) {
        this._cardPublisher = cardPublisher;
    }

    get sender() {
        return 'asbplayerv2';
    }

    get command() {
        return 'publish-card';
    }

    handle(command: Command<Message>, sender: Browser.runtime.MessageSender) {
        const message = command.message as PublishCardMessage;
        this._cardPublisher.publish(message, PostMineAction.exportCard, sender.tab?.id, (command as any).src);
        return false;
    }
}
