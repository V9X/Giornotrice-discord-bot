import Discord from "discord.js";
import fs from "fs";
import { Bot } from "../../main";
import canvas from "canvas";
import CommandT from '../../commandT';

export default class Wordle extends CommandT {
  static commandName = "wordle";
  static ver = "1.0.1";
  static alphabet = [ "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z" ];

  static images = {
    keyboard: {
      green: {},
      grey: {},
      yellow: {},
    },
    letters: {
      green: {},
      grey: {},
      yellow: {},
    },
  } as any

  static wordLists: {
    english?: string[],
    polish?: string[],
  } = {}

  static async applicationConstructor(start?: boolean): Promise<Discord.RESTPostAPIApplicationCommandsJSONBody> {
    if (start) {
      Wordle.wordLists.english = JSON.parse(fs.readFileSync('./lib/files/wordle/wordLists/wordle_english.json').toString())
      Wordle.wordLists.polish = JSON.parse(fs.readFileSync('./lib/files/wordle/wordLists/wordle_polish.json').toString())

      for (let letter of Wordle.alphabet) { 
        ["keyboard", "letters"].forEach(async (korl) => {
          ["grey", "green", "yellow"].forEach(async (color) => {
            Wordle.images[korl][color][letter] = await canvas.loadImage(`./lib/files/wordle/${korl}/${color}/${letter.toUpperCase()}.png`).catch(() => {});
          });
        });
      }

      ["grey", "green", "yellow"].forEach(async (color) => { 
        Wordle.images.letters[color]["ą"] = await canvas.loadImage( `./lib/files/wordle/letters/${color}/AP1.png` );
        Wordle.images.letters[color]["ć"] = await canvas.loadImage( `./lib/files/wordle/letters/${color}/CP1.png` );
        Wordle.images.letters[color]["ę"] = await canvas.loadImage( `./lib/files/wordle/letters/${color}/EP1.png` );
        Wordle.images.letters[color]["ł"] = await canvas.loadImage( `./lib/files/wordle/letters/${color}/LP1.png` );
        Wordle.images.letters[color]["ń"] = await canvas.loadImage( `./lib/files/wordle/letters/${color}/NP1.png` );
        Wordle.images.letters[color]["ó"] = await canvas.loadImage( `./lib/files/wordle/letters/${color}/OP1.png` );
        Wordle.images.letters[color]["ś"] = await canvas.loadImage( `./lib/files/wordle/letters/${color}/SP1.png` );
        Wordle.images.letters[color]["ź"] = await canvas.loadImage( `./lib/files/wordle/letters/${color}/ZP1.png` );
        Wordle.images.letters[color]["ż"] = await canvas.loadImage( `./lib/files/wordle/letters/${color}/ZP2.png` );
      });
      Wordle.images.template = await canvas.loadImage( "./lib/files/wordle/wordleTemplate.png" );
    }

    let choiceList = [
      {name: 'english', value: 'english'},
      {name: 'polish', value: 'polish'}
    ]

    let command = new Discord.SlashCommandBuilder().setName("wordle").setDescription("Funny word game")
      .addStringOption((o) =>o.setName("language").setDescription("Select language").setChoices(...choiceList)).toJSON();

    return command;
  }
  static keyboardLocation = {
    a: [45, 1080, 70, 90],
    b: [445, 1185, 70, 90],
    c: [285, 1185, 70, 90],
    d: [205, 1080, 70, 90],
    e: [165, 975, 70, 90],
    f: [285, 1080, 70, 90],
    g: [365, 1080, 70, 90],
    h: [445, 1080, 70, 90],
    i: [565, 975, 70, 90],
    j: [525, 1080, 70, 90],
    k: [605, 1080, 70, 90],
    l: [685, 1080, 70, 90],
    m: [605, 1185, 70, 90],
    n: [525, 1185, 70, 90],
    o: [645, 975, 70, 90],
    p: [725, 975, 70, 90],
    q: [5, 975, 70, 90],
    r: [245, 975, 70, 90],
    s: [125, 1080, 70, 90],
    t: [325, 975, 70, 90],
    u: [485, 975, 70, 90],
    v: [365, 1185, 70, 90],
    w: [85, 975, 70, 90],
    x: [205, 1185, 70, 90],
    y: [405, 975, 70, 90],
    z: [125, 1185, 70, 90],
  }
  static rowLocation = [
    [ [5, 5, 150, 150], [165, 5, 150, 150], [325, 5, 150, 150], [485, 5, 150, 150], [645, 5, 150, 150] ],
    [ [5, 165, 150, 150], [165, 165, 150, 150], [325, 165, 150, 150], [485, 165, 150, 150], [645, 165, 150, 150] ],
    [ [5, 325, 150, 150], [165, 325, 150, 150], [325, 325, 150, 150], [485, 325, 150, 150], [645, 325, 150, 150] ],
    [ [5, 485, 150, 150], [165, 485, 150, 150], [325, 485, 150, 150], [485, 485, 150, 150], [645, 485, 150, 150] ],
    [ [5, 645, 150, 150], [165, 645, 150, 150], [325, 645, 150, 150], [485, 645, 150, 150], [645, 645, 150, 150] ],
    [ [5, 805, 150, 150], [165, 805, 150, 150], [325, 805, 150, 150], [485, 805, 150, 150], [645, 805, 150, 150] ],
  ];

