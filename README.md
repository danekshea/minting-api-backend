# Minting API Backend for Free Mints

This project is a backend API for minting. It uses Prisma ORM with sqlite3.

## Setup Instructions

1. Install the dependencies:
   ```
   npm i
   ```
2. Copy the example environment file and fill it with your API key, and DB path(should be `file:./allowList.db`):
   ```
   cp .env.example .env
   ```
3. Make sure to configure `src/config.ts` with your collection address after deploying the contract on hub.immutable.com. Pay specific attention to the mintPhases parameter:
   ```
   mintPhases: [
     {
       name: "Presale",
       startTime: 1629913600,
       endTime: 1629999999,
       maxSupply: 1000,
       enableAllowList: true,
     },
     {
       name: "Public Sale",
       startTime: 1630000000,
       endTime: 1719292800,
       maxSupply: 9000,
       enableAllowList: false,
       maxPerWallet: 2,
     }],
   ```
   Keep in mind that you can configure a single phase if you're not planning a phased approach but just a start/end time.
4. Populate your metadata in `tokens/metadata` with the format of filename being {tokenid} and the metadata format following [this](https://docs.immutable.com/docs/zkEVM/products/minting/metadata/format) format. There's already examples in the folder for a project called copypasta.
5. Run the DB migrations:
   ```
   npx prisma migrate dev
   ```
6. Load your database, https://sqlitebrowser.org/ is great for this. You can also write a script that uses the Prisma client to load the database. Make sure you have your address allowlisted, and quantity is 1, isLocked is 0, hasMinted is 0.

7. Run the development server:

   ```
   npm start
   ```

8. Create your webhook at https://hub.immutable.com/, use localtunnel for testing webhooks locally:

   ```
   npx localtunnel --port 3000
   ```

   Use the above URL for the webhook endpoint with the path `/webhook`. For example: `https://ten-rooms-vanish.loca.lt/webhook`.

## Features

*Uses the Immutable Minting API to ensure that minting is sponsored & transaction life cycle monitoring, nonce management etc. is abstracted.
*Accounts for race conditions by locking the DB during minting for a specific address.
*Records all tokens minted in a DB, both during pending & succeeded states. If the server crashes or a large amount of mints are pending, it's counted in the max supply.
*Ability to allowlist addresses for minting and designate a quantity. For example that an address has the right to mint 5 tokens.
*Webhook support for minting events, no need for polling. Also allows for asynchronous updating from a pending to succeeded or failed state.
*Authenticated requests that are verified from both Passport and from IMX for webhooks, both on subscription & notifications.
*Ability to designate a start & end time & max supply for the minting.
*Rich logging using Winston for troubleshooting & debugging.

## To-Do List

- [ ] Add a type for the JSON web token.
- [ ] Generally type more things like the mint requests etc.
- [ ] Potentially add more variables to the allowlist like expirations etc.
- [ ] Consider adding batching functions. This will require ways to batch mint requests together, but also a way of checking a UUID not for a single mint but several.
- [ ] Add ERC1155 support once the minting API is ready
- [ ] Add the ability to choose whether you want mintByQuantity or mintByID

## Tech Stack

- Prisma ORM
- sqlite3
