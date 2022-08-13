# Giornotrice Discord bot

Giornotrice is a small bot created mainly to run on a few servers, there are not many commands but some of them are really big like music player or wordle, so if by some miracle you found yourself here feel free to add a bot to your server or host it yourself.
(New commands requests welcome).

**[Bot invite link](https://discord.com/api/oauth2/authorize?client_id=752285078436184064&permissions=2147483656&scope=bot%20applications.commands)**

## Commands

#### Message commands

- getsauce - Gets image from message and reverse searches it using [saucenao](https://saucenao.com/).

#### Slash commands

- owner commands:
  - cmanager - Manage commands across bot's servers.
  - eval - Evaluate expressions.
  - presence - Change bot's presence.
- public commands:
  - choose - Let the bot choose from provided options.
  - e621 - (nsfw) Search for images on e621.net
  - gelbooru (nsfw) Search for images on gelbooru.com
  - music - Music player with queue and history support.
  - ping - Check bot's ping
  - tictactoe - Tictactoe game made from buttons.
  - wordle - Discord version of popular wordle.
- commands for administartors:
  - delete - Bulk delete messages that match provided requirements.

## How to run it?

#### instruction

- Make sure you have:
  - A working computer.
  - Nodejs installed (at least v16.16.0)
- How to set it up?
  - Download repository.
  - Create ".env" file (example below).
  - Open command line and run:
    - `npm install`
    - `npm run startWin` or if you are on linux `npm run startLin`.

Congratulations! The bot is working! ...It is not? Then you did something wrong.
 
#### .env example

```
token= 'token'
ownerId= 'id'
ownerServerId= 'id'
errorWebhook= 'url'
sauceNaoApiKey= 'apiKey' (optional)
e621api= 'username apiKey' (optional)
```
1. Discord bot token.
2. ID of the user who should be able to use owner commands.
3. ID of the server in which the command manager should be added.
4. Discord webhook to which all errors will be sent.
5. Api key for saucenao command [generate here](https://saucenao.com/user.php?page=search-api)
6. login info for e621 command [more info here](https://e621.net/help/api)