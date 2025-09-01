// _index.js
// Loads all UI reactor modules in /reactors

const basePath = './'; // Adjust this path as necessary

// List all your UI-reactor files manually or dynamically if using a bundler
const reactorModules = [
  // Add more here...
];

// Dynamically import and initialize each reactor
(async () => {
  for (const file of reactorModules) {
    try {
      await import(`${basePath}${file}`);
      console.log(`[DawnUI] Loaded: ${file}`);
    } catch (err) {
      console.warn(`[DawnUI] Failed to load reactor: ${file}`, err);
    }
  }
})();
