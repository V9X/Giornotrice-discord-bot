import { Bot } from "../../main";
import Discord from "discord.js";
import fs from 'fs'
import CommandT from "../../commandT";

export default class misc {
  static char = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  constructor(private bot: Bot) {}

  public errorEmbed = (commandName: string, error: any) => {
    return new Discord.EmbedBuilder({
      title: `Error was encountered while running "${commandName}" command:`,
      description: error.toString(),
    });
  };
  public generateID(length: number) {
    let id = "";
    for (let i = 0; i < length; i++) {
      id += misc.char.charAt(Math.floor(Math.random() * misc.char.length));
    }
    return id;
  }
  public isPositiveInt(str: string){
    let n = Math.floor(Number(str));
    return n !== Infinity && String(n) === str && n >= 0;
  }

  public async importCommands(path: string){
    let commands: { [commandName: string]: typeof CommandT } = {}

    for (let p of this.getPaths(path)){
      if(!p) continue
      let Command = Object.values(await import('../.' + p))[0] as typeof CommandT
      await Command.applicationConstructor(true)
      commands[Command.commandName] = Command
    }
    return commands
}
private getPaths(startpath: string): string[]{
  return fs.readdirSync(startpath).map((value) => {
    if (value.endsWith(".ts")){
        return (startpath + "/" + value).replace(".ts", "").replace("/lib", "")
      } else if (!value.includes(".")){
        return this.getPaths(startpath + "/" + value)
      }
    }).flat()
  }
}
