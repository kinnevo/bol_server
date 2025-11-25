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
    // Add unique constraint to display_name column
    // Using a unique index with LOWER() to make it case-insensitive
    pgm.createIndex('users', 'display_name', {
        name: 'idx_users_display_name_unique',
        unique: true,
        where: 'display_name IS NOT NULL'
    });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
    pgm.dropIndex('users', 'display_name', { name: 'idx_users_display_name_unique' });
};
