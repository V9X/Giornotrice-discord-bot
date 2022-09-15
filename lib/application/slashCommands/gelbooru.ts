import axios, { AxiosResponse } from "axios";
import Discord from "discord.js";
import { Bot } from "../../main";
import cheerio from "cheerio";
import CommandT from '../../commandT';

interface postData {
  imageUrl: string;
  id: number;
  score: number;
  rating: string;
  tags: string[];
}

interface commentData{
  name: string
  content: string
  points: string
}

interface ret {
  rCode: Number;
  message: string;
  postData?: postData;
  comments?: commentData[];
}

interface cBuilder {
  embeds: Discord.EmbedBuilder[];
  commentEmbeds: Discord.EmbedBuilder[] | undefined;
  actionRows: Discord.ActionRowBuilder<Discord.ButtonBuilder | Discord.SelectMenuBuilder>[];
  content: string;
}

export default class Gelbooru extends CommandT {
  static commandName = "gelbooru";
  static ver = "1.0.1";

  static async applicationConstructor(start?: boolean): Promise<Discord.RESTPostAPIApplicationCommandsJSONBody> {
    let command = new Discord.SlashCommandBuilder().setName(Gelbooru.commandName).setDescription('Searches for images on gelbooru')
        .addStringOption(o => o.setName('tags').setDescription('Tags to search for (optional)').setAutocomplete(true)).toJSON()
        
    return command;
  }

  static async autoComplete(interaction: Discord.AutocompleteInteraction): Promise<void> {
    let input = interaction.options.getString("tags");
    if (input) {
      let tags: any[], statusCode: number, rda: {name: string, value: string}[] = [], inputArray = input.replace(/\s+/g, " ").split(" ");
      await axios.get( `https://gelbooru.com/index.php?page=autocomplete2&term=${ encodeURI(inputArray.slice(-1)[0]) }&type=tag_query&limit=10`)
        .then((resp) => { tags = resp.data; statusCode = resp.status })
        .catch((error) => (statusCode = error.response?.status));
      if (statusCode == 200 && tags.length > 0) {
        inputArray.pop();
        tags.forEach((element) => {
          let name = (inputArray.join(" ") + " " + element.value).slice(0, 100);
          rda.push({ name: name, value: name });
        });
        await interaction.respond(rda);
      } else await interaction.respond([]);
    } else interaction.respond([]);
  }

  static async run(int:  Discord.ChatInputCommandInteraction, bot: Bot): Promise<void> {
    await new Gelbooru(int, bot).main();
  }

  constructor( private originalInteraction:  Discord.ChatInputCommandInteraction, private bot: Bot ) { super() }

  private originalMessage: Discord.Message;
  private tags: string[];
  private wasLockButtonUsed = false;
  private interCollector: Discord.InteractionCollector<any>;
  private cBuilderM: cBuilder;

  private components = {
    refreshButton: new Discord.ButtonBuilder().setCustomId("refreshButton").setStyle(Discord.ButtonStyle.Success).setLabel("refresh"),
    lockButton: new Discord.ButtonBuilder().setCustomId("lockButton").setStyle(Discord.ButtonStyle.Primary).setLabel("🔓"),
    deleteButton: new Discord.ButtonBuilder().setCustomId("deleteButton").setStyle(Discord.ButtonStyle.Danger).setLabel("stop"),
    commentSelector: new Discord.SelectMenuBuilder().setCustomId("commentSelector").setMaxValues(1).setPlaceholder("comments page selector"),
  }
  private actionRows = {
    mainRow: new Discord.ActionRowBuilder<Discord.ButtonBuilder>({ components: [this.components.refreshButton, this.components.lockButton, this.components.deleteButton] }),
    commentRow: new Discord.ActionRowBuilder<Discord.SelectMenuBuilder>({components: [this.components.commentSelector]}),
  }

