import Discord from "discord.js";
import { Bot } from "../../main";
import * as voice from "@discordjs/voice";
import ytf from "../../utils/music/ytf";
import ytfps from "ytfps";
import { opus } from "prism-media";
import CommandT from '../../commandT';

interface song {
  title: string;
  length: string;
  published: string;
  views: string;
  thumbnail: string;
  url: string;
  addingUser: string;
  author: {
    name: string;
    url: string;
  };
}

interface cBuilder {
  embeds: Discord.EmbedBuilder[];
  actionRows: Discord.ActionRowBuilder<Discord.ButtonBuilder | Discord.SelectMenuBuilder>[];
}

export default class Music extends CommandT {
  static commandName = "music";
  static ver = "2.0.0";

  static async applicationConstructor(start?: boolean): Promise<Discord.RESTPostAPIApplicationCommandsJSONBody> {
    let command = new Discord.SlashCommandBuilder().setName("music").setDescription("Multi manager with all music options").setDMPermission(false).toJSON();
    return command;
  }

  static async run(interaction: Discord.ChatInputCommandInteraction, bot: Bot) {
    let musicInstance = Music.musicInstances[interaction.guildId];
    if (musicInstance) {
      musicInstance.originalInteraction = interaction;
      musicInstance.interCollector.stop("newWindow");
      await musicInstance.main();
    } else {
      let qah = await bot.db.music.getData(interaction.guildId)
      let inst = new Music(interaction, bot, qah);
      Music.musicInstances[interaction.guildId] = inst;
      await inst.main();
    }
  }

  static musicInstances: {[guildID: string]: Music} = {};

  private queue: song[];
  private history: song[];

  constructor( private originalInteraction: Discord.ChatInputCommandInteraction, private bot: Bot, qah: { queue: song[], history: song[] }) {
    super();
    this.queue = qah.queue
    this.history = qah.history
  }
  private timer: NodeJS.Timeout;
  private currentGroup: keyof Music["cBuilders"];
  private interCollector: Discord.InteractionCollector<any>;
  private originalMessage: Discord.Message;
  private loopnum: number = 0;
  private vc: {
    player: voice.AudioPlayer;
    connection: voice.VoiceConnection;
    channel: Discord.VoiceBasedChannel;
    stream: opus.WebmDemuxer | opus.Encoder | undefined;
    nowPlaying: song | undefined;
  } | undefined;

  private components = {
    groupSelector: new Discord.SelectMenuBuilder().setCustomId("group_selector").setMaxValues(1).setMinValues(1)
      .setOptions(
        { label: "player", value: "player" },
        { label: "queue", value: "queue" },
        { label: "history", value: "history" }
      ),
    player: {
      play: new Discord.ButtonBuilder().setCustomId("player_play").setStyle(Discord.ButtonStyle.Success),
      skip: new Discord.ButtonBuilder().setCustomId("player_skip").setStyle(Discord.ButtonStyle.Primary).setEmoji("⏩"),
      addSong: new Discord.ButtonBuilder().setCustomId("player_addsong").setStyle(Discord.ButtonStyle.Primary).setLabel("add song"),
      loop: new Discord.ButtonBuilder().setCustomId("player_loop").setStyle(Discord.ButtonStyle.Primary).setLabel("loop"),
      stop: new Discord.ButtonBuilder().setCustomId("player_stop").setStyle(Discord.ButtonStyle.Danger).setLabel("stop"),
    },
    queue: {
      pageSelector: new Discord.SelectMenuBuilder().setCustomId("queue_pageSelector").setMaxValues(1).setMinValues(1),
      pageDown: new Discord.ButtonBuilder().setCustomId("queue_pageDown").setStyle(Discord.ButtonStyle.Primary).setEmoji("◀️"),
      pageUp: new Discord.ButtonBuilder().setCustomId("queue_pageUp").setStyle(Discord.ButtonStyle.Primary).setEmoji("▶️"),
      shuffle: new Discord.ButtonBuilder().setCustomId("queue_shuffle").setStyle(Discord.ButtonStyle.Primary).setLabel("shuffle"),
      remove: new Discord.ButtonBuilder().setCustomId("queue_remove").setStyle(Discord.ButtonStyle.Danger).setLabel("remove"),
    },
    history: {
      pageSelector: new Discord.SelectMenuBuilder().setCustomId("history_pageSelector").setMaxValues(1).setMinValues(1),
      pageDown: new Discord.ButtonBuilder().setCustomId("history_pageDown").setStyle(Discord.ButtonStyle.Primary).setEmoji("◀️"),
      pageUp: new Discord.ButtonBuilder().setCustomId("history_pageUp").setStyle(Discord.ButtonStyle.Primary).setEmoji("▶️"),
      repeat: new Discord.ButtonBuilder().setCustomId("history_repeat").setStyle(Discord.ButtonStyle.Primary).setLabel("repeat"),
      remove: new Discord.ButtonBuilder().setCustomId("history_remove").setStyle(Discord.ButtonStyle.Danger).setLabel("remove"),
    },
  };
  private actionRows = {
    groupSelector: new Discord.ActionRowBuilder<Discord.SelectMenuBuilder>({ components: [this.components.groupSelector] }),
    playerSelector: new Discord.ActionRowBuilder<Discord.ButtonBuilder>({
      components: [
        this.components.player.play,
        this.components.player.skip,
        this.components.player.addSong,
        this.components.player.loop,
        this.components.player.stop,
      ],
    }),
    queueSelectorPage: new Discord.ActionRowBuilder<Discord.SelectMenuBuilder>({ components: [this.components.queue.pageSelector] }),
    queueSelector: new Discord.ActionRowBuilder<Discord.ButtonBuilder>({
      components: [
        this.components.queue.pageDown,
        this.components.queue.pageUp,
        this.components.queue.shuffle,
        this.components.queue.remove,
      ],
    }),
    historySelectorPage: new Discord.ActionRowBuilder<Discord.SelectMenuBuilder>({ components: [this.components.history.pageSelector] }),
    historySelector: new Discord.ActionRowBuilder<Discord.ButtonBuilder>({
      components: [
        this.components.history.pageDown,
        this.components.history.pageUp,
        this.components.history.repeat,
        this.components.history.remove,
      ],
    }),
  };

