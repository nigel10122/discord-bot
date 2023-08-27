import { OpenAI } from 'openai';
import * as dotenv from 'dotenv';
dotenv.config();

const nigiBot = async (apiToken , user_input) => {

    const openai = new OpenAI({
        apiKey: apiToken // This is also the default, can be omitted
      });
    
      const history = [];
    
      while (true) {
   
    
        const messages = [];
        for (const [input_text, completion_text] of history) {
          messages.push({ role: "user", content: input_text });
          messages.push({ role: "assistant", content: completion_text });
        }
    
        messages.push({ role: "user", content: user_input });
    
        try {
          const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: messages,
          });
    
          const completion_text = completion.choices[0].message.content;
       
          history.push([user_input, completion_text]);

          return completion_text;
    
        } catch (error) {

          const errorMessage = error.response ? {  status : error.response.status, data : error.response.data} : { message : error.message }

          return JSON.stringify(errorMessage);
      
        }
      }
}

export { nigiBot };
  
