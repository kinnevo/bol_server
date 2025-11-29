/**
 * Authentication Controller
 * Handles user registration, login, and session management
 */

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('./dbClient');
const { getRedisClient } = require('./redisClient');

const SALT_ROUNDS = 10;
const SESSION_TTL = parseInt(process.env.REDIS_SESSION_TTL) || 3600; // 1 hour default

/**
 * Create a new user
 * @param {string} email - User email
 * @param {string} password - Plain text password
 * @param {string} displayName - Optional display name
 * @returns {Promise<Object>} Created user (without password hash)
 */
async function registerUser(email, password, displayName = null) {
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        throw new Error('Invalid email format');
    }

    // Validate password strength
    if (password.length < 6) {
        throw new Error('Password must be at least 6 characters long');
    }

    try {
        // Check if user already exists
        const existingUser = await getUserByEmail(email);
        if (existingUser) {
            throw new Error('User with this email already exists');
        }

        // Set display name to email prefix if not provided
        const finalDisplayName = displayName || email.split('@')[0];

        // Check if display name is already taken
        const existingDisplayName = await getUserByDisplayName(finalDisplayName);
        if (existingDisplayName) {
            throw new Error('This display name is already taken. Please choose a different one.');
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

        // Insert user into database
        const query = `
      INSERT INTO users (email, password_hash, display_name)
      VALUES ($1, $2, $3)
      RETURNING id, email, display_name, created_at
    `;

        const result = await pool.query(query, [email.toLowerCase(), passwordHash, finalDisplayName]);
        const user = result.rows[0];

        console.log(`[Auth] User registered: ${user.email} (${user.id})`);
        return user;
    } catch (error) {
        console.error('[Auth] Registration error:', error);
        throw error;
    }
}

/**
 * Authenticate user and create session
 * @param {string} email - User email
 * @param {string} password - Plain text password
 * @param {string} windowSessionId - Browser window session ID
 * @returns {Promise<Object>} Session data with token and user info
 */
async function loginUser(email, password, windowSessionId) {
    try {
        // Get user by email
        const user = await getUserByEmail(email);
        if (!user) {
            throw new Error('Invalid email or password');
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            throw new Error('Invalid email or password');
        }

        // Create session token
        const sessionToken = uuidv4();

        // Store session in Redis
        const redis = getRedisClient();
        const sessionKey = `session:${sessionToken}`;
        const sessionData = {
            userId: user.id,
            email: user.email,
            displayName: user.display_name,
            windowSessionId: windowSessionId,
            createdAt: Date.now(),
        };

        await redis.set(sessionKey, JSON.stringify(sessionData));
        await redis.expire(sessionKey, SESSION_TTL);

        // Also create a mapping from windowSessionId to sessionToken
        await redis.set(`windowSession:${windowSessionId}`, sessionToken);
        await redis.expire(`windowSession:${windowSessionId}`, SESSION_TTL);

        console.log(`[Auth] User logged in: ${user.email} (${user.id})`);

        return {
            sessionToken,
            user: {
                id: user.id,
                email: user.email,
                displayName: user.display_name,
            },
        };
    } catch (error) {
        console.error('[Auth] Login error:', error);
        throw error;
    }
}

/**
 * Validate session token
 * @param {string} sessionToken - Session token
 * @returns {Promise<Object|null>} Session data or null if invalid
 */
async function validateSession(sessionToken) {
    if (!sessionToken) {
        return null;
    }

    try {
        const redis = getRedisClient();
        const sessionKey = `session:${sessionToken}`;
        const sessionData = await redis.get(sessionKey);

        if (!sessionData) {
            return null;
        }

        const session = JSON.parse(sessionData);

        // Refresh session TTL on validation
        await redis.expire(sessionKey, SESSION_TTL);

        return session;
    } catch (error) {
        console.error('[Auth] Session validation error:', error);
        return null;
    }
}

/**
 * Get session from windowSessionId
 * @param {string} windowSessionId - Browser window session ID
 * @returns {Promise<Object|null>} Session data or null if not found
 */
async function getSessionByWindowId(windowSessionId) {
    if (!windowSessionId) {
        return null;
    }

    try {
        const redis = getRedisClient();
        const sessionToken = await redis.get(`windowSession:${windowSessionId}`);

        if (!sessionToken) {
            return null;
        }

        return await validateSession(sessionToken);
    } catch (error) {
        console.error('[Auth] Error getting session by window ID:', error);
        return null;
    }
}

/**
 * Logout user and clear session
 * @param {string} sessionToken - Session token
 */