  public async main(): Promise<void> {
    this.currentGroup = "player";
    let cBuilder: cBuilder = this.cBuilders.player();
    this.originalMessage = await this.originalInteraction.reply({ embeds: cBuilder.embeds, components: cBuilder.actionRows, fetchReply: true });
    this.timer = setTimeout(async () => { await this.onTimerEnd() }, 3600000);
    this.startCollectors();
  }

  private async updateCurrentPage<B extends boolean>(x?: B): Promise<B extends true ? cBuilder : void>;
  private async updateCurrentPage(get: boolean = false): Promise<cBuilder | void> {
    if(this.interCollector.ended) return;
    let cBuilder: cBuilder = this.cBuilders[this.currentGroup]();
    if (get) { 
      return cBuilder;
    } else { 
      await this.originalMessage.edit({embeds: cBuilder.embeds, components: cBuilder.actionRows });
    }
  }

  private async onTimerEnd(): Promise<void> {
    if(!this.vc || this.vc?.player?.state?.status == voice.AudioPlayerStatus.Paused || this.vc?.channel?.members?.size == 1){
      this.vc && this.vc.connection.disconnect();
      this.interCollector.stop('time');
      await this.bot.db.music.replaceData(this.originalInteraction.guildId, this.queue, this.history);
      delete Music.musicInstances[this.originalInteraction.guildId];
    } else {
      this.timer.refresh();
    }
  }
  
  private startCollectors(): void {
    this.interCollector = this.originalMessage.createMessageComponentCollector();

    this.interCollector.on("collect", async (interaction) => {
      this.timer.refresh();
      await this.handlers[interaction.customId as keyof Music["handlers"]](interaction);
    });

    this.interCollector.on("end", async (_, reason) => await this.onCollectorStop(reason));
    this.bot.misc.collectorErrorHandler(Music.commandName, this.originalMessage, this.interCollector, this.originalInteraction);
  }

  private async onCollectorStop(reason: string): Promise<void> {
    let embed = new Discord.EmbedBuilder()
      .setColor(0xff0000)
      .setAuthor({ name: `Music manager`, iconURL: "https://www.youtube.com/s/desktop/ef1623de/img/favicon_144x144.png", url: "https://www.youtube.com/" });

    switch (reason) {
      case "newWindow": 
        embed.setTitle("Manager closed because new window opened somewhere in this server.");
        break;
      case "time":
        embed.setTitle("Manager closed because of no activity.");
    }
    await this.originalMessage.edit({ embeds: [embed], components: [] }).catch(() => {});
  }

  private startConnection(voiceChannelID: string): void {
    if (this.vc) return;

    let connection: voice.VoiceConnection = voice.joinVoiceChannel({
      channelId: voiceChannelID,
      guildId: this.originalInteraction.guildId,
      adapterCreator: this.originalInteraction.guild.voiceAdapterCreator,
    });

    let player: voice.AudioPlayer = voice.createAudioPlayer();
    connection.subscribe(player);

    this.vc = {
      player: player,
      connection: connection,
      channel: this.originalInteraction.guild.members.me.voice.channel,
      stream: undefined,
      nowPlaying: undefined,
    };

    this.vc.connection.on("stateChange", async (_, state) => {
      switch (state.status) {
        case "ready":
          await this.updateCurrentPage();
          this.vc.channel = this.originalInteraction.guild.members.me.voice.channel;
          break;
        case "disconnected":
          setTimeout(() => { if (!this.originalInteraction.guild.members.me.voice.channelId) this.vc.connection.destroy() }, 1000);
          break;
        case "destroyed": {
          this.vc.player.stop();
          this.vc = undefined;
          await this.updateCurrentPage();
        }
      }
    });
  }

