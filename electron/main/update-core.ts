/**
 * Pure update logic (no Electron imports, unit-tested): version ordering,
 * GitHub release parsing and which installer fits this machine.
 * The runtime side lives in updater.ts.
 */

export interface ReleaseAsset {
  name: string;
  size: number;
  url: string;
  /** 'sha256:<hex>' as reported by GitHub, or null for older uploads. */
  digest: string | null;
}

export interface ReleaseInfo {
  version: string;
  tag: string;
  name: string;
  /** Markdown body: the release notes from .github/release-notes/<version>.md. */
  notes: string;
  publishedAt: string;
  url: string;
  prerelease: boolean;
  assets: ReleaseAsset[];
}

export type UpdateChannel = 'stable' | 'beta';
/** mac-zip replaces the app bundle in place; the others are handed to the OS or an installer. */
export type InstallTarget = 'mac-zip' | 'mac-dmg' | 'win' | 'appimage' | 'deb';

const VERSION = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/;

export const isVersion = (value: unknown): value is string => typeof value === 'string' && VERSION.test(value);

/** Semver precedence: <0 when a is older than b, 0 when equal, >0 when newer. Build metadata is ignored. */
export function compareVersions(a: string, b: string) {
  const left = VERSION.exec(a);
  const right = VERSION.exec(b);
  if (!left || !right) throw new Error(`Invalid version: ${left ? b : a}`);
  for (let index = 1; index <= 3; index++) {
    const diff = Number(left[index]) - Number(right[index]);
    if (diff) return Math.sign(diff);
  }
  const pre = (match: RegExpExecArray) => (match[4] ? match[4].split('.') : []);
  const [x, y] = [pre(left), pre(right)];
  // A pre-release sorts before its release: 1.0.0-rc.1 < 1.0.0.
  if (!x.length || !y.length) return Math.sign(y.length - x.length);
  for (let index = 0; index < Math.max(x.length, y.length); index++) {
    if (x[index] === undefined) return -1;
    if (y[index] === undefined) return 1;
    if (x[index] === y[index]) continue;
    const [numericX, numericY] = [/^\d+$/.test(x[index]), /^\d+$/.test(y[index])];
    if (numericX && numericY) return Math.sign(Number(x[index]) - Number(y[index]));
    if (numericX !== numericY) return numericX ? -1 : 1;
    return x[index] < y[index] ? -1 : 1;
  }
  return 0;
}

const record = (value: unknown) => (value && typeof value === 'object' ? value as Record<string, unknown> : {});
const text = (value: unknown) => (typeof value === 'string' ? value : '');

/**
 * Published releases from the GitHub API, newest version first. Drafts, tags
 * that are not versions and assets hosted anywhere but this repository's
 * release downloads are dropped, so a URL from the response can be fetched as is.
 */
export function parseReleases(raw: unknown, repo: string): ReleaseInfo[] {
  if (!Array.isArray(raw)) return [];
  const downloads = `https://github.com/${repo}/releases/download/`;
  const releases: ReleaseInfo[] = [];
  for (const item of raw.map(record)) {
    const tag = text(item.tag_name);
    if (item.draft === true || !isVersion(tag)) continue;
    const assets = (Array.isArray(item.assets) ? item.assets : []).map(record).flatMap(asset => {
      const url = text(asset.browser_download_url);
      const name = text(asset.name);
      if (!name || !url.startsWith(downloads) || (asset.state !== undefined && asset.state !== 'uploaded')) return [];
      const digest = text(asset.digest);
      return [{ name, url, size: typeof asset.size === 'number' ? asset.size : 0, digest: /^sha256:[0-9a-f]{64}$/.test(digest) ? digest : null }];
    });
    releases.push({
      version: tag.replace(/^v/, ''),
      tag,
      name: text(item.name) || `CoCo Music ${tag.replace(/^v/, '')}`,
      notes: text(item.body).replace(/\r\n/g, '\n').trim(),
      publishedAt: text(item.published_at),
      url: text(item.html_url) || `https://github.com/${repo}/releases/tag/${tag}`,
      prerelease: item.prerelease === true,
      assets,
    });
  }
  return releases.sort((a, b) => compareVersions(b.version, a.version));
}

/** Releases the channel offers: stable only, or stable and pre-releases. */
export const inChannel = (releases: ReleaseInfo[], channel: UpdateChannel) => releases.filter(release => channel === 'beta' || !release.prerelease);

/** Newest release in the channel that is newer than `current` and ships an installer for `target`. */
export function pickUpdate(releases: ReleaseInfo[], current: string, channel: UpdateChannel, target: InstallTarget, arch: string) {
  return inChannel(releases, channel).find(release => compareVersions(release.version, current) > 0 && installAsset(release, target, arch));
}

/** Everything between `current` (exclusive) and `latest` (inclusive), newest first: the notes to read before updating. */
export function releasesBetween(releases: ReleaseInfo[], current: string, latest: ReleaseInfo, channel: UpdateChannel) {
  return inChannel(releases, channel).filter(release => compareVersions(release.version, current) > 0 && compareVersions(release.version, latest.version) <= 0);
}

const LINUX_ARCH: Record<string, string[]> = { x64: ['x64', 'x86_64', 'amd64'], arm64: ['arm64', 'aarch64'] };

/** The installer for this machine, named as electron-builder.yml writes them. */
export function installAsset(release: ReleaseInfo, target: InstallTarget, arch: string): ReleaseAsset | undefined {
  const prefix = `CoCo-Music-${release.version}-`;
  const find = (test: (name: string) => boolean) => release.assets.find(asset => asset.name.startsWith(prefix) && test(asset.name.slice(prefix.length)));
  switch (target) {
    case 'mac-zip': return find(rest => rest === `mac-${arch}.zip`);
    case 'mac-dmg': return find(rest => rest === `mac-${arch}.dmg`);
    // Only x64 is built; Windows on Arm runs it emulated.
    case 'win': return find(rest => rest === `win-${arch}-Setup.exe`) ?? find(rest => rest === 'win-x64-Setup.exe');
    case 'appimage':
    case 'deb': {
      const extension = target === 'appimage' ? '.AppImage' : '.deb';
      const names = LINUX_ARCH[arch] ?? [arch];
      return find(rest => rest.endsWith(extension) && names.some(name => rest === `linux-${name}${extension}`));
    }
  }
}

/** Expected hash for `name` in a SHA256SUMS.txt (`<hex>  <name>` per line). */
export function checksumFromSums(sums: string, name: string) {
  for (const line of sums.split('\n')) {
    const match = /^([0-9a-f]{64})\s+\*?(.+)$/.exec(line.trim());
    if (match && match[2] === name) return match[1];
  }
  return null;
}
