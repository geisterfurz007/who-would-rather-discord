import {Message} from "discord.js";

const deleteMsg = (msg: Message | Message[], ms: number) => {
	if (msg instanceof Message) {
		msg.delete(ms);
	} else {
		msg.forEach(m => m.delete(ms));
	}
};

export const deleteMessage = deleteMsg;
