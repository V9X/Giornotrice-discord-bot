import Discord from 'discord.js'
import { Bot } from './main';

export default class Command {
  static commandName: string
  static ver: string;
  static owner?: boolean

  static async applicationConstructor(start?: boolean): Promise<Discord.RESTPostAPIApplicationCommandsJSONBody> {
    throw(`Application constructor not implemented in ${this.commandName}`)
  }

  static async run(int: Discord.ChatInputCommandInteraction | Discord.MessageContextMenuCommandInteraction | Discord.UserContextMenuCommandInteraction, bot: Bot): Promise<void> {
    throw(`Run not implemented in ${this.commandName}`)
  }

  static async autoComplete(interaction: Discord.AutocompleteInteraction): Promise<void> {
    throw(`Auto complete not implemented in ${this.commandName}`)
  }
}

