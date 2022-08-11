import Discord from "discord.js";
import { Bot } from "../../main";
import CommandT from '../../commandT';

export default class Choose extends CommandT {
  static commandName = "choose";
  static ver = "1.0.1";

  static async applicationConstructor(start?: boolean): Promise<Discord.RESTPostAPIApplicationCommandsJSONBody> {
    let command = new Discord.SlashCommandBuilder().setName(Choose.commandName).setDescription("Having a problem with making some important decision? Let the bot choose for you!")
        .addStringOption((o) => o.setName("options").setDescription('The options seperated by the "|" character').setMaxLength(2000).setRequired(true)).toJSON();
    return command;
  }

  static async run(int: Discord.ChatInputCommandInteraction, bot: Bot): Promise<void> {
    await new Choose(int, bot).main();
  }

  constructor(private originalInteraction: Discord.ChatInputCommandInteraction, private bot: Bot) { super() }

  private async main(): Promise<void> {
    let opt = this.originalInteraction.options.getString("options").trim().split("|");
    let ch = opt[Math.floor(Math.random() * opt.length)];

    let resps = [
      `definitely **${ch}**`,
      `Quite hard choice, but i think the best option is **${ch}**`,
      `That's easy, of course **${ch}**`,
      "None of them, just go and do something useful",
      `**${ch}** sounds like good idea`,
      `Yeah... best I can do is to choose the worst one which is **${ch}**`,
      `hmm... go for **${ch}**`,
      `**${ch}** is good idea`,
      `**${ch}** is the wors... Best idea!`,
      `**${ch}** sounds great`,
    ];
    let embed = new Discord.EmbedBuilder()
      .setAuthor({ name: "choose" })
      .setColor(0xffb404)
      .setDescription(resps[Math.floor(Math.random() * resps.length)].slice(0, 4096))
      .setFooter({ text: `Choices: ${opt.join(", ")}`.slice(0, 2048) });
      
    this.originalInteraction.reply({ embeds: [embed] });
  }
}
