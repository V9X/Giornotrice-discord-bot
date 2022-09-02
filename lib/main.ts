import Discord from "discord.js";
import { commandManager } from "./utils/command_manager/commandManager";
import mainUtils from "./utils/misc/misc";
import seq from 'sequelize';
import { musicDB, botDB } from "./utils/misc/db";
import CommandT from "./commandT";

interface database {
  sq: seq.Sequelize,
  music: typeof musicDB,
  bot: typeof botDB,
}

export class Bot extends Discord.Client {
  public commands: { [commandName: string]: typeof CommandT};
  public misc: mainUtils;
  public cm: commandManager;

  constructor(public db: database, presence: Discord.PresenceData) {
    super({
      intents: Object.values(Discord.GatewayIntentBits) as number[],
      presence: presence,
    });
    this.misc = new mainUtils(this);

    process.on("unhandledRejection", (error: Error) => { this.misc.sendWebhookError(error) })
    process.on("uncaughtException", (error: Error) => { this.misc.sendWebhookError(error) })

    this.main();
  }

  private async main() {
    this.commands = await this.misc.importCommands("./lib/application");

    this.on("ready", () => {
      this.cm = new commandManager(this);
      console.log(`Logged as ${this.user.username}`);
      this.cm.deployCommands([this.commands["cmanager"]], [process.env.ownerServerId]);
    });

    this.on("interactionCreate", async (interaction) => {
      if (interaction.type == Discord.InteractionType.ApplicationCommand) {
        for (let command of Object.values(this.commands)) {
          if (interaction.commandName != command.commandName) continue;
          try { await command.run(interaction, this) } 
          catch (error) {
            let errorEmbed = this.misc.userErrorEmbed(command.commandName, error as Error);
            this.misc.sendWebhookError(error as Error, command.commandName, interaction);
            if (interaction.replied){
              try { interaction.fetchReply().then(msg => {msg.reply({ embeds: [errorEmbed] })}) }
              catch { interaction.channel.send({ embeds: [errorEmbed] }).catch(() => {}) }
            } else interaction.reply({ embeds: [errorEmbed] }).catch(() => {});
          }
        }
      } else if (interaction.type == Discord.InteractionType.ApplicationCommandAutocomplete) {
        for (let command of Object.values(this.commands)) {
          if (command.commandName == interaction.commandName) {
            command.autoComplete(interaction).catch((error: Error) => {
              this.misc.sendWebhookError(error, command.commandName, interaction)
            });
          }
        }
      }
    });
  }
}
