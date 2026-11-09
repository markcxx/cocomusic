import path from 'node:path';

/** Desktop lyrics need X11 global coordinates and always-on-top support. */
export function configureLinuxWindowing(
  app: {
    commandLine: { getSwitchValue(name: string): string };
    relaunch(options: { args: string[]; execPath?: string }): void;
    exit(code: number): void;
  },
  platform: string = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  argv: readonly string[] = process.argv,
  executable: string = process.execPath,
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
  // AppRun starts our binary directly inside APPDIR. Restart the outer image
  // so the next process has its own mount. Ignore variables inherited from
  // other AppImages (for example when running from an editor's terminal).
  const image = env.APPDIR === path.dirname(executable) && env.APPIMAGE;
  app.relaunch(image ? { args, execPath: image } : { args });
  app.exit(0);
}
