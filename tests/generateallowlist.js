const fs = require("fs");

// Read the signers JSON file
fs.readFile("tests/signers.json", "utf8", (err, data) => {
  if (err) {
    console.error("Error reading file:", err);
    return;
  }

  const signers = JSON.parse(data);

  // Create an array to store address strings
  const addresses = [];

  for (let i = 0; i < 3000; i++) {
    addresses.push(signers[i].address);
  }

  // Join the scenario strings
  const output = addresses.join("\n");

  // Write the addresses to a file
  fs.writeFile("data/addresses.txt", output, (err) => {
    if (err) {
      console.error("Error writing file:", err);
      return;
    }
    console.log("Scenarios saved to addresses.txt");
  });
});