  static unAuthClEmbed = new Discord.EmbedBuilder().setColor(0x538d4e).setDescription("Sorry, you can't do that");

  static async run(int: Discord.ChatInputCommandInteraction, bot: Bot): Promise<void> {
    await new Wordle(int, bot).main();
  }

  constructor(private originalInteraction: Discord.ChatInputCommandInteraction, private bot: Bot) { super() }

  private originalMessage: Discord.Message;
  private embed: Discord.EmbedBuilder;
  private isButtonPublicActive:boolean = false;
  private processing = false;
  private language: "english" | "polish";
  private msgCollector: Discord.MessageCollector;
  private interCollector: Discord.InteractionCollector<any>;
  private guessingWord: string;
  private guessing = 0;
  private cnv: canvas.Canvas;
  private ctx: canvas.CanvasRenderingContext2D;
  private kgreen: string[] = [];

  private components = {
    answerButton: new Discord.ButtonBuilder().setCustomId("answerButton").setStyle(Discord.ButtonStyle.Success).setLabel("answer"),
    publicButton: new Discord.ButtonBuilder().setCustomId("publicButton").setStyle(Discord.ButtonStyle.Primary).setLabel("public"),
    endGameButton: new Discord.ButtonBuilder().setCustomId("endGameButton").setStyle(Discord.ButtonStyle.Danger).setLabel("end game"),
  };

  private actionRows = {
    mainRow: new Discord.ActionRowBuilder<Discord.ButtonBuilder>({ components: [this.components.answerButton, this.components.publicButton, this.components.endGameButton] })
  };

  private async main(): Promise<void> {
    let lan = this.originalInteraction.options.getString( "language", false ) || "english"
    this.language = lan as 'polish' | 'english'
    this.guessingWord = Wordle.wordLists[this.language][Math.floor(Math.random() * Wordle.wordLists[this.language].length)];
    this.cnv = canvas.createCanvas(800, 1280);
    this.ctx = this.cnv.getContext("2d", { alpha: true });
    this.ctx.drawImage(Wordle.images.template, 0, 0, 800, 1280);

    this.embed = new Discord.EmbedBuilder()
      .setColor(0x538d4e)
      .setAuthor({ name: `Wordle [${this.language}]`,url: "https://www.powerlanguage.co.uk/wordle/", iconURL: "https://cdn.discordapp.com/attachments/752238790323732494/963154625110880316/W.png" })
      .setFooter({ text: `${this.originalInteraction.user.username} is playing` })
      .setImage("attachment://wt.png")
      .setDescription("type 5-letter word to start");

    this.originalMessage = await this.originalInteraction.reply({ 
      embeds: [this.embed], 
      components: [this.actionRows.mainRow], 
      files: [new Discord.AttachmentBuilder(this.cnv.toBuffer(), {name: "wt.png"} )], 
      fetchReply: true 
    })
    this.startCollectors();
  }
  private startCollectors(): void {
    this.msgCollector = this.originalMessage.channel.createMessageCollector({ idle: 3600000, filter: (m) => m.content.length == 5 && !this.processing });
    this.interCollector = this.originalMessage.createMessageComponentCollector();

    this.msgCollector.on("collect", async (msg) => {
      if (msg.author.id == this.originalInteraction.user.id || this.isButtonPublicActive){
        await this.onMessage(msg.content);
        setTimeout(() => { msg.delete().catch(() => {}) }, 10);
      };
    });

    this.msgCollector.on( "end", async (_, reason) => {
      await this.onCollectorStop(reason)
    });
    this.interCollector.on("collect", async (interaction) => {
      await this.handlers[interaction.customId as keyof Wordle['handlers']](interaction);
    });
    this.bot.misc.collectorErrorHandler(Wordle.commandName, this.originalMessage, this.msgCollector, this.originalInteraction);
    this.bot.misc.collectorErrorHandler(Wordle.commandName, this.originalMessage, this.interCollector, this.originalInteraction);
  }

  private async onCollectorStop(reason: string): Promise<void> {
    switch (reason) {
      case "time":
      case "idle":
        this.embed.setDescription(`Time's up, the correct word was: ${this.guessingWord}`);
        break;
      case "cancel":
        this.embed.setDescription(`Game canceled. The correct word was: ${this.guessingWord}`);
        break;
    }
    this.interCollector.stop();
    if (reason != "dn") {
      this.components.answerButton.setDisabled(true)
      this.components.endGameButton.setDisabled(true)
      this.components.publicButton.setDisabled(true)
      await this.originalMessage.edit({ components: [this.actionRows.mainRow] }).catch(() => {});
    }
  }

