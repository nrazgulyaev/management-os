/* Minimal inline icon set — line, 1.6 stroke, 20px viewBox */
const I = (path, vb = "0 0 24 24") => ({ size = 16, color = "currentColor", ...p } = {}) => (
  <svg width={size} height={size} viewBox={vb} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
    {path}
  </svg>
);

const Icon = {
  Search:      I(<><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>),
  Bell:        I(<><path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 6 1.5 6h-15S6 13 6 9Z"/><path d="M10 19a2 2 0 0 0 4 0"/></>),
  Plus:        I(<><path d="M12 5v14M5 12h14"/></>),
  ArrowUR:     I(<><path d="M7 17 17 7M9 7h8v8"/></>),
  Settings:    I(<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8L4.2 7a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></>),
  Mic:         I(<><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></>),
  Sparkles:    I(<><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.5 5.5l2.8 2.8M15.7 15.7l2.8 2.8M5.5 18.5l2.8-2.8M15.7 8.3l2.8-2.8"/></>),
  Home:        I(<><path d="m3 11 9-7 9 7v9a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2v-9Z"/></>),
  Building:    I(<><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 8h.01M15 8h.01M9 12h.01M15 12h.01M9 16h.01M15 16h.01"/></>),
  Bookings:    I(<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></>),
  Coin:        I(<><circle cx="12" cy="12" r="9"/><path d="M9 9.5a3 3 0 0 1 6 0c0 2-3 2-3 4M12 17.5h.01"/></>),
  Wallet:      I(<><path d="M3 7a2 2 0 0 1 2-2h13a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H5a2 2 0 0 1-2-2V7Z"/><path d="M16 13h2M3 9h15"/></>),
  Wrench:      I(<><path d="M14.7 6.3a4 4 0 0 0-5.4 4.9L3 17.6a2 2 0 1 0 2.8 2.8l6.4-6.3a4 4 0 0 0 4.9-5.4l-2.9 2.9-2-2 2.5-3.3Z"/></>),
  Key:         I(<><circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M16 7l3 3M14 9l3 3"/></>),
  Users:       I(<><circle cx="9" cy="8" r="4"/><path d="M2 20a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M22 20a7 7 0 0 0-5-6.7"/></>),
  Concierge:   I(<><path d="M12 3v9M5 12h14M4 18a8 8 0 0 1 16 0v3H4v-3Z"/></>),
  Box:         I(<><path d="M3 7.5 12 3l9 4.5L12 12 3 7.5Z"/><path d="M3 7.5V16l9 5 9-5V7.5M12 12v9"/></>),
  ChartLine:   I(<><path d="M3 3v18h18M7 14l4-4 3 3 6-7"/></>),
  ChartBar:    I(<><path d="M3 3v18h18M7 17v-5M12 17V8M17 17V12"/></>),
  ChartPie:    I(<><path d="M21 12A9 9 0 1 1 12 3v9h9Z"/></>),
  Inbox:       I(<><path d="M3 12h6l2 3h2l2-3h6"/><path d="M3 12V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v6m-18 0v6a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-6"/></>),
  Compass:     I(<><circle cx="12" cy="12" r="9"/><path d="m15 9-2 6-4 2 2-6 4-2Z"/></>),
  File:        I(<><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z"/><path d="M14 3v6h6M8 13h8M8 17h6"/></>),
  Briefcase:   I(<><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/></>),
  Hammer:      I(<><path d="M14 6 9 1 4 6l3 3h2l5 5-3 3 4 4 6-6-4-4-3 3-5-5 3-3Z"/></>),
  Layers:      I(<><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5M3 18l9 5 9-5"/></>),
  Map:         I(<><path d="M9 4 3 6v15l6-2 6 2 6-2V4l-6 2-6-2Z"/><path d="M9 4v15M15 6v15"/></>),
  Truck:       I(<><path d="M3 7h11v10H3zM14 11h4l3 3v3h-7"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></>),
  Receipt:     I(<><path d="M5 21V3l2 1 2-1 2 1 2-1 2 1 2-1 2 1v18l-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z"/><path d="M9 8h6M9 12h6M9 16h3"/></>),
  Bank:        I(<><path d="M3 10 12 4l9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18"/></>),
  Tag:         I(<><path d="M3 13V3h10l8 8-10 10-8-8Z"/><circle cx="8" cy="8" r="1.5"/></>),
  Logout:      I(<><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h12"/></>),
  Menu:        I(<><path d="M4 7h16M4 12h16M4 17h16"/></>),
  Bolt:        I(<><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/></>),
  Check:       I(<><path d="m4 12 5 5L20 6"/></>),
  Chevron:     I(<><path d="m6 9 6 6 6-6"/></>),
  ChevronR:    I(<><path d="m9 6 6 6-6 6"/></>),
  Dot:         I(<><circle cx="12" cy="12" r="3" fill="currentColor"/></>),
  Filter:      I(<><path d="M3 4h18l-7 9v7l-4-2v-5L3 4Z"/></>),
  Download:    I(<><path d="M12 4v11M7 11l5 5 5-5M5 21h14"/></>),
  ArrowR:      I(<><path d="M5 12h14M13 6l6 6-6 6"/></>),
  ArrowL:      I(<><path d="M19 12H5M11 6l-6 6 6 6"/></>),
  Calendar:    I(<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4M8 14h.01M12 14h.01M16 14h.01"/></>),
  PlugZap:     I(<><path d="M7 2v6M17 2v6M5 8h14v4a7 7 0 0 1-14 0V8ZM12 16v6"/></>),
  ShieldCheck: I(<><path d="M12 3 4 6v6a10 10 0 0 0 8 9 10 10 0 0 0 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/></>),
  Robot:       I(<><rect x="4" y="7" width="16" height="12" rx="3"/><path d="M9 12h.01M15 12h.01M12 3v4M8 19v2M16 19v2"/></>),
  Eye:         I(<><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z"/><circle cx="12" cy="12" r="3"/></>),
  Lock:        I(<><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V8a4 4 0 1 1 8 0v3"/></>),
};

window.Icon = Icon;
