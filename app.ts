import {Client, Snowflake, TextChannel} from 'discord.js';
import Game from "./Game";
import {deleteMessage} from "./Utils";

const client = new Client();

client.on('ready', () => {
	console.log(`Running as ${client.user.tag}`);
});

const activeGameChannels: Array<Snowflake> = [];

client.on('message', msg => {
	if (msg.author.bot) return;

	if (!(msg.channel instanceof TextChannel)) return;

	if (msg.content === "wwr") {
		if (activeGameChannels.includes(msg.channel.id)) {
			msg.reply("There is already a game running! Please wait until it finished.")
				.then(msg => deleteMessage(msg, 5000));
			return;
		}

		new Game(client, activeGameChannels).start(msg.channel);
		activeGameChannels.push(msg.channel.id);
		return;
	}
});

client.login("token").catch(console.error);
