import { Bot } from "../../main";

export class commandManager {

  constructor(private bot: Bot) {}
  private comManager = this.bot.application.commands;

  public async deployCommands(commandArray: any[], guildIds?: string[] | undefined) {
    let cstate = await this.bot.db.bot.getData('cstate')

    if (guildIds) {
      for (let guildID of guildIds) {
        for (let command of Object.values(commandArray)) {
          if (!cstate.guilds[guildID]) { cstate.guilds[guildID] = {} }
          cstate.guilds[guildID][command.commandName] = command.ver;
          await this.comManager.create(await command.applicationConstructor(), guildID);
        }
      }
    } else {
      for (let command of Object.values(commandArray)) {
        cstate.global[command.commandName] = command.ver;
        await this.comManager.create(await command.applicationConstructor());
      }
    }
    await this.bot.db.bot.replaceData('cstate', cstate)
  }

  public async removeCommands(name: string[], guildID?: string[] | undefined) {
    let cstate = await this.bot.db.bot.getData('cstate')
    if (guildID) {
      for (let guild of this.bot.guilds.cache.values()) {
        if (guildID.includes(guild.id)) {
          for (let command of (await guild.commands.fetch()).values()) {
            if (name.includes(command.name)) {
              delete cstate.guilds[guild.id][command.name];
              await command.delete();
            }
          }
        }
      }
    } else {
      for (let gcommand of (await this.comManager.fetch()).values()) {
        if (name.includes(gcommand.name)) {
          delete cstate.global[gcommand.name];
          await gcommand.delete();
        }
      }
    }
    await this.bot.db.bot.replaceData('cstate', cstate)
  }

  public async removeAll() {
    let cstate = {
      global: {},
      guilds: {},
    }

    for (let guild of this.bot.guilds.cache.values()) {
      await this.comManager.set([], guild.id).catch(() => {});
    }
    for (let gcommand of (await this.comManager.fetch()).values()) {
      await gcommand.delete().catch(() => {});
    }
    await this.bot.db.bot.replaceData('cstate', cstate)
    await this.deployCommands([this.bot.commands["cmanager"]], [process.env.ownerServerId]);
  }
}
