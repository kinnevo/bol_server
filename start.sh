#!/bin/bash
# Script to run migrations and start server
# This ensures migrations complete before starting the server

set -e  # Exit on any error

echo "🔄 Running database migrations..."

# Run migrations
npm run migrate:up

echo "✅ Migrations completed successfully"
echo "🚀 Starting server..."

# Start the server
npm start
