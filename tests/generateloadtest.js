const fs = require("fs");

// Read the signers JSON file
fs.readFile("tests/signers.json", "utf8", (err, data) => {
  if (err) {
    console.error("Error reading file:", err);
    return;
  }

  const signers = JSON.parse(data);

  // Create an array to store scenario strings
  const scenarios = [];

  // Generate scenario strings
  signers.forEach((signer, index) => {
    const scenario = `- name: "Scenario ${index + 1}"
  flow:
    - get:
        url: "/config"
    - post:
        url: "/mint/eoa"
        json:
          signature: "${signer.signature}"
        headers:
          Content-Type: "application/json"`;

    scenarios.push(scenario);
  });

  // Join the scenario strings
  const output = scenarios.join("\n\n");

  // Write the scenarios to a file
  fs.writeFile("tests/scenarios_output.yaml", output, (err) => {
    if (err) {
      console.error("Error writing file:", err);
      return;
    }
    console.log("Scenarios saved to scenarios_output.yaml");
  });
});
