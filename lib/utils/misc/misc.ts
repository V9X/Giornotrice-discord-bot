import { Bot } from "../../main";
import Discord from "discord.js";
import fs from 'fs'
import CommandT from "../../commandT";

export default class misc {
  static char = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  private webhookClient: Discord.WebhookClient
  constructor(private bot: Bot) {
    this.webhookClient = new Discord.WebhookClient({url: process.env.errorWebhook});
  }

  public async sendWebhookError(error: Error, commandName: string = undefined, int: Discord.Interaction = undefined){
    try {
      let embed = new Discord.EmbedBuilder({
        title: `${commandName || 'unknown'} error occured.`,
        description: 
          `**User:** ${int ? int.user.tag + " | " + int.user.id : 'unknown'}\n
          **Guild:** ${int?.guild ? int.guild.name + " | " + int.guild.id : 'unknown'}\n\n
          **Name:** \`\`\`${error.name || error}\`\`\` 
          **Message**: \`\`\`${error.message || 'unknown'}\`\`\` 
          **Stack:** \`\`\`${error.stack || 'unknown'}\`\`\``
      });

      await this.webhookClient.send({
        username: `${this.bot.user?.username} error webhook`,
        avatarURL: this.bot.user?.avatarURL(),
        embeds: [embed],
      });
    } catch {
      console.log(error, commandName, int);
    }
  }

  public userErrorEmbed = (commandName: string | undefined, error: Error) => {
    return new Discord.EmbedBuilder({
      title: `Error was encountered while running "${commandName}" command`,
      description: error.name ? `**Name:** \`${error.name} \n**message: \`${error.message}\`` : `**name:** \`${error}\``,
    })
  }

  public collectorErrorHandler(commandName: string, message: Discord.Message, interCollector: Discord.InteractionCollector<any> | Discord.MessageCollector, interaction: Discord.Interaction){
    //@ts-ignore
    interCollector.on('error', async (e: Error) => {
      this.sendWebhookError(e, commandName, interaction);
      try {
        await message.reply({ embeds: [this.userErrorEmbed(commandName, e)] });
      } catch {
        message.channel.send({ embeds: [this.userErrorEmbed(commandName, e)] }).catch(() => {});
      }
    });
  }

  public generateID(length: number): string {
    let id = "";
    for (let i = 0; i < length; i++) {
      id += misc.char.charAt(Math.floor(Math.random() * misc.char.length));
    }
    return id;
  }

  public isPositiveInt(str: string): boolean {
    let n = Math.floor(Number(str));
    return n !== Infinity && String(n) === str && n >= 0;
  }

  public async importCommands(path: string): Promise<{[commandName: string]: typeof CommandT}> {
    let commands: { [commandName: string]: typeof CommandT } = {}

    for (let p of this.getPaths(path)){
      if(!p) continue;
      let Command = Object.values(await import('../.' + p))[0] as typeof CommandT;
      await Command.applicationConstructor(true);
      commands[Command.commandName] = Command;
    }
    return commands;
}
private getPaths(startpath: string): string[]{
  return fs.readdirSync(startpath).map((value) => {
    if (value.endsWith(".ts")){
        return (startpath + "/" + value).replace(".ts", "").replace("/lib", "");
      } else if (!value.includes(".")){
        return this.getPaths(startpath + "/" + value);
      }
    }).flat();
  }
}
