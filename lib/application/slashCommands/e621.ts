import axios, { Axios, AxiosResponse } from "axios";
import Discord, { ButtonBuilder } from "discord.js";
import { Bot } from "../../main";
import CommandT from '../../commandT';

interface postData {
  imageUrl: string;
  id: number;
  upvotes: number;
  downvotes: number;
  favorite: number;
  rating: string;
  artist: string[];
  character: string[];
  copyright: string[];
  species: string[];
  tags: string[];
}

interface ret {
  rCode: Number;
  message: string;
  postData?: postData;
}

interface cBuilder {
  embeds: Discord.EmbedBuilder[];
  content: string;
}

export default class E621 extends CommandT {
  static commandName = "e621";
  static ver = "1.0.1";

  static async applicationConstructor(start?: boolean): Promise<Discord.RESTPostAPIApplicationCommandsJSONBody> {
    let command = new Discord.SlashCommandBuilder().setName(E621.commandName).setDescription("Searches for images on e621")
        .addStringOption((o) => o.setName("tags").setDescription("Tags to search for (optional)").setAutocomplete(true)).toJSON();

    return command;
  }

  static async autoComplete(interaction: Discord.AutocompleteInteraction): Promise<void> {
    let input = interaction.options.getString("tags");
    if (input.length >= 3) {
      let tags: any[], statusCode: number, rda: { name: string; value: string }[] = [], inputArray = input.replace(/\s+/g, " ").split(" ");
      await axios.get(`https://e621.net/tags/autocomplete.json?search%5Bname_matches%5D=${encodeURI(inputArray.slice(-1)[0])}&expiry=10`)
        .then((resp) => { tags = resp.data; statusCode = resp.status })
        .catch((error) => statusCode = error.response.status);
      if (statusCode == 200 && tags.length > 0) {
        inputArray.pop();
        tags.forEach((element) => {
          let name = (inputArray.join(" ") + " " + element.name).slice(0, 100);
          rda.push({ name: name, value: name });
        });
        await interaction.respond(rda);
      } else interaction.respond([]);
    } else interaction.respond([]);
  }

  static async run(int: Discord.ChatInputCommandInteraction, bot: Bot): Promise<void> {
    await new E621(int, bot).main();
  }

  constructor(private originalInteraction: Discord.ChatInputCommandInteraction, private bot: Bot) { super() }

  private originalMessage: Discord.Message;
  private interCollector: Discord.InteractionCollector<any>;
  private wasLockButtonUsed = false;
  private tags: string[];
  private components = {
    refreshButton: new Discord.ButtonBuilder().setCustomId("refreshButton").setStyle(Discord.ButtonStyle.Success).setLabel("refresh"),
    lockButton: new Discord.ButtonBuilder().setCustomId("lockButton").setStyle(Discord.ButtonStyle.Primary).setLabel("🔓"),
    deleteButton: new Discord.ButtonBuilder().setCustomId("deleteButton").setStyle(Discord.ButtonStyle.Danger).setLabel("stop"),
  }
  private actionRows = {
    mainRow: new Discord.ActionRowBuilder<ButtonBuilder>({ components: [this.components.refreshButton, this.components.lockButton, this.components.deleteButton] })
  }

  private async main(): Promise<void> {
    let tagString = this.originalInteraction.options.getString("tags", false);
    if (tagString) this.tags = tagString.replace(/\s+/g, " ").trim().split(" ");

    let sembed = new Discord.EmbedBuilder()
      .setColor(0x00ffcc)
      .setAuthor({ name: "e621", url: "https://e621.net/", iconURL: "https://en.wikifur.com/w/images/d/dd/E621Logo.png" })
      .setTitle("Searching <a:eyespam:931649077001732117>");

    if (!this.originalInteraction.replied) this.originalMessage = await this.originalInteraction.reply({ embeds: [sembed], fetchReply: true });
    else this.originalMessage = await this.originalInteraction.followUp({ embeds: [sembed], fetchReply: true });

    let ret = await this.fetchPost(this.tags);
    let cBuilder = this.cBuilder(ret, this.tags);

    if (!ret.postData) {
      await this.originalMessage.edit({ embeds: cBuilder.embeds });
      return;
    }
    await this.originalMessage.edit({
      embeds: cBuilder.embeds,
      content: cBuilder.content,
      components: [this.actionRows.mainRow],
    });
    await this.startCollectors();
  }

  private async startCollectors(): Promise<void> {
    this.interCollector = this.originalMessage.createMessageComponentCollector({ idle: 3600000 });

    this.interCollector.on("collect", async (interaction) => {
      this.handlers[interaction.customId as keyof E621['handlers']](interaction)
    });

    this.interCollector.on("end", async (_, reason) => await this.onCollectorStop(reason) );
    this.interCollector.on("error", async (error) => { 
      await this.originalInteraction.followUp({ embeds: [this.bot.misc.errorEmbed(E621.commandName, error)] })
    });
  }

  private async onCollectorStop(reason: string): Promise<void> {
    switch (reason) {
      case "time":
      case "idle":
        break;
      default:
        return;
    }
    this.components.deleteButton.setDisabled(false);
    this.components.lockButton.setDisabled(false);
    this.components.refreshButton.setDisabled(false);

    this.originalMessage.edit({ components: [this.actionRows.mainRow] }).catch(() => {});
  }

