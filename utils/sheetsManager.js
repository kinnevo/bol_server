/**
 * Google Sheets Manager
 * Handles reading questions from Google Sheets for game inflection points
 */

require('dotenv').config();
const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const SERVICE_ACCOUNT_PRIVATE_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

// In-memory cache for questions
let questionsCache = null;
let lastCacheUpdate = null;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Initializes and returns a Google Sheets API client
 * @returns {Promise<Object>} Authenticated Google Sheets API client
 */
async function initializeSheetsClient() {
  if (!SERVICE_ACCOUNT_EMAIL || !SERVICE_ACCOUNT_PRIVATE_KEY) {
    throw new Error('Google Sheets service account credentials are not configured in environment variables');
  }

  if (!SPREADSHEET_ID) {
    throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID is not configured in environment variables');
  }

  try {
    // Create auth client with service account credentials
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: SERVICE_ACCOUNT_EMAIL,
        private_key: SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'), // Handle escaped newlines
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    console.log('[Sheets] Successfully initialized Google Sheets API client');
    return sheets;
  } catch (error) {
    console.error('[Sheets] Error initializing client:', error);
    throw error;
  }
}

/**
 * Fetches all questions from the Google Sheet
 * @param {string} sheetName - The name of the sheet tab to read from (default: 'Sheet1')
 * @param {string} range - The range to read (default: 'A:Z' - all columns)
 * @returns {Promise<Array>} Array of question objects
 */
async function fetchQuestions(sheetName = 'Sheet1', range = 'A:Z') {
  try {
    const sheets = await initializeSheetsClient();
    const fullRange = `${sheetName}!${range}`;

    console.log(`[Sheets] Fetching questions from range: ${fullRange}`);

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: fullRange,
    });

    const rows = response.data.values;

    if (!rows || rows.length === 0) {
      console.log('[Sheets] No data found in spreadsheet');
      return [];
    }

    // Assume first row contains headers
    const headers = rows[0];
    const questions = [];

    // Process remaining rows
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const questionObj = {};

      // Map each cell to its header
      headers.forEach((header, index) => {
        questionObj[header] = row[index] || '';
      });

      // Only add non-empty rows
      if (Object.values(questionObj).some(val => val.trim() !== '')) {
        questions.push(questionObj);
      }
    }

    console.log(`[Sheets] Successfully fetched ${questions.length} questions`);
    return questions;
  } catch (error) {
    console.error('[Sheets] Error fetching questions:', error);
    throw error;
  }
}

/**
 * Gets questions with caching to avoid excessive API calls
 * Cache is refreshed every 5 minutes to ensure latest questions are available
 * @param {string} sheetName - The name of the sheet tab to read from
 * @param {string} range - The range to read
 * @param {boolean} forceRefresh - Force refresh the cache
 * @returns {Promise<Array>} Array of question objects
 */
async function getQuestionsWithCache(sheetName = 'Sheet1', range = 'A:Z', forceRefresh = false) {
  const now = Date.now();

  // Check if cache is valid
  const cacheIsValid = questionsCache !== null &&
                       lastCacheUpdate !== null &&
                       (now - lastCacheUpdate) < CACHE_DURATION_MS;

  if (cacheIsValid && !forceRefresh) {
    console.log('[Sheets] Returning cached questions');
    return questionsCache;
  }

  // Fetch fresh data
  console.log('[Sheets] Cache expired or force refresh, fetching new data');
  questionsCache = await fetchQuestions(sheetName, range);
  lastCacheUpdate = now;

  return questionsCache;
}

/**
 * Gets questions for a specific game session
 * This function can be extended to track which questions have been used
 * to ensure no repeats within a game session
 *
 * @param {string} gameSessionId - The game session ID
 * @param {Array} usedQuestionIds - Array of question IDs already used in this session
 * @param {number} count - Number of questions to return (default: all available)
 * @returns {Promise<Array>} Array of unused question objects
 */
async function getQuestionsForGame(gameSessionId, usedQuestionIds = [], count = null) {
  try {
    const allQuestions = await getQuestionsWithCache();

    // Filter out questions that have already been used in this game session
    const availableQuestions = allQuestions.filter((question, index) => {
      // Use index as a simple ID if no ID field exists
      const questionId = question.id || question.ID || index;
      return !usedQuestionIds.includes(questionId);
    });

    console.log(`[Sheets] Game ${gameSessionId}: ${availableQuestions.length} questions available (${usedQuestionIds.length} already used)`);

    // Return requested count or all available
    if (count && count > 0) {
      return availableQuestions.slice(0, count);
    }

    return availableQuestions;
  } catch (error) {
    console.error('[Sheets] Error getting questions for game:', error);
    throw error;
  }
}

/**
 * Clears the questions cache
 * Useful for testing or forcing an immediate refresh
 */
function clearCache() {
  questionsCache = null;
  lastCacheUpdate = null;
  console.log('[Sheets] Cache cleared');
}

/**
 * Gets cache status information
 * @returns {Object} Cache status information
 */
function getCacheStatus() {
  return {
    isCached: questionsCache !== null,
    questionCount: questionsCache ? questionsCache.length : 0,
    lastUpdate: lastCacheUpdate,
    cacheAge: lastCacheUpdate ? Date.now() - lastCacheUpdate : null,
    cacheAgeMinutes: lastCacheUpdate ? Math.floor((Date.now() - lastCacheUpdate) / 60000) : null,
  };
}

module.exports = {
  initializeSheetsClient,
  fetchQuestions,
  getQuestionsWithCache,
  getQuestionsForGame,
  clearCache,
  getCacheStatus,
};
