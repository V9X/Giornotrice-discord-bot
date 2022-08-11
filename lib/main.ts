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
    this.main();
  }

  private async main() {
    this.commands = await this.misc.importCommands("./lib/application");

    this.on("ready", async () => {
      this.cm = new commandManager(this);
      console.log(`Logged as ${this.user.username}`);
      await this.cm.deployCommands([this.commands["cmanager"]], [process.env.ownerServerId]);
    });

    this.on("interactionCreate", async (interaction) => {
      if (interaction.type == Discord.InteractionType.ApplicationCommand) {
        for (let command of Object.values(this.commands)) {
          try {
            if (interaction.commandName == command.commandName) {
              command.run(interaction, this);
            }
          } catch (e) {
            interaction.replied
              ? interaction.deferred
                ? interaction.editReply({ embeds: [this.misc.errorEmbed(command.commandName, e)] })
                : interaction.followUp({ embeds: [this.misc.errorEmbed(command.commandName, e)] })
              : interaction.reply({ embeds: [this.misc.errorEmbed(command.commandName, e)] });
          }
        }
      } else if (interaction.type == Discord.InteractionType.ApplicationCommandAutocomplete) {
        for (let command of Object.values(this.commands)) {
          if (command.commandName == interaction.commandName) {
            command.autoComplete(interaction).catch(() => {});
          }
        }
      }
    });
  }
}