async function logoutUser(sessionToken) {
    if (!sessionToken) {
        return;
    }

    try {
        const redis = getRedisClient();
        const sessionKey = `session:${sessionToken}`;

        // Get session data to clear windowSession mapping
        const sessionData = await redis.get(sessionKey);
        if (sessionData) {
            const session = JSON.parse(sessionData);
            if (session.windowSessionId) {
                await redis.del(`windowSession:${session.windowSessionId}`);
            }
        }

        // Delete session
        await redis.del(sessionKey);

        console.log(`[Auth] User logged out: ${sessionToken.substring(0, 8)}...`);
    } catch (error) {
        console.error('[Auth] Logout error:', error);
        throw error;
    }
}

/**
 * Get user by email
 * @param {string} email - User email
 * @returns {Promise<Object|null>} User object or null
 */
async function getUserByEmail(email) {
    const query = 'SELECT * FROM users WHERE email = $1';
    try {
        const result = await pool.query(query, [email.toLowerCase()]);
        return result.rows[0] || null;
    } catch (error) {
        console.error('[Auth] Error getting user by email:', error);
        throw error;
    }
}

/**
 * Get user by ID
 * @param {string} userId - User UUID
 * @returns {Promise<Object|null>} User object or null
 */
async function getUserById(userId) {
    const query = 'SELECT id, email, display_name, created_at FROM users WHERE id = $1';
    try {
        const result = await pool.query(query, [userId]);
        return result.rows[0] || null;
    } catch (error) {
        console.error('[Auth] Error getting user by ID:', error);
        throw error;
    }
}

/**
 * Get user by display name (case-insensitive)
 * @param {string} displayName - Display name to search for
 * @returns {Promise<Object|null>} User object or null
 */
async function getUserByDisplayName(displayName) {
    const query = 'SELECT id, email, display_name, created_at FROM users WHERE LOWER(display_name) = LOWER($1)';
    try {
        const result = await pool.query(query, [displayName]);
        return result.rows[0] || null;
    } catch (error) {
        console.error('[Auth] Error getting user by display name:', error);
        throw error;
    }
}

/**
 * Get full user profile including all profile fields
 * @param {string} userId - User UUID
 * @returns {Promise<Object|null>} User profile or null
 */
async function getUserProfile(userId) {
    const query = `
        SELECT id, email, display_name, bio, location, website, created_at, updated_at
        FROM users
        WHERE id = $1
    `;
    try {
        const result = await pool.query(query, [userId]);
        return result.rows[0] || null;
    } catch (error) {
        console.error('[Auth] Error getting user profile:', error);
        throw error;
    }
}

/**
 * Update user profile
 * @param {string} userId - User UUID
 * @param {Object} profileData - Profile data to update
 * @param {string} [profileData.displayName] - New display name
 * @param {string} [profileData.bio] - User biography
 * @param {string} [profileData.location] - User location
 * @param {string} [profileData.website] - User website/social link
 * @returns {Promise<Object>} Updated user profile
 */
async function updateUserProfile(userId, profileData) {
    const { displayName, bio, location, website } = profileData;

    // Validate display name if provided
    if (displayName !== undefined) {
        if (!displayName || displayName.trim().length === 0) {
            throw new Error('Display name cannot be empty');
        }
        if (displayName.length > 100) {
            throw new Error('Display name must be 100 characters or less');
        }

        // Check if display name is already taken by another user
        const existingUser = await getUserByDisplayName(displayName);
        if (existingUser && existingUser.id !== userId) {
            throw new Error('This display name is already taken');
        }
    }

    // Validate bio if provided
    if (bio !== undefined && bio && bio.length > 500) {
        throw new Error('Bio must be 500 characters or less');
    }

    // Validate location if provided
    if (location !== undefined && location && location.length > 100) {
        throw new Error('Location must be 100 characters or less');
    }

    // Validate website if provided
    if (website !== undefined && website && website.length > 255) {
        throw new Error('Website URL must be 255 characters or less');
    }

    try {
        const query = `
            UPDATE users
            SET
                display_name = COALESCE($2, display_name),
                bio = COALESCE($3, bio),
                location = COALESCE($4, location),
                website = COALESCE($5, website),
                updated_at = NOW()
            WHERE id = $1
            RETURNING id, email, display_name, bio, location, website, created_at, updated_at
        `;

        const result = await pool.query(query, [
            userId,
            displayName || null,
            bio !== undefined ? bio : null,
            location !== undefined ? location : null,
            website !== undefined ? website : null,
        ]);

        if (result.rows.length === 0) {
            throw new Error('User not found');
        }

        console.log(`[Auth] User profile updated: ${userId}`);
        return result.rows[0];
    } catch (error) {
        console.error('[Auth] Error updating user profile:', error);
        throw error;
    }
}

module.exports = {
    registerUser,
    loginUser,
    validateSession,
    getSessionByWindowId,
    logoutUser,
    getUserByEmail,
    getUserById,
    getUserByDisplayName,
    getUserProfile,
    updateUserProfile,
};
