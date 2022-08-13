import { Bot } from "./lib/main";
import events from "events";
import { botDB, musicDB } from './lib/utils/misc/db'
import seq from "sequelize";

events.captureRejections = true
require('dotenv').config()

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

