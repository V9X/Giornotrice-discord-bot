import Discord from "discord.js";
import { Bot } from "../../main";
import CommandT from '../../commandT';

export default class Ping extends CommandT {
  static commandName = "ping";
  static ver = "1.0.1";

  static async applicationConstructor(start?: boolean): Promise<Discord.RESTPostAPIApplicationCommandsJSONBody> {
    let command = new Discord.SlashCommandBuilder().setName(Ping.commandName).setDescription("Checks bot's ping").toJSON();
    return command
  }

  static async run(int: Discord.ChatInputCommandInteraction, bot: Bot) {
    await new Ping(int, bot).main();
  }

  constructor( private interaction: Discord.ChatInputCommandInteraction, private bot: Bot ) { super() }

  private async main(): Promise<void> {
    let embed = new Discord.EmbedBuilder({
      color: 0xffb404,
      description: `**Pong 🏓**\nPing: ${Date.now() - this.interaction.createdTimestamp}ms\nAPI ping: ${Math.round(this.bot.ws.ping)}ms`,
    });
    await this.interaction.reply({ embeds: [embed] });
  }
}