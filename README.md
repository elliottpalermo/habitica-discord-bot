# habitica-discord-bot

This bot will provide integration between your Discord channel  Habitica.


Current implemented features include:
 - The ability for users to register and unregister with the bot. The user information is stored in a local database.
 - The ability for users to send messages to their Habitica party chat.
 
Planned features:
 - Synchronized chat between Habitica and your discord channel (bi-directional message support)
 - Quest updates posted in your discord channel.
 - Ability to add todo items
 - Basically anything the Habitica API allows you to do :)
 
 # instructions for use
 
 Still heavily in development... but it works. If you want to run it you need nodejs. 

You also need your own Discord Bot set up in the Discord API. You can do that here: https://discordapp.com/developers/applications/

Also make sure you've invited your bot to your channel.

1. Clone the repo.
2. Run 'npm install'
3. Update the 'discord_auth.json' file with your bots Token (you can get it from the Bot section of your Discord application)
4. Run 'node bot.js'

That should be it. Try messaging the bot !help or !register.