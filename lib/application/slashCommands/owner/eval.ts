import Discord from "discord.js";
import { Bot } from "../../../main";
import util from "node:util";
import CommandT from '../../../commandT';

export default class Ev extends CommandT {
  static commandName = "eval";
  static ver = "1.0.1";
  static owner = true;

  static async applicationConstructor(start?: boolean): Promise<Discord.RESTPostAPIApplicationCommandsJSONBody> {
    let command = new Discord.SlashCommandBuilder().setName(Ev.commandName).setDescription("_").setDefaultMemberPermissions("0")
      .addStringOption((o) => o.setName("expression").setDescription("_"))
      .addBooleanOption((o) => o.setName("private").setDescription("_")).toJSON();

    return command;
  }

  static async run(int: Discord.ChatInputCommandInteraction, bot: Bot): Promise<void> {
    if (int.user.id == process.env.ownerId) {
      await new Ev(int, bot).main();
    } else int.reply({ embeds: [ new Discord.EmbedBuilder().setTitle("no").setDescription("just no") ], ephemeral: true });
  }

  constructor(private originalInteraction: Discord.ChatInputCommandInteraction, private bot: Bot) { super() }

  private async main(): Promise<void> {
    let content = this.originalInteraction.options.getString("expression");
    let priv = this.originalInteraction.options.getBoolean("private");

    if (content) { 
      await this.evaluate(this.originalInteraction, content, priv);
    } else {
      let modid = this.bot.misc.generateID(16);

      let textInput1 = new Discord.TextInputBuilder()
        .setCustomId("1")
        .setLabel("eval code")
        .setStyle(Discord.TextInputStyle.Paragraph)
        .setRequired(true);
      let textInput2 = new Discord.TextInputBuilder()
        .setCustomId("2")
        .setLabel("private [anything]")
        .setStyle(Discord.TextInputStyle.Paragraph)
        .setRequired(false);

      let actionRow1 = new Discord.ActionRowBuilder<Discord.ModalActionRowComponentBuilder>({ components: [textInput1] });
      let actionRow2 = new Discord.ActionRowBuilder<Discord.ModalActionRowComponentBuilder>({ components: [textInput2] });

      let modal = new Discord.ModalBuilder()
        .setCustomId(modid)
        .setTitle("eval")
        .setComponents(actionRow1, actionRow2);
        
      await this.originalInteraction.showModal(modal);

      let int = await this.originalInteraction.awaitModalSubmit({ filter: (int: Discord.ModalSubmitInteraction) => int.customId == modid, time: 3600000 }).catch(() => undefined)
      if(!int) return;
      let content = int.fields.getTextInputValue("1").replace("\n", ";");
      let isPriv = int.fields.getTextInputValue("2").length == 0 ? false : true;
      await this.evaluate(int, content, isPriv);
    }
  }
  private async evaluate(int: Discord.ModalSubmitInteraction | Discord.CommandInteraction, content: string, priv: boolean): Promise<void> {
    let resp;
    try {
      resp = await eval(`(async () => {let int = this.originalInteraction, bot = this.bot; ${content}})`)();
    } catch (e) {
      resp = e;
    }
    resp = util.inspect(resp, false, 2) || "undefined";
    let embedArray = [];
    for (let x of Array(Math.ceil(resp.length / 4086)).keys()) {
      let embed = new Discord.EmbedBuilder()
        .setAuthor({ name: "eval", iconURL: "https://cdn.discordapp.com/avatars/752285078436184064/f6a157f8f92f8ebb9a60132a75bd502d.webp?size=2048" })
        .setColor(0xffb404)
        .setDescription( "```js\n" + resp.slice(x * 4086, (x + 1) * 4086) + "\n```" );

      if (Math.ceil(resp.length / 4086) == x + 1) embed.setFooter({ text: "expression: " + content });
      
      embedArray.push(embed);
    }
    await int.reply({ embeds: [embedArray[0]], ephemeral: priv });
    for (let embed of embedArray.slice(1)) {
      await int.followUp({ embeds: [embed], ephemeral: priv });
    }
  }
}
