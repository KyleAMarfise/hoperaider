// main.js: Loads config, then app.js as a module
(async () => {
  // Dynamically load the correct config based on environment
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(location.hostname) || location.hostname.startsWith("[::]");
  const configScript = document.createElement('script');
  configScript.src = isLocal ? "config/local/app-config.local.js" : "config/prod/app-config.github.js";
  configScript.setAttribute('data-env', isLocal ? 'local' : 'prod');
  document.head.appendChild(configScript);

  // Wait for config to load
  await new Promise((resolve, reject) => {
    configScript.onload = resolve;
    configScript.onerror = reject;
  });

  // Now import app.js as a module
  import('./app.js');
})();
