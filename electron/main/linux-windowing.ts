/** Desktop lyrics need X11 global coordinates and always-on-top support. */
export function configureLinuxWindowing(
  app: {
    commandLine: { getSwitchValue(name: string): string };
    relaunch(options: { args: string[] }): void;
    exit(code: number): void;
  },
  platform: string = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  argv: readonly string[] = process.argv,
) {
  const separator = argv.indexOf('--');
  const switches = separator < 0 ? argv : argv.slice(0, separator);
  const explicitBackend = switches.some(arg => arg === '--ozone-platform' || arg.startsWith('--ozone-platform='));
  if (platform !== 'linux' || !env.DISPLAY || explicitBackend || app.commandLine.getSwitchValue('ozone-platform') === 'x11') return;

  // Electron can initialize Ozone before loading main. Changing its switch here
  // leaves the browser on Wayland but starts GPU children on X11 (GPU crashes).
  // Relaunch once so every process selects X11 from the start. Keep file arguments.
  const args = [...argv.slice(1)];
  args.splice(separator < 0 ? args.length : separator - 1, 0, '--ozone-platform=x11');
  app.relaunch({ args });
  app.exit(0);
}