  private async onMessage(content: String): Promise<void> {
    this.processing = true;

    if (!Wordle.wordLists[this.language].includes(content.toLowerCase())) {
      if (this.embed.data.description != "This word does not exist") {
          this.embed.data.description = "This word does not exist";
          await this.originalMessage.edit({ embeds: [this.embed], components: [this.actionRows.mainRow] });
        }
        this.processing = false;
        return;
    }

    this.embed.setDescription("nice")
    let colors = this.genWord(this.guessingWord, content.toLowerCase());

    let keyboardColors = this.genKeyboard(this.guessingWord, content.toLowerCase());

    let letterArray = content.toLowerCase().split("");

    for (let index in colors) {
      try { this.ctx.drawImage( Wordle.images.letters[colors[index]][letterArray[index]], ...Wordle.rowLocation[this.guessing][index] )} catch {}
      try { this.ctx.drawImage( Wordle.images.keyboard[keyboardColors[index]][letterArray[index]], ...(Wordle.keyboardLocation as any)[letterArray[index]] )} catch {}
    }
    this.guessing++;
    
    if (content.toLowerCase() == this.guessingWord) {
      this.embed.setDescription("Congratulations, you won");
      this.components.answerButton.setDisabled(true);
      this.components.endGameButton.setDisabled(true);
      this.components.publicButton.setDisabled(true);
      this.msgCollector.stop("dn");
    } else {
      if (this.guessing == 6) {
        this.components.answerButton.setDisabled(true);
        this.components.endGameButton.setDisabled(true);
        this.components.publicButton.setDisabled(true);
        this.embed.setDescription( `Game over, you lost. The correct word was: ${this.guessingWord}` );
        this.msgCollector.stop("dn");
      }
    }
    await this.originalMessage.edit({
        embeds: [this.embed],
        components: [this.actionRows.mainRow],
        files: [new Discord.AttachmentBuilder(this.cnv.toBuffer(), {name: "wt.png"})],
    });

    this.processing = false;
  }
  private handlers = new class{
    constructor(private outer: Wordle) {}

    async answerButton(interaction: Discord.MessageComponentInteraction): Promise<void> {
      if (interaction.user.id != this.outer.originalInteraction.user.id && !this.outer.isButtonPublicActive) {
          await interaction.reply({embeds: [ Wordle.unAuthClEmbed ], ephemeral: true });
          return;
      } 
      let textInput = new Discord.TextInputBuilder()
        .setCustomId("1")
        .setLabel("wordle answer")
        .setStyle(Discord.TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(5)
        .setMaxLength(5);
      let modid = this.outer.bot.misc.generateID(16);
  
      let actionRow = new Discord.ActionRowBuilder<Discord.ModalActionRowComponentBuilder>({ components: [textInput] });
      let modal = new Discord.ModalBuilder()
        .setCustomId(modid)
        .setTitle("wordle")
        .setComponents(actionRow);
      await interaction.showModal(modal);
      let int = await interaction.awaitModalSubmit({ filter: (int) => int.customId == modid, time: 60000 }).catch(() => undefined);
      if(!int) return;
      await this.outer.onMessage(int.fields.getTextInputValue("1"));
      await int.deferUpdate();
    }

    async publicButton(interaction: Discord.MessageComponentInteraction): Promise<void> {
      if (interaction.user.id != this.outer.originalInteraction.user.id) {
        await interaction.reply({ embeds: [Wordle.unAuthClEmbed], ephemeral: true });
        return;
      }
      this.outer.components.publicButton.setLabel(this.outer.isButtonPublicActive ? "public" : "private");
      this.outer.isButtonPublicActive = !this.outer.isButtonPublicActive;
  
      await interaction.update({ components: [this.outer.actionRows.mainRow] });
    }

    async endGameButton(interaction: Discord.MessageComponentInteraction): Promise<void> {
      if (interaction.user.id != this.outer.originalInteraction.user.id) {
        await interaction.reply({ embeds: [Wordle.unAuthClEmbed], ephemeral: true });
        return;
      }
      await interaction.deferUpdate();
      this.outer.msgCollector.stop("cancel");
    }

  }(this)

  private genWord(correct: string, input: string): string[] {
    let C = correct;
    let G = input;
    let out = [] as string[];

    for (let n = 0; n < C.length; n++) {
      out.push(C[n] == G[n] ? "green" : !C.includes(G[n]) ? "grey" : "?");
    }
    for (let i = 0; i < C.length; i++) {
      if (out[i] == "?") {
        out[i] = [...C].filter((e) => e == G[i]).length - Array(C.length).fill(0).filter((_, x) => (out[x] == "green" || out[x] == "yellow") && G[x] == G[i] ).length > 0 ? "yellow": "grey";
      }
    }
    return out;
  }
  private genKeyboard(correct: string, input: string): string[] {
    let C = correct;
    let G = input;
    let yellow = [];
    let out = [] as string[];

    for (let i = 0; i < C.length; i++) {
      C[i] == G[i] ? this.kgreen.push(C[i]) : C.includes(G[i]) && yellow.push(G[i]);
    }
    for (let i = 0; i < C.length; i++) {
      this.kgreen.includes(G[i]) ? (out[i] = "green") : yellow.includes(G[i]) ? (out[i] = "yellow") : (out[i] = "grey");
    }
    return out;
  }
}
