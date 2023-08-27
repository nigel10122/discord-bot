import {Client, IntentsBitField } from "discord.js";

import * as dotenv from 'dotenv';
import { nigiBot } from "./nigi-bot.js";
dotenv.config();

const nigiClient = new Client({
    intents : [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMembers,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.MessageContent,
    ]
});

nigiClient.login(process.env.DISCORD_TOKEN);

nigiClient.on('ready', (e) => {
    console.log(`${e.user.tag} IS ONLINE!`);
});

nigiClient.on('messageCreate', async (message) => {

        if (!message.author.bot &&  includesKeyword(message)){
            message.reply(await nigiBot(process.env.OPEN_AI_TOKEN, message.content));
        }
     
});


const includesKeyword = async (message) => {


    const keyWords = ['hey pranit', 'eeh smiith', 'buddy', 'hoohoo', 'yaar'];

    let includesKeyWord = true;

    for(const keyword of keyWords){
        if(!message.content.includes(keyword)){
                includesKeyWord = false;
        }   
    }

    return includesKeyWord;
}

