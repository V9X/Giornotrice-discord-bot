import Discord from "discord.js";
import { Bot } from "../../../main";
import CommandT from '../../../commandT';

export default class CManager extends CommandT {
  static commandName = "cmanager";
  static ver = "1.0.1";
  static owner = true;

  static async applicationConstructor(start?: boolean): Promise<Discord.RESTPostAPIApplicationCommandsJSONBody> {
    let command = new Discord.SlashCommandBuilder().setName(CManager.commandName).setDescription("Command management group").setDefaultMemberPermissions("0")
        .addSubcommand((m) => m.setName("list").setDescription("Get full list of commands"))
        .addSubcommand((m) => m.setName("deploy").setDescription("Deploy commands")
            .addStringOption((o) => o.setName("name").setDescription("NAME[] | ALL").setRequired(true))
            .addStringOption((o) => o.setName("guild").setDescription("IDS[]")))
        .addSubcommand((m) => m.setName("remove").setDescription("Remove commands")
            .addStringOption((o) => o.setName("name").setDescription("NAME[] | ALL").setRequired(true))
            .addStringOption((o) => o.setName("guild").setDescription("IDS[]").setRequired(true)))
        .addSubcommand((m) => m.setName("removeall").setDescription("Remove all commands")).toJSON();
    return command;
  }

  static async run(int: Discord.ChatInputCommandInteraction, bot: Bot): Promise<void> {
    if (int.user.id == process.env.ownerId) {
      switch (int.options.getSubcommand(false)) {
        case "list": await new CManager(int, bot).list(); break;
        case "deploy": await new CManager(int, bot).deploy(); break;
        case "remove": await new CManager(int, bot).remove(); break;
        case "removeall": await new CManager(int, bot).removeAll(); break;
      }
    } else
      await int.reply({ embeds: [ new Discord.EmbedBuilder().setTitle("no").setDescription("just no") ], ephemeral: true });
  }

  private embed: Discord.EmbedBuilder

  constructor(private originalInteraction: Discord.ChatInputCommandInteraction, private bot: Bot) {
    super();
    this.embed = new Discord.EmbedBuilder()
      .setColor(0xffb404)
  }

  private async list(): Promise<void>{
    let cstate = await this.bot.db.bot.getData('cstate')
    this.embed
      .setTitle('cManager | list')
      .setDescription(`\`\`\`json\n${JSON.stringify(cstate, null, 2)}\n\`\`\``);

    await this.originalInteraction.reply({ embeds: [this.embed] });
  }

  private async deploy(): Promise<void> {
    await this.originalInteraction.deferReply();

    let IDSraw = this.originalInteraction.options.getString("guild");
    let IDS = IDSraw.trim().split(" ")
    let comNames = this.originalInteraction.options.getString("name").trim().split(" ");

    let adlist = [];

    if (comNames[0] == "ALL") {
      for (let command of Object.values(this.bot.commands)) {
        if (!command.owner) {
          adlist.push(command);
        }
      }
    } else {
      for (let command of Object.values(this.bot.commands)) {
        if (comNames.includes(command.commandName)) {
          adlist.push(command);
        }
      }
    }
    if(!adlist.length){
      this.embed
        .setTitle('cmanager | deploy')
        .setDescription('Provided command name(s) does not exists');
      this.originalInteraction.editReply({ embeds: [this.embed]});
      return;
    }

    await this.bot.cm.deployCommands(adlist, IDS);
    
    this.embed
      .setTitle('cmanager | deploy')
      .setDescription(`Guild ID(s): ${IDS ? IDS.join(', ') : 'global'}\n\nCommands: ${comNames.join(', ')}`);

    this.originalInteraction.editReply({ embeds: [this.embed] });
  }

  private async remove(): Promise<void> {
    await this.originalInteraction.deferReply();

    let IDS = this.originalInteraction.options.getString("guild").trim().split(" ");
    let comNames = this.originalInteraction.options.getString("name").trim().split(" ");

    let adlist: string[] = []

    if (comNames[0] == "ALL") {
      let names = Object.keys(this.bot.commands);
      await this.bot.cm.removeCommands(names, IDS)
    } else {
      await this.bot.cm.removeCommands(comNames, IDS);
    }

    let embed = new Discord.EmbedBuilder()
      .setAuthor({ name: "cManager | remove", iconURL: "https://cdn.discordapp.com/avatars/752285078436184064/f6a157f8f92f8ebb9a60132a75bd502d.webp?size=2048" })
      .setColor(0xffb404)
      .setDescription(`Guild ID(s): ${IDS ? IDS.join(', ') : 'global'}\n\nCommands: ${comNames.join(', ')}`);
    await this.originalInteraction.editReply({ embeds: [embed] });
  }

  private async removeAll(): Promise<void> {
    await this.originalInteraction.deferReply();

    await this.bot.cm.removeAll();

    let embed = new Discord.EmbedBuilder()
      .setAuthor({ name: "cManager | removeAll", iconURL: "https://cdn.discordapp.com/avatars/752285078436184064/f6a157f8f92f8ebb9a60132a75bd502d.webp?size=2048" })
      .setColor(0xffb404)
      .setDescription("All commands removed");

    await this.originalInteraction.editReply({ embeds: [embed] });
  }
}