  private async player(): Promise<void> {
    this.timer.refresh()
    if (!this.queue[0] && !this.loopnum) {
      setTimeout(() => { this.vc.connection.disconnect(), 10000 })
      return;
    }
    this.loopnum ? (this.loopnum -= 1) : (this.vc.nowPlaying = this.queue.shift());
    this.history.unshift(this.vc.nowPlaying);
    let stream: opus.WebmDemuxer | opus.Encoder;
    try { stream = await ytf.getStream(this.vc.nowPlaying.url) } 
    catch (error) {
      await this.onSongError(error, this.vc.nowPlaying);
      await this.player();
      return;
    }
    this.vc.stream = stream;
    let res = voice.createAudioResource(stream);
    this.vc.player.play(res);
    await this.updateCurrentPage();
    stream.on("end", async () => {
      this.vc.player.stop();
      this.vc.channel.members.size == 1 ? this.vc.connection.disconnect() : await this.player();
    });
  }

  private async onSongError(error: unknown, song: song): Promise<void> {
    let embed = new Discord.EmbedBuilder()
      .setColor(0xff0000)
      .setAuthor({ name: "Music manager | error", iconURL: "https://www.youtube.com/s/desktop/ef1623de/img/favicon_144x144.png", url: "https://www.youtube.com/" })
      .setTitle("Error appeard while trying to play the song")
      .setThumbnail(song.thumbnail)
      .setDescription(`**Song:** [${song.title}](${song.url})\n**Error**: ${error}\n\n Do you want to remove all occurrences of this song in queue and history?`);
    let yesButton = new Discord.ButtonBuilder()
      .setCustomId("oseyb")
      .setStyle(Discord.ButtonStyle.Success)
      .setLabel("yes");
    let noButton = new Discord.ButtonBuilder()
      .setCustomId("osenb")
      .setStyle(Discord.ButtonStyle.Danger)
      .setLabel("no");
    let actionRow = new Discord.ActionRowBuilder<Discord.ButtonBuilder>({ components: [yesButton, noButton] });

    let message = await this.originalInteraction.followUp({
      embeds: [embed],
      components: [actionRow],
      fetchReply: true,
    });

    let collector = message.createMessageComponentCollector({ time: 300000 });
    collector.on("collect", async (int) => {
      if (int.customId == "oseyb") {
        this.queue = this.queue.filter((s) => s.title != song.title);
        this.history = this.queue.filter((h) => h.title != song.title);
        await int.deferUpdate()
        await this.updateCurrentPage()
      }
      collector.stop();
    });
    collector.on("end", async () => {
      message.delete().catch(() => {});
    });

    this.bot.misc.collectorErrorHandler(Music.commandName, this.originalMessage, collector, this.originalInteraction);
  }