  private async main(): Promise<void> {
    let stringTags = this.originalInteraction.options.getString("tags", false);
    if (stringTags) this.tags = stringTags.replace(/\s+/g, " ").trim().split(" ");

    let sembed = new Discord.EmbedBuilder()
      .setColor(0x3056ff)
      .setAuthor({ name: "gelbooru", url: "https://gelbooru.com/", iconURL: "https://images-ext-1.discordapp.net/external/yxljRVkJFhJ5VGTQ3AwMbjHhftTDInxMymJkgK9Mnt8/https/pbs.twimg.com/profile_images/1118350008003301381/3gG6lQMl.png" })
      .setTitle("Searching <a:eyespam:931649077001732117>");

    if (!this.originalInteraction.replied) this.originalMessage = await this.originalInteraction.reply({ embeds: [sembed], fetchReply: true });
    else this.originalMessage = await this.originalInteraction.followUp({ embeds: [sembed], fetchReply: true });

    let ret = await this.fetchPost(this.tags);
    this.cBuilderM = this.cBuilder(ret, this.tags)

    if (!ret.postData) {
      await this.originalMessage.edit({ embeds: this.cBuilderM.embeds});
      return;
    }

    await this.originalMessage.edit({
      embeds: this.cBuilderM.embeds,
      content: this.cBuilderM.content,
      components: this.cBuilderM.actionRows,
    });
    this.startCollectors();
  }

  private startCollectors(): void {
    this.interCollector = this.originalMessage.createMessageComponentCollector({ idle: 3600000 });

    this.interCollector.on("collect", async interaction => {
      await this.handlers[interaction.customId as keyof Gelbooru['handlers']](interaction)
    });

    this.interCollector.on("end", async (_, reason) => await this.onCollectorStop(reason));
    this.bot.misc.collectorErrorHandler(Gelbooru.commandName, this.originalMessage, this.interCollector, this.originalInteraction);
  }

  private async onCollectorStop(reason: string): Promise<void> {
    switch (reason) {
      case "time":
      case "idle":
        break;
      default:
        return;
    }
    this.components.refreshButton.setDisabled(true);
    this.components.deleteButton.setDisabled(true);
    this.components.lockButton.setDisabled(true);
    this.components.commentSelector.setDisabled(true);

    await this.originalMessage.edit({ components: this.cBuilderM.actionRows }).catch(() => {});
  }

  private handlers = new class{
    constructor(private outer: Gelbooru) {}

    async refreshButton( interaction: Discord.MessageComponentInteraction ): Promise<void> {
      if(this.outer.wasLockButtonUsed){
        this.outer.actionRows.mainRow.components.splice(0, 1);
        await interaction.update({ components: this.outer.cBuilderM.actionRows });
        if (!this.outer.cBuilderM.commentEmbeds) this.outer.interCollector.stop()
        await new Gelbooru(this.outer.originalInteraction, this.outer.bot).main();
        return;
      }
      this.outer.components.commentSelector.setDisabled(true);
      this.outer.components.deleteButton.setDisabled(true);
      this.outer.components.lockButton.setDisabled(true);
      this.outer.components.refreshButton.setDisabled(true);
      
      await interaction.update({ components: this.outer.cBuilderM.actionRows });
      let ret = await this.outer.fetchPost(this.outer.tags);
      this.outer.cBuilderM = this.outer.cBuilder(ret, this.outer.tags)
  
      if (!ret.postData) {
        await this.outer.originalMessage.edit({ embeds: this.outer.cBuilderM.embeds });
        return;
      }
      
      this.outer.components.refreshButton.setDisabled(false);
      this.outer.components.deleteButton.setDisabled(false);
      this.outer.components.lockButton.setDisabled(false);
      this.outer.components.commentSelector.setDisabled(false);
  
      await this.outer.originalMessage.edit({
        embeds: this.outer.cBuilderM.embeds,
        content: this.outer.cBuilderM.content,
        components: this.outer.cBuilderM.actionRows,
      });
    }

    async lockButton(interaction: Discord.MessageComponentInteraction): Promise<void> {
      this.outer.wasLockButtonUsed = true;
      this.outer.components.lockButton.setDisabled(true).setLabel(`🔒 by ${interaction.user.username}`);
      this.outer.actionRows.mainRow.components.splice(2, 1);
      await interaction.update({ components: this.outer.cBuilderM.actionRows });
    }

    async deleteButton( interaction: Discord.MessageComponentInteraction ): Promise<void> {
      this.outer.components.deleteButton.setDisabled(true).setLabel(`Stopped by ${interaction.user.username}`);
      this.outer.components.refreshButton.setDisabled(true);
      this.outer.components.lockButton.setDisabled(true);
      this.outer.components.commentSelector.setDisabled(true);
      
      this.outer.cBuilderM.embeds[0]?.setImage(null)
      await interaction.update({
        embeds: this.outer.cBuilderM.embeds,
        components: this.outer.cBuilderM.actionRows,
        content: "⠀",
      }); 
      this.outer.interCollector.stop();
    }
  
    async commentSelector(interaction: Discord.SelectMenuInteraction): Promise<void> {
      if (interaction.values[0] == "im") await interaction.update({ embeds: this.outer.cBuilderM.embeds});
      else interaction.update({ embeds: [this.outer.cBuilderM.commentEmbeds[Number(interaction.values[0])]] });
    }
  
  }(this)

