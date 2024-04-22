# Minting API backend for free mints

## Instructions

- npm i
- cp .env.example .env
- fill in .env with the API key and the webhook endpoint
- npm run dev
- use localtunnel for tesing webhooks locally
  npx localtunnel --port 3000

## TODO

- [ ] Add a type for the JSON web token
- [ ] Generally type more things like the mint requests etc.
- [ ] Potentially add more variables to the allowlist like expirations etc.
- [ ] Consider adding batching functions, will need ways to batch mint requests together but also a way of checking a UUID not for a single mint but several

## Stack

-Prisma ORM with sqlite3