  private cBuilders = new class {
    constructor(private outer: Music) {}

    player(): cBuilder {
      this.outer.components.groupSelector.setPlaceholder("player");
      this.outer.currentGroup = "player";

      let playerFields;
      let queue: song[] = this.outer.queue;
      if (this.outer.vc) {
        if (this.outer.vc?.nowPlaying) {
          playerFields = [
            { name: this.outer.loopnum ? `Loops remaining: ${this.outer.loopnum}` : "⠀", value: `[${this.outer.vc.nowPlaying.title}](${this.outer.vc.nowPlaying.url})` },
            { name: "Channel", value: `[${this.outer.vc.nowPlaying.author.name}](${this.outer.vc.nowPlaying.author.url})`, inline: true },
            { name: "Length", value: `${this.outer.vc.nowPlaying.length}`, inline: true },
            { name: "Added by", value: `${this.outer.vc.nowPlaying.addingUser}`, inline: true },
          ];
        } else
          playerFields = [{ name: "Nothing is playing right now", value: `Bot is connected to ${this.outer.vc.channel.name}` }];
      } else {
        playerFields = [{ name: "Nothing is playing right now", value: "Bot is not connected to a voice channel." }];
      }

      let embed = new Discord.EmbedBuilder()
        .setColor(0xff0000)
        .setAuthor({ name: "Music manager | player", iconURL: "https://www.youtube.com/s/desktop/ef1623de/img/favicon_144x144.png", url: "https://www.youtube.com/" })
        .setTitle(`Now playing ${this.outer.vc?.nowPlaying ? "🟢" : "🔴"}`)
        .setThumbnail( this.outer.vc?.nowPlaying ? this.outer.vc?.nowPlaying.thumbnail : null )
        .setFields(
          ...playerFields,
          { name: "⠀", value: "Next in queue:" },
          ...queue.slice(0, 4).map((song, index) => {
            return {
              name: `Channel: ${song.author.name}, Length: ${song.length} | Added by ${song.addingUser}`,
              value: `${index + 1}. [${song.title}](${song.url})`,
            };
          }),
        );
        if(this.outer.queue.length > 4) {
          embed.addFields({name: "⠀", value: `${this.outer.queue.length - 4} more in queue.`})
        }

      this.outer.vc
        ? this.outer.components.player.play.setEmoji("⏸️")
        : this.outer.components.player.play.setEmoji("▶️");
      if (this.outer.vc?.player?.state?.status == voice.AudioPlayerStatus.Paused) this.outer.components.player.play.setEmoji("▶️");

      if (this.outer.vc) {
        this.outer.components.player.play.setDisabled(false);
        this.outer.components.player.skip.setDisabled(false);
        this.outer.components.player.loop.setDisabled(false);
        this.outer.components.player.stop.setDisabled(false);
      } else {
        queue.length == 0
          ? this.outer.components.player.play.setDisabled(true)
          : this.outer.components.player.play.setDisabled(false);
        this.outer.components.player.skip.setDisabled(true);
        this.outer.components.player.loop.setDisabled(true);
        this.outer.components.player.stop.setDisabled(true);
      }

      return {
        embeds: [embed],
        actionRows: [ this.outer.actionRows.groupSelector, this.outer.actionRows.playerSelector ],
      };
    }

    queue(page: number = 1): cBuilder {
      this.outer.currentGroup = "queue";
      return this.hqBuilder(page, true);
    }

    history(page: number = 1): cBuilder {
      this.outer.currentGroup = "history";
      return this.hqBuilder(page, false);
    }

    hqBuilder(page: number = 1, isQueue?: boolean): cBuilder {
      this.outer.components.groupSelector.setPlaceholder( isQueue ? "queue" : "history" );
      let queueOrHistory: song[] = isQueue ? this.outer.queue : this.outer.history;
      let pages = Math.ceil(queueOrHistory.length / 10);

      let embed = new Discord.EmbedBuilder()
        .setColor(0xff0000)
        .setAuthor({ name: `Music manager | ${isQueue ? "queue" : "history"}`, iconURL: "https://www.youtube.com/s/desktop/ef1623de/img/favicon_144x144.png", url: "https://www.youtube.com/" })
        .setTitle(isQueue ? "Queue" : "History");

      if (!queueOrHistory.length) {
        if (isQueue) {
          this.outer.components.queue.pageDown.setDisabled(true);
          this.outer.components.queue.pageUp.setDisabled(true);
          this.outer.components.queue.shuffle.setDisabled(true);
          this.outer.components.queue.remove.setDisabled(true);
        } else {
          this.outer.components.history.pageDown.setDisabled(true);
          this.outer.components.history.pageUp.setDisabled(true);
          this.outer.components.history.repeat.setDisabled(true);
          this.outer.components.history.remove.setDisabled(true);
        }
      } else if (queueOrHistory.length <= 10) {
        if (isQueue) {
          this.outer.components.queue.pageDown.setDisabled(true);
          this.outer.components.queue.pageUp.setDisabled(true);
          this.outer.components.queue.shuffle.setDisabled(false);
          this.outer.components.queue.remove.setDisabled(false);
        } else {
          this.outer.components.history.pageDown.setDisabled(true);
          this.outer.components.history.pageUp.setDisabled(true);
          this.outer.components.history.repeat.setDisabled(false);
          this.outer.components.history.remove.setDisabled(false);
        }
      } else {
        if (isQueue) {
          this.outer.components.queue.pageDown.setDisabled(page == 1 ? true : false);
          this.outer.components.queue.pageUp.setDisabled(page == pages ? true : false);
          this.outer.components.queue.shuffle.setDisabled(false);
          this.outer.components.queue.remove.setDisabled(false);
        } else {
          this.outer.components.history.pageDown.setDisabled(page == 1 ? true : false);
          this.outer.components.history.pageUp.setDisabled(page == pages ? true : false);
          this.outer.components.history.repeat.setDisabled(false);
          this.outer.components.history.remove.setDisabled(false);
        }
      }

      if (!queueOrHistory.length) {
        embed.setFields({ name: `The ${isQueue ? "queue" : "history"} is empty`, value: "⠀" });
        return {
          embeds: [embed],
          actionRows: [this.outer.actionRows.groupSelector, isQueue ? this.outer.actionRows.queueSelector : this.outer.actionRows.historySelector],
        };
      }

      let displaySongs = queueOrHistory.slice((page - 1) * 10, page * 10);
      embed
        .setFooter({ text: `Page [${page}/${pages}]` })
        .setFields(
          displaySongs.map((song, index) => {
            return {
              name: `Channel: ${song.author.name}, Length: ${song.length} | Added by ${song.addingUser}`,
              value: `${(page - 1) * 10 + index + 1}. [${song.title}](${song.url})`,
            };
          })
        );
        

      if (pages > 1) {
        let selectMenuOptions = [];
        if (pages / 25 > 1) {
          let mn = pages / 24;
          let x = 1;
          for (let _ of Array(24).fill(0)) {
            selectMenuOptions.push({ label: `page [${Math.round(x)}/${pages}]`, value: `${Math.round(x)}` });
            x += mn;
          }
          selectMenuOptions.push({ label: `page [${pages}/${pages}]`, value: `${pages}` });
        } else {
          selectMenuOptions = Array(pages).fill(0).map((_, index) => (
            { label: `page [${index + 1}/${pages}]`, value: String(index + 1) }
          ));
        }
        isQueue
          ? this.outer.components.queue.pageSelector.setOptions(selectMenuOptions).setPlaceholder(`Page [${page}/${pages}]`)
          : this.outer.components.history.pageSelector.setOptions(selectMenuOptions).setPlaceholder(`Page [${page}/${pages}]`);
      }

      return {
        embeds: [embed],
        actionRows: pages > 1
          ? isQueue
            ? [this.outer.actionRows.groupSelector, this.outer.actionRows.queueSelectorPage, this.outer.actionRows.queueSelector]
            : [this.outer.actionRows.groupSelector, this.outer.actionRows.historySelectorPage, this.outer.actionRows.historySelector]
          : [ this.outer.actionRows.groupSelector, isQueue ? this.outer.actionRows.queueSelector : this.outer.actionRows.historySelector]
      };
    }
  }(this);

