// The outlets that covered Yo, as typographic wordmarks (no logo files), each linked to its story about Yo.
// Used by the "As seen on" band on the home page and the press picks on /p/story. Data: src/data/media.json.
import media from '../data/media.json';

export type Mark = 'serif' | 'serif-italic' | 'sans' | 'sans-heavy' | 'condensed' | 'box';
export type Outlet = { name: string; mark: Mark; url: string; title: string; date: string };

const find = (part: string) => {
  const all = [...media.articles, ...media.videos];
  const hit = all.find((x) => x.url.includes(part));
  if (!hit) throw new Error(`media.json has no ${part}`);
  return hit;
};
const o = (name: string, mark: Mark, part: string): Outlet => {
  const { url, title, date } = find(part);
  return { name, mark, url, title, date };
};

// Each outlet links a story Or would be glad to see (none on the June 2014 hack, none calling Yo stupid).
export const outlets: Outlet[] = [
  o('TechCrunch', 'sans-heavy', 'techcrunch.com/2014/06/18/yo-yo'),
  o('The Wall Street Journal', 'serif', 'yo-this-app-isnt-so-dumb'),
  o('The Colbert Report', 'condensed', 'b23LSEX6qzY'),
  o('The Washington Post', 'serif-italic', 'in-defense-of-yo'),
  o('BBC', 'box', 'technology-28247504'),
  o('The Guardian', 'serif', 'yo-founder-hack-hires-hackers'),
  o('CNN', 'sans-heavy', 'money.cnn.com/2014/06/18'),
  o('CNBC', 'sans-heavy', 'cnbc.com/2014/06/18'),
  o('NBC News', 'sans', 'nbcnews.com/tech/mobile'),
  o('The Verge', 'condensed', 'theverge.com/2014/7/9'),
  o('Business Insider', 'sans-heavy', 'interview-with-yo-app-founder'),
  o('Financial Times', 'serif', 'ft.com'),
  o('NPR', 'box', 'npr.org'),
  o('Fast Company', 'sans-heavy', 'fastcompany.com/3032257'),
  o('Mashable', 'sans', 'yo-100-million'),
  o('Haaretz', 'serif', 'haaretz.com'),
];

// Any outlet's wordmark style: its own if listed, else serif for "The …" papers, heavy sans for the rest.
export const markFor = (name: string): Mark =>
  outlets.find((o) => o.name === name)?.mark ?? (/^The /.test(name) ? 'serif' : 'sans-heavy');
