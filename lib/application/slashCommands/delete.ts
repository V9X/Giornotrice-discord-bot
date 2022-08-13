import Discord from "discord.js";
import { Bot } from "../../main";
import CommandT from '../../commandT';

export default class Delet extends CommandT {
  static commandName = "delete";
  static ver = "1.0.1";

  static async applicationConstructor(start?: boolean): Promise<Discord.RESTPostAPIApplicationCommandsJSONBody> {
    let command = new Discord.SlashCommandBuilder().setName(Delet.commandName).setDescription("Bulk delete messages").setDefaultMemberPermissions("0").setDMPermission(false)
        .addIntegerOption((o) => o.setName("amount").setDescription("Amount of messages to search for").setMinValue(1).setMaxValue(5000).setRequired(true))
        .addMentionableOption((o) => o.setName("user").setDescription("Only deletes messages of provided user or role"))
        .addStringOption((o) => o.setName("content").setDescription("Only deletes messages that includes provided content")).toJSON();
    return command;
  }

  static async run(int: Discord.ChatInputCommandInteraction, bot: Bot): Promise<void> {
    await new Delet(int, bot).main();
  }

  constructor(private originalInteraction: Discord.ChatInputCommandInteraction, private bot: Bot) { super() }

  private filteredMessageArray: Discord.Message[];
  private interCollector: Discord.InteractionCollector<any>;
  private originalMessage: Discord.Message;
  private ammount: number;
  private embed: Discord.EmbedBuilder
  private notDeleted: number = 0;

  private components = {
    buttonDelete: new Discord.ButtonBuilder().setCustomId("buttonDelete").setStyle(Discord.ButtonStyle.Danger).setLabel("delete"),
    buttonCancel: new Discord.ButtonBuilder().setCustomId("buttonCancel").setStyle(Discord.ButtonStyle.Primary).setLabel("cancel"),
  }

  private actionRows = {
    confirmRow: new Discord.ActionRowBuilder<Discord.ButtonBuilder>({ components: [this.components.buttonDelete, this.components.buttonCancel] }),
  }

  private async main(): Promise<void> {
    this.ammount = this.originalInteraction.options.getInteger("amount", false);
    let mentionable = this.originalInteraction.options.getMentionable("user", false)
    let filter = this.originalInteraction.options.getString('content', false)

    this.embed = new Discord.EmbedBuilder()
      .setColor(0xffb404)
      .setTitle("Searching <a:eyespam:931649077001732117>")

    this.originalMessage = await this.originalInteraction.reply({ embeds: [this.embed], fetchReply: true});

    let messageArray = await this.fetchMessages(this.originalInteraction.channel.messages, this.ammount);
    this.filteredMessageArray = await this.ArrayFilter(messageArray, filter, mentionable);
  
    if (this.filteredMessageArray.length == 0){
        this.embed.setTitle("0 messages found");
        await this.originalMessage.edit({ embeds: [this.embed] });
        return;
    }

    this.embed
      .setFields([{ name: `Scanned ${this.ammount} message(s), ${this.filteredMessageArray.length} matching message(s) found`, value: `Are you sure you want to delete them?` }])
      .setTitle('Searching complete');

    await this.originalMessage.edit({ embeds: [this.embed], components: [this.actionRows.confirmRow] });
    this.startCollectors();
  }

