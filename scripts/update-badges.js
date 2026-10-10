#!/usr/bin/env node
/**
 * Fetch LeetCode badges via GraphQL and inject into index.html.
 * Replaces the Python version; runs with Node (available on GitHub Actions runners).
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const USERNAME = 'Gogo200202';
const GRAPHQL = 'https://leetcode.com/graphql';
const QUERY = `
query userBadges($username: String!) {
  matchedUser(username: $username) {
    badges {
      shortName
      displayName
      icon
      creationDate
      category
      medal { config { iconGif } }
    }
  }
}`;
const CATEGORY_LABELS = {
  DCC: 'Daily Medals',
  STUDY_PLAN: 'Study Plan Medals',
  COMPETITION: 'Competition Medals',
  ANNUAL: 'Annual Medals',
  SUBMISSION: 'Submission Days',
};
const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);
const START = '<!--BADGES:START-->';
const END = '<!--BADGES:END-->';
const INDEX = resolve('index.html');

async function fetchBadges() {
  const res = await fetch(GRAPHQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) badges-page',
    },
    body: JSON.stringify({ query: QUERY, variables: { username: USERNAME } }),
  });
  const data = await res.json();
  if (data.errors) throw new Error(JSON.stringify(data.errors));
  const matched = data?.data?.matchedUser;
  if (!matched) throw new Error('user not found');
  return matched.badges || [];
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, "'");
}

function render(badges) {
  const grouped = {};
  for (const b of badges) {
    (grouped[b.category] ||= []).push(b);
  }
  const order = [...CATEGORY_ORDER.filter(c => c in grouped),
    ...Object.keys(grouped).filter(c => !CATEGORY_ORDER.includes(c))];

  const parts = [
    '<div class="showCase" style="background-color:#000;border:none">',
    '<div>',
    '<span class="header" style="color:#efefef">',
    '<img src="logo.webp" alt="LeetCode Logo" title="LeetCode Logo" width="36" height="36"/>',
    `<span>${esc(USERNAME)} LeetCode Badges</span>`,
    '</span>',
    '<hr style="background-color:#fff"/>',
    '</div>',
  ];

  for (const cat of order) {
    const items = grouped[cat].sort((a, b) =>
      (b.creationDate || '').localeCompare(a.creationDate || '')
    );
    const label = CATEGORY_LABELS[cat] || cat;
    parts.push(
      '<div class="category">',
      `<p id="title" style="color:#fff">${esc(label)}</p>`,
      '<div class="grid">'
    );
    for (const b of items) {
      const cfg = (b.medal?.config) || {};
      const img = cfg.iconGif || b.icon || '';
      const name = b.displayName || b.shortName || b.name || '';
      const date = b.creationDate || '';
      parts.push(
        '<div class="badge">',
        `<img src="${esc(img)}" alt="${esc(name)}" title="${esc(name)}"/>`,
        `<p style="color:#efefef">${esc(name)}</p>`,
        `<h6 style="color:#fff">${esc(date)}</h6>`,
        '</div>'
      );
    }
    parts.push('</div>', '</div>');
  }
  parts.push('</div>');
  return parts.join('');
}

async function main() {
  let doc;
  try {
    doc = readFileSync(INDEX, 'utf8');
  } catch {
    console.error(`cannot read ${INDEX}`);
    process.exit(1);
  }
  if (!doc.includes(START) || !doc.includes(END)) {
    console.error('markers missing in index.html');
    process.exit(1);
  }

  let payload;
  try {
    const badges = await fetchBadges();
    payload = render(badges);
  } catch (e) {
    console.error('warning: leaving existing badges in place:', e.message);
    process.exit(0);
  }

  const [head, rest] = doc.split(START);
  const [, tail] = rest.split(END);
  writeFileSync(INDEX, `${head}${START}\n${payload}\n${END}${tail}`, 'utf8');
  console.log(`inlined ${payload.length} bytes of badge markup into index.html`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});