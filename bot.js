const Discord = require('discord.io');
const logger = require('winston');
const discordAuth = require('./discord_auth.json');
const habitica = require('habitica');
const _ = require('lodash');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const adapter = new FileSync('db.json');
const db = low(adapter);


// Initialize Discord Bot
let bot = new Discord.Client({
    token: discordAuth.token,
    autorun: true
});

//Set up the Habitica API.
var api = new habitica({
    platform: 'Habitica-Discord-Bot', // defaults to Habitica-Node
});

//Initialize the DB
db.defaults({ users:[] })
    .write();

// Configure logger settings
logger.remove(logger.transports.Console);
logger.add(new logger.transports.Console, {
    colorize: true
});
logger.level = 'debug';


/**
 * Look up a user by their Discord userID.
 * @param discordUserId The users discord userID.
 * @returns {*} The
 */
function getUserByDiscordId(discordUserId){
    return db.get('users')
        .find({discordUserId})
        .value();
}


/**
 * Sends a PM to a user.
 * @param userId The Discord userId to send the message to.
 * @param message The message to send.
 * @returns {Promise<*>} A promise that will resolve with the message that was sent, or reject with any errors.
 */
function sendPMToUser( userId, message ){
    logger.debug(`Sending message to ${userId} -> ${message}`);
    return new Promise((resolve, reject) => {
        bot.sendMessage(
            {
                to: userId,
                message: message
            },
            (err) => {
                if( err ){
                    logger.error('Error sending message to user.', {error: err});
                    reject(err);
                }else{
                    resolve(message);
                }
            }
        );
    });
}

/**
 * Notifies the user of an unexpected error. Use this as the final error trap when processing user requests.
 * @param discordUserId
 */
function notifyUserOfError( discordUserId ){
    sendPMToUser(discordUserId,'Whoops... something went wrong. You can try again. If this keeps happening please notify my owner.')
        .catch(_.noop);
}


/**
 * Register a new user with the Bot.
 * @param discordUserId
 * @param discordUserName
 * @param args
 */
function handleRegisterRequestFromDiscord( discordUserId, discordUserName, args){
    let existingUser = getUserByDiscordId(discordUserId);
    logger.debug(`Got a request to register user ${discordUserId}`);

    if( !!existingUser ){
        logger.debug(`User was already registered.`);
        sendPMToUser(discordUserId, 'Whoops. It seems you\'ve already been registered! ' +
            'You can unregister using the !unregister command.')
            .catch(_.noop);
        return;
    }

    if( args.length < 2 ){
        logger.debug(`User used wrong syntax.`);
        sendPMToUser(discordUserId, 'Hello :) To register, send me a message like this: ')
            .then(_.partial(sendPMToUser, discordUserId, '!register USERID APIKEY'))
            .then(_.partial(sendPMToUser, discordUserId, 'Swap in your own  USERID and APIKEY. You can find them here: https://habitica.com/user/settings/api'))
            .catch(_.noop);
    }else{
        try{
            let newUser = {discordUserId, discordUserName, habiticaUserId: args[0], habiticaApiKey: args[1]};
            db.get('users')
                .push(newUser)
                .write();
            logger.info('Registered new user', {newUser} );
            sendPMToUser(discordUserId, 'Huzzah! You\'ve been registered. You can ask me for !help any time.' )
                .catch(_.noop);
        }catch(e){
            notifyUserOfError(discordUserId);
            logger.error('There was an error adding the user into the database', {error: e});
        }

    }
}

/**
 * Unregisters a users account with the bot.
 * @param discordUserId The user's discord userId.
 */