  private getComments(body: string): commentData[] {
    let commentsArray = [];
    for (let x of cheerio("div.commentBody", body)
      .toArray()
      .map((e) => cheerio(e).text())) {
      commentsArray.push({
        name: x.split(" ")[0].trim(),
        content: x.split("» #")[1].split("\n")[0].replace(/^\d+/, ""),
        points: x.split("\n")[3].split("Points")[0].trim(),
      });
    }
    return commentsArray;
  }

  private async fetchPost(tags: string[]): Promise<ret>{
    let url;

    if(!tags){
      let qResponse;
      try {
        qResponse = await axios.get("http://gelbooru.com/index.php?page=post&s=random");
      } catch (error: any) {
        return {
            rCode: Number(error.response.status) || -1,
            message: error.response.statusText || "Couldn't connect to gelbooru",
          };
      }
      url = `http://gelbooru.com/index.php?page=dapi&s=post&q=index&json=1&limit=1&id=${ qResponse.request.res.responseUrl.split("id=")[1]}`
    } else {
      url = `http://gelbooru.com/index.php?page=dapi&s=post&q=index&json=1&limit=1&tags=sort:random+${encodeURI( this.tags.join("+"))}`;
    }
    
    let response;
    try {
      response = await axios.get(url);
    } catch (error: any) {
      return {
        rCode: Number(error.response.status) || -1,
        message: error.response.statusText || "Couldn't connect to gelbooru",
      };
    }
    if (response.data['@attributes'].count == 0){
      return {
          rCode: response.status || -1,
          message: `There's no image with provided tag(s): ${tags.join(", ")}`
      }
    }

    let commentsArray: commentData[]
    try {
      if (response.data.post[0].has_comments){
        commentsArray = []
        let pn = 0;
        while (true) {
          let cResponse
          try { cResponse = await axios.get(`https://gelbooru.com/index.php?page=post&s=view&id=${response.data.post[0].id}&pid=${pn}`) } 
          catch { pn += 10; continue }

          let pageComments = this.getComments(cResponse.data)
          if (pageComments.length == 0) break;
          commentsArray.push(...pageComments)
          pn += 10;
          if (pageComments.length < 10) break;
        }
      }
      let postData: postData = {
        imageUrl: response.data.post[0].file_url,
        id: response.data.post[0].id,
        rating: response.data.post[0].rating,
        tags: response.data.post[0].tags.split(' '),
        score: response.data.post[0].score
      }
      return {
          rCode: 200,
          message: "OK",
          postData: postData,
          comments: commentsArray
        };
      } catch {
        return {
          rCode: 200,
          message: "Couldn't parse the data provided by gelbooru",
        };
      }
  }

