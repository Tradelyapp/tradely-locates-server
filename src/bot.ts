import TelegramBot, { Message } from 'node-telegram-bot-api';
import got from 'got';
import { logMessage } from './log.js';

// Replace 'YOUR_API_TOKEN' with your Telegram bot's API token
const bot = new TelegramBot('YOUR_API_TOKEN', { polling: true });

// Define the URL of your Express server
const expressServerUrl = 'http://localhost:3000';

bot.onText(/\/b (.+) (\d+)/, (msg: Message, match: RegExpExecArray | null) => {
    if (match === null) return;

    const stockName = match[1];
    const numShares = parseInt(match[2]);

    // Execute your desired Node.js script using child process or perform any other actions here

    const response = `Executing script for stock '${stockName}' with ${numShares} shares`;
    bot.sendMessage(msg.chat.id, response);
});

bot.on('message', (msg) => {
    const chatId = msg.chat.id;

    console.log(`Command executed by user ${msg?.from?.username}: ${msg.text}`);

    logMessage(msg.text);

    if (msg.text === '/server') {
        console.log('MADAFAKA');
        // Send a request to the Express server
        got
            .get(`${expressServerUrl}/`)
            .then((response) => {
                bot.sendMessage(chatId, 'Request sent to the server');
            })
            .catch((error) => {
                console.error('Error sending request to server:', error);
                bot.sendMessage(chatId, 'An error occurred while sending the request');
            });
    } else {
        // Send the initial message with the buttons
        const replyMarkup = {
            inline_keyboard: [
                [{ text: 'BUY', callback_data: 'buy' }],
                [{ text: 'CANCEL', callback_data: 'cancel' }],
            ],
        };

        // Send the initial message with the buttons
        bot
            .sendMessage(chatId, 'Please choose an option:', { reply_markup: replyMarkup })
            .then((sentMessage) => {
                const messageId = sentMessage.message_id;

                // Start the timer
                const timerDuration = 5000; // Timer duration in milliseconds (5 seconds)
                setTimeout(() => {
                    const editedReplyMarkup = { inline_keyboard: [] };

                    // Edit the message reply markup
                    const editOptions = {
                        chat_id: chatId,
                        message_id: messageId,
                    };

                    bot.editMessageReplyMarkup(editedReplyMarkup, editOptions);
                }, timerDuration);
            });
    }
});
