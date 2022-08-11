import { Bot } from "./lib/main";
import events from "events";
import discord from "discord.js"
import { botDB, musicDB } from './lib/utils/misc/db'
import seq from "sequelize";

events.captureRejections = true
require('dotenv').config()

const webhookClient = new discord.WebhookClient({url: process.env.errorWebhook})
const errorEmbed  = (description: string) => {return new discord.EmbedBuilder().setDescription(`\`\`\`ts\n${description}\`\`\``)}

process.on("unhandledRejection", error => {webhookClient.send({
    username: `${process.env.botName} error webhook`,
    embeds: [errorEmbed(String(error))]
})})
process.on("uncaughtException", error => {webhookClient.send({
    username: `${process.env.botName} error webhook`,
    embeds: [errorEmbed(String(error))]
})})

async function prepareDatabase() {
  const sq =  new seq.Sequelize({
    dialect: 'sqlite',
    storage: './lib/files/db.sqlite3',
    logging: false,
  })

  await sq.authenticate()

  musicDB.prep(sq)
  botDB.prep(sq)

  await sq.sync()

  return {
    sq: sq,
    music: musicDB,
    bot: botDB,
  }
}

prepareDatabase()
  .then(async (db) => {
    let presence = await db.bot.getData('presence')
    let bot = new Bot(db, presence)
    bot.login(process.env.token)
  })
  .catch((error) => {
    console.log(error);
  })