  private cBuilder(ret: ret, tags: string[]): cBuilder {
    let embed = new Discord.EmbedBuilder()
      .setColor(0x3056ff)
      .setAuthor({ name: "gelbooru", url: "https://gelbooru.com/", iconURL: "https://images-ext-1.discordapp.net/external/yxljRVkJFhJ5VGTQ3AwMbjHhftTDInxMymJkgK9Mnt8/https/pbs.twimg.com/profile_images/1118350008003301381/3gG6lQMl.png" });

    if (!ret.postData) {
      embed
        .setTitle("Failure")
        .setDescription( `**Response status code**: ${ret.rCode}\n**Reason**: ${ret.message}`.slice(0, 4096));
      return {
        embeds: [embed],
        commentEmbeds: [],
        content: "⠀",
        actionRows: [this.actionRows.mainRow],
      };
    }
    let isVideo = ["mp4", "webm", "avi", "ogg", "mov"].some((format) => ret.postData.imageUrl.toLowerCase().endsWith(format))

    let commentsEmbeds: Discord.EmbedBuilder[]
    let bestComment: commentData

    if (ret.comments.length){
      let sortedComments = ret.comments.sort((a, b) => Number(b.points) - Number(a.points));
      bestComment = sortedComments[0]
      if (ret.comments.length > 1 || isVideo ) {
        commentsEmbeds = []
        let prepComments: commentData[][] = []
        for (let i = 0, j = sortedComments.length; i < j; i += 10) {
          prepComments.push(sortedComments.slice(i, i + 10));
        }
        for (let i of Array(prepComments.length).keys()){
          let cEmbed = new Discord.EmbedBuilder()
            .setColor(0x3056ff)
            .setAuthor({ name: "gelbooru", url: "https://gelbooru.com/", iconURL: "https://images-ext-1.discordapp.net/external/yxljRVkJFhJ5VGTQ3AwMbjHhftTDInxMymJkgK9Mnt8/https/pbs.twimg.com/profile_images/1118350008003301381/3gG6lQMl.png" })
            .setTitle(this.tags ? this.tags.join(" ").slice(0, 256) : "random")
            .setURL(`https://gelbooru.com/index.php?page=post&s=view&id=${ret.postData.id}`)
            .setFooter({text: `Browsing comments page [${i+1}/${prepComments.length}]`})
            .setFields(prepComments[i].map( comment => { return { name: `[${comment.points} upvotes] ${comment.name}:`.slice(0, 256), value: `${comment.content}\n⠀`.slice(0, 1024), inline: false }}));
          commentsEmbeds.push(cEmbed)
        }
      }
    }
    if (commentsEmbeds) {
      this.components.commentSelector.setOptions(
        { label: "Image", value: "im", description: "go to image" }, 
        ...Array(commentsEmbeds.length).fill(0).map((_, i) => ({ label: `Page ${i + 1}`, value: String(i) }))
      );
    }

    if (isVideo) { 
      return { 
        content: ret.postData.imageUrl, 
        commentEmbeds: commentsEmbeds,
        embeds: [],
        actionRows: commentsEmbeds ? [this.actionRows.commentRow, this.actionRows.mainRow] : [this.actionRows.mainRow]
      }
    }

    embed.setTitle(this.tags ? this.tags.join(" ").slice(0, 256) : "random")
      .setURL(`https://gelbooru.com/index.php?page=post&s=view&id=${ret.postData.id}`)
      .setImage(ret.postData.imageUrl)
      .setFooter({
        text: [
          `ID: ${ret.postData.id}`,
          `Score: ${ret.postData.score}`,
          `Rating: ${ret.postData.rating}`,
          `Tags: ${ret.postData.tags.join(' ')}`,
        ].join(", ").slice(0, 2048)
      });
    if (bestComment) embed.setFields({name: `Top comment by ${bestComment.name}:`, value: bestComment.content.slice(0, 1024)})

    return {
      embeds: [embed], 
      commentEmbeds: commentsEmbeds,
      content: "⠀",
      actionRows: commentsEmbeds ? [this.actionRows.commentRow, this.actionRows.mainRow] : [this.actionRows.mainRow]
    }
  }
}
