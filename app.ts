import { Client, Message, TextChannel } from 'discord.js';
import Game from "./Game";

const client = new Client();

client.on('ready', () => {
	console.log(`Running as ${client.user.tag}`);
});

const activeGameChannels: Array<TextChannel> = [];

client.on('message', msg => {
	if (msg.author.bot) return;

	if (!(msg.channel instanceof TextChannel)) return;

	if (msg.content === "wwr") {
		new Game(client).start(msg.channel);
		activeGameChannels.push(msg.channel);
		return;
	}
});

client.login("token").catch(console.error);
