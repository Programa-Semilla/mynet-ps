import { useState, useRef, useEffect } from "react";
import imgMarcus from "@/imports/EventlinkMobileHome/124033ba92a8dda677fb9feedff6f0461677c8c2.png";
import imgDevon from "@/imports/EventlinkMobileHome/612a68df98fa7b3c5c535ec4ddfec8c07d7e9542.png";
import imgSrinivas from "@/imports/EventlinkMobileHome/de297827f9ec6c594405bd444c7b041ee1d8864a.png";
import imgElena from "@/imports/EventlinkMobileHome/5a095ec5ffecae6a2443601431769995dbf66586.png";
import imgAris from "@/imports/EventlinkMobileHome/3fe2ad390532c1282995803567b3554a6c453927.png";

// ─── Types ──────────────────────────────────────────────────────────────────

type Tab = "home" | "agenda" | "discover" | "messages" | "network";

interface Session {
  id: string;
  time: string;
  endTime?: string;
  title: string;
  room?: string;
  track: string;
  trackColor: string;
  speakerId?: string;
  description?: string;
  qa?: { id: string; text: string; author: string }[];
}

interface Speaker {
  id: string;
  name: string;
  title: string;
  company: string;
  img: string;
  bio?: string;
}

interface Attendee {
  id: string;
  name: string;
  company: string;
  role: string;
  img: string;
  interests: string[];
  intent: string;
  available: boolean;
}

interface Message {
  id: string;
  from: string;
  text: string;
  time: string;
  mine: boolean;
}

interface Conversation {
  id: string;
  attendeeId: string;
  messages: Message[];
}

interface Appointment {
  id: string;
  time: string;
  attendeeId: string;
  topic: string;
}

interface Event {
  id: string;
  name: string;
  location: string;
  day: number;
  totalDays: number;
}

// ─── Sample Data ─────────────────────────────────────────────────────────────

const EVENTS: Event[] = [
  { id: "tc26", name: "TechConnect Summit 2026", location: "SF, CA", day: 2, totalDays: 3 },
  { id: "ai25", name: "AI Forward 2025", location: "NYC, NY", day: 1, totalDays: 2 },
  { id: "ds24", name: "DesignSphere 2024", location: "Austin, TX", day: 3, totalDays: 3 },
];

const SPEAKERS: Speaker[] = [
  { id: "marcus", name: "Marcus Aurelius", title: "Principal Designer", company: "Creative Systems", img: imgMarcus, bio: "Marcus leads product design at Creative Systems, focusing on the intersection of AI and human-centered design. Previously at Google and IDEO." },
  { id: "devon", name: "Devon Webb", title: "Head of Developer Experience", company: "Stripe", img: imgDevon, bio: "Devon champions developer tools and API design at Stripe, with a focus on making complex infrastructure feel simple." },
  { id: "elena", name: "Elena Rostova", title: "Senior Designer", company: "Figma", img: imgElena, bio: "Elena works on design systems and collaboration features at Figma. She writes extensively about the future of design tooling." },
];

const SESSIONS: Session[] = [
  {
    id: "s0", time: "10:30 AM", endTime: "11:15 AM",
    title: "The Future of AI in Product Design",
    room: "Main Hall A", track: "Design", trackColor: "#E8634D",
    speakerId: "marcus",
    description: "How AI is fundamentally changing the way designers think about their craft — from generative prototyping to real-time user insight.",
    qa: [
      { id: "q1", text: "How do you balance AI suggestions with designer intuition?", author: "Jamie L." },
      { id: "q2", text: "What tools are you most excited about in 2026?", author: "Priya S." },
      { id: "q3", text: "Will AI replace junior designers entirely?", author: "Tom R." },
    ],
  },
  { id: "s1", time: "11:30 AM", title: "Scale and Growth Panel", room: "Hall B", track: "Product", trackColor: "#5CC9A7", speakerId: "devon", description: "A panel discussion on scaling product teams from 10 to 100 without losing velocity.", qa: [{ id: "q4", text: "How do you maintain culture at scale?", author: "Alex M." }] },
  { id: "s2", time: "1:00 PM", title: "Lunch & Structured Networking", room: "Atrium", track: "Main Event", trackColor: "#E8634D", description: "Structured 10-minute one-on-ones facilitated by EventLink matching." },
  { id: "s3", time: "2:30 PM", title: "Interactive Workshop: Prompting", room: "Workshop Room 3", track: "Tech", trackColor: "#5D9CEC", description: "Hands-on prompt engineering workshop covering chain-of-thought, RAG patterns, and safety constraints.", qa: [{ id: "q5", text: "Best resources for learning prompt engineering?", author: "Sara K." }] },
  { id: "s4", time: "4:00 PM", title: "Keynote: Next Gen Ecosystems", room: "Main Hall A", track: "Keynote", trackColor: "#967ADC", speakerId: "elena", description: "A sweeping look at how developer and design ecosystems are converging, and what that means for the next generation of builders.", qa: [{ id: "q6", text: "What ecosystem do you think wins the next 5 years?", author: "Wei C." }] },
  { id: "s5", time: "5:00 PM", title: "Closing Reception", room: "Rooftop Terrace", track: "Main Event", trackColor: "#E8634D", description: "Wind down with fellow attendees, speakers, and sponsors." },
];

const ATTENDEES: Attendee[] = [
  { id: "devon", name: "Devon Webb", company: "Stripe", role: "Head of Developer Experience", img: imgDevon, interests: ["AI Agents", "APIs", "Developer Tools"], intent: "Open to meetings", available: true },
  { id: "srinivas", name: "Srinivas Rao", company: "Supabase", role: "Engineering Lead", img: imgSrinivas, interests: ["Postgres", "Open Source", "Data"], intent: "Looking for collaborators", available: true },
  { id: "elena", name: "Elena Rostova", company: "Figma", role: "Senior Designer", img: imgElena, interests: ["Design Systems", "UX", "Typography"], intent: "Happy to chat", available: false },
  { id: "aris", name: "Aris Thorne", company: "Vercel", role: "Platform Engineer", img: imgAris, interests: ["Edge Computing", "Performance", "React"], intent: "Open to meetings", available: true },
  { id: "marcus", name: "Marcus Aurelius", company: "Creative Systems", role: "Principal Designer", img: imgMarcus, interests: ["AI Design", "Prototyping", "Research"], intent: "Limited availability", available: false },
];

const INITIAL_CONVERSATIONS: Conversation[] = [
  {
    id: "c1", attendeeId: "elena",
    messages: [
      { id: "m1", from: "elena", text: "Hey Sarah, loved your talk last year! Are you presenting this time?", time: "9:12 AM", mine: false },
      { id: "m2", from: "me", text: "Hi Elena! Not presenting but attending a few sessions. Would love to catch up!", time: "9:45 AM", mine: true },
      { id: "m3", from: "elena", text: "Hey Sarah, let's catch up after the keynote tonight?", time: "10:02 AM", mine: false },
    ],
  },
  {
    id: "c2", attendeeId: "devon",
    messages: [
      { id: "m4", from: "devon", text: "Sarah! Saw you're attending the AI workshop. Excited to see you there.", time: "8:30 AM", mine: false },
    ],
  },
  {
    id: "c3", attendeeId: "aris",
    messages: [
      { id: "m5", from: "aris", text: "Quick question — are you free for a 30-min chat about API design this afternoon?", time: "Yesterday", mine: false },
      { id: "m6", from: "me", text: "Sure, 3:30 works for me. I'll book via EventLink.", time: "Yesterday", mine: true },
    ],
  },
];

const INITIAL_APPOINTMENTS: Appointment[] = [
  { id: "a1", time: "3:30 PM", attendeeId: "aris", topic: "API Integration Review" },
];

const MEETING_SLOTS = ["9:00 AM", "9:30 AM", "10:00 AM", "11:00 AM", "2:00 PM", "3:00 PM", "4:30 PM", "5:30 PM"];

