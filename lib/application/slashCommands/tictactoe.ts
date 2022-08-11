import Discord from "discord.js";
import { Bot } from "../../main";
import CommandT from '../../commandT';

export default class Tictactoe extends CommandT {
  static commandName = "tictactoe";
  static ver = "1.0.1";

  static async applicationConstructor(start?: boolean): Promise<Discord.RESTPostAPIApplicationCommandsJSONBody> {
    let command = new Discord.SlashCommandBuilder().setName(Tictactoe.commandName).setDescription('tic tac toe game')
        .addUserOption(o => o.setName('user').setDescription('User you want to play with').setRequired(true)).toJSON();

    return command;
  }

  static async run(int: Discord.ChatInputCommandInteraction, bot: Bot): Promise<void> {
    await new Tictactoe(int, bot).main();
  }

  constructor( private originalInteraction: Discord.ChatInputCommandInteraction, private bot: Bot ) { super() }

  private embed: Discord.EmbedBuilder;
  private interCollector: Discord.InteractionCollector<any>;
  private originalMessage: Discord.Message;
  private buttonList: Discord.ButtonBuilder[];

  private player: {
    first?: Discord.User;
    second?: Discord.User;
  } = {}
  private actionRows: {
    row1?: Discord.ActionRowBuilder<Discord.ButtonBuilder>;
    row2?: Discord.ActionRowBuilder<Discord.ButtonBuilder>;
    row3?: Discord.ActionRowBuilder<Discord.ButtonBuilder>;
  } = {}
  private components: {
    S1x1?: Discord.ButtonBuilder;
    S1x2?: Discord.ButtonBuilder;
    S1x3?: Discord.ButtonBuilder;
    S2x1?: Discord.ButtonBuilder;
    S2x2?: Discord.ButtonBuilder;
    S2x3?: Discord.ButtonBuilder;
    S3x1?: Discord.ButtonBuilder;
    S3x2?: Discord.ButtonBuilder;
    S3x3?: Discord.ButtonBuilder;
  } = {}


  private async main(): Promise<void>{
    let player1 = this.originalInteraction.options.getUser("user", false);
    let player2 = this.originalInteraction.user;
    if(Math.round(Math.random())){
        this.player.first = player1
        this.player.second = player2
    } else {
        this.player.first = player2
        this.player.second = player1
    }

    this.embed = new Discord.EmbedBuilder()
      .setColor(0xffb404)
      .setAuthor({ name: "tic tac toe", iconURL: "https://cdn.discordapp.com/attachments/752238790323732494/942373249193508884/85535e05d1f130b16751c8308cfbb19b.png" })
      .setDescription( `${this.player.first.username} - 🟢\n${this.player.second.username} - ❌` )
      .setTitle(`It's ${this.player.first.username}'s turn`);

    this.components.S1x1 = new Discord.ButtonBuilder().setCustomId("s1x1").setStyle(Discord.ButtonStyle.Secondary).setLabel("⠀");
    this.components.S1x2 = new Discord.ButtonBuilder().setCustomId("s1x2").setStyle(Discord.ButtonStyle.Secondary).setLabel("⠀");
    this.components.S1x3 = new Discord.ButtonBuilder().setCustomId("s1x3").setStyle(Discord.ButtonStyle.Secondary).setLabel("⠀");
    this.components.S2x1 = new Discord.ButtonBuilder().setCustomId("s2x1").setStyle(Discord.ButtonStyle.Secondary).setLabel("⠀");
    this.components.S2x2 = new Discord.ButtonBuilder().setCustomId("s2x2").setStyle(Discord.ButtonStyle.Secondary).setLabel("⠀");
    this.components.S2x3 = new Discord.ButtonBuilder().setCustomId("s2x3").setStyle(Discord.ButtonStyle.Secondary).setLabel("⠀");
    this.components.S3x1 = new Discord.ButtonBuilder().setCustomId("s3x1").setStyle(Discord.ButtonStyle.Secondary).setLabel("⠀");
    this.components.S3x2 = new Discord.ButtonBuilder().setCustomId("s3x2").setStyle(Discord.ButtonStyle.Secondary).setLabel("⠀");
    this.components.S3x3 = new Discord.ButtonBuilder().setCustomId("s3x3").setStyle(Discord.ButtonStyle.Secondary).setLabel("⠀");

    this.actionRows.row1 = new Discord.ActionRowBuilder<Discord.ButtonBuilder>({components: [ this.components.S1x1, this.components.S1x2, this.components.S1x3 ]});
    this.actionRows.row2 = new Discord.ActionRowBuilder<Discord.ButtonBuilder>({components: [ this.components.S2x1, this.components.S2x2, this.components.S2x3 ]});
    this.actionRows.row3 = new Discord.ActionRowBuilder<Discord.ButtonBuilder>({components: [ this.components.S3x1, this.components.S3x2, this.components.S3x3 ]});

    this.buttonList = [
      this.components.S1x1,
      this.components.S1x2,
      this.components.S1x3,
      this.components.S2x1,
      this.components.S2x2,
      this.components.S2x3,
      this.components.S3x1,
      this.components.S3x2,
      this.components.S3x3,
    ];

    this.originalMessage = (await this.originalInteraction.reply({
      embeds: [this.embed],
      components: [this.actionRows.row1, this.actionRows.row2, this.actionRows.row3],
      fetchReply: true,
    }))
    await this.startCollectors();
  }

