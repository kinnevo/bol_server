/**
 * AI Summary Service using LangChain
 * Generates personalized philosophical insights for players based on voice transcripts
 */

const { ChatOpenAI } = require('@langchain/openai');
const { PromptTemplate } = require('@langchain/core/prompts');
const { StructuredOutputParser } = require('langchain/output_parsers');
const { z } = require('zod');
const { getTranscriptsByPlayer } = require('./dbClient');
require('dotenv').config();

// Initialize LangChain with GPT-4o-mini
const model = new ChatOpenAI({
  modelName: 'gpt-4o-mini',
  temperature: 0.7,
  openAIApiKey: process.env.OPENAI_API_KEY,
});

// Define the structure of the summary output
const summarySchema = z.object({
  commonTopics: z.array(z.string()).describe('3-5 main themes discussed during the game'),
  emotionalHighlights: z.array(z.string()).describe('2-3 moments of emotional depth or philosophical vulnerability'),
  areasToExplore: z.array(z.string()).describe('2-3 philosophical questions or areas for further reflection'),
  nextSteps: z.array(z.string()).describe('2-3 concrete actions for their personal journey'),
  nextGameSuggestions: z.array(z.string()).describe('1-2 focus areas for the next game session'),
  narrative: z.string().describe('A 100-word narrative summary tying everything together'),
});

const outputParser = StructuredOutputParser.fromZodSchema(summarySchema);

// Prompt template for philosophical analysis
const SUMMARY_PROMPT = `You are a wise, empathetic guide analyzing a player's journey through a philosophical exploration game about personal reinvention and finding what makes you feel truly alive.

The game is called "Book of Life" and focuses on deep, exploratory conversations where players discuss:
- What new experiences or skills would make them feel truly alive again
- Personal transformations and life changes they're considering
- Vulnerabilities, fears, and hopes about their future
- Philosophical questions about meaning, purpose, and fulfillment

You have access to the player's voice chat transcript from the game session. Analyze it deeply to provide personalized insights.

PLAYER INFORMATION:
- Player Name: {playerName}
- Session ID: {sessionId}

VOICE TRANSCRIPT:
{transcriptText}

ANALYSIS INSTRUCTIONS:
1. **Common Topics**: Identify 3-5 recurring themes or subjects the player discussed. What kept coming up? What seemed most important to them?

2. **Emotional Highlights**: Find 2-3 moments where the player showed vulnerability, depth, or genuine emotion. What moved them? What resonated?

3. **Areas to Explore**: Suggest 2-3 philosophical questions or topics for the player to explore further based on what they discussed. Make these thought-provoking and personal.

4. **Next Steps**: Recommend 2-3 concrete, actionable steps the player could take in their life based on their conversations. Be specific and practical.

5. **Next Game Suggestions**: Suggest 1-2 focus areas or questions for their next game session to deepen their exploration.

6. **Narrative**: Write a compelling 100-word summary that ties everything together, reflecting on their journey during this session and what it revealed about their path forward.

TONE: Warm, philosophical, encouraging, insightful. Speak directly to the player using "you/your". Be specific to their actual conversations, not generic.

{format_instructions}

Generate the summary:`;

const promptTemplate = PromptTemplate.fromTemplate(SUMMARY_PROMPT);

/**
 * Generates a fallback summary when no transcripts are available
 * @param {string} playerName - The player's name
 * @returns {Object} Fallback summary object
 */
function generateFallbackSummary(playerName) {
  return {
    commonTopics: [
      'Exploring new possibilities for personal growth',
      'Considering what brings meaning and vitality to life',
      'Reflecting on personal transformation'
    ],
    emotionalHighlights: [
      'Your presence in this game shows openness to self-discovery',
      'Taking time for reflection is a powerful step toward change'
    ],
    areasToExplore: [
      'What would it feel like to prioritize one thing that truly excites you?',
      'What small experiment could you try this week to feel more alive?'
    ],
    nextSteps: [
      'Identify one activity or skill that sparks curiosity and research it',
      'Have a conversation with someone about what brings them joy'
    ],
    nextGameSuggestions: [
      'Focus on using voice chat to share your thoughts more deeply',
      'Explore a specific area of your life you want to transform'
    ],
    narrative: `${playerName}, your journey is just beginning. While we didn't capture your voice during this session, your willingness to explore these questions matters. Consider what truly makes you feel alive. In your next session, try engaging more through voice chat to unlock deeper insights. The path to reinvention starts with honest conversation—with others and with yourself. Your next chapter awaits.`
  };
}

