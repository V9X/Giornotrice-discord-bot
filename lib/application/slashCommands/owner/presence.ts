import Discord from "discord.js";
import { Bot } from "../../../main";
import util from "node:util";
import CommandT from '../../../commandT';

export default class Presence extends CommandT {
  static commandName = "presence";
  static ver = "1.0.1";
  static owner = true;

  static async applicationConstructor(start?: boolean): Promise<Discord.RESTPostAPIApplicationCommandsJSONBody> {
    let statusChoices = [
      { name: "online", value: "online" },
      { name: "idle", value: "idle" },
      { name: "invisible", value: "invisible" },
      { name: "do not disturb", value: "dnd" },
    ];

    let command = new Discord.SlashCommandBuilder().setName(Presence.commandName).setDescription("Changes bot's status/activity").setDefaultMemberPermissions("0")
        .addStringOption((o) => o.setName("activity").setDescription("type | name | url").setAutocomplete(true))
        .addStringOption((o) => o.setName("status").setDescription("Bot's status").setChoices(...statusChoices)).toJSON();

    return command;
  }
  static async autoComplete(interaction: Discord.AutocompleteInteraction): Promise<void> {
    let input = interaction.options.getString("activity").split(" ");
    if (input.length == 1) {
      await interaction.respond([
        { name: "PLAYING", value: "PLAYING" },
        { name: "STREAMING", value: "STREAMING" },
        { name: "LISTENING", value: "LISTENING" },
        { name: "WATCHING", value: "WATCHING" },
        { name: "CUSTOM", value: "CUSTOM" },
        { name: "COMPETING", value: "COMPETING" },
      ]);
    } else interaction.respond([]);
  }

  static async run(int: Discord.ChatInputCommandInteraction, bot: Bot): Promise<void> {
    if (int.user.id == process.env.ownerId) {
      await new Presence(int, bot).main();
    } else
      int.reply({ embeds: [new Discord.EmbedBuilder().setTitle("no").setDescription("just no")], ephemeral: true });
  }

  constructor(private originalInteraction: Discord.ChatInputCommandInteraction, private bot: Bot) { super() }

  private async main(): Promise<void> {
    let activityRaw = this.originalInteraction.options.getString("activity", false);
    let status = this.originalInteraction.options.getString("status", false) as "online" | "idle" | "invisible" | "dnd";

    let activity
    if (activityRaw) {
      let ars = activityRaw.split("|").map(val => val.trim());
      let type: 0 | 1 | 2 | 3 | 4 | 5;
      switch(ars[0].toLowerCase()) {
        case "playing": type =  Discord.ActivityType.Playing; break;
        case "streaming": type =  Discord.ActivityType.Streaming; break;
        case "listening":type =  Discord.ActivityType.Listening; break;
        case "watching": type =  Discord.ActivityType.Watching; break;
        case "custom": type =  Discord.ActivityType.Custom; break;
        case "competing": type =  Discord.ActivityType.Competing; break;
      }
      activity = {
        name: ars[1],
        type: type,
        url : ars[2],
      }
    }

    let presence = {
      status: status || "online",
      activities: activity ? [activity] : [],
    };
    
    let resp = this.bot.user.setPresence(presence);
    await this.bot.db.bot.replaceData('presence', presence)
    let embed = new Discord.EmbedBuilder()
      .setTitle("presence")
      .setColor(0xffb404)
      .setDescription("```js\n" + util.inspect(resp, false, 2) + "\n\n" + "\n```")
      .setFooter({ text: `status: ${status ? status : "online"}, activity: ${activity ? activity : "none" }` });

    await this.originalInteraction.reply({ embeds: [embed] });
  }
}