  private handlers = new class {
    constructor(private outer: Music) {}

    async group_selector(interaction: Discord.SelectMenuInteraction): Promise<void> {
      let group = interaction.values[0] as keyof Music["cBuilders"];
      let cBuilder = this.outer.cBuilders[group](1);

      await interaction.update({ embeds: cBuilder.embeds, components: cBuilder.actionRows });
    }
    async player_play(interaction: Discord.MessageComponentInteraction): Promise<void> {
      let originalVoiceChannelId = (interaction.member as Discord.GuildMember).voice.channelId;

      let embed = new Discord.EmbedBuilder()
        .setColor(0xff0000)
        .setAuthor({ name: `Music manager | play`, iconURL: "https://www.youtube.com/s/desktop/ef1623de/img/favicon_144x144.png", url: "https://www.youtube.com/" });

      if (!originalVoiceChannelId) {
        embed.setTitle("You're not in the voice channel, join one and try again.");
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      if (!this.outer.vc) {
        this.outer.startConnection(originalVoiceChannelId);
        await interaction.deferUpdate();
        await this.outer.player();
        return;
      }
      this.outer?.vc?.player?.state?.status == voice.AudioPlayerStatus.Paused ? this.outer.vc?.player?.unpause() : this.outer.vc?.player?.pause(true);
      let cBuilder = await this.outer.updateCurrentPage(true);
      await interaction.update({ embeds: cBuilder.embeds, components: cBuilder.actionRows });
    }

    async player_skip(interaction: Discord.MessageComponentInteraction): Promise<void> {
      this.outer.loopnum = 0;
      this.outer?.vc?.stream?.end();
      await interaction.deferUpdate();
    }

    async player_addsong(interaction: Discord.MessageComponentInteraction): Promise<void> {
      let textInput1 = new Discord.TextInputBuilder()
        .setCustomId("1")
        .setLabel(`Name of the song or url [text]`)
        .setStyle(Discord.TextInputStyle.Short)
        .setRequired(true);
      let textInput2 = new Discord.TextInputBuilder()
        .setCustomId("2")
        .setLabel("Add on top of the queue [anything]")
        .setStyle(Discord.TextInputStyle.Short)
        .setRequired(false);
      let textInput3 = new Discord.TextInputBuilder()
        .setCustomId("3")
        .setLabel(`Open menu with search results [anything]`)
        .setStyle(Discord.TextInputStyle.Short)
        .setRequired(false);

      let modID = this.outer.bot.misc.generateID(16);
      let actionRow1 = new Discord.ActionRowBuilder<Discord.ModalActionRowComponentBuilder>({ components: [textInput1] });
      let actionRow2 = new Discord.ActionRowBuilder<Discord.ModalActionRowComponentBuilder>({ components: [textInput2] });
      let actionRow3 = new Discord.ActionRowBuilder<Discord.ModalActionRowComponentBuilder>({ components: [textInput3] });

      let modal = new Discord.ModalBuilder()
        .setCustomId(modID)
        .setTitle("Add song")
        .setComponents(actionRow1, actionRow2, actionRow3);
      interaction.showModal(modal);
      let int = await interaction.awaitModalSubmit({ filter: (int) => int.customId == modID, time: 60000 }).catch(() => undefined)
      if(!int) return;
      let embed = new Discord.EmbedBuilder()
        .setColor(0xff0000)
        .setAuthor({ name: `Music manager | add song`, iconURL: "https://www.youtube.com/s/desktop/ef1623de/img/favicon_144x144.png", url: "https://www.youtube.com/" });

      let songName = int.fields.getTextInputValue("1");
      let onTop = int.fields.getTextInputValue("2").length == 0 ? false : true;
      let isSearch = int.fields.getTextInputValue("3").length == 0 ? false : true;

      let playlistIDr = songName.match(/youtube.com\/playlist\?list=(.*)/);
      if (playlistIDr) {
        let playlist;
        try {
          playlist = await ytfps(playlistIDr[1]);
        } catch {
          embed.setTitle("Couldn't find provided playlist");
          await int.reply({ embeds: [embed] });
          return;
        }
        let parsedSongs: song[] = [];
        for (let song of playlist.videos) {
          parsedSongs.push({
            title: song.title || "undefined",
            length: song.length || "undefined",
            published: "undefined",
            views: "undefined",
            thumbnail: song.thumbnail_url,
            url: song.url,
            addingUser: int.user.username,
            author: {
              name: song.author.name || "undefined",
              url: song.author.url || "undefined",
            },
          });
        }
        embed
          .setTitle("Playlist added to the queue")
          .setDescription(`[${playlist.title}](${playlist.url})`)
          .setThumbnail(playlist.thumbnail_url)
          .setFields([
            { name: "author", value: playlist.isAlbum ? "unknown" : `[${playlist.author.name}](${playlist.author.url})`, inline: true },
            { name: "count", value: String(playlist.video_count), inline: true },
          ]);
        onTop ? this.outer.queue.unshift(...parsedSongs) : this.outer.queue.push(...parsedSongs);
        await this.outer.updateCurrentPage();
        await int.reply({ embeds: [embed], ephemeral: true });
        return;
      }
      let searchedSongs = (await ytf.search(songName)).slice(0, 10);
      if (!searchedSongs.length) {
        embed.setTitle("Couln't find provided song");
        await int.reply({ embeds: [embed], ephemeral: true });
        return;
      }
      if (!isSearch) {
        embed
          .setTitle("Song added to the queue")
          .setDescription(`[${searchedSongs[0].title}](${searchedSongs[0].url})`)
          .setThumbnail(searchedSongs[0].thumbnail)
          .setFields([
            { name: "channel", value: `[${searchedSongs[0].author.name}](${searchedSongs[0].author.url})`, inline: true },
            { name: "length", value: `${searchedSongs[0].length}`, inline: true },
            { name: "position in queue", value: `${onTop ? 1 : this.outer.queue.length + 1}`, inline: true },
          ]);
        searchedSongs[0].addingUser = int.user.username;
        onTop ? this.outer.queue.unshift(searchedSongs[0]) : this.outer.queue.push(searchedSongs[0]);
        this.outer.updateCurrentPage();
        int.reply({ embeds: [embed], ephemeral: true });
        return;
      }
      embed.setTitle(`Search results for: ${songName}`).setFields(
        searchedSongs.map((value, index) => {
          return { name: `channel: ${value.author.name} | length: ${value.length} | ${value.views}`, value: `${index + 1}. [${value.title}](${value.url})` };
        })
      );
      let selectMenu = new Discord.SelectMenuBuilder()
        .setCustomId("assm")
        .setMaxValues(1)
        .setMinValues(1)
        .setPlaceholder("select song to add")
        .setOptions(
          searchedSongs.map((value, index) => {
            return { label: `${index + 1}. ${value.title}`.slice(0, 99), value: `${index}` };
          })
        );
      let actionRow = new Discord.ActionRowBuilder<Discord.SelectMenuBuilder>({ components: [selectMenu] });

      let message = await int.reply({ embeds: [embed], components: [actionRow], fetchReply: true });
      let collector = message.createMessageComponentCollector({ time: 300000 });

      collector.on("collect", async (cInt: Discord.SelectMenuInteraction) => {
        let selectedSong = searchedSongs[Number(cInt.values[0])];
        selectedSong.addingUser = cInt.user.username;
        embed
          .setTitle("Adding song to the queue")
          .setDescription(`[${selectedSong.title}](${selectedSong.url})`)
          .setThumbnail(selectedSong.thumbnail)
          .setFields([
            { name: "channel", value: `[${selectedSong.author.name}](${selectedSong.author.url})`, inline: true },
            { name: "length", value: `${selectedSong.length}`, inline: true },
            { name: "position in queue", value: `${onTop ? 1 : this.outer.queue.length + 1}`, inline: true },
          ]);
        onTop ? this.outer.queue.unshift(selectedSong) : this.outer.queue.push(selectedSong);
        this.outer.updateCurrentPage();
        await int.followUp({ embeds: [embed], ephemeral: true });
        collector.stop();
      });

      collector.on("end", async () => {
        await message.delete().catch(() => {});
      });

      this.outer.bot.misc.collectorErrorHandler(Music.commandName, this.outer.originalMessage, collector, this.outer.originalInteraction);

    }
    async player_loop(interaction: Discord.MessageComponentInteraction): Promise<void> {
      let textInput1 = new Discord.TextInputBuilder()
        .setCustomId("1")
        .setLabel(`Amount of loops [number]`)
        .setStyle(Discord.TextInputStyle.Short)
        .setRequired(true);
      let modID = this.outer.bot.misc.generateID(16);
      let actionRow1 = new Discord.ActionRowBuilder<Discord.ModalActionRowComponentBuilder>({ components: [textInput1] });

      let modal = new Discord.ModalBuilder()
        .setCustomId(modID)
        .setTitle(`Loop currently playing song`)
        .setComponents(actionRow1);

      await interaction.showModal(modal);
      let int = await interaction.awaitModalSubmit({ filter: (int) => int.customId == modID, time: 60000 }).catch(() => undefined)
      if(!int) return;
      let embed = new Discord.EmbedBuilder()
        .setColor(0xff0000)
        .setAuthor({ name: `Music manager | loop`, iconURL: "https://www.youtube.com/s/desktop/ef1623de/img/favicon_144x144.png", url: "https://www.youtube.com/" })

      let loopStr = int.fields.getTextInputValue("1");
      let loop = Number(loopStr)
      if (!this.outer.bot.misc.isPositiveInt(loopStr)) {
        embed.setTitle("Amount of loops must be a positive number");
        await int.reply({ embeds: [embed], ephemeral: true });
        return;
      }
      this.outer.loopnum = loop;
      let cBuilder = await this.outer.updateCurrentPage(true);
      await int.update({ embeds: cBuilder.embeds, components: cBuilder.actionRows });
    }

    async player_stop(interaction: Discord.MessageComponentInteraction): Promise<void> {
      this.outer.vc?.connection?.disconnect();
      await interaction.deferUpdate();
    }

    async queue_shuffle(interaction: Discord.MessageComponentInteraction): Promise<void> {
      let queue = this.outer.queue;
      for (let i = queue.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        [queue[i], queue[j]] = [queue[j], queue[i]];
      }
      this.outer.queue = queue;
      let cbuilder = await this.outer.updateCurrentPage(true);
      interaction.update({ embeds: cbuilder.embeds, components: cbuilder.actionRows });
    }

    async history_repeat(interaction: Discord.MessageComponentInteraction): Promise<void> {
      let textInput1 = new Discord.TextInputBuilder()
        .setCustomId("1")
        .setLabel(`Position of the song (0 to all) [number]`)
        .setStyle(Discord.TextInputStyle.Short)
        .setRequired(true);
      let textInput2 = new Discord.TextInputBuilder()
        .setCustomId("2")
        .setLabel(`Add on top of the queue [anything]`)
        .setStyle(Discord.TextInputStyle.Short)
        .setRequired(false);
      let modID = this.outer.bot.misc.generateID(16);
      let actionRow1 = new Discord.ActionRowBuilder<Discord.ModalActionRowComponentBuilder>({ components: [textInput1] });
      let actionRow2 = new Discord.ActionRowBuilder<Discord.ModalActionRowComponentBuilder>({ components: [textInput2] });

      let modal = new Discord.ModalBuilder()
        .setCustomId(modID)
        .setTitle("Repeat song from history")
        .setComponents(actionRow1, actionRow2);

      await interaction.showModal(modal);
      let int = await interaction.awaitModalSubmit({ filter: (int) => int.customId == modID, time: 60000 }).catch(() => undefined)
      if (!int) return;

      let positionStr = int.fields.getTextInputValue("1");
      let position = Number(positionStr);
      let onTop = int.fields.getTextInputValue("2").length == 0 ? false : true;

      let embed = new Discord.EmbedBuilder()
        .setColor(0xff0000)
        .setAuthor({ name: "Music manager | repeat from history", iconURL: "https://www.youtube.com/s/desktop/ef1623de/img/favicon_144x144.png", url: "https://www.youtube.com/" });

      if (!this.outer.bot.misc.isPositiveInt(positionStr)) {
        embed.setTitle("Position must be positive a number.");
        await int.reply({ embeds: [embed], ephemeral: true });
        return;
      }
      if (position == 0) {
        onTop ? this.outer.queue.unshift(...this.outer.history) : this.outer.queue.push(...this.outer.history);
        embed
          .setTitle("All songs from history added to the queue")
          .setDescription(`**Added in total:** ${this.outer.history.length}`);
        await this.outer.updateCurrentPage();
        await int.reply({ embeds: [embed], ephemeral: true });
        return;
      }
      if (position > this.outer.history.length) {
        embed.setTitle(`There's no song at position ${position}`);
        await int.reply({ embeds: [embed], ephemeral: true });
        return;
      }
      onTop ? this.outer.queue.unshift(this.outer.history[position - 1]) : this.outer.queue.push(this.outer.history[position - 1]);
      embed
        .setTitle(`The song successfully added to the queue`)
        .setDescription(`**Song:** ${this.outer.history[position - 1].title}`);

      await int.reply({ embeds: [embed], ephemeral: true });
      await this.outer.updateCurrentPage();
    }

    async hq_pageSelector(interaction: Discord.SelectMenuInteraction, isQueue?: boolean): Promise<void> {
      let cBuilder = this.outer.cBuilders.hqBuilder(Number(interaction.values[0]), isQueue);
      await interaction.update({ embeds: cBuilder.embeds, components: cBuilder.actionRows });
    }

    async hq_pageDown(interaction: Discord.MessageComponentInteraction, isQueue?: boolean): Promise<void> {
      let currentPage = Number(interaction.message.embeds[0].footer.text.split("[")[1].split("/")[0]);
      let cBuilder = this.outer.cBuilders.hqBuilder(currentPage - 1, isQueue);
      await interaction.update({ embeds: cBuilder.embeds, components: cBuilder.actionRows });
    }

    async hq_pageUp(interaction: Discord.MessageComponentInteraction, isQueue?: boolean): Promise<void> {
      let currentPage = Number(interaction.message.embeds[0].footer.text.split("[")[1].split("/")[0]);
      let cBuilder = this.outer.cBuilders.hqBuilder(currentPage + 1, isQueue);
      await interaction.update({ embeds: cBuilder.embeds, components: cBuilder.actionRows });
    }

    async hq_remove(interaction: Discord.MessageComponentInteraction, isQueue?: boolean): Promise<void> {
      let textInput1 = new Discord.TextInputBuilder()
        .setCustomId("1")
        .setLabel(`Position of the song (0 to all) [number]`)
        .setStyle(Discord.TextInputStyle.Short)
        .setRequired(true);
      let textInput2 = new Discord.TextInputBuilder()
        .setCustomId("2")
        .setLabel(`Remove all occurrences of the song [anything]`)
        .setStyle(Discord.TextInputStyle.Short)
        .setRequired(false);
      let modID = this.outer.bot.misc.generateID(16);
      let actionRow1 = new Discord.ActionRowBuilder<Discord.ModalActionRowComponentBuilder>({ components: [textInput1] });
      let actionRow2 = new Discord.ActionRowBuilder<Discord.ModalActionRowComponentBuilder>({ components: [textInput2] });

      let modal = new Discord.ModalBuilder()
        .setCustomId(modID)
        .setTitle(`Remove song from the ${isQueue ? "queue" : "history"}`)
        .setComponents(actionRow1, actionRow2);

      await interaction.showModal(modal);
      let int = await interaction.awaitModalSubmit({ filter: (int) => int.customId == modID, time: 60000 }).catch(() => undefined)
      if(!int) return;

      let queueOrHistory: song[] = isQueue ? this.outer.queue : this.outer.history;
      let positionStr = int.fields.getTextInputValue("1");
      let position = Number(positionStr);
      let allOccurrences = int.fields.getTextInputValue("2").length == 0 ? false : true;

      let embed = new Discord.EmbedBuilder()
        .setColor(0xff0000)
        .setAuthor({ name: `Music manager | remove from ${isQueue ? "queue" : "History"}`, iconURL: "https://www.youtube.com/s/desktop/ef1623de/img/favicon_144x144.png", url: "https://www.youtube.com/" });

      if (!this.outer.bot.misc.isPositiveInt(positionStr)) {
        embed.setTitle("Position must be a number.");
        await int.reply({ embeds: [embed], ephemeral: true });
        return;
      }
      if (position == 0) {
        isQueue ? (this.outer.queue = []) : (this.outer.history = []);
        embed.setTitle(`${isQueue ? "Queue" : "History"} removed.`);
        await this.outer.updateCurrentPage();
        await int.reply({ embeds: [embed], ephemeral: true });
        return;
      }
      if (position > queueOrHistory.length) {
        embed.setTitle(`There's no song at position ${position}`);
        await int.reply({ embeds: [embed], ephemeral: true });
        return;
      }
      let removedSong = queueOrHistory[position - 1];
      if (allOccurrences) {
        let newQOH = queueOrHistory.filter((song) => song.title != queueOrHistory[position - 1].title);
        let removedInTotal = queueOrHistory.length - newQOH.length;
        isQueue ? (this.outer.queue = newQOH) : (this.outer.history = newQOH);
        embed
          .setTitle("Successfully removed all occurrences of the song")
          .setDescription(`**Song:** [${removedSong.title}]\n**Removed in total:** ${removedInTotal}`);
      } else {
        isQueue ? this.outer.queue.splice(position - 1, 1) : this.outer.history.splice(position - 1, 1);
        embed
          .setTitle("Successfully removed the song at position ${position}")
          .setDescription(`**Song:** [${removedSong.title}]`);
      }
      await this.outer.updateCurrentPage();
      await int.reply({ embeds: [embed], ephemeral: true });

    }
    async queue_pageSelector(interaction: Discord.SelectMenuInteraction): Promise<void> { this.hq_pageSelector(interaction, true) }
    async queue_pageDown(interaction: Discord.MessageComponentInteraction): Promise<void> { this.hq_pageDown(interaction, true) }
    async queue_pageUp(interaction: Discord.MessageComponentInteraction): Promise<void> { this.hq_pageUp(interaction, true) }
    async queue_remove(interaction: Discord.MessageComponentInteraction): Promise<void> { this.hq_remove(interaction, true) }
    async history_pageSelector(interaction: Discord.SelectMenuInteraction): Promise<void> { this.hq_pageSelector(interaction, false) }
    async history_pageDown(interaction: Discord.MessageComponentInteraction): Promise<void> { this.hq_pageDown(interaction, false) }
    async history_pageUp(interaction: Discord.MessageComponentInteraction): Promise<void> { this.hq_pageUp(interaction, false) }
    async history_remove(interaction: Discord.MessageComponentInteraction): Promise<void> { this.hq_remove(interaction, false) }
  }(this);
}
