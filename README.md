# Minting API Backend for Free Mints

This project is a backend API for minting. It uses Prisma ORM with sqlite3.

## Setup Instructions

1. Install the dependencies:
   ```
   npm i
   ```
2. Copy the example environment file and fill it with your API key and the webhook endpoint:
   ```
   cp .env.example .env
   ```
3. Run the development server:
   ```
   npm start
   ```
4. Use localtunnel for testing webhooks locally:
   ```
   npx localtunnel --port 3000
   ```

## To-Do List

- [ ] Add a type for the JSON web token.
- [ ] Generally type more things like the mint requests etc.
- [ ] Potentially add more variables to the allowlist like expirations etc.
- [ ] Consider adding batching functions. This will require ways to batch mint requests together, but also a way of checking a UUID not for a single mint but several.

## Tech Stack

- Prisma ORM
- sqlite3