  private startCollectors(): void {
    this.interCollector = this.originalMessage.createMessageComponentCollector({ time: 600000 });

    this.interCollector.on("collect", async interaction => {
      await this.handlers[interaction.customId as keyof Delet['handlers']](interaction)
    });
    this.interCollector.on("end", async (_, reason) => await this.onCollectorStop(reason));
    this.bot.misc.collectorErrorHandler(Delet.commandName, this.originalMessage, this.interCollector, this.originalInteraction);
  }
  private async onCollectorStop(reason: string): Promise<void> {
    switch (reason) {
      case "canceled":
      case "time":
      case "idle":
        this.embed.setDescription("Deleting messages cancelled").setFields([]).setTitle('Delete messages');
        break;
      case "success":
        this.embed.setDescription(`${this.filteredMessageArray.length - this.notDeleted } messages deleted.`).setFields([]).setTitle('Delete messages');
        break;
      default:
        return;
    }
    await this.originalMessage.edit({ embeds: [this.embed], components: [] }).catch(() => {});
  }
  private handlers = new class{
    constructor(private outer: Delet) {}

    async buttonDelete(interaction: Discord.MessageComponentInteraction): Promise<void> {
      if(interaction.user.id != this.outer.originalInteraction.user.id) {
          await interaction.reply({ embeds: [ new Discord.EmbedBuilder().setColor(0xffb404).setDescription("Sorry, you can't do that") ], ephemeral: true });
          return;
      }
      this.outer.components.buttonCancel.setDisabled(true);
      this.outer.components.buttonDelete.setDisabled(true);
  
      await interaction.update({embeds: [this.outer.embed.setTitle("Deleting messages <a:loading:938066660076711956>").setFields([])], components: [this.outer.actionRows.confirmRow] });
      await this.outer.deleteMessages()
      this.outer.interCollector.stop("success");
    }

    async buttonCancel(interaction: Discord.MessageComponentInteraction): Promise<void> {
      if (interaction.user.id != this.outer.originalInteraction.user.id) {
          await interaction.reply({ embeds: [ new Discord.EmbedBuilder().setColor(0xffb404).setDescription("Sorry, you can't do that") ], ephemeral: true})
      }
      await interaction.deferUpdate();
      this.outer.interCollector.stop("canceled");
    }

  }(this)

  private async deleteMessages(): Promise<void> {
    for (let i = 0, j = this.filteredMessageArray.length; i < j; i += 100) {
      let temporary = this.filteredMessageArray.slice(i, i + 100);
      if (temporary.length == 1) {
        await temporary[0].delete().catch(() => { this.notDeleted++ });
        continue;
      }
      await this.originalInteraction.channel.bulkDelete(temporary, true)
      .then((msgs) => {
        if (msgs.size < temporary.length) {
          temporary.filter((value) => ![...msgs.keys()].includes(value.id)).forEach(async (value) => {
            await value.delete().catch(() => {{ this.notDeleted++ }});
          });
        }
      });
    }
  }

  private async fetchMessages( msgManager: Discord.MessageManager, limit: number ): Promise<Discord.Message[]> {
    let msgArray = [];
    let last_id;
    for (let _ of Array(Math.ceil(limit / 100) + 1).keys()) {
      let options: Discord.FetchMessagesOptions = { limit: 100, cache: false };
      if (last_id) { options.before = last_id }
      let fetchedMessages = await msgManager.fetch(options)

      if (fetchedMessages instanceof Discord.Collection) {
        msgArray.push(...fetchedMessages.values());
        if (fetchedMessages.size < 100) {
          break;
        }
        last_id = fetchedMessages.last().id;
      }
    }
    return msgArray.slice(1, limit + 1);
  }

  private async ArrayFilter(msgArray: Discord.Message[], content: string, mentionable: Discord.Role | Discord.User | Discord.GuildMember | Discord.APIInteractionDataResolvedGuildMember | Discord.APIRole): Promise<Discord.Message[]> {
    if (content) { msgArray = msgArray.filter((msg) => { return msg.content.includes(content.trim()) }) }
    if ( mentionable instanceof Discord.Role && mentionable.name != "@everyone" ) {
      msgArray = msgArray.filter((msg) => {
        try { return msg.member.roles.cache.has(mentionable.id) } 
        catch { return false }
      });
    } else if (mentionable instanceof Discord.GuildMember) {
      msgArray = msgArray.filter((msg) => { 
        try { return msg.author.id == mentionable.id } 
        catch { return false }
      });
    }
    return msgArray;
  }
}
