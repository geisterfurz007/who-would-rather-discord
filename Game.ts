import {
	Client,
	Collection,
	Emoji,
	GuildMember,
	Message,
	MessageReaction,
	ReactionEmoji,
	RichEmbed,
	Snowflake,
	TextChannel,
	User
} from "discord.js";
import {deleteMessage} from "./Utils";
import axios from 'axios';

/*TODO
 + Disallow duplicate votes.
 + Disallow votes by people outside the game.
 + Deleting the voting list.
 - End voting if everyone voted.
 / Question list.
 */

export default class Game {
	bot: Client;
	question: string;
	otherRounds: Array<Snowflake>;

	signUpTime = 10;
	voteTime = 15;

	constructor(bot: Client, otherRounds: Array<Snowflake>) {
		this.bot = bot;
		this.otherRounds = otherRounds;
	}

	async start(channel: TextChannel) {
		await this.setQuestion();

		const embed = this.gameEmbed(channel, "Sign up!",
			`A new round of "Who would rather" just started! React to this message during the next ${this.signUpTime} seconds with a unique emote or chose one of the provided ones to join.`);
		const signUpMessage = await channel.send(embed);

		if (!(signUpMessage instanceof Message)) return;

		const collector = signUpMessage.createReactionCollector(this.signUpFilter, {time: this.signUpTime * 1000});

		const reactionNumbers = ["\u0030\u20E3", "\u0031\u20E3", "\u0032\u20E3", "\u0033\u20E3", "\u0034\u20E3", "\u0035\u20E3", "\u0036\u20E3", "\u0037\u20E3", "\u0038\u20E3", "\u0039\u20E3"];

		for (let number of reactionNumbers) {
			await signUpMessage.react(number);
		}

		collector.on('end', collected => this.questionRound(channel, collected));

		return;
	}

	async setQuestion() {
		const entries = [];
		const response = await axios.get('https://spreadsheets.google.com/feeds/cells/1tWHKwajakUco7WwUWuU7xAoVFfDSFDJ3BArgBf_37Kk/1/public/full?alt=json');

		response.data.feed.entry.forEach(element => {
			entries.push(element.content.$t)
		});

		const question = entries[Math.floor(Math.random() * entries.length)];
		this.question = `Who is most likely to ${question}`;
	}

	signUpFilter(reaction: MessageReaction, user: User) {
		if (user.bot) return false;

		const msg = reaction.message;

		// Clear reaction if it was provided by the bot
		reaction.users.filter((user) => user.bot).forEach(user => reaction.remove(user));

		const taken = reaction.users.filter(u => !u.bot && u.id !== user.id).size > 0;

		// If the user picks an emoji someone else already used, deny that reaction and notify the user.
		if (taken) {
			msg.channel.send(user + " Your chosen emoji was already taken by someone else. Please react with a unique emoji to join.")
				.then(warn => deleteMessage(warn, 10000));
			reaction.remove(user);
			return false;
		}

		const botHasEmoji = reaction.emoji.id === null // Standard emoji
			|| msg.guild.emojis.some(emoji => emoji.id === reaction.emoji.id);

		if (!botHasEmoji) {
			msg.channel.send(user + " Your chosen emoji is not available to this bot. Please use a standard emoji or one of this server")
				.then(warn => deleteMessage(warn, 10000));
			reaction.remove(user);
			return false;
		}

		//If the user has already used some other emoji, just remove it and accept the new one.
		const reactionByUser = existingReaction => existingReaction.users.some(({id}) => id === user.id);

		const previousReactionsBySameUser = msg.reactions.filter(reactionByUser).filter(exR => exR.emoji.id !== reaction.emoji.id || exR.emoji.name !== reaction.emoji.name);
		previousReactionsBySameUser.forEach(reaction => reaction.remove(user));

		return true;
	};