function handleUnregisterRequestFromDiscord(discordUserId){
    let existingUser =  getUserByDiscordId(discordUserId);
    logger.debug(`Got a request to unregister user ${discordUserId}`);

    if( !!existingUser){
        try{
            db.get('users')
                .remove({discordUserId})
                .write();

            sendPMToUser(discordUserId,'Success. You\'re unregistered. I\'ll miss you.')
                .catch(_.noop);

            logger.info(`Unregistered user ${discordUserId}`);
        }catch(e){
            logger.error('There was an error removing the user from the database', {error: e});
            notifyUserOfError(discordUserId);
        }

    }else{
        logger.debug(`User wasn't registered`);
        sendPMToUser(discordUserId, 'Whoops. You\'ve already been unregistered. Or maybe you never were registered in the first place?');
    }
}

/**
 * Sends a message to the user's Party chat on behalf of that user.
 * @param discordUserId The users discord id.
 * @param message The message to send
 * @returns {Promise<T>} A promise that will resolve if the message was sent successfully, otherwise reject.
 */
function sendHabiticaMessageOnBehalfOfUser( discordUserId, message){
    let user = getUserByDiscordId(discordUserId);
    if( !user ){
        return Promise.reject(new Error('Attempted to send a message on behalf of a non-existent user.'));
    }
    logger.debug(`Sending message on behalf of discord user ${discordUserId}`);
    api.setOptions({id: user.habiticaUser, apiToken: user.habiticaApiKey });
    return api.post('/groups/party/chat', { message: message})
        .then((result) => {
            //Nothing to see here?
            return undefined;
        })
        .catch((err) => {
            logger.error('There was a problem sending the message to Habitica chat.', {error: err});
            throw err;
        });
}


/**
 *
 * @param discordUserName
 * @param discordUserId
 * @param channelId The channel that the !message command was detected in.
 * @param messageWords An array of the words that were included after the !message command.
 */
function handleMessageRequestFromDiscord(discordUserName, discordUserId, channelId, messageWords){
    logger.debug(`Received a message request from Discord user ${discordUserName}`);
    let user = getUserByDiscordId(discordUserId);

    if( !user ) {
        logger.debug('User was not registered.');
        sendPMToUser( discordUserId,'You need to register first in order to !messageParty. Reply with !register to get started.')
            .catch(_.noop);
    }
    else if( _.isEmpty(messageWords) ){
        logger.debug('User did not include a message.');
        sendPMToUser(discordUserId, 'Whoops. It looks like you forgot to include your message so I couldn\'t send anything for you.')
            .catch(_.noop);
    }else{
        let messageToSend = _.join(messageWords, ' ');
        sendHabiticaMessageOnBehalfOfUser(discordUserId, messageToSend)
            .catch(_.partial(notifyUserOfError, discordUserId));
    }
}



// Kick things off by adding event listeners to the bot.
bot.on('ready', function (evt) {
    logger.info('Connected');
    logger.info('Logged in as: ');
    logger.info(bot.username + ' - (' + bot.id + ')');
});

bot.on('message', function (discordUserName, discordUserId, channelId, message, evt) {
    if (message.substring(0, 1) === '!') {
        let args = message.substring(1).split(' ');
        let cmd = args[0]; //Pull the "command" word off the message (the word with the ! at the beginning)
        args = args.splice(1); //Splice the "command" word off so we're left with the rest of the words of the message
        switch (cmd) {
            // !ping
            case 'ping':
                bot.sendMessage({ to: channelId, message: 'Pong!'});
                break;
            case 'messageParty':
                handleMessageRequestFromDiscord(discordUserName, discordUserId, channelId, args);
                break;
            case 'register':
                handleRegisterRequestFromDiscord(discordUserId, discordUserName, args);
                break;
            case 'unregister':
                handleUnregisterRequestFromDiscord(discordUserId);
                break;
            case 'test':
                sendPMToUser(discordUserId, 'Hello there!')
                    .catch(_.noop);
                break;
            case 'help':
                sendPMToUser(discordUserId, 'Here\'s the commands I know currently: !register !unregister !help !ping !test !messageParty')
                    .catch(_.noop);
                break;
        }
    }
});