  private async startCollectors(): Promise<void> {
    this.interCollector = this.originalMessage.createMessageComponentCollector({ idle: 3600000 });
    let currentPlayer = this.player.first;
    let cox = false;
    this.interCollector.on( "collect", async (interaction: Discord.ButtonInteraction) => {
        if (interaction.user.id == currentPlayer.id) {
          for (let button of this.buttonList) {
            if ((button as any).data.custom_id == interaction.customId) {
              button.setDisabled(true);
              button.setStyle(cox ? Discord.ButtonStyle.Danger : Discord.ButtonStyle.Success);
              button.setLabel(cox ? "X" : "O");
            }
          }
          if (this.check()) {
            for (let button of this.buttonList) { button.setDisabled(true) }
            this.embed.setTitle(`${currentPlayer.username} won!`);
            this.embed.setDescription("⠀");
            this.interCollector.stop();
          } else if (this.buttonList.every((button) => button.data.disabled == true)) {
            this.embed.setTitle(`game over - draw`);
            this.embed.setDescription("⠀");
            this.interCollector.stop();
          } else {
            currentPlayer.id == this.player.first.id ? (currentPlayer = this.player.second) : (currentPlayer = this.player.first);
            cox ? (cox = false) : (cox = true);
            this.embed.setTitle(`It's ${currentPlayer.username}'s turn`);
          }
          await interaction.update({ embeds: [this.embed], components: [this.actionRows.row1, this.actionRows.row2, this.actionRows.row3] });
        } else await interaction.deferUpdate();
      }
    );

    this.interCollector.on("end", (_, reason) => {
      switch (reason) {
        case "time":
        case "idle":
          this.embed.setTitle("time's up");
          break;
        default:
          return;
      }
      this.buttonList.forEach((b) => b.setDisabled(true));
      this.originalMessage.edit({ embeds: [this.embed], components: [this.actionRows.row1, this.actionRows.row2, this.actionRows.row3] }).catch(() => {});
    });

    this.interCollector.on("error", async (error) => {
      await this.originalInteraction.followUp({ embeds: [this.bot.misc.errorEmbed(Tictactoe.commandName, error)] });
    });
  }

  private check(): boolean {
    let po = [
      [this.components.S1x1.data.style, this.components.S1x2.data.style, this.components.S1x3.data.style],
      [this.components.S2x1.data.style, this.components.S2x2.data.style, this.components.S2x3.data.style],
      [this.components.S3x1.data.style, this.components.S3x2.data.style, this.components.S3x3.data.style],
      [this.components.S1x1.data.style, this.components.S2x1.data.style, this.components.S3x1.data.style],
      [this.components.S1x2.data.style, this.components.S2x2.data.style, this.components.S3x2.data.style],
      [this.components.S1x3.data.style, this.components.S2x3.data.style, this.components.S3x3.data.style],
      [this.components.S1x1.data.style, this.components.S2x2.data.style, this.components.S3x3.data.style],
      [this.components.S3x1.data.style, this.components.S2x2.data.style, this.components.S1x3.data.style],
    ];
    for (let ar of po) {
      if (
        ar.every((value) => value == 3) ||
        ar.every((value) => value == 4)
      )
        return true;
    }
  }
}