  private handlers = new class{
    constructor(private outer: E621) {}

    async refreshButton(interaction: Discord.MessageComponentInteraction): Promise<void> {
      if (this.outer.wasLockButtonUsed) {
        this.outer.actionRows.mainRow.components.splice(0, 1);
        await interaction.update({ components: [this.outer.actionRows.mainRow] });
  
        new E621(this.outer.originalInteraction, this.outer.bot).main();
        this.outer.interCollector.stop("locked");
        return;
      }
  
      this.outer.components.deleteButton.setDisabled(true);
      this.outer.components.lockButton.setDisabled(true);
      this.outer.components.refreshButton.setDisabled(true);
      await interaction.update({ components: [this.outer.actionRows.mainRow] });
  
      let ret = await this.outer.fetchPost(this.outer.tags);
      let cBuilder = this.outer.cBuilder(ret, this.outer.tags);
  
      this.outer.components.deleteButton.setDisabled(false);
      this.outer.components.lockButton.setDisabled(false);
      this.outer.components.refreshButton.setDisabled(false);
      await this.outer.originalMessage.edit({
        embeds: cBuilder.embeds,
        content: cBuilder.content,
        components: [this.outer.actionRows.mainRow],
      });
    }
    
  async lockButton(interaction: Discord.MessageComponentInteraction): Promise<void> {
    this.outer.wasLockButtonUsed = true;
    this.outer.components.lockButton.setDisabled(true).setLabel(`🔒 by ${interaction.user.username}`);
    this.outer.actionRows.mainRow.components.splice(2, 1);
    await interaction.update({ components: [this.outer.actionRows.mainRow] });
  }

  async deleteButton(interaction: Discord.MessageComponentInteraction): Promise<void> {
    this.outer.components.deleteButton.setDisabled(true);
    this.outer.components.lockButton.setDisabled(true);
    this.outer.components.refreshButton.setDisabled(true);
    this.outer.components.deleteButton.setLabel( `Stopped by ${interaction.user.username}` );

    await interaction.update({ 
      embeds: interaction.message?.embeds[0] ? [Discord.EmbedBuilder.from(interaction.message.embeds[0]).setImage(null)] : [],
      components: [this.outer.actionRows.mainRow],
      content: "⠀",
    });
    this.outer.interCollector.stop("cancel");
  }
  }(this)


  private async fetchPost(tags: string[]): Promise<ret> {
    let url = `https://e621.net/posts/random.json?tags=${encodeURI( tags ? tags.join("+") : "" )}`;
    let headers = { "User-Agent": "DiscordBot\\1.0" };
    let auth = {
      username: process.env.e621api.split(' ')[0],
      password: process.env.e621api.split(' ')[1],
    };

    let response;
    try { response = await axios.get(url, { headers: headers, auth: auth }) } 
    catch (error: any) {
      if (error.response.status == 404) {
        return {
          rCode: 404,
          message: `There's no image with provided tag(s): ${tags.join(", ")}`,
        };
      } else {
        return {
          rCode: Number(error.response.status) || -1,
          message: error.response.statusText || "Couldn't connect to e621",
        };
      }
    }

    try {
      let postData: postData = {
        imageUrl: response.data.post.file.url,
        id: response.data.post.id,
        upvotes: response.data.post.score.up,
        downvotes: response.data.post.score.up,
        favorite: response.data.post.fav_count,
        rating: response.data.post.rating,
        artist: response.data.post.tags.artist,
        character: response.data.post.tags.character,
        copyright: response.data.post.tags.copyright,
        species: response.data.post.tags.species,
        tags: response.data.post.tags.general,
      };
      return {
        rCode: 200,
        message: "OK",
        postData: postData,
      };
    } catch {
      return {
        rCode: 200,
        message: "Couldn't parse the data provided by e621",
      };
    }
  }

  private cBuilder( ret: ret, sTags: string[] ): cBuilder {
    let embed = new Discord.EmbedBuilder()
      .setColor(0x00ffcc)
      .setAuthor({ name: "e621", url: "https://e621.net/", iconURL: "https://en.wikifur.com/w/images/d/dd/E621Logo.png" });

    if (!ret.postData) {
      embed
        .setTitle("Failure")
        .setDescription( `**Response status code**: ${ret.rCode}\n**Reason**: ${ret.message}`.slice(0, 4096));
      return {
        embeds: [],
        content: "⠀"
      }
    }
    if ( ["mp4", "webm", "avi", "ogg", "mov"].some((format) => ret.postData.imageUrl.toLowerCase().endsWith(format)) ) {
      return {
        embeds: [],
        content: ret.postData.imageUrl,
      }
    }
    embed
      .setTitle((sTags ? sTags.join(" ") : "random").slice(0, 256))
      .setURL(`https://e621.net/posts/${ret.postData.id}`)
      .setImage(ret.postData.imageUrl)
      .setFooter({
        text: [
          `ID: ${ret.postData.id}`,
          `Upvotes: ${ret.postData.upvotes}`,
          `Downvotes: ${ret.postData.downvotes}`,
          `Favorite: ${ret.postData.favorite}`,
          `Rating: ${ret.postData.rating}`,
          `Artist: ${ret.postData.artist.join(" ")}`,
          `Character: ${ret.postData.character.join(" ")}`,
          `Copyright: ${ret.postData.copyright.join(" ")}`,
          `Species: ${ret.postData.species.join(" ")}`,
          `Tags: ${ret.postData.tags.join(" ")}`,
        ]
          .join(", ")
          .slice(0, 2048),
      });
    return {
      embeds: [embed],
      content: "⠀",
    }
  }
}
