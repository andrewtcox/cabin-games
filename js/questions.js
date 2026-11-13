// Starter question sets ("themes"). The host picks one on the host screen and it shows on the TV.
// Each set's LAST question is the final round and pays double.
// The host can edit, add, or delete sets on the host screen (saved on that laptop only),
// so your real questions don't have to live in the public GitHub repo.

export const QUESTION_SETS = [
  {
    id: 'winter',
    name: 'Snowed In',
    desc: 'Mountains, ski history, and record-breaking cold',
    questions: [
      { q: 'What is the coldest temperature ever recorded in the United States, in °F?', answer: -80, unit: '°F', source: 'NOAA — Prospect Creek, Alaska, 1971' },
      { q: 'How many feet tall is Mount Everest?', answer: 29032, unit: 'ft', source: '2020 China–Nepal survey' },
      { q: 'How many feet tall is Denali, the tallest peak in North America?', answer: 20310, unit: 'ft', source: 'USGS 2015 survey' },
      { q: 'In what year were the first Winter Olympics held?', answer: 1924, unit: '', source: 'IOC — Chamonix, France' },
      { q: 'In what year did the world’s first ski chairlift open (in Sun Valley, Idaho)?', answer: 1936, unit: '', source: 'Sun Valley Resort / NRHP' },
      { q: 'How many inches of snow fell at Mt. Baker, Washington, in its record 1998–99 season?', answer: 1140, unit: 'inches', source: 'NOAA-verified world record' },
      { q: 'In what year did snowboarding become an Olympic sport?', answer: 1998, unit: '', source: 'IOC — Nagano 1998' },
      { q: 'How many Winter Olympics has the United States hosted?', answer: 4, unit: '', source: 'IOC — 1932, 1960, 1980, 2002' },
      { q: 'What is the coldest temperature ever officially recorded on Earth, in °F?', answer: -128.6, unit: '°F', source: 'WMO — Vostok Station, Antarctica, 1983' },
      { q: 'How many Olympic gold medals did Shaun White win in snowboarding?', answer: 3, unit: '', source: 'IOC — 2006, 2010, 2018' },
    ],
  },
  {
    id: 'food',
    name: 'Bar & Kitchen',
    desc: 'Snacks, fast food, and what’s in your glass',
    questions: [
      { q: 'In what year was Coca-Cola invented?', answer: 1886, unit: '', source: 'The Coca-Cola Company' },
      { q: 'In what year did Ray Kroc open his first McDonald’s, in Des Plaines, Illinois?', answer: 1955, unit: '', source: 'McDonald’s Corporation' },
      { q: 'About how many gallons of maple sap does it take to make one gallon of maple syrup?', answer: 40, unit: 'gallons', source: 'USDA / maple producers (≈40:1)' },
      { q: 'In what year were Oreo cookies introduced?', answer: 1912, unit: '', source: 'Mondelēz International' },
      { q: 'How many hot dogs did Joey Chestnut eat to set the Nathan’s contest record in 2021?', answer: 76, unit: 'hot dogs', source: 'Major League Eating' },
      { q: 'In what year was pre-sliced bread first sold?', answer: 1928, unit: '', source: 'Chillicothe Baking Co., Missouri' },
      { q: 'In what year was Kraft Macaroni & Cheese introduced?', answer: 1937, unit: '', source: 'Kraft Heinz' },
      { q: 'In what year did Congress declare bourbon a “distinctive product of the United States”?', answer: 1964, unit: '', source: 'Senate Concurrent Resolution 19, 1964' },
      { q: 'How many fluid ounces are in a standard 750 ml bottle of wine?', answer: 25.4, unit: 'oz', source: 'Unit conversion (750 ml)' },
      { q: 'At minimum, how many years must a whiskey be aged to be called “straight bourbon”?', answer: 2, unit: 'years', source: 'U.S. federal standards of identity (27 CFR 5)' },
    ],
  },
  {
    id: 'usa',
    name: 'Road Trip USA',
    desc: 'Landmarks, highways, and states by the numbers',
    questions: [
      { q: 'How many feet tall is the Statue of Liberty, from the ground to the tip of the torch?', answer: 305, unit: 'ft', source: 'National Park Service' },
      { q: 'In what year did the Golden Gate Bridge open?', answer: 1937, unit: '', source: 'Golden Gate Bridge District' },
      { q: 'How many U.S. states share a border with Canada?', answer: 13, unit: 'states', source: 'U.S. Census Bureau' },
      { q: 'How many miles long was the original Route 66, from Chicago to Los Angeles?', answer: 2448, unit: 'miles', source: 'Britannica — 1926 commissioning' },
      { q: 'How many feet tall is the Gateway Arch in St. Louis?', answer: 630, unit: 'ft', source: 'National Park Service' },
      { q: 'How many counties does Texas have?', answer: 254, unit: 'counties', source: 'Texas State Library' },
      { q: 'How many feet tall is the Washington Monument?', answer: 555, unit: 'ft', source: 'National Park Service' },
      { q: 'In what year did Hawaii become a state?', answer: 1959, unit: '', source: 'National Archives' },
      { q: 'What was Wyoming’s population in the 2020 Census?', answer: 576851, unit: 'people', source: 'U.S. Census Bureau' },
      { q: 'How many feet tall is the Empire State Building, to the tip of its antenna?', answer: 1454, unit: 'ft', source: 'Empire State Realty Trust' },
    ],
  },
  {
    id: 'science',
    name: 'Lab Coats & Rockets',
    desc: 'Space, the human body, and the natural world',
    questions: [
      { q: 'On average, how many miles is the Moon from Earth?', answer: 238855, unit: 'miles', source: 'NASA' },
      { q: 'How many bones are in the adult human body?', answer: 206, unit: 'bones', source: 'Standard anatomy' },
      { q: 'How many people have walked on the Moon?', answer: 12, unit: 'people', source: 'NASA — Apollo 11–17' },
      { q: 'What is the speed of sound at sea level, in miles per hour?', answer: 767, unit: 'mph', source: 'NASA (at 59°F)' },
      { q: 'How many Earth days does it take Mars to orbit the Sun?', answer: 687, unit: 'days', source: 'NASA' },
      { q: 'How many hearts does an octopus have?', answer: 3, unit: 'hearts', source: 'Smithsonian' },
      { q: 'About how hot is the surface of the Sun, in °F?', answer: 10000, unit: '°F', source: 'NASA' },
      { q: 'How many teeth does a typical adult have, including wisdom teeth?', answer: 32, unit: 'teeth', source: 'American Dental Association' },
      { q: 'How many miles per second does light travel?', answer: 186282, unit: 'miles/sec', source: 'NIST' },
      { q: 'On average, how many miles is the Sun from Earth?', answer: 93000000, unit: 'miles', source: 'NASA (≈93 million)' },
    ],
  },
  {
    id: 'sports',
    name: 'Game Day',
    desc: 'Records, rules, and Olympic legends',
    questions: [
      { q: 'How many feet long is an NFL field, including both end zones?', answer: 360, unit: 'ft', source: 'NFL rulebook' },
      { q: 'In what year was the first Super Bowl played?', answer: 1967, unit: '', source: 'NFL' },
      { q: 'How many red stitches are on an official MLB baseball?', answer: 108, unit: 'stitches', source: 'MLB' },
      { q: 'How many feet is it from the pitcher’s rubber to home plate in MLB?', answer: 60.5, unit: 'ft', source: 'MLB Official Rules (60 ft 6 in)' },
      { q: 'How many miles long is a marathon?', answer: 26.2, unit: 'miles', source: 'World Athletics (42.195 km)' },
      { q: 'In what year were the first modern Olympic Games held?', answer: 1896, unit: '', source: 'IOC — Athens' },
      { q: 'How many laps is the Daytona 500?', answer: 200, unit: 'laps', source: 'NASCAR' },
      { q: 'How many Olympic gold medals did Michael Phelps win?', answer: 23, unit: 'golds', source: 'IOC' },
      { q: 'In what year did Parker Brothers first sell Monopoly?', answer: 1935, unit: '', source: 'Hasbro' },
      { q: 'How many NHL regular-season goals did Wayne Gretzky score in his career?', answer: 894, unit: 'goals', source: 'NHL' },
    ],
  },
];

export function toLines(list) {
  return list.map((x) => [x.q, x.answer, x.unit || '', x.source || ''].join(' | ')).join('\n');
}

export function fromLines(text, parse) {
  const out = [];
  const errors = [];
  text.split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    const [q, a, unit = '', source = ''] = line.split('|').map((s) => s.trim());
    const answer = parse(a);
    if (!q || Number.isNaN(answer)) errors.push(`Line ${i + 1}: needs "question | number answer | unit | source"`);
    else out.push({ q, answer, unit, source });
  });
  return { list: out, errors };
}
