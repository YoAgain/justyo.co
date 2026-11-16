// Who owns Yo and who operates it: the one place for these facts (privacy policy, imprint).

export const owner = {
  name: 'Or Arbel',
  company: 'Life Before Us, LLC',
  since: 2014,
  domain: 'justyo.co',
};

export const operator = {
  name: 'Christopher Eller',
  project: 'YoAgain',
  address: ['c/o Online-Impressum 12856', 'Europaring 90', '53757 Sankt Augustin'],
  country: 'Germany',
  email: 'privacy@justyo.app',
};

export const services = [
  { name: 'Hetzner', where: 'Germany', what: 'hosts the server.' },
  { name: 'Cloudflare', what: 'carries the connection to the server and protects it against attacks; it sees IP addresses and encrypted traffic.' },
  { name: 'Apple', what: "delivers push notifications, TestFlight builds and the App Store, under Apple's own privacy policy." },
  { name: 'GitHub', what: '(GitHub, Inc.) hosts this website on GitHub Pages; it processes visitors\' IP addresses in its server logs.' },
  { name: 'YouTube', what: "(Google) plays the videos on the Story page. A video loads from YouTube (youtube-nocookie.com) only after you click it; until then the page sends nothing to YouTube or Google." },
];

export const lastUpdated = {
  privacy: 'November 16, 2026',
  imprint: 'November 16, 2026',
};
