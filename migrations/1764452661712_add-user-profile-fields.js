/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
    // Add bio column for user biography
    pgm.addColumn('users', {
        bio: {
            type: 'text',
            notNull: false,
        },
    });

    // Add location column for user's location
    pgm.addColumn('users', {
        location: {
            type: 'varchar(100)',
            notNull: false,
        },
    });

    // Add website column for personal website/social link
    pgm.addColumn('users', {
        website: {
            type: 'varchar(255)',
            notNull: false,
        },
    });

    // Add comment for documentation
    pgm.sql(`COMMENT ON COLUMN users.bio IS 'User biography/description'`);
    pgm.sql(`COMMENT ON COLUMN users.location IS 'User location'`);
    pgm.sql(`COMMENT ON COLUMN users.website IS 'User website or social link'`);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
    pgm.dropColumn('users', 'website');
    pgm.dropColumn('users', 'location');
    pgm.dropColumn('users', 'bio');
};