	async questionRound(channel: TextChannel, reactions: Collection<string, MessageReaction>) {
		const minPlayers = 1;

		const notEnoughPlayers = async () => {
			const embed = this.gameEmbed(channel, "Issue", "There aren't enough players for the game. Get more people here and start again!");
			await channel.send(embed);
			this.clearChannelStatus(channel);
			return;
		};

		if (reactions.size < minPlayers) {
			await notEnoughPlayers();
			return;
		}

		const memberFromReactions = reaction => {
			const user = reaction.users.filter(user => !user.bot).array()[0];
			return channel.guild.member(user);
		};

		const userReactionMap = reactions
			.map(reaction => ({emoji: reaction.emoji, user: memberFromReactions(reaction)}))
			.filter(({user}) => user) // Remove entries that were removed because of duplicate
			.sort(({user: userA}, {user: userB}) => userA.displayName.localeCompare(userB.displayName));

		if (userReactionMap.length < minPlayers) {
			await notEnoughPlayers();
			return;
		}

		const question = `${this.question}? Use the emojis to cast your vote during the next ${this.voteTime} seconds!`;
		const embed = this.gameEmbed(channel, "Question", question);
		await channel.send(embed);

		const peopleList = userReactionMap.map(({emoji, user}) => `${emoji} - ${user.displayName}`);
		const sendResult = await channel.send(peopleList);

		let voteMessage: Message;
		if (sendResult instanceof Message) {
			voteMessage = sendResult;
		} else { // I think this could hypothetically be hit if there is a huge list of people playing and there are two messages posted listing the participants. Rather unlikely tho.
			voteMessage = sendResult[sendResult.length];
		}

		deleteMessage(sendResult, this.voteTime * 1000);

		userReactionMap.map(({emoji}) => emoji).forEach(emoji => voteMessage.react(emoji));

		const voteCollector = voteMessage.createReactionCollector(
			(reaction, user) => this.voteFilter(reaction, user, userReactionMap),
			{time: this.voteTime * 1000}
		);
		voteCollector.on('end', collection => this.voteEndListener(collection, userReactionMap, channel));
	}

	voteFilter(reaction: MessageReaction,
	           user: User,
	           userReactionMap: Array<{ emoji: Emoji | ReactionEmoji, user: GuildMember }>) {
		if (user.bot) return false;

		if (userReactionMap.every(({user: u}) => u.id !== user.id)) {
			reaction.remove(user);
			return false;
		}

		const allReactions = reaction.message.reactions;

		const reactionByUser = existingReaction => existingReaction.users.some(({id}) => id === user.id);
		const otherReactionsBySameUser = allReactions.filter(reactionByUser)
			.filter(({emoji: e}) => e.id !== reaction.emoji.id || e.name !== reaction.emoji.name);

		otherReactionsBySameUser.forEach(reaction => reaction.remove(user));

		return true;
	}

	voteEndListener(votings: Collection<string, MessageReaction>,
	                userReactionMap: Array<{ emoji: Emoji | ReactionEmoji, user: GuildMember }>,
	                channel: TextChannel) {

		const mostReactions: { max: number, emojis: Array<Emoji | ReactionEmoji> } = votings.reduce((acc, reaction) => {
			const reactionCount = reaction.users.size;
			if (reactionCount > acc.max) return {max: reactionCount, emojis: [reaction.emoji]};
			if (reactionCount === acc.max) {
				acc.emojis.push(reaction.emoji);
			}

			return acc;
		}, {max: 0, emojis: []});

		const users = userReactionMap.filter(({emoji}) =>
			mostReactions.emojis.some(e => e.id === emoji.id && e.name === emoji.name)
		).map(({user}) => user).map(user => user.displayName);

		let userList: string;
		if (users.length === 0) userList = "noone? That's weird... Shouldn't have happened. Probably never will actually.";
		if (users.length === 1) userList = users[0];
		// https://stackoverflow.com/a/15069646/6707985
		if (users.length > 1) userList = users.slice(0, -1).join(", ") + " and " + users.slice(-1);

		const embed = this.gameEmbed(channel, "Result", `So... ${this.question}? It's **${userList}**!`);
		channel.send(embed);
		this.clearChannelStatus(channel);
	}

	clearChannelStatus(channel: TextChannel) {
		const roundIndex = this.otherRounds.indexOf(channel.id);
		if (roundIndex > -1)
			this.otherRounds.splice(roundIndex, 1);
	}

	gameEmbed(channel: TextChannel, titleNote: string, description: string): RichEmbed {
		const botColor = channel.guild.member(this.bot.user).displayColor;

		return new RichEmbed()
			.setColor(botColor)
			.setTitle("Who would rather? - " + titleNote)
			.setDescription(description);
	}

}
