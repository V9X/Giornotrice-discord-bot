import axios from "axios";
import Discord from "discord.js";
import { Bot } from "../../main";
import CommandT from '../../commandT';

interface post {
  similarity: string;
  thumbnail: string;
  urls: string[];
  title: string;
  author: string;
  source: string;
}

interface ret {
  rCode: Number;
  message: string;
  code?: Number;
  data?: post[];
}

export default class SauceNao extends CommandT {
  static commandName = "getsauce";
  static ver = "1.0.1";
  static async applicationConstructor(start?: boolean): Promise<Discord.RESTPostAPIApplicationCommandsJSONBody> {
    let command = new Discord.ContextMenuCommandBuilder().setType(Discord.ApplicationCommandType.Message).setName(SauceNao.commandName).toJSON()
    return command
  }
  static async run(int: Discord.MessageContextMenuCommandInteraction, bot: Bot): Promise<void> {
    await new SauceNao(int, bot).main();
  }

  constructor(private originalInteraction: Discord.MessageContextMenuCommandInteraction, private bot: Bot) { super() }

  private originalMessage: Discord.Message;
  private embeds: Discord.EmbedBuilder[];
  private interCollector: Discord.InteractionCollector<any>;
  private discordMsgLink: string;

  private components = {
    pageSelector: new Discord.SelectMenuBuilder().setCustomId("pageSelector").setMaxValues(1).setPlaceholder("select result page")
  }
  private actionRows = {
    selectorActionRow: new Discord.ActionRowBuilder<Discord.SelectMenuBuilder>({components: [this.components.pageSelector]})
  }


  private async main(): Promise<void> {
    let sembed = new Discord.EmbedBuilder()
      .setColor(0x000000)
      .setAuthor({ name: "SauceNao", url: "https://saucenao.com/", iconURL: "https://cdn.discordapp.com/attachments/752238790323732494/931619710397714432/SauceNAO.png" })
      .setTitle("Searching <a:eyespam:931649077001732117>");

    this.discordMsgLink = `https://discord.com/channels/${this.originalInteraction.guildId}/${this.originalInteraction.channelId}/${this.originalInteraction.targetMessage.id}`;

    this.originalMessage = await this.originalInteraction.reply({ embeds: [sembed], fetchReply: true });

    let possibleUrls: string[] = [
      this.originalInteraction.targetMessage.attachments?.at(0)?.url,
      this.originalInteraction.targetMessage.embeds.at(0)?.image?.url,
      this.originalInteraction.targetMessage.embeds.at(0)?.url,
      this.originalInteraction.targetMessage.embeds.at(0)?.thumbnail?.url,
      this.originalInteraction.targetMessage.content,
    ];

    let imageUrl: string;
    for (let url of possibleUrls) {
      url = String(url);
      if (url.startsWith("https")) {
        if (['.tif', '.tiff', '.bmp', '.jpg', '.jpeg', '.gif', '.png', '.eps'].some(format => url.toLowerCase().endsWith(format))){ imageUrl = url; break }
        if (!/\.\D{3,4}$/.test(url)){ imageUrl = url + ".gif"; break }
      }
    }

    if (!imageUrl) {
      sembed.setTitle("Failure");
      sembed.setDescription(`couldn't find any image in [this message](${this.discordMsgLink})`);
      await this.originalMessage.edit({ embeds: [sembed] });
      return;
    }
    let response: ret = await this.fetchResults(imageUrl);
    if (!response.data) {
      sembed.setTitle("Failure");
      sembed.setDescription(`[targeted message](${this.discordMsgLink})\n\n**Response status code:** ${response.rCode}\n**Saucenao status code:** ${response.code}\n**Reason:** ${response.message}`);
      await this.originalMessage.edit({ embeds: [sembed] });
      return;
    }

    this.embeds = this.prepareEmbeds(response.data);
    this.components.pageSelector
      .addOptions(...Array(this.embeds.length).fill(0).map((_, i) => ({ label: `page ${i + 1}`, value: String(i) })));

    await this.originalMessage.edit({ embeds: [this.embeds[0]], components: [this.actionRows.selectorActionRow] });
    this.startCollectors();
  }

  private startCollectors(): void {
    this.interCollector = this.originalMessage.createMessageComponentCollector({ idle: 3600000 });

    this.interCollector.on("collect", async interaction => {
      await this.handlers[interaction.customId as keyof SauceNao['handlers']](interaction)
    });

    this.interCollector.on("end", async (_, reason) => await this.onCollectorStop(reason));
    this.bot.misc.collectorErrorHandler(SauceNao.commandName, this.originalMessage, this.interCollector, this.originalInteraction);
  }

  private async onCollectorStop(reason: String): Promise<void> {
    switch (reason) {
      case "time":
      case "idle":
        break;
      default:
        return;
    }
    this.components.pageSelector.setDisabled(true);
    await this.originalMessage.edit({ components: [this.actionRows.selectorActionRow] }).catch(() => {});
  }

  private handlers = new class {
    constructor(private outer: SauceNao) {}

    async pageSelector(interaction: Discord.SelectMenuInteraction): Promise<void> {
      this.outer.components.pageSelector.setPlaceholder( `page ${Number(interaction.values[0]) + 1}` );
      await interaction.update({ embeds: [this.outer.embeds[Number(interaction.values[0])]] });
    }

  }(this)

  private prepareEmbeds(data: post[]): Discord.EmbedBuilder[] {
    let embeds: Discord.EmbedBuilder[] = [];
    let c = 1;
    for (let post of data) {
      embeds.push(
        new Discord.EmbedBuilder()
          .setColor(0x000000)
          .setAuthor({ name: "SauceNao", url: "https://saucenao.com/", iconURL: "https://cdn.discordapp.com/attachments/752238790323732494/931619710397714432/SauceNAO.png" })
          .setThumbnail(post.thumbnail)
          .setTitle(`"${post.title}" [${post.similarity}% similarity]`)
          .setDescription( `Result url(s) for [image](${ this.discordMsgLink }):\n${post.urls.join("\n")}`)
          .addFields([
            { name: "Author", value: post.author },
            { name: "Source", value: post.source },
          ])
          .setFooter({ text: `${c}/${data.length}` })
      );
      c++;
    }
    return embeds;
  }

  private async fetchResults(imageUrl: string): Promise<ret> {
    let response;

    try {
      response = await axios.get( `https://saucenao.com/search.php?api_key=${process.env.sauceNaoApiKey}&output_type=2&url=${imageUrl}` );
    } catch (error: any) {
      return {
        rCode: Number(error.response.status) || -1,
        message: error.response.statusText || "Couldn't connect to saucenao",
      }
    }

    let arrayOfPosts: post[] = [];

    if (response.data.header.status == 0) {
      for (let result of response.data.results) {
        arrayOfPosts.push({
          similarity: result.header.similarity,
          thumbnail: result.header.thumbnail,
          urls: result.data.ext_urls || ["no urls"],
          title: result.data.title || "unknown",
          author:
            result.data.author_name ||
            result.data.twitter_user_handle ||
            result.data.member_name ||
            "unknown",
          source: result.data.source || "unknown",
        });
      }
      return {
        rCode: 200,
        message: "OK",
        code: response.data.header.status,
        data: arrayOfPosts,
      }
    } else {
      return {
        rCode: 200,
        message: response.data.header.message,
        code: response.data.header.status,
      }
    }
  }
}
