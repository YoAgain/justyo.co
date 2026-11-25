// The services there are when the site is built: from api.justyo.app, else from yo-services.
type Service = { name: string; about: string };
const REPO = 'YoAgain/yo-services';

async function get(url: string): Promise<Response> {
  const answer = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!answer.ok) throw new Error(`${url}: ${answer.status}`);
  return answer;
}

async function fromRepo(): Promise<Service[]> {
  const { tree } = await (await get(`https://api.github.com/repos/${REPO}/git/trees/main?recursive=1`)).json();
  const tomls = (tree as { path: string }[]).map((f) => f.path).filter((path) => /^[^/]+\/([^/]+)\/\1\.toml$/.test(path));
  return Promise.all(tomls.map(async (path) => {
    const toml = await (await get(`https://raw.githubusercontent.com/${REPO}/main/${path}`)).text();
    return { name: toml.match(/^names\s*=\s*\["([^"]+)"/m)?.[1] ?? '', about: toml.match(/^about\s*=\s*"([^"]*)"/m)?.[1] ?? '' };
  }));
}

async function read(): Promise<Service[]> {
  const found: Service[] = await get('https://api.justyo.app/services').then((a) => a.json()).catch((error) => {
    console.warn(`${error}: the services are read from ${REPO}`);
    return fromRepo();
  });
  return found.filter((s) => /^[a-z0-9._]{1,32}$/i.test(s.name) && typeof s.about === 'string');
}

let once: Promise<Service[]> | undefined;
export const services = () => (once ??= read());
