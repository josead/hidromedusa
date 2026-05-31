// MetaCall Lambda — Google Calendar integration
// Endpoints:
//   GET  /calendar/events          → [events]
//   POST /calendar/subscribe       { userId, eventId } → { icsUrl, googleUrl }
//   GET  /calendar/ics/:eventId    → ICS file download

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;
const CALENDAR_API_KEY = process.env.GOOGLE_CALENDAR_API_KEY;

const HIDROMEDUSA_EVENTS = [
  {
    id: 'ev-1',
    title: 'Hidromedusa · 990 Espacio Cultural',
    description: 'Próxima tocada en 990 Espacio Cultural, Tandil. Puertas 23hs. +18.',
    start: '2026-07-11T23:00:00-03:00',
    end:   '2026-07-12T06:00:00-03:00',
    location: '990 Espacio Cultural, Tandil, Buenos Aires, AR',
    url: 'https://hidromedusa.com/#entradas',
    tags: [],
  },
];

async function getEvents(req) {
  // If Google Calendar API key is configured, fetch from there
  if (CALENDAR_API_KEY && CALENDAR_ID) {
    try {
      const now = new Date().toISOString();
      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events?key=${CALENDAR_API_KEY}&timeMin=${now}&orderBy=startTime&singleEvents=true&maxResults=10`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.items) {
        return { status: 200, body: data.items.map(item => ({
          id: item.id,
          title: item.summary,
          description: item.description,
          start: item.start?.dateTime || item.start?.date,
          end: item.end?.dateTime || item.end?.date,
          location: item.location,
          url: item.htmlLink,
        })) };
      }
    } catch {}
  }

  // Fallback to hardcoded events
  return { status: 200, body: HIDROMEDUSA_EVENTS };
}

async function subscribe(req) {
  const { userId, eventId } = req.body || {};
  const event = HIDROMEDUSA_EVENTS.find(e => e.id === eventId);
  if (!event) return { status: 404, body: { error: 'Event not found' } };

  const icsUrl = `${process.env.API_URL || 'https://api.hidromedusa.com'}/calendar/ics/${eventId}`;

  const googleUrl = buildGoogleCalendarUrl(event);

  // Schedule reminder notification 24h before event
  // TODO: queue reminder job

  return { status: 200, body: { icsUrl, googleUrl, event } };
}

async function serveIcs(req) {
  const id = req.params?.id;
  const event = HIDROMEDUSA_EVENTS.find(e => e.id === id);
  if (!event) return { status: 404, body: { error: 'Not found' } };

  const ics = buildICS(event);

  return {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="hidromedusa-${id}.ics"`,
    },
    body: ics,
  };
}

function buildGoogleCalendarUrl(event) {
  const fmt = (d) => d.replace(/[-:]/g, '').replace(/\.\d{3}/, '').replace('+', '%2B');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    details: event.description + '\n\nEntradas: ' + event.url,
    location: event.location,
    dates: `${fmt(event.start)}/${fmt(event.end)}`,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

function buildICS(event) {
  const fmt = (d) => d.replace(/[-:]/g, '').replace(/\.\d{3}Z?/, 'Z').slice(0, 16) + '00Z';
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hidromedusa//Events//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.id}@hidromedusa.com`,
    `DTSTART:${fmt(event.start)}`,
    `DTEND:${fmt(event.end)}`,
    `SUMMARY:${event.title}`,
    `DESCRIPTION:${event.description}`,
    `LOCATION:${event.location}`,
    `URL:${event.url}`,
    'STATUS:CONFIRMED',
    `DTSTAMP:${fmt(new Date().toISOString())}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT24H',
    'ACTION:DISPLAY',
    `DESCRIPTION:Mañana: ${event.title}`,
    'END:VALARM',
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    `DESCRIPTION:¡En 2 horas: ${event.title}!`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

module.exports = { getEvents, subscribe, serveIcs };
