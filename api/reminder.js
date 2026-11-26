import { get } from '@vercel/blob';
import { handleSchedule } from '@vercel/schedules';

const KEY = 'syllabus-progress.json';
const MAX_AGE_MS = 60 * 60 * 1000;

function esc(value) {
  return String(value).replace(/[&<>"']/g, function (ch) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
  });
}

export function buildReminder(courses) {
  const groups = (Array.isArray(courses) ? courses : []).map(function (course) {
    return {
      title: String(course.title || 'Untitled course'),
      topics: (Array.isArray(course.topics) ? course.topics : [])
        .filter(function (topic) { return !topic.done; })
        .map(function (topic) { return String(topic.title || 'Untitled topic'); })
    };
  }).filter(function (group) { return group.topics.length > 0; });

  const count = groups.reduce(function (sum, group) { return sum + group.topics.length; }, 0);
  if (!count) return null;

  const lines = ['You have ' + count + (count === 1 ? ' topic' : ' topics') + ' left in your syllabus:', ''];
  groups.forEach(function (group) {
    lines.push(group.title);
    group.topics.forEach(function (topic) { lines.push('- ' + topic); });
    lines.push('');
  });
  lines.push('Open your dashboard: https://course-progress-tau.vercel.app');

  const html = '<p>You have <strong>' + count + (count === 1 ? ' topic' : ' topics') + '</strong> left in your syllabus:</p>' +
    groups.map(function (group) {
      return '<p><strong>' + esc(group.title) + '</strong></p><ul>' +
        group.topics.map(function (topic) { return '<li>' + esc(topic) + '</li>'; }).join('') + '</ul>';
    }).join('') +
    '<p><a href="https://course-progress-tau.vercel.app">Open your dashboard</a></p>';

  return { count: count, text: lines.join('\n'), html: html };
}

async function readCourses() {
  const file = await get(KEY, { access: 'private' });
  if (!file) return [];
  const text = await new Response(file.stream).text();
  const data = JSON.parse(text);
  return Array.isArray(data.courses) ? data.courses : [];
}

export const POST = handleSchedule(async function (metadata) {
  if (Date.now() - metadata.scheduledAt.getTime() > MAX_AGE_MS) {
    console.log('Skipping stale reminder ' + metadata.executionId);
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.REMINDER_TO;
  if (!apiKey || !to) throw new Error('RESEND_API_KEY and REMINDER_TO must be configured');

  const reminder = buildReminder(await readCourses());
  if (!reminder) {
    console.log('No pending topics; skipping reminder');
    return;
  }

  const response = await fetch(process.env.RESEND_API_URL || 'https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + apiKey,
      'content-type': 'application/json',
      'idempotency-key': 'reminder-' + metadata.executionId
    },
    body: JSON.stringify({
      from: 'onboarding@resend.dev',
      to: [to],
      subject: reminder.count + (reminder.count === 1 ? ' topic' : ' topics') + ' left in your syllabus',
      text: reminder.text,
      html: reminder.html
    })
  });

  if (!response.ok) {
    throw new Error('Resend rejected the reminder (' + response.status + '): ' + await response.text());
  }

  console.log('Reminder sent to ' + to + ' with ' + reminder.count + ' pending topics');
});