/**
 * Generates a fallback summary when AI generation fails
 * @param {string} playerName - The player's name
 * @returns {Object} Fallback summary object
 */
function generateErrorFallbackSummary(playerName) {
  return {
    commonTopics: [
      'Personal growth and transformation',
      'Finding what brings vitality and meaning',
      'Exploring new possibilities'
    ],
    emotionalHighlights: [
      'Your engagement with deep questions shows courage',
      'Every conversation is a step toward greater self-awareness'
    ],
    areasToExplore: [
      'What patterns in your life are you ready to change?',
      'What would feeling "truly alive" mean for you specifically?'
    ],
    nextSteps: [
      'Journal about one thing that emerged during the game',
      'Take one small action toward a change you discussed'
    ],
    nextGameSuggestions: [
      'Come with a specific question you want to explore',
      'Share more openly about your vulnerabilities and hopes'
    ],
    narrative: `${playerName}, thank you for engaging with these profound questions. While we encountered a technical issue generating your personalized insights, know that the work you're doing—asking hard questions, considering new possibilities—is valuable. Reflect on what came up for you during the game. What surprised you? What resonated? Carry those insights forward. Your journey of reinvention continues.`
  };
}

/**
 * Generates an AI summary for a single player
 * @param {string} sessionId - The game session ID
 * @param {string} playerId - The player's UUID
 * @param {string} playerName - The player's name
 * @returns {Promise<Object>} Summary object with structured insights
 */
async function generatePlayerSummary(sessionId, playerId, playerName) {
  console.log(`[AI Summary] Generating summary for player: ${playerName} (${playerId})`);

  try {
    // Fetch player's transcripts from database
    const transcripts = await getTranscriptsByPlayer(sessionId, playerId);

    // If no transcripts, return fallback
    if (!transcripts || transcripts.length === 0) {
      console.log(`[AI Summary] No transcripts found for ${playerName}, using fallback summary`);
      return generateFallbackSummary(playerName);
    }

    // Combine all transcript segments into a single text
    const transcriptText = transcripts
      .map(t => `[${new Date(t.timestamp).toLocaleTimeString()}] ${t.transcript_text}`)
      .join('\n');

    console.log(`[AI Summary] Processing ${transcripts.length} transcript segments for ${playerName}`);

    // Generate the prompt with formatting instructions
    const formatInstructions = outputParser.getFormatInstructions();
    const prompt = await promptTemplate.format({
      playerName,
      sessionId,
      transcriptText,
      format_instructions: formatInstructions,
    });

    // Call LangChain with 30-second timeout
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('AI generation timeout')), 30000)
    );

    const generationPromise = model.invoke(prompt);

    const response = await Promise.race([generationPromise, timeoutPromise]);

    // Parse the structured output
    const summary = await outputParser.parse(response.content);

    console.log(`[AI Summary] Successfully generated summary for ${playerName}`);
    return summary;
  } catch (error) {
    console.error(`[AI Summary] Error generating summary for ${playerName}:`, error.message);
    console.error('[AI Summary] Error stack:', error.stack);

    // Return fallback summary on error
    return generateErrorFallbackSummary(playerName);
  }
}

/**
 * Generates summaries for all players in parallel
 * @param {string} sessionId - The game session ID
 * @param {Array<Object>} players - Array of player objects with id and name
 * @returns {Promise<Object>} Map of playerId to summary object
 */
async function generateAllPlayerSummaries(sessionId, players) {
  console.log(`[AI Summary] Generating summaries for ${players.length} players in session: ${sessionId}`);

  try {
    // Generate all summaries in parallel
    const summaryPromises = players.map(player =>
      generatePlayerSummary(sessionId, player.id, player.name)
        .then(summary => ({ playerId: player.id, summary }))
    );

    const results = await Promise.all(summaryPromises);

    // Convert array to map
    const summariesMap = {};
    results.forEach(({ playerId, summary }) => {
      summariesMap[playerId] = summary;
    });

    console.log(`[AI Summary] Successfully generated ${Object.keys(summariesMap).length} summaries`);
    return summariesMap;
  } catch (error) {
    console.error('[AI Summary] Error generating player summaries:', error);
    throw error;
  }
}

module.exports = {
  generatePlayerSummary,
  generateAllPlayerSummaries,
  generateFallbackSummary,
  generateErrorFallbackSummary,
};