const DISCOVER_FILTERS = ["All", "AI/ML", "Product", "Design", "Engineering", "Open Source"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TRACK_DOT_COLORS: Record<string, string> = {
  "#5CC9A7": "bg-[#5CC9A7]",
  "#E8634D": "bg-[#E8634D]",
  "#5D9CEC": "bg-[#5D9CEC]",
  "#967ADC": "bg-[#967ADC]",
};

function TrackDot({ color }: { color: string }) {
  const cls = TRACK_DOT_COLORS[color] ?? "bg-[#8F96A8]";
  return <span className={`inline-block rounded-full shrink-0 size-[6px] ${cls}`} />;
}

function Avatar({ src, alt, size = 40, radius = 12 }: { src: string; alt: string; size?: number; radius?: number }) {
  return (
    <div
      className="overflow-hidden shrink-0 bg-[#efe8e1]"
      style={{ width: size, height: size, borderRadius: radius }}
    >
      <img src={src} alt={alt} className="w-full h-full object-cover" />
    </div>
  );
}

function ChevronRightIcon({ color = "#E8634D" }: { color?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M4.5 9L7.5 6L4.5 3" stroke={color} strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function SectionHeader({ title, linkLabel, onLink }: { title: string; linkLabel: string; onLink: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 pt-3 pb-1">
      <p className="font-['Outfit',sans-serif] font-bold text-[#1b2340] text-[18px]">{title}</p>
      <button onClick={onLink} className="flex items-center gap-1 px-2 py-1.5 text-[#e8634d] font-['Geist',sans-serif] font-semibold text-[13px]">
        {linkLabel} <ChevronRightIcon />
      </button>
    </div>
  );
}

// ─── Bottom Navigation ────────────────────────────────────────────────────────

const NAV_ITEMS: { id: Tab; label: string; icon: (active: boolean) => JSX.Element }[] = [
  {
    id: "home", label: "Home",
    icon: (a) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M3 7.5L10 2L17 7.5V17C17 17.5523 16.5523 18 16 18H13V13H7V18H4C3.44772 18 3 17.5523 3 17V7.5Z" stroke={a ? "#E8634D" : "#8F96A8"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "agenda", label: "Agenda",
    icon: (a) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="3" y="4" width="14" height="14" rx="2" stroke={a ? "#E8634D" : "#8F96A8"} strokeWidth="2" />
        <path d="M7 2V6M13 2V6M3 9H17" stroke={a ? "#E8634D" : "#8F96A8"} strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "discover", label: "Discover",
    icon: (a) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="9" cy="9" r="6" stroke={a ? "#E8634D" : "#8F96A8"} strokeWidth="2" />
        <path d="M14 14L18 18" stroke={a ? "#E8634D" : "#8F96A8"} strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "messages", label: "Messages",
    icon: (a, unread?: boolean) => (
      <div className="relative">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M17 13C17 13.5304 16.7893 14.0391 16.4142 14.4142C16.0391 14.7893 15.5304 15 15 15H5L2 18V5C2 4.46957 2.21071 3.96086 2.58579 3.58579C2.96086 3.21071 3.46957 3 4 3H15C15.5304 3 16.0391 3.21071 16.4142 3.58579C16.7893 3.96086 17 4.46957 17 5V13Z" stroke={a ? "#E8634D" : "#8F96A8"} strokeWidth="2" strokeLinecap="round" />
        </svg>
        {unread && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#E8634D] rounded-full" />}
      </div>
    ),
  },
  {
    id: "network", label: "Network",
    icon: (a) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M14 15C14 13.3431 12.2091 12 10 12C7.79086 12 6 13.3431 6 15M17 15C17 13.6739 15.7 12.5 14 12C14.8946 11.3796 15.5 10.4346 15.5 9.35295C15.5 7.49595 13.933 6 12 6C11.6 6 11.22 6.06 10.86 6.17M3 15C3 13.6739 4.3 12.5 6 12C5.10539 11.3796 4.5 10.4346 4.5 9.35295C4.5 7.49595 6.067 6 8 6C8.4 6 8.78 6.06 9.14 6.17M10 12C11.6569 12 13 10.6569 13 9C13 7.34315 11.6569 6 10 6C8.34315 6 7 7.34315 7 9C7 10.6569 8.34315 12 10 12Z" stroke={a ? "#E8634D" : "#8F96A8"} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
];

function BottomNav({ active, onChange, unreadMessages }: { active: Tab; onChange: (t: Tab) => void; unreadMessages: boolean }) {
  return (
    <div className="absolute bottom-0 left-0 right-0 h-[72px] bg-white border-t border-[#efe8e1] flex items-center px-2 z-20">
      {NAV_ITEMS.map((item) => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            className="flex-1 flex flex-col items-center gap-1 py-1"
            aria-label={item.label}
            aria-current={isActive ? "page" : undefined}
          >
            <div className="w-6 h-6 flex items-center justify-center">
              {item.icon(isActive, item.id === "messages" ? unreadMessages : false)}
            </div>
            <span
              className={`font-['Geist',sans-serif] text-[10px] leading-none ${isActive ? "font-bold text-[#e8634d]" : "font-medium text-[#8f96a8]"}`}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Status Bar ───────────────────────────────────────────────────────────────

function StatusBar() {
  return (
    <div className="bg-[#1b2340] h-10 flex items-center justify-between px-5 shrink-0">
      <span className="font-['Geist',sans-serif] font-semibold text-[15px] text-white">9:41</span>
      <div className="flex items-center gap-1.5">
        <svg width="17" height="11" viewBox="0 0 17 11" fill="none"><path fillRule="evenodd" clipRule="evenodd" d="M1 7.5H3V11H1V7.5ZM5 5H7V11H5V5ZM9 2.5H11V11H9V2.5ZM13 0H15V11H13V0Z" fill="white" /></svg>
        <svg width="15" height="11" viewBox="0 0 15 11" fill="none"><path fillRule="evenodd" clipRule="evenodd" d="M7.5 2.2C9.8 2.2 11.8 3.2 13.2 4.8L15 3C13.1 1.1 10.4 0 7.5 0C4.6 0 1.9 1.1 0 3L1.8 4.8C3.2 3.2 5.2 2.2 7.5 2.2ZM7.5 6.6C8.8 6.6 10 7.1 10.9 8L12.7 6.2C11.3 4.8 9.5 4 7.5 4C5.5 4 3.7 4.8 2.3 6.2L4.1 8C5 7.1 6.2 6.6 7.5 6.6ZM7.5 11C8.3 11 9 10.7 9.5 10.2L7.5 8.2L5.5 10.2C6 10.7 6.7 11 7.5 11Z" fill="white" /></svg>
        <svg width="25" height="12" viewBox="0 0 25 12" fill="none"><rect x="0.5" y="0.5" width="21" height="11" rx="3.5" stroke="white" strokeOpacity="0.35" /><rect x="2" y="2" width="18" height="8" rx="2" fill="white" /><path d="M23 4.5V7.5C23.8 7.2 24.5 6.5 24.5 6C24.5 5.5 23.8 4.8 23 4.5Z" fill="white" fillOpacity="0.4" /></svg>
      </div>
    </div>
  );
}

// ─── Home Screen ──────────────────────────────────────────────────────────────

function HomeScreen({
  event,
  events,
  onEventChange,
  savedSessions,
  onToggleSave,
  appointments,
  conversations,
  onNavigate,
  onOpenSession,
}: {
  event: Event;
  events: Event[];
  onEventChange: (e: Event) => void;
  savedSessions: Set<string>;
  onToggleSave: (id: string) => void;
  appointments: Appointment[];
  conversations: Conversation[];
  onNavigate: (t: Tab) => void;
  onOpenSession: (s: Session) => void;
}) {
  const [showEventPicker, setShowEventPicker] = useState(false);
  const upNext = SESSIONS[0];
  const speaker = SPEAKERS.find((s) => s.id === upNext.speakerId);
  const unreadCount = conversations.filter((c) => !c.messages[c.messages.length - 1]?.mine).length;
  const lastMsg = conversations[0].messages[conversations[0].messages.length - 1];
  const lastMsgAttendee = ATTENDEES.find((a) => a.id === conversations[0].attendeeId);

  return (
    <div className="flex-1 overflow-y-auto pb-[80px]">
      {/* Header */}
      <div className="bg-[#1b2340] h-16 flex items-center justify-between px-4 shrink-0">
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <button
            onClick={() => setShowEventPicker(!showEventPicker)}
            className="flex items-center gap-1"
            aria-label="Switch event"
          >
            <span className="font-['Outfit',sans-serif] font-bold text-[15px] text-white truncate">{event.name}</span>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3.5 5.25L7 8.75L10.5 5.25" stroke="#E8634D" strokeLinecap="round" strokeWidth="2" />
            </svg>
          </button>
          <div className="bg-white/10 w-fit px-1.5 py-0.5 rounded">
            <span className="font-['Geist',sans-serif] font-medium text-[11px] text-white">{event.location}</span>
          </div>
        </div>
        <button className="relative size-10 flex items-center justify-center rounded-full bg-white/[0.06]" aria-label="Notifications">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M10 2.5C7 2.5 5 5 5 8V13L3 14.5V15.5H17V14.5L15 13V8C15 5 13 2.5 10 2.5ZM10 2.5V1M8 16.5C8 17.6 8.9 18.5 10 18.5C11.1 18.5 12 17.6 12 16.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span className="absolute top-1.5 right-1.5 size-2.5 bg-[#E8634D] rounded-full" />
        </button>
      </div>

      {/* Event picker dropdown */}
      {showEventPicker && (
        <div className="mx-4 mt-1 bg-white rounded-xl shadow-lg border border-[#efe8e1] overflow-hidden z-10 relative">
          {events.map((ev) => (
            <button
              key={ev.id}
              onClick={() => { onEventChange(ev); setShowEventPicker(false); }}
              className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[#fdf8f3] transition-colors ${ev.id === event.id ? "bg-[#fdf8f3]" : ""}`}
            >
              <div className="flex flex-col flex-1 min-w-0">
                <span className="font-['Geist',sans-serif] font-semibold text-[14px] text-[#1b2340] truncate">{ev.name}</span>
                <span className="font-['Geist',sans-serif] text-[12px] text-[#8f96a8]">{ev.location} · Day {ev.day} of {ev.totalDays}</span>
              </div>
              {ev.id === event.id && (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-0.5 shrink-0">
                  <path d="M3 8L6.5 11.5L13 5" stroke="#E8634D" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Greeting */}
      <div className="px-4 pt-5 pb-1">
        <p className="font-['Outfit',sans-serif] font-extrabold text-[26px] text-[#1b2340] leading-tight">Good morning, Sarah</p>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="font-['Geist',sans-serif] font-medium text-[14px] text-[#525a70]">Tuesday, March 18</span>
          <span className="size-1 rounded-full bg-[#8f96a8]" />
          <span className="font-['Geist',sans-serif] font-semibold text-[14px] text-[#e8634d]">Day {event.day} of {event.totalDays}</span>
        </div>
      </div>

      {/* Up Next Card */}
      <div className="px-4 pt-4">
        <div className="bg-white rounded-xl shadow-[0_4px_8px_rgba(27,35,64,0.05)] p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="bg-[rgba(232,99,77,0.08)] text-[#e8634d] font-['Geist',sans-serif] font-bold text-[11px] uppercase px-2 py-1 rounded">Up Next</span>
            <div className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-[#5CC9A7]" />
              <span className="font-['Geist',sans-serif] font-semibold text-[12px] text-[#525a70]">Starts in 15m</span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <p className="font-['Outfit',sans-serif] font-bold text-[20px] text-[#1b2340] leading-snug">{upNext.title}</p>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="#8F96A8" strokeWidth="1.6" /><path d="M7 4V7L9 9" stroke="#8F96A8" strokeWidth="1.6" strokeLinecap="round" /></svg>
                <span className="font-['Geist',sans-serif] text-[13px] text-[#525a70]">{upNext.time} – {upNext.endTime}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1C4.79 1 3 2.79 3 5C3 7.5 7 13 7 13C7 13 11 7.5 11 5C11 2.79 9.21 1 7 1ZM7 6.5C6.17 6.5 5.5 5.83 5.5 5C5.5 4.17 6.17 3.5 7 3.5C7.83 3.5 8.5 4.17 8.5 5C8.5 5.83 7.83 6.5 7 6.5Z" stroke="#8F96A8" strokeWidth="1.6" strokeLinecap="round" /></svg>
                <span className="font-['Geist',sans-serif] text-[13px] text-[#525a70]">{upNext.room}</span>
              </div>
            </div>
          </div>
          {speaker && (
            <div className="flex items-center gap-2.5 pt-3 border-t border-[#efe8e1]">
              <Avatar src={speaker.img} alt={speaker.name} size={32} radius={8} />
              <div>
                <p className="font-['Geist',sans-serif] font-semibold text-[14px] text-[#1b2340]">{speaker.name}</p>
                <p className="font-['Geist',sans-serif] text-[12px] text-[#8f96a8]">{speaker.title}, {speaker.company}</p>
              </div>
            </div>
          )}
          <button
            onClick={() => onOpenSession(upNext)}
            className="bg-[#e8634d] h-11 flex items-center justify-center rounded-lg w-full text-white font-['Geist',sans-serif] font-bold text-[14px] active:opacity-90 transition-opacity"
          >
            Join Session
          </button>
        </div>
      </div>

      {/* Today's Schedule */}
      <SectionHeader title="Today's Schedule" linkLabel="View Agenda" onLink={() => onNavigate("agenda")} />
      <div className="px-4 flex flex-col gap-3">
        {SESSIONS.slice(1, 5).map((s) => (
          <button
            key={s.id}
            onClick={() => onOpenSession(s)}
            className="bg-white rounded-lg w-full text-left"
          >
            <div className="flex items-center gap-3 p-3">
              <span className="font-['Geist',sans-serif] font-bold text-[13px] text-[#1b2340] w-[68px] shrink-0">{s.time}</span>
              <div className="w-px h-6 bg-[#efe8e1] shrink-0" />
              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                <span className="font-['Geist',sans-serif] font-semibold text-[14px] text-[#1b2340] truncate">{s.title}</span>
                <div className="flex items-center gap-1">
                  <TrackDot color={s.trackColor} />
                  <span className="font-['Geist',sans-serif] text-[11px] text-[#8f96a8]">{s.track}</span>
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* People to Meet */}
      <SectionHeader title="People to Meet" linkLabel="Discover More" onLink={() => onNavigate("discover")} />
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-3 px-4" style={{ width: "max-content" }}>
          {ATTENDEES.slice(0, 3).map((a) => (
            <div key={a.id} className="bg-white rounded-xl shadow-[0_2px_4px_rgba(27,35,64,0.05)] p-4 flex flex-col items-center gap-3 w-[140px]">
              <Avatar src={a.img} alt={a.name} size={48} radius={24} />
              <div className="text-center">
                <p className="font-['Outfit',sans-serif] font-bold text-[15px] text-[#1b2340]">{a.name.split(" ")[0]} {a.name.split(" ")[1]?.charAt(0)}.</p>
                <p className="font-['Geist',sans-serif] text-[12px] text-[#8f96a8]">{a.company}</p>
              </div>
              <span className="bg-[#fdf8f3] text-[#525a70] font-['Geist',sans-serif] font-medium text-[11px] px-2 py-1 rounded-full">{a.interests[0]}</span>
              <button
                onClick={() => onNavigate("discover")}
                className="w-full h-8 border border-[#e8634d] rounded flex items-center justify-center text-[#e8634d] font-['Geist',sans-serif] font-bold text-[12px]"
              >
                Connect
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* My Appointments */}
      <SectionHeader title="My Appointments" linkLabel="All Meetings" onLink={() => onNavigate("network")} />
      <div className="px-4 flex flex-col gap-2">
        {appointments.length === 0 && (
          <p className="text-[#8f96a8] font-['Geist',sans-serif] text-[13px] py-2">No appointments scheduled yet.</p>
        )}
        {appointments.map((apt) => {
          const person = ATTENDEES.find((a) => a.id === apt.attendeeId);
          if (!person) return null;
          return (
            <div key={apt.id} className="bg-white rounded-lg">
              <div className="flex items-center gap-3 p-3">
                <div className="bg-[rgba(232,99,77,0.08)] text-[#e8634d] font-['Geist',sans-serif] font-bold text-[12px] px-2 py-1.5 rounded shrink-0">{apt.time}</div>
                <Avatar src={person.img} alt={person.name} size={36} radius={18} />
                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                  <p className="font-['Geist',sans-serif] font-bold text-[13px] text-[#1b2340] truncate">Meeting with {person.name}</p>
                  <p className="font-['Geist',sans-serif] text-[12px] text-[#525a70] truncate">Topic: {apt.topic}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Messages Banner */}
      {unreadCount > 0 && (
        <div className="px-4 pt-4 pb-2">
          <button
            onClick={() => onNavigate("messages")}
            className="w-full bg-white rounded-lg border border-[#e8634d]"
          >
            <div className="flex items-center gap-3 p-3">
              <div className="size-9 bg-[rgba(232,99,77,0.08)] rounded-full flex items-center justify-center shrink-0">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M15 12C15 12.5304 14.7893 13.0391 14.4142 13.4142C14.0391 13.7893 13.5304 14 13 14H4L2 16V4C2 3.46957 2.21071 2.96086 2.58579 2.58579C2.96086 2.21071 3.46957 2 4 2H13C13.5304 2 14.0391 2.21071 14.4142 2.58579C14.7893 2.96086 15 3.46957 15 4V12Z" stroke="#E8634D" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                <p className="font-['Outfit',sans-serif] font-bold text-[14px] text-[#1b2340]">{unreadCount} New Message{unreadCount > 1 ? "s" : ""}</p>
                <p className="font-['Geist',sans-serif] text-[12px] text-[#525a70] truncate">
                  {lastMsgAttendee?.name}: "{lastMsg?.text}"
                </p>
              </div>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8H13M9 4L13 8L9 12" stroke="#E8634D" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Session Detail Panel ─────────────────────────────────────────────────────

function SessionPanel({
  session,
  saved,
  onToggleSave,
  notes,
  onSaveNote,
  qaVotes,
  onUpvote,
  onClose,
}: {
  session: Session;
  saved: boolean;
  onToggleSave: () => void;
  notes: string;
  onSaveNote: (n: string) => void;
  qaVotes: Record<string, number>;
  onUpvote: (id: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"overview" | "notes" | "qa" | "speaker">("overview");
  const [noteText, setNoteText] = useState(notes);
  const [noteSaved, setNoteSaved] = useState(false);
  const speaker = SPEAKERS.find((s) => s.id === session.speakerId);

  const handleSaveNote = () => {
    onSaveNote(noteText);
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 1500);
  };

  const TABS: { id: "overview" | "notes" | "qa" | "speaker"; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "notes", label: "Notes" },
    { id: "qa", label: "Q&A" },
    ...(speaker ? [{ id: "speaker" as const, label: "Speaker" }] : []),
  ];

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-[#fdf8f3]">
      {/* Header */}
      <div className="bg-[#1b2340] px-4 pt-3 pb-4 shrink-0">
        <div className="flex items-start justify-between gap-2">
          <button onClick={onClose} className="size-8 flex items-center justify-center rounded-full bg-white/10 shrink-0" aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4L12 12" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <button onClick={onToggleSave} className={`size-8 flex items-center justify-center rounded-full shrink-0 ${saved ? "bg-[#e8634d]" : "bg-white/10"}`} aria-label={saved ? "Remove from agenda" : "Save to agenda"}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 2H12C12.5523 2 13 2.44772 13 3V14L8 11L3 14V3C3 2.44772 3.44772 2 4 2Z" stroke="white" strokeWidth="1.8" strokeLinecap="round" fill={saved ? "white" : "none"} />
            </svg>
          </button>
        </div>
        <div className="mt-3">
          <div className="flex items-center gap-2 mb-2">
            <TrackDot color={session.trackColor} />
            <span className="font-['Geist',sans-serif] text-[12px] text-white/60">{session.track}</span>
          </div>
          <p className="font-['Outfit',sans-serif] font-bold text-[20px] text-white leading-snug">{session.title}</p>
          <div className="flex items-center gap-3 mt-2 text-white/70">
            <div className="flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" /><path d="M7 4V7L9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              <span className="font-['Geist',sans-serif] text-[12px]">{session.time}{session.endTime ? ` – ${session.endTime}` : ""}</span>
            </div>
            {session.room && (
              <div className="flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M7 1C4.79 1 3 2.79 3 5C3 7.5 7 13 7 13C7 13 11 7.5 11 5C11 2.79 9.21 1 7 1Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                <span className="font-['Geist',sans-serif] text-[12px]">{session.room}</span>
              </div>
            )}
          </div>
        </div>
        {/* Tabs */}
        <div className="flex gap-1 mt-3">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded text-[12px] font-['Geist',sans-serif] font-medium transition-colors ${tab === t.id ? "bg-[#e8634d] text-white" : "bg-white/10 text-white/70"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === "overview" && (
          <div className="flex flex-col gap-4">
            <p className="font-['Geist',sans-serif] text-[15px] text-[#525a70] leading-relaxed">{session.description ?? "Session details coming soon."}</p>
            {speaker && (
              <div className="bg-white rounded-xl p-4 flex items-center gap-3">
                <Avatar src={speaker.img} alt={speaker.name} size={44} radius={12} />
                <div>
                  <p className="font-['Geist',sans-serif] font-semibold text-[14px] text-[#1b2340]">{speaker.name}</p>
                  <p className="font-['Geist',sans-serif] text-[12px] text-[#8f96a8]">{speaker.title}, {speaker.company}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "notes" && (
          <div className="flex flex-col gap-3">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Type your notes here..."
              className="w-full min-h-[200px] bg-white rounded-xl p-4 font-['Geist',sans-serif] text-[14px] text-[#1b2340] placeholder:text-[#8f96a8] border border-[#efe8e1] resize-none focus:outline-none focus:border-[#e8634d]"
            />
            <button
              onClick={handleSaveNote}
              className={`flex items-center justify-center gap-2 h-11 rounded-lg font-['Geist',sans-serif] font-bold text-[14px] transition-colors ${noteSaved ? "bg-[#5CC9A7] text-white" : "bg-[#e8634d] text-white"}`}
            >
              {noteSaved ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8L6.5 11.5L13 5" stroke="white" strokeWidth="2" strokeLinecap="round" /></svg>
                  Saved!
                </>
              ) : "Save Notes"}
            </button>
          </div>
        )}

        {tab === "qa" && (
          <div className="flex flex-col gap-3">
            {!session.qa || session.qa.length === 0 ? (
              <p className="text-[#8f96a8] font-['Geist',sans-serif] text-[14px] text-center py-8">No questions yet. Be the first to ask!</p>
            ) : (
              session.qa.map((q) => (
                <div key={q.id} className="bg-white rounded-xl p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-['Geist',sans-serif] text-[14px] text-[#1b2340] leading-snug">{q.text}</p>
                    <p className="font-['Geist',sans-serif] text-[12px] text-[#8f96a8] mt-1">{q.author}</p>
                  </div>
                  <button
                    onClick={() => onUpvote(q.id)}
                    className="flex flex-col items-center gap-0.5 shrink-0 text-[#8f96a8] hover:text-[#e8634d] transition-colors"
                    aria-label="Upvote question"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M8 12V4M4 8L8 4L12 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <span className="font-['Geist',sans-serif] font-semibold text-[11px]">{qaVotes[q.id] ?? 0}</span>
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "speaker" && speaker && (
          <div className="flex flex-col gap-4">
            <div className="bg-white rounded-xl p-4 flex flex-col items-center gap-3 text-center">
              <Avatar src={speaker.img} alt={speaker.name} size={72} radius={24} />
              <div>
                <p className="font-['Outfit',sans-serif] font-bold text-[20px] text-[#1b2340]">{speaker.name}</p>
                <p className="font-['Geist',sans-serif] text-[14px] text-[#8f96a8]">{speaker.title}</p>
                <p className="font-['Geist',sans-serif] font-semibold text-[14px] text-[#e8634d]">{speaker.company}</p>
              </div>
              {speaker.bio && <p className="font-['Geist',sans-serif] text-[14px] text-[#525a70] leading-relaxed text-left">{speaker.bio}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Agenda Screen ────────────────────────────────────────────────────────────

function AgendaScreen({
  savedSessions,
  onToggleSave,
  notes,
  onSaveNote,
  qaVotes,
  onUpvote,
}: {
  savedSessions: Set<string>;
  onToggleSave: (id: string) => void;
  notes: Record<string, string>;
  onSaveNote: (sessionId: string, n: string) => void;
  qaVotes: Record<string, number>;
  onUpvote: (qId: string) => void;
}) {
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [filter, setFilter] = useState<"all" | "saved">("all");

  const displayed = filter === "saved" ? SESSIONS.filter((s) => savedSessions.has(s.id)) : SESSIONS;

  return (
    <div className="flex-1 overflow-y-auto pb-[80px] relative">
      {selectedSession && (
        <SessionPanel
          session={selectedSession}
          saved={savedSessions.has(selectedSession.id)}
          onToggleSave={() => onToggleSave(selectedSession.id)}
          notes={notes[selectedSession.id] ?? ""}
          onSaveNote={(n) => onSaveNote(selectedSession.id, n)}
          qaVotes={qaVotes}
          onUpvote={onUpvote}
          onClose={() => setSelectedSession(null)}
        />
      )}

      <div className="px-4 pt-5 pb-3">
        <p className="font-['Outfit',sans-serif] font-bold text-[22px] text-[#1b2340]">My Agenda</p>
        <p className="font-['Geist',sans-serif] text-[13px] text-[#8f96a8]">Tuesday, March 18 · Day 2 of 3</p>
      </div>

      {/* Filter toggle */}
      <div className="flex gap-2 px-4 pb-4">
        {(["all", "saved"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-[13px] font-['Geist',sans-serif] font-medium transition-colors ${filter === f ? "bg-[#1b2340] text-white" : "bg-white border border-[#efe8e1] text-[#525a70]"}`}
          >
            {f === "all" ? "All Sessions" : "Saved"}
          </button>
        ))}
      </div>

      {displayed.length === 0 && (
        <div className="px-4 py-12 flex flex-col items-center gap-3 text-center">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none"><rect x="8" y="10" width="24" height="24" rx="4" stroke="#8F96A8" strokeWidth="2" /><path d="M14 6V14M26 6V14M8 18H32" stroke="#8F96A8" strokeWidth="2" strokeLinecap="round" /></svg>
          <p className="font-['Geist',sans-serif] font-semibold text-[16px] text-[#1b2340]">No saved sessions yet</p>
          <p className="font-['Geist',sans-serif] text-[13px] text-[#8f96a8]">Tap the bookmark on any session to save it here.</p>
          <button onClick={() => setFilter("all")} className="text-[#e8634d] font-['Geist',sans-serif] font-semibold text-[13px]">Browse all sessions</button>
        </div>
      )}

      <div className="px-4 flex flex-col gap-3">
        {displayed.map((s) => (
          <div
            key={s.id}
            onClick={() => setSelectedSession(s)}
            className="bg-white rounded-xl shadow-[0_2px_4px_rgba(27,35,64,0.04)] w-full text-left cursor-pointer"
          >
            <div className="p-4 flex gap-3">
              <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
                <span className="font-['Geist',sans-serif] font-bold text-[12px] text-[#1b2340] whitespace-nowrap">{s.time}</span>
                <div className="w-px flex-1 bg-[#efe8e1]" />
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <p className="font-['Geist',sans-serif] font-semibold text-[15px] text-[#1b2340] leading-snug">{s.title}</p>
                <div className="flex items-center gap-1.5">
                  <TrackDot color={s.trackColor} />
                  <span className="font-['Geist',sans-serif] text-[12px] text-[#8f96a8]">{s.track}</span>
                  {s.room && <><span className="text-[#efe8e1]">·</span><span className="font-['Geist',sans-serif] text-[12px] text-[#8f96a8]">{s.room}</span></>}
                </div>
                {s.speakerId && (() => {
                  const sp = SPEAKERS.find((x) => x.id === s.speakerId);
                  return sp ? (
                    <div className="flex items-center gap-1.5 mt-1">
                      <Avatar src={sp.img} alt={sp.name} size={18} radius={9} />
                      <span className="font-['Geist',sans-serif] text-[12px] text-[#525a70]">{sp.name}</span>
                    </div>
                  ) : null;
                })()}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onToggleSave(s.id); }}
                className={`size-8 flex items-center justify-center rounded-full shrink-0 ${savedSessions.has(s.id) ? "bg-[#e8634d]" : "bg-[#fdf8f3]"}`}
                aria-label={savedSessions.has(s.id) ? "Remove from saved" : "Save session"}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M4 2H12C12.5523 2 13 2.44772 13 3V14L8 11L3 14V3C3 2.44772 3.44772 2 4 2Z" stroke={savedSessions.has(s.id) ? "white" : "#8F96A8"} strokeWidth="1.8" strokeLinecap="round" fill={savedSessions.has(s.id) ? "white" : "none"} />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Discover Screen ──────────────────────────────────────────────────────────

function DiscoverScreen({
  onStartMessage,
  onScheduleMeeting,
}: {
  onStartMessage: (attendeeId: string) => void;
  onScheduleMeeting: (attendeeId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");
  const [sharedCards, setSharedCards] = useState<Set<string>>(new Set());

  const INTEREST_MAP: Record<string, string[]> = {
    "AI/ML": ["AI Agents", "AI Design"],
    "Product": ["APIs", "Developer Tools"],
    "Design": ["Design Systems", "UX", "Typography", "Prototyping"],
    "Engineering": ["Postgres", "Open Source", "Data", "Edge Computing", "Performance", "React"],
    "Open Source": ["Open Source", "Postgres"],
  };

  const results = ATTENDEES.filter((a) => {
    const q = query.toLowerCase();
    const matchQuery = !q || a.name.toLowerCase().includes(q) || a.company.toLowerCase().includes(q) || a.role.toLowerCase().includes(q) || a.interests.some((i) => i.toLowerCase().includes(q));
    const matchFilter = activeFilter === "All" || a.interests.some((i) => (INTEREST_MAP[activeFilter] ?? []).includes(i));
    return matchQuery && matchFilter;
  });

  const handleShare = (id: string) => {
    setSharedCards((prev) => new Set(prev).add(id));
    setTimeout(() => setSharedCards((prev) => { const s = new Set(prev); s.delete(id); return s; }), 2000);
  };

  return (
    <div className="flex-1 overflow-y-auto pb-[80px]">
      <div className="px-4 pt-5 pb-3">
        <p className="font-['Outfit',sans-serif] font-bold text-[22px] text-[#1b2340]">Discover</p>
        <p className="font-['Geist',sans-serif] text-[13px] text-[#8f96a8]">Find attendees to connect with</p>
      </div>

      {/* Search */}
      <div className="px-4 pb-3">
        <div className="flex items-center gap-2 bg-white border border-[#efe8e1] rounded-xl px-3 h-11">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><circle cx="9" cy="9" r="6" stroke="#8F96A8" strokeWidth="2" /><path d="M14 14L18 18" stroke="#8F96A8" strokeWidth="2" strokeLinecap="round" /></svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, company, interest..."
            className="flex-1 font-['Geist',sans-serif] text-[14px] text-[#1b2340] placeholder:text-[#8f96a8] bg-transparent focus:outline-none"
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label="Clear search">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M11 3L3 11M3 3L11 11" stroke="#8F96A8" strokeWidth="1.8" strokeLinecap="round" /></svg>
            </button>
          )}
        </div>
      </div>

      {/* Filter chips */}
      <div className="overflow-x-auto pb-3">
        <div className="flex gap-2 px-4" style={{ width: "max-content" }}>
          {DISCOVER_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-['Geist',sans-serif] font-medium whitespace-nowrap transition-colors ${activeFilter === f ? "bg-[#1b2340] text-white" : "bg-white border border-[#efe8e1] text-[#525a70]"}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {results.length === 0 ? (
        <div className="px-4 py-12 flex flex-col items-center gap-3 text-center">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none"><circle cx="18" cy="18" r="12" stroke="#8F96A8" strokeWidth="2" /><path d="M28 28L36 36" stroke="#8F96A8" strokeWidth="2" strokeLinecap="round" /></svg>
          <p className="font-['Geist',sans-serif] font-semibold text-[16px] text-[#1b2340]">No attendees found</p>
          <p className="font-['Geist',sans-serif] text-[13px] text-[#8f96a8]">Try adjusting your search or filters.</p>
          <button onClick={() => { setQuery(""); setActiveFilter("All"); }} className="text-[#e8634d] font-['Geist',sans-serif] font-semibold text-[13px]">Reset filters</button>
        </div>
      ) : (
        <div className="px-4 flex flex-col gap-3">
          {results.map((a) => (
            <div key={a.id} className="bg-white rounded-xl shadow-[0_2px_4px_rgba(27,35,64,0.04)] p-4">
              <div className="flex items-start gap-3">
                <Avatar src={a.img} alt={a.name} size={48} radius={24} />
                <div className="flex-1 min-w-0">
                  <p className="font-['Outfit',sans-serif] font-bold text-[16px] text-[#1b2340]">{a.name}</p>
                  <p className="font-['Geist',sans-serif] text-[13px] text-[#525a70]">{a.role}</p>
                  <p className="font-['Geist',sans-serif] font-medium text-[13px] text-[#e8634d]">{a.company}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className={`size-2 rounded-full ${a.available ? "bg-[#5CC9A7]" : "bg-[#8f96a8]"}`} />
                  <span className="font-['Geist',sans-serif] text-[11px] text-[#8f96a8]">{a.available ? "Available" : "Busy"}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 mt-3">
                {a.interests.map((i) => (
                  <span key={i} className="bg-[#fdf8f3] text-[#525a70] font-['Geist',sans-serif] font-medium text-[11px] px-2 py-0.5 rounded-full">{i}</span>
                ))}
              </div>

              <p className="font-['Geist',sans-serif] text-[12px] text-[#8f96a8] mt-2 italic">"{a.intent}"</p>

              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => handleShare(a.id)}
                  className={`flex-1 h-9 rounded-lg text-[12px] font-['Geist',sans-serif] font-bold flex items-center justify-center gap-1 transition-colors ${sharedCards.has(a.id) ? "bg-[#5CC9A7] text-white" : "bg-[#fdf8f3] text-[#525a70] border border-[#efe8e1]"}`}
                >
                  {sharedCards.has(a.id) ? (
                    <><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 8L6.5 11.5L13 5" stroke="white" strokeWidth="2" strokeLinecap="round" /></svg> Card Sent!</>
                  ) : (
                    <><svg width="12" height="12" viewBox="0 0 14 14" fill="none"><rect x="1" y="3" width="12" height="8" rx="2" stroke="currentColor" strokeWidth="1.5" /><path d="M4 7H10M7 5V9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg> Share Card</>
                  )}
                </button>
                <button
                  onClick={() => onStartMessage(a.id)}
                  className="flex-1 h-9 rounded-lg text-[12px] font-['Geist',sans-serif] font-bold bg-[#fdf8f3] text-[#525a70] border border-[#efe8e1] flex items-center justify-center gap-1"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M14 10C14 10.5 13.8 11 13.4 11.4C13.1 11.8 12.6 12 12 12H4L2 14V4C2 3.5 2.2 3 2.6 2.6C2.9 2.2 3.4 2 4 2H12C12.6 2 13.1 2.2 13.4 2.6C13.8 3 14 3.5 14 4V10Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                  Message
                </button>
                <button
                  onClick={() => onScheduleMeeting(a.id)}
                  className="flex-1 h-9 rounded-lg border border-[#e8634d] text-[12px] font-['Geist',sans-serif] font-bold text-[#e8634d] flex items-center justify-center gap-1"
                >
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><rect x="1" y="2" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" /><path d="M4 1V3M10 1V3M1 6H13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
                  Schedule
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Messages Screen ──────────────────────────────────────────────────────────

function MessagesScreen({
  conversations,
  onSendMessage,
}: {
  conversations: Conversation[];
  onSendMessage: (conversationId: string, text: string) => void;
}) {
  const [activeConv, setActiveConv] = useState<string>(conversations[0]?.id ?? "");
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const conv = conversations.find((c) => c.id === activeConv);
  const attendee = conv ? ATTENDEES.find((a) => a.id === conv.attendeeId) : null;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conv?.messages.length]);

  const handleSend = () => {
    if (!draft.trim() || !activeConv) return;
    onSendMessage(activeConv, draft.trim());
    setDraft("");
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Conversation list */}
      <div className="px-4 pt-4 pb-2 shrink-0">
        <p className="font-['Outfit',sans-serif] font-bold text-[22px] text-[#1b2340]">Messages</p>
      </div>
      <div className="overflow-x-auto shrink-0 pb-2">
        <div className="flex gap-2 px-4" style={{ width: "max-content" }}>
          {conversations.map((c) => {
            const a = ATTENDEES.find((x) => x.id === c.attendeeId);
            if (!a) return null;
            const last = c.messages[c.messages.length - 1];
            const unread = !last?.mine;
            return (
              <button
                key={c.id}
                onClick={() => setActiveConv(c.id)}
                className={`flex flex-col items-center gap-1 p-2 rounded-xl min-w-[68px] transition-colors ${activeConv === c.id ? "bg-[#1b2340]" : "bg-white border border-[#efe8e1]"}`}
              >
                <div className="relative">
                  <Avatar src={a.img} alt={a.name} size={40} radius={20} />
                  {unread && <span className="absolute top-0 right-0 size-2.5 bg-[#e8634d] rounded-full border-2 border-white" />}
                </div>
                <span className={`font-['Geist',sans-serif] font-medium text-[11px] whitespace-nowrap ${activeConv === c.id ? "text-white" : "text-[#525a70]"}`}>
                  {a.name.split(" ")[0]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Thread */}
      {conv && attendee ? (
        <>
          <div className="border-t border-[#efe8e1] px-4 py-2.5 flex items-center gap-2 shrink-0">
            <Avatar src={attendee.img} alt={attendee.name} size={32} radius={16} />
            <div>
              <p className="font-['Geist',sans-serif] font-semibold text-[14px] text-[#1b2340]">{attendee.name}</p>
              <p className="font-['Geist',sans-serif] text-[11px] text-[#8f96a8]">{attendee.company}</p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-2 flex flex-col gap-3 min-h-0">
            {conv.messages.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Avatar src={attendee.img} alt={attendee.name} size={48} radius={24} />
                <p className="font-['Geist',sans-serif] font-semibold text-[15px] text-[#1b2340]">Start a conversation</p>
                <p className="font-['Geist',sans-serif] text-[13px] text-[#8f96a8]">Say hi to {attendee.name}!</p>
              </div>
            )}
            {conv.messages.map((m) => (
              <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] px-3 py-2 rounded-xl ${m.mine ? "bg-[#1b2340] text-white rounded-br-sm" : "bg-white text-[#1b2340] border border-[#efe8e1] rounded-bl-sm"}`}>
                  <p className="font-['Geist',sans-serif] text-[14px] leading-snug">{m.text}</p>
                  <p className={`font-['Geist',sans-serif] text-[10px] mt-1 ${m.mine ? "text-white/50" : "text-[#8f96a8]"}`}>{m.time}</p>
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <div className="border-t border-[#efe8e1] px-4 py-3 flex items-center gap-2 shrink-0 pb-[84px]">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Type a message..."
              className="flex-1 bg-[#fdf8f3] border border-[#efe8e1] rounded-full px-4 h-10 font-['Geist',sans-serif] text-[14px] text-[#1b2340] placeholder:text-[#8f96a8] focus:outline-none focus:border-[#e8634d]"
            />
            <button
              onClick={handleSend}
              disabled={!draft.trim()}
              className="size-10 bg-[#e8634d] rounded-full flex items-center justify-center disabled:opacity-40 shrink-0"
              aria-label="Send message"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M16 9L2 2L6 9L2 16L16 9Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="white" />
              </svg>
            </button>
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="font-['Geist',sans-serif] text-[#8f96a8] text-[14px]">Select a conversation</p>
        </div>
      )}
    </div>
  );
}

// ─── Meeting Scheduling Modal ─────────────────────────────────────────────────

function MeetingModal({
  attendeeId,
  existingSlots,
  onConfirm,
  onClose,
}: {
  attendeeId: string;
  existingSlots: string[];
  onConfirm: (attendeeId: string, time: string, topic: string) => void;
  onClose: () => void;
}) {
  const attendee = ATTENDEES.find((a) => a.id === attendeeId);
  const [slot, setSlot] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  if (!attendee) return null;

  const availableSlots = MEETING_SLOTS.filter((s) => !existingSlots.includes(s));

  const handleConfirm = () => {
    if (!slot || !topic.trim()) return;
    onConfirm(attendeeId, slot, topic.trim());
    setConfirmed(true);
    setTimeout(onClose, 1500);
  };

  return (
    <div className="absolute inset-0 z-50 flex items-end bg-black/40" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full bg-white rounded-t-2xl max-h-[85vh] overflow-y-auto">
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <p className="font-['Outfit',sans-serif] font-bold text-[18px] text-[#1b2340]">Schedule Meeting</p>
          <button onClick={onClose} className="size-8 flex items-center justify-center rounded-full bg-[#fdf8f3]" aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M11 3L3 11M3 3L11 11" stroke="#8F96A8" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="px-4 pb-2 flex items-center gap-3">
          <Avatar src={attendee.img} alt={attendee.name} size={40} radius={20} />
          <div>
            <p className="font-['Geist',sans-serif] font-semibold text-[14px] text-[#1b2340]">{attendee.name}</p>
            <p className="font-['Geist',sans-serif] text-[12px] text-[#8f96a8]">{attendee.company}</p>
          </div>
        </div>

        {confirmed ? (
          <div className="px-4 py-8 flex flex-col items-center gap-3 text-center">
            <div className="size-14 bg-[#5CC9A7]/10 rounded-full flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M5 14L11 20L23 8" stroke="#5CC9A7" strokeWidth="2.5" strokeLinecap="round" /></svg>
            </div>
            <p className="font-['Outfit',sans-serif] font-bold text-[18px] text-[#1b2340]">Meeting Scheduled!</p>
            <p className="font-['Geist',sans-serif] text-[13px] text-[#525a70]">{slot} · {topic}</p>
          </div>
        ) : (
          <div className="px-4 pb-6 flex flex-col gap-4">
            {availableSlots.length === 0 ? (
              <div className="py-6 text-center">
                <p className="font-['Geist',sans-serif] font-semibold text-[15px] text-[#1b2340]">No available slots</p>
                <p className="font-['Geist',sans-serif] text-[13px] text-[#8f96a8] mt-1">All time slots are taken. Please check back later.</p>
                <button onClick={onClose} className="mt-4 px-6 h-10 bg-[#1b2340] text-white rounded-lg font-['Geist',sans-serif] font-bold text-[14px]">Close</button>
              </div>
            ) : (
              <>
                <div>
                  <p className="font-['Geist',sans-serif] font-semibold text-[13px] text-[#525a70] mb-2">Select a time slot</p>
                  <div className="grid grid-cols-3 gap-2">
                    {availableSlots.map((s) => (
                      <button
                        key={s}
                        onClick={() => setSlot(s)}
                        className={`h-10 rounded-lg text-[13px] font-['Geist',sans-serif] font-medium transition-colors ${slot === s ? "bg-[#1b2340] text-white" : "bg-[#fdf8f3] text-[#525a70] border border-[#efe8e1]"}`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="font-['Geist',sans-serif] font-semibold text-[13px] text-[#525a70] mb-2">Meeting topic</p>
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g. API collaboration ideas"
                    className="w-full bg-[#fdf8f3] border border-[#efe8e1] rounded-xl px-4 h-11 font-['Geist',sans-serif] text-[14px] text-[#1b2340] placeholder:text-[#8f96a8] focus:outline-none focus:border-[#e8634d]"
                  />
                </div>
                <button
                  onClick={handleConfirm}
                  disabled={!slot || !topic.trim()}
                  className="h-12 bg-[#e8634d] text-white rounded-xl font-['Geist',sans-serif] font-bold text-[15px] disabled:opacity-40 transition-opacity"
                >
                  Confirm Meeting
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Network Screen ───────────────────────────────────────────────────────────

function NetworkScreen({
  conversations,
  appointments,
  onScheduleMeeting,
  onStartMessage,
}: {
  conversations: Conversation[];
  appointments: Appointment[];
  onScheduleMeeting: (id: string) => void;
  onStartMessage: (id: string) => void;
}) {
  const [tab, setTab] = useState<"contacts" | "appointments">("contacts");
  const contacts = ATTENDEES.filter((a) => conversations.some((c) => c.attendeeId === a.id));

  return (
    <div className="flex-1 overflow-y-auto pb-[80px]">
      <div className="px-4 pt-5 pb-3">
        <p className="font-['Outfit',sans-serif] font-bold text-[22px] text-[#1b2340]">Network</p>
        <p className="font-['Geist',sans-serif] text-[13px] text-[#8f96a8]">Your connections and appointments</p>
      </div>

      <div className="flex gap-2 px-4 pb-4">
        {(["contacts", "appointments"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-full text-[13px] font-['Geist',sans-serif] font-medium capitalize transition-colors ${tab === t ? "bg-[#1b2340] text-white" : "bg-white border border-[#efe8e1] text-[#525a70]"}`}
          >
            {t === "contacts" ? `Contacts (${contacts.length})` : `Appointments (${appointments.length})`}
          </button>
        ))}
      </div>

      {tab === "contacts" && (
        <div className="px-4 flex flex-col gap-3">
          {contacts.length === 0 && (
            <p className="font-['Geist',sans-serif] text-[#8f96a8] text-[14px] py-6 text-center">No contacts yet. Connect with attendees in Discover!</p>
          )}
          {contacts.map((a) => (
            <div key={a.id} className="bg-white rounded-xl p-4 flex items-center gap-3">
              <div className="relative">
                <Avatar src={a.img} alt={a.name} size={48} radius={24} />
                <span className={`absolute bottom-0 right-0 size-3 rounded-full border-2 border-white ${a.available ? "bg-[#5CC9A7]" : "bg-[#8f96a8]"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-['Outfit',sans-serif] font-bold text-[15px] text-[#1b2340]">{a.name}</p>
                <p className="font-['Geist',sans-serif] text-[12px] text-[#8f96a8]">{a.role} · {a.company}</p>
                <div className="flex gap-1 mt-1 flex-wrap">
                  {a.interests.slice(0, 2).map((i) => (
                    <span key={i} className="bg-[#fdf8f3] text-[#525a70] font-['Geist',sans-serif] text-[10px] px-1.5 py-0.5 rounded-full">{i}</span>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <button
                  onClick={() => onStartMessage(a.id)}
                  className="size-9 bg-[#fdf8f3] border border-[#efe8e1] rounded-lg flex items-center justify-center"
                  aria-label="Message"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M14 10C14 10.5 13.8 11 13.4 11.4C13.1 11.8 12.6 12 12 12H4L2 14V4C2 3.5 2.2 3 2.6 2.6C2.9 2.2 3.4 2 4 2H12C12.6 2 13.1 2.2 13.4 2.6C13.8 3 14 3.5 14 4V10Z" stroke="#525A70" strokeWidth="1.5" strokeLinecap="round" /></svg>
                </button>
                <button
                  onClick={() => onScheduleMeeting(a.id)}
                  className="size-9 bg-[rgba(232,99,77,0.08)] rounded-lg flex items-center justify-center"
                  aria-label="Schedule meeting"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="11" rx="2" stroke="#E8634D" strokeWidth="1.5" /><path d="M5 2V4M11 2V4M2 7H14" stroke="#E8634D" strokeWidth="1.3" strokeLinecap="round" /></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "appointments" && (
        <div className="px-4 flex flex-col gap-3">
          {appointments.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none"><rect x="6" y="8" width="28" height="26" rx="4" stroke="#8F96A8" strokeWidth="2" /><path d="M12 4V12M28 4V12M6 18H34" stroke="#8F96A8" strokeWidth="2" strokeLinecap="round" /></svg>
              <p className="font-['Geist',sans-serif] font-semibold text-[15px] text-[#1b2340]">No appointments scheduled</p>
              <p className="font-['Geist',sans-serif] text-[13px] text-[#8f96a8]">Use Discover to schedule meetings with attendees.</p>
            </div>
          )}
          {appointments.map((apt) => {
            const person = ATTENDEES.find((a) => a.id === apt.attendeeId);
            if (!person) return null;
            return (
              <div key={apt.id} className="bg-white rounded-xl p-4 flex items-center gap-3">
                <div className="bg-[rgba(232,99,77,0.08)] text-[#e8634d] font-['Geist',sans-serif] font-bold text-[13px] px-3 py-2 rounded-lg shrink-0 text-center min-w-[72px]">{apt.time}</div>
                <Avatar src={person.img} alt={person.name} size={40} radius={20} />
                <div className="flex-1 min-w-0">
                  <p className="font-['Geist',sans-serif] font-bold text-[14px] text-[#1b2340]">{person.name}</p>
                  <p className="font-['Geist',sans-serif] text-[12px] text-[#525a70] truncate">Topic: {apt.topic}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [activeEvent, setActiveEvent] = useState<Event>(EVENTS[0]);
  const [savedSessions, setSavedSessions] = useState<Set<string>>(new Set(["s0"]));
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [qaVotes, setQaVotes] = useState<Record<string, number>>({});
  const [conversations, setConversations] = useState<Conversation[]>(INITIAL_CONVERSATIONS);
  const [appointments, setAppointments] = useState<Appointment[]>(INITIAL_APPOINTMENTS);
  const [homeSelectedSession, setHomeSelectedSession] = useState<Session | null>(null);
  const [meetingModalAttendeeId, setMeetingModalAttendeeId] = useState<string | null>(null);

  const toggleSave = (id: string) => {
    setSavedSessions((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const saveNote = (sessionId: string, text: string) => {
    setNotes((prev) => ({ ...prev, [sessionId]: text }));
  };

  const upvoteQA = (qId: string) => {
    setQaVotes((prev) => ({ ...prev, [qId]: (prev[qId] ?? 0) + 1 }));
  };

  const sendMessage = (convId: string, text: string) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === convId
          ? { ...c, messages: [...c.messages, { id: `m${Date.now()}`, from: "me", text, time: "Now", mine: true }] }
          : c
      )
    );
  };

  const startMessage = (attendeeId: string) => {
    const existingConv = conversations.find((c) => c.attendeeId === attendeeId);
    if (!existingConv) {
      setConversations((prev) => [...prev, { id: `c${Date.now()}`, attendeeId, messages: [] }]);
    }
    setActiveTab("messages");
  };

  const scheduleMeeting = (attendeeId: string, time: string, topic: string) => {
    setAppointments((prev) => [...prev, { id: `a${Date.now()}`, time, attendeeId, topic }]);
  };

  const unreadMessages = conversations.some((c) => {
    const last = c.messages[c.messages.length - 1];
    return last && !last.mine;
  });

  return (
    <div className="min-h-screen bg-[#1b2340] flex items-center justify-center p-0 sm:p-6">
      {/* Phone frame */}
      <div className="relative w-full sm:w-[390px] h-screen sm:h-[844px] bg-[#fdf8f3] overflow-hidden sm:rounded-[40px] sm:shadow-2xl flex flex-col">
        <StatusBar />

        <div className="flex-1 flex flex-col overflow-hidden relative">
          {/* Screen content */}
          {activeTab === "home" && (
            <HomeScreen
              event={activeEvent}
              events={EVENTS}
              onEventChange={setActiveEvent}
              savedSessions={savedSessions}
              onToggleSave={toggleSave}
              appointments={appointments}
              conversations={conversations}
              onNavigate={setActiveTab}
              onOpenSession={setHomeSelectedSession}
            />
          )}
          {activeTab === "agenda" && (
            <AgendaScreen
              savedSessions={savedSessions}
              onToggleSave={toggleSave}
              notes={notes}
              onSaveNote={saveNote}
              qaVotes={qaVotes}
              onUpvote={upvoteQA}
            />
          )}
          {activeTab === "discover" && (
            <DiscoverScreen
              onStartMessage={startMessage}
              onScheduleMeeting={(id) => setMeetingModalAttendeeId(id)}
            />
          )}
          {activeTab === "messages" && (
            <MessagesScreen
              conversations={conversations}
              onSendMessage={sendMessage}
            />
          )}
          {activeTab === "network" && (
            <NetworkScreen
              conversations={conversations}
              appointments={appointments}
              onScheduleMeeting={(id) => setMeetingModalAttendeeId(id)}
              onStartMessage={startMessage}
            />
          )}

          {/* Home session panel overlay */}
          {homeSelectedSession && (
            <SessionPanel
              session={homeSelectedSession}
              saved={savedSessions.has(homeSelectedSession.id)}
              onToggleSave={() => toggleSave(homeSelectedSession.id)}
              notes={notes[homeSelectedSession.id] ?? ""}
              onSaveNote={(n) => saveNote(homeSelectedSession.id, n)}
              qaVotes={qaVotes}
              onUpvote={upvoteQA}
              onClose={() => setHomeSelectedSession(null)}
            />
          )}

          {/* Meeting modal */}
          {meetingModalAttendeeId && (
            <MeetingModal
              attendeeId={meetingModalAttendeeId}
              existingSlots={appointments.map((a) => a.time)}
              onConfirm={scheduleMeeting}
              onClose={() => setMeetingModalAttendeeId(null)}
            />
          )}

          <BottomNav active={activeTab} onChange={setActiveTab} unreadMessages={unreadMessages} />
        </div>
      </div>
    </div>
  );
}
