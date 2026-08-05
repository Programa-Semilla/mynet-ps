import svgPaths from "./svg-8m04ju62cw";
import imgAvatarImg from "./124033ba92a8dda677fb9feedff6f0461677c8c2.png";
import imgAvatarImg1 from "./612a68df98fa7b3c5c535ec4ddfec8c07d7e9542.png";
import imgAvatarImg2 from "./de297827f9ec6c594405bd444c7b041ee1d8864a.png";
import imgAvatarImg3 from "./5a095ec5ffecae6a2443601431769995dbf66586.png";
import imgAvatarImg4 from "./3fe2ad390532c1282995803567b3554a6c453927.png";

function IosSignal() {
  return (
    <div className="h-[11px] relative shrink-0 w-[17px]" data-name="ios-signal">
      <svg className="absolute block inset-0 size-full" fill="none" height="11" preserveAspectRatio="none" viewBox="0 0 17 11" width="17">
        <g id="ios-signal">
          <path clipRule="evenodd" d={svgPaths.p2d6ad970} fill="white" fillRule="evenodd" id="Vector" />
        </g>
      </svg>
    </div>
  );
}

function IosWifiSignal() {
  return (
    <div className="h-[11px] relative shrink-0 w-[15px]" data-name="ios-wifi-signal">
      <svg className="absolute block inset-0 size-full" fill="none" height="11" preserveAspectRatio="none" viewBox="0 0 15 11" width="15">
        <g id="ios-wifi-signal">
          <path clipRule="evenodd" d={svgPaths.p190a1500} fill="white" fillRule="evenodd" id="Vector" />
        </g>
      </svg>
    </div>
  );
}

function IosBatteryFull() {
  return (
    <div className="h-[12px] relative shrink-0 w-[25px]" data-name="ios-battery-full">
      <svg className="absolute block inset-0 size-full" fill="none" height="12" preserveAspectRatio="none" viewBox="0 0 25 12" width="25">
        <g id="ios-battery-full">
          <path d={svgPaths.pde03700} fill="white" id="Vector" />
        </g>
      </svg>
    </div>
  );
}

function Frame() {
  return (
    <div className="content-stretch flex gap-[6px] items-center relative shrink-0" data-name="Frame">
      <IosSignal />
      <IosWifiSignal />
      <IosBatteryFull />
    </div>
  );
}

function StatusBar() {
  return (
    <div className="bg-[#1b2340] h-[40px] relative shrink-0 w-full" data-name="status-bar">
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex items-center justify-between px-[20px] relative size-full">
          <p className="[word-break:break-word] font-['Geist:SemiBold',sans-serif] font-semibold leading-[normal] relative shrink-0 text-[15px] text-white whitespace-nowrap">9:41</p>
          <Frame />
        </div>
      </div>
    </div>
  );
}

function ChevronDown() {
  return (
    <div className="relative shrink-0 size-[14px]" data-name="chevron-down">
      <svg className="absolute block inset-0 size-full" fill="none" height="14" preserveAspectRatio="none" viewBox="0 0 14 14" width="14">
        <g id="chevron-down">
          <path d="M3.5 5.25L7 8.75L10.5 5.25" id="Vector" stroke="#E8634D" strokeLinecap="round" strokeWidth="2" />
        </g>
      </svg>
    </div>
  );
}

function Frame1() {
  return (
    <div className="content-stretch flex gap-[4px] items-center relative shrink-0 w-full" data-name="Frame">
      <p className="[word-break:break-word] font-['Outfit:Bold',sans-serif] font-bold leading-[normal] overflow-hidden relative shrink-0 text-[15px] text-ellipsis text-white whitespace-nowrap">TechConnect Summit 2026</p>
      <ChevronDown />
    </div>
  );
}

function LocationBadge() {
  return (
    <div className="bg-[rgba(255,255,255,0.11)] content-stretch flex items-start px-[6px] py-[2px] relative rounded-[4px] shrink-0" data-name="location-badge">
      <p className="[word-break:break-word] font-['Geist:Medium',sans-serif] font-medium leading-[normal] relative shrink-0 text-[11px] text-white whitespace-nowrap">SF, CA</p>
    </div>
  );
}

function EventSelector() {
  return (
    <div className="content-stretch flex flex-col gap-[2px] items-start relative shrink-0 w-[240px]" data-name="event-selector">
      <Frame1 />
      <LocationBadge />
    </div>
  );
}

function NotificationTrigger() {
  return (
    <div className="relative shrink-0 size-[40px]" data-name="notification-trigger">
      <svg className="absolute block inset-0 size-full" fill="none" height="40" preserveAspectRatio="none" viewBox="0 0 40 40" width="40">
        <g id="notification-trigger">
          <rect fill="white" fillOpacity="0.0627451" height="40" rx="20" width="40" />
          <g id="bell">
            <path d={svgPaths.pf528000} id="Vector" stroke="white" strokeLinecap="round" strokeWidth="2" />
          </g>
          <circle cx="26" cy="14" fill="#E8634D" id="Ellipse" r="4" />
        </g>
      </svg>
    </div>
  );
}

function Header() {
  return (
    <div className="bg-[#1b2340] h-[64px] relative shrink-0 w-full" data-name="header">
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex items-center justify-between px-[16px] relative size-full">
          <EventSelector />
          <NotificationTrigger />
        </div>
      </div>
    </div>
  );
}

function Frame2() {
  return (
    <div className="content-stretch flex gap-[6px] items-center relative shrink-0" data-name="Frame">
      <p className="[word-break:break-word] font-['Geist:Medium',sans-serif] font-medium leading-[normal] relative shrink-0 text-[#525a70] text-[14px] whitespace-nowrap">Tuesday, March 18</p>
      <div className="bg-[#8f96a8] relative rounded-[2px] shrink-0 size-[4px]" data-name="Rectangle" />
      <p className="[word-break:break-word] font-['Geist:SemiBold',sans-serif] font-semibold leading-[normal] relative shrink-0 text-[#e8634d] text-[14px] whitespace-nowrap">Day 2 of 3</p>
    </div>
  );
}

function GreetingSection() {
  return (
    <div className="relative shrink-0 w-full" data-name="greeting-section">
      <div className="content-stretch flex flex-col gap-[4px] items-start px-[16px] relative size-full">
        <p className="[word-break:break-word] font-['Outfit:ExtraBold',sans-serif] font-extrabold leading-[normal] min-w-full relative shrink-0 text-[#1b2340] text-[26px] w-[min-content]">Good morning, Sarah</p>
        <Frame2 />
      </div>
    </div>
  );
}

function Frame4() {
  return (
    <div className="bg-[rgba(232,99,77,0.08)] content-stretch flex items-start px-[8px] py-[4px] relative rounded-[6px] shrink-0" data-name="Frame">
      <p className="[word-break:break-word] font-['Geist:Bold',sans-serif] font-bold leading-[normal] relative shrink-0 text-[#e8634d] text-[11px] uppercase whitespace-nowrap">UP NEXT</p>
    </div>
  );
}

function Frame5() {
  return (
    <div className="content-stretch flex gap-[6px] items-center relative shrink-0" data-name="Frame">
      <div className="relative shrink-0 size-[6px]" data-name="Ellipse">
        <svg className="absolute block inset-0 size-full" fill="none" height="6" preserveAspectRatio="none" viewBox="0 0 6 6" width="6">
          <circle cx="3" cy="3" fill="#5CC9A7" id="Ellipse" r="3" />
        </svg>
      </div>
      <p className="[word-break:break-word] font-['Geist:SemiBold',sans-serif] font-semibold leading-[normal] relative shrink-0 text-[#525a70] text-[12px] whitespace-nowrap">Starts in 15m</p>
    </div>
  );
}

function Frame3() {
  return (
    <div className="content-stretch flex items-center justify-between relative shrink-0 w-full" data-name="Frame">
      <Frame4 />
      <Frame5 />
    </div>
  );
}

function Clock() {
  return (
    <div className="relative shrink-0 size-[14px]" data-name="clock">
      <svg className="absolute block inset-0 size-full" fill="none" height="14" preserveAspectRatio="none" viewBox="0 0 14 14" width="14">
        <g clipPath="url(#clip0_0_30)" id="clock">
          <path d={svgPaths.p3da783c0} id="Vector" stroke="#8F96A8" strokeLinecap="round" strokeWidth="2" />
        </g>
        <defs>
          <clipPath id="clip0_0_30">
            <rect fill="white" height="14" width="14" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Frame8() {
  return (
    <div className="content-stretch flex gap-[6px] items-center relative shrink-0" data-name="Frame">
      <Clock />
      <p className="[word-break:break-word] font-['Geist:Regular',sans-serif] font-normal leading-[normal] relative shrink-0 text-[#525a70] text-[13px] whitespace-nowrap">10:30 – 11:15 AM</p>
    </div>
  );
}

function MapPin() {
  return (
    <div className="relative shrink-0 size-[14px]" data-name="map-pin">
      <svg className="absolute block inset-0 size-full" fill="none" height="14" preserveAspectRatio="none" viewBox="0 0 14 14" width="14">
        <g id="map-pin">
          <path d={svgPaths.p1b8a0e00} id="Vector" stroke="#8F96A8" strokeLinecap="round" strokeWidth="2" />
        </g>
      </svg>
    </div>
  );
}

function Frame9() {
  return (
    <div className="content-stretch flex gap-[6px] items-center relative shrink-0" data-name="Frame">
      <MapPin />
      <p className="[word-break:break-word] font-['Geist:Regular',sans-serif] font-normal leading-[normal] relative shrink-0 text-[#525a70] text-[13px] whitespace-nowrap">Main Hall A</p>
    </div>
  );
}

function Frame7() {
  return (
    <div className="content-stretch flex gap-[16px] items-center relative shrink-0" data-name="Frame">
      <Frame8 />
      <Frame9 />
    </div>
  );
}

function Frame6() {
  return (
    <div className="content-stretch flex flex-col gap-[8px] items-start relative shrink-0 w-full" data-name="Frame">
      <p className="[word-break:break-word] font-['Outfit:Bold',sans-serif] font-bold leading-[1.3] min-w-full relative shrink-0 text-[#1b2340] text-[20px] w-[min-content]">The Future of AI in Product Design</p>
      <Frame7 />
    </div>
  );
}

function Avatar() {
  return (
    <div className="content-stretch flex flex-col items-center justify-center overflow-clip relative rounded-[16px] shrink-0 size-[32px]" data-name="avatar">
      <div className="flex-[1_0_0] min-h-px relative w-full" data-name="avatar-img">
        <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgAvatarImg} />
      </div>
    </div>
  );
}

function Frame11() {
  return (
    <div className="[word-break:break-word] content-stretch flex flex-[1_0_0] flex-col gap-[2px] items-start leading-[normal] min-w-px relative whitespace-nowrap" data-name="Frame">
      <p className="font-['Geist:SemiBold',sans-serif] font-semibold relative shrink-0 text-[#1b2340] text-[14px]">Marcus Aurelius</p>
      <p className="font-['Geist:Regular',sans-serif] font-normal relative shrink-0 text-[#8f96a8] text-[12px]">Principal Designer, Creative Systems</p>
    </div>
  );
}

function Frame10() {
  return (
    <div className="content-stretch flex gap-[10px] items-center py-[8px] relative shrink-0 w-full" data-name="Frame">
      <div aria-hidden className="absolute border-[#efe8e1] border-solid border-t inset-0 pointer-events-none" />
      <Avatar />
      <Frame11 />
    </div>
  );
}

function JoinButton() {
  return (
    <div className="bg-[#e8634d] content-stretch flex h-[44px] items-center justify-center relative rounded-[8px] shrink-0 w-full" data-name="join-button">
      <p className="[word-break:break-word] font-['Geist:Bold',sans-serif] font-bold leading-[normal] relative shrink-0 text-[14px] text-white whitespace-nowrap">Join Session</p>
    </div>
  );
}

function UpNextCard() {
  return (
    <div className="bg-white drop-shadow-[0px_4px_8px_rgba(27,35,64,0.05)] relative rounded-[12px] shrink-0 w-full" data-name="up-next-card">
      <div className="content-stretch flex flex-col gap-[16px] items-start p-[16px] relative size-full">
        <Frame3 />
        <Frame6 />
        <Frame10 />
        <JoinButton />
      </div>
    </div>
  );
}

function UpNextSection() {
  return (
    <div className="relative shrink-0 w-full" data-name="up-next-section">
      <div className="content-stretch flex flex-col items-start px-[16px] relative size-full">
        <UpNextCard />
      </div>
    </div>
  );
}

function ChevronRight() {
  return (
    <div className="relative shrink-0 size-[12px]" data-name="chevron-right">
      <svg className="absolute block inset-0 size-full" fill="none" height="12" preserveAspectRatio="none" viewBox="0 0 12 12" width="12">
        <g id="chevron-right">
          <path d="M4.5 9L7.5 6L4.5 3" id="Vector" stroke="#E8634D" strokeLinecap="round" strokeWidth="2" />
        </g>
      </svg>
    </div>
  );
}

function Frame12() {
  return (
    <div className="content-stretch flex gap-[4px] items-center px-[8px] py-[6px] relative shrink-0" data-name="Frame">
      <p className="[word-break:break-word] font-['Geist:SemiBold',sans-serif] font-semibold leading-[normal] relative shrink-0 text-[#e8634d] text-[13px] whitespace-nowrap">View Agenda</p>
      <ChevronRight />
    </div>
  );
}

function SectionHeader() {
  return (
    <div className="relative shrink-0 w-full" data-name="section-header">
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex items-center justify-between pb-[4px] pt-[12px] px-[16px] relative size-full">
          <p className="[word-break:break-word] font-['Outfit:Bold',sans-serif] font-bold leading-[normal] relative shrink-0 text-[#1b2340] text-[18px] whitespace-nowrap">{`Today's Schedule`}</p>
          <Frame12 />
        </div>
      </div>
    </div>
  );
}

function Frame14() {
  return (
    <div className="content-stretch flex gap-[4px] items-center relative shrink-0" data-name="Frame">
      <div className="relative shrink-0 size-[6px]" data-name="Ellipse">
        <svg className="absolute block inset-0 size-full" fill="none" height="6" preserveAspectRatio="none" viewBox="0 0 6 6" width="6">
          <circle cx="3" cy="3" fill="#5CC9A7" id="Ellipse" r="3" />
        </svg>
      </div>
      <p className="[word-break:break-word] font-['Geist:Regular',sans-serif] font-normal leading-[normal] relative shrink-0 text-[#8f96a8] text-[11px] whitespace-nowrap">Product</p>
    </div>
  );
}

function Frame13() {
  return (
    <div className="content-stretch flex flex-[1_0_0] flex-col gap-[2px] items-start min-w-px relative" data-name="Frame">
      <p className="[word-break:break-word] font-['Geist:SemiBold',sans-serif] font-semibold leading-[normal] min-w-full overflow-hidden relative shrink-0 text-[#1b2340] text-[14px] text-ellipsis w-[min-content] whitespace-nowrap">Scale and Growth Panel</p>
      <Frame14 />
    </div>
  );
}

function TimelineRow() {
  return (
    <div className="bg-white relative rounded-[8px] shrink-0 w-full" data-name="timeline-row-0">
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex gap-[12px] items-center p-[12px] relative size-full">
          <p className="[word-break:break-word] font-['Geist:Bold',sans-serif] font-bold leading-[normal] relative shrink-0 text-[#1b2340] text-[13px] w-[72px]">11:30 AM</p>
          <div className="bg-[#efe8e1] h-[24px] relative shrink-0 w-px" data-name="Rectangle" />
          <Frame13 />
        </div>
      </div>
    </div>
  );
}

function Frame16() {
  return (
    <div className="content-stretch flex gap-[4px] items-center relative shrink-0" data-name="Frame">
      <div className="relative shrink-0 size-[6px]" data-name="Ellipse">
        <svg className="absolute block inset-0 size-full" fill="none" height="6" preserveAspectRatio="none" viewBox="0 0 6 6" width="6">
          <circle cx="3" cy="3" fill="#E8634D" id="Ellipse" r="3" />
        </svg>
      </div>
      <p className="[word-break:break-word] font-['Geist:Regular',sans-serif] font-normal leading-[normal] relative shrink-0 text-[#8f96a8] text-[11px] whitespace-nowrap">Main Event</p>
    </div>
  );
}

function Frame15() {
  return (
    <div className="content-stretch flex flex-[1_0_0] flex-col gap-[2px] items-start min-w-px relative" data-name="Frame">
      <p className="[word-break:break-word] font-['Geist:SemiBold',sans-serif] font-semibold leading-[normal] min-w-full overflow-hidden relative shrink-0 text-[#1b2340] text-[14px] text-ellipsis w-[min-content] whitespace-nowrap">{`Lunch & Structured Networking`}</p>
      <Frame16 />
    </div>
  );
}

function TimelineRow1() {
  return (
    <div className="bg-white relative rounded-[8px] shrink-0 w-full" data-name="timeline-row-1">
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex gap-[12px] items-center p-[12px] relative size-full">
          <p className="[word-break:break-word] font-['Geist:Bold',sans-serif] font-bold leading-[normal] relative shrink-0 text-[#1b2340] text-[13px] w-[72px]">1:00 PM</p>
          <div className="bg-[#efe8e1] h-[24px] relative shrink-0 w-px" data-name="Rectangle" />
          <Frame15 />
        </div>
      </div>
    </div>
  );
}

function Frame18() {
  return (
    <div className="content-stretch flex gap-[4px] items-center relative shrink-0" data-name="Frame">
      <div className="relative shrink-0 size-[6px]" data-name="Ellipse">
        <svg className="absolute block inset-0 size-full" fill="none" height="6" preserveAspectRatio="none" viewBox="0 0 6 6" width="6">
          <circle cx="3" cy="3" fill="#5D9CEC" id="Ellipse" r="3" />
        </svg>
      </div>
      <p className="[word-break:break-word] font-['Geist:Regular',sans-serif] font-normal leading-[normal] relative shrink-0 text-[#8f96a8] text-[11px] whitespace-nowrap">Tech</p>
    </div>
  );
}

function Frame17() {
  return (
    <div className="content-stretch flex flex-[1_0_0] flex-col gap-[2px] items-start min-w-px relative" data-name="Frame">
      <p className="[word-break:break-word] font-['Geist:SemiBold',sans-serif] font-semibold leading-[normal] min-w-full overflow-hidden relative shrink-0 text-[#1b2340] text-[14px] text-ellipsis w-[min-content] whitespace-nowrap">Interactive Workshop: Prompting</p>
      <Frame18 />
    </div>
  );
}

function TimelineRow2() {
  return (
    <div className="bg-white relative rounded-[8px] shrink-0 w-full" data-name="timeline-row-2">
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex gap-[12px] items-center p-[12px] relative size-full">
          <p className="[word-break:break-word] font-['Geist:Bold',sans-serif] font-bold leading-[normal] relative shrink-0 text-[#1b2340] text-[13px] w-[72px]">2:30 PM</p>
          <div className="bg-[#efe8e1] h-[24px] relative shrink-0 w-px" data-name="Rectangle" />
          <Frame17 />
        </div>
      </div>
    </div>
  );
}

function Frame20() {
  return (
    <div className="content-stretch flex gap-[4px] items-center relative shrink-0" data-name="Frame">
      <div className="relative shrink-0 size-[6px]" data-name="Ellipse">
        <svg className="absolute block inset-0 size-full" fill="none" height="6" preserveAspectRatio="none" viewBox="0 0 6 6" width="6">
          <circle cx="3" cy="3" fill="#967ADC" id="Ellipse" r="3" />
        </svg>
      </div>
      <p className="[word-break:break-word] font-['Geist:Regular',sans-serif] font-normal leading-[normal] relative shrink-0 text-[#8f96a8] text-[11px] whitespace-nowrap">Keynote</p>
    </div>
  );
}

function Frame19() {
  return (
    <div className="content-stretch flex flex-[1_0_0] flex-col gap-[2px] items-start min-w-px relative" data-name="Frame">
      <p className="[word-break:break-word] font-['Geist:SemiBold',sans-serif] font-semibold leading-[normal] min-w-full overflow-hidden relative shrink-0 text-[#1b2340] text-[14px] text-ellipsis w-[min-content] whitespace-nowrap">Keynote: Next Gen Ecosystems</p>
      <Frame20 />
    </div>
  );
}

function TimelineRow3() {
  return (
    <div className="bg-white relative rounded-[8px] shrink-0 w-full" data-name="timeline-row-3">
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex gap-[12px] items-center p-[12px] relative size-full">
          <p className="[word-break:break-word] font-['Geist:Bold',sans-serif] font-bold leading-[normal] relative shrink-0 text-[#1b2340] text-[13px] w-[72px]">4:00 PM</p>
          <div className="bg-[#efe8e1] h-[24px] relative shrink-0 w-px" data-name="Rectangle" />
          <Frame19 />
        </div>
      </div>
    </div>
  );
}

function TimelineList() {
  return (
    <div className="relative shrink-0 w-full" data-name="timeline-list">
      <div className="content-stretch flex flex-col gap-[12px] items-start px-[16px] relative size-full">
        <TimelineRow />
        <TimelineRow1 />
        <TimelineRow2 />
        <TimelineRow3 />
      </div>
    </div>
  );
}

function ScheduleSection() {
  return (
    <div className="content-stretch flex flex-col gap-[12px] items-start relative shrink-0 w-full" data-name="schedule-section">
      <SectionHeader />
      <TimelineList />
    </div>
  );
}

function ChevronRight1() {
  return (
    <div className="relative shrink-0 size-[12px]" data-name="chevron-right">
      <svg className="absolute block inset-0 size-full" fill="none" height="12" preserveAspectRatio="none" viewBox="0 0 12 12" width="12">
        <g id="chevron-right">
          <path d="M4.5 9L7.5 6L4.5 3" id="Vector" stroke="#E8634D" strokeLinecap="round" strokeWidth="2" />
        </g>
      </svg>
    </div>
  );
}

function Frame21() {
  return (
    <div className="content-stretch flex gap-[4px] items-center px-[8px] py-[6px] relative shrink-0" data-name="Frame">
      <p className="[word-break:break-word] font-['Geist:SemiBold',sans-serif] font-semibold leading-[normal] relative shrink-0 text-[#e8634d] text-[13px] whitespace-nowrap">Discover More</p>
      <ChevronRight1 />
    </div>
  );
}

function SectionHeader1() {
  return (
    <div className="relative shrink-0 w-full" data-name="section-header">
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex items-center justify-between pb-[4px] pt-[12px] px-[16px] relative size-full">
          <p className="[word-break:break-word] font-['Outfit:Bold',sans-serif] font-bold leading-[normal] relative shrink-0 text-[#1b2340] text-[18px] whitespace-nowrap">People to Meet</p>
          <Frame21 />
        </div>
      </div>
    </div>
  );
}

function Avatar1() {
  return (
    <div className="content-stretch flex flex-col items-center justify-center overflow-clip relative rounded-[24px] shrink-0 size-[48px]" data-name="avatar">
      <div className="flex-[1_0_0] min-h-px relative w-full" data-name="avatar-img">
        <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgAvatarImg1} />
      </div>
    </div>
  );
}

function Frame22() {
  return (
    <div className="[word-break:break-word] content-stretch flex flex-col gap-[2px] items-center leading-[normal] relative shrink-0 whitespace-nowrap" data-name="Frame">
      <p className="font-['Outfit:Bold',sans-serif] font-bold relative shrink-0 text-[#1b2340] text-[15px]">Devon Webb</p>
      <p className="font-['Geist:Regular',sans-serif] font-normal relative shrink-0 text-[#8f96a8] text-[12px]">Stripe</p>
    </div>
  );
}

function Frame23() {
  return (
    <div className="bg-[#fdf8f3] content-stretch flex items-start px-[8px] py-[4px] relative rounded-[100px] shrink-0" data-name="Frame">
      <p className="[word-break:break-word] font-['Geist:Medium',sans-serif] font-medium leading-[normal] relative shrink-0 text-[#525a70] text-[11px] whitespace-nowrap">AI Agents</p>
    </div>
  );
}

function Frame24() {
  return (
    <div className="content-stretch flex h-[32px] items-center justify-center relative rounded-[6px] shrink-0 w-full" data-name="Frame">
      <div aria-hidden className="absolute border border-[#e8634d] border-solid inset-0 pointer-events-none rounded-[6px]" />
      <p className="[word-break:break-word] font-['Geist:Bold',sans-serif] font-bold leading-[normal] relative shrink-0 text-[#e8634d] text-[12px] whitespace-nowrap">Connect</p>
    </div>
  );
}

function PersonCard() {
  return (
    <div className="bg-white content-stretch drop-shadow-[0px_2px_4px_rgba(27,35,64,0.05)] flex flex-col gap-[12px] items-center p-[16px] relative rounded-[12px] shrink-0 w-[220px]" data-name="person-card-0">
      <Avatar1 />
      <Frame22 />
      <Frame23 />
      <Frame24 />
    </div>
  );
}

function Avatar2() {
  return (
    <div className="content-stretch flex flex-col items-center justify-center overflow-clip relative rounded-[24px] shrink-0 size-[48px]" data-name="avatar">
      <div className="flex-[1_0_0] min-h-px relative w-full" data-name="avatar-img">
        <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgAvatarImg2} />
      </div>
    </div>
  );
}

function Frame25() {
  return (
    <div className="[word-break:break-word] content-stretch flex flex-col gap-[2px] items-center leading-[normal] relative shrink-0 whitespace-nowrap" data-name="Frame">
      <p className="font-['Outfit:Bold',sans-serif] font-bold relative shrink-0 text-[#1b2340] text-[15px]">Srinivas Rao</p>
      <p className="font-['Geist:Regular',sans-serif] font-normal relative shrink-0 text-[#8f96a8] text-[12px]">Supabase</p>
    </div>
  );
}

function Frame26() {
  return (
    <div className="bg-[#fdf8f3] content-stretch flex items-start px-[8px] py-[4px] relative rounded-[100px] shrink-0" data-name="Frame">
      <p className="[word-break:break-word] font-['Geist:Medium',sans-serif] font-medium leading-[normal] relative shrink-0 text-[#525a70] text-[11px] whitespace-nowrap">Postgres</p>
    </div>
  );
}

function Frame27() {
  return (
    <div className="content-stretch flex h-[32px] items-center justify-center relative rounded-[6px] shrink-0 w-full" data-name="Frame">
      <div aria-hidden className="absolute border border-[#e8634d] border-solid inset-0 pointer-events-none rounded-[6px]" />
      <p className="[word-break:break-word] font-['Geist:Bold',sans-serif] font-bold leading-[normal] relative shrink-0 text-[#e8634d] text-[12px] whitespace-nowrap">Connect</p>
    </div>
  );
}

function PersonCard1() {
  return (
    <div className="bg-white content-stretch drop-shadow-[0px_2px_4px_rgba(27,35,64,0.05)] flex flex-col gap-[12px] items-center p-[16px] relative rounded-[12px] shrink-0 w-[220px]" data-name="person-card-1">
      <Avatar2 />
      <Frame25 />
      <Frame26 />
      <Frame27 />
    </div>
  );
}

function Avatar3() {
  return (
    <div className="content-stretch flex flex-col items-center justify-center overflow-clip relative rounded-[24px] shrink-0 size-[48px]" data-name="avatar">
      <div className="flex-[1_0_0] min-h-px relative w-full" data-name="avatar-img">
        <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgAvatarImg3} />
      </div>
    </div>
  );
}

function Frame28() {
  return (
    <div className="[word-break:break-word] content-stretch flex flex-col gap-[2px] items-center leading-[normal] relative shrink-0 whitespace-nowrap" data-name="Frame">
      <p className="font-['Outfit:Bold',sans-serif] font-bold relative shrink-0 text-[#1b2340] text-[15px]">Elena Rostova</p>
      <p className="font-['Geist:Regular',sans-serif] font-normal relative shrink-0 text-[#8f96a8] text-[12px]">Figma</p>
    </div>
  );
}

function Frame29() {
  return (
    <div className="bg-[#fdf8f3] content-stretch flex items-start px-[8px] py-[4px] relative rounded-[100px] shrink-0" data-name="Frame">
      <p className="[word-break:break-word] font-['Geist:Medium',sans-serif] font-medium leading-[normal] relative shrink-0 text-[#525a70] text-[11px] whitespace-nowrap">Design Systems</p>
    </div>
  );
}

function Frame30() {
  return (
    <div className="content-stretch flex h-[32px] items-center justify-center relative rounded-[6px] shrink-0 w-full" data-name="Frame">
      <div aria-hidden className="absolute border border-[#e8634d] border-solid inset-0 pointer-events-none rounded-[6px]" />
      <p className="[word-break:break-word] font-['Geist:Bold',sans-serif] font-bold leading-[normal] relative shrink-0 text-[#e8634d] text-[12px] whitespace-nowrap">Connect</p>
    </div>
  );
}

function PersonCard2() {
  return (
    <div className="bg-white content-stretch drop-shadow-[0px_2px_4px_rgba(27,35,64,0.05)] flex flex-col gap-[12px] items-center p-[16px] relative rounded-[12px] shrink-0 w-[220px]" data-name="person-card-2">
      <Avatar3 />
      <Frame28 />
      <Frame29 />
      <Frame30 />
    </div>
  );
}

function ScrollTrack() {
  return (
    <div className="relative shrink-0 w-full" data-name="scroll-track">
      <div className="overflow-clip rounded-[inherit] size-full">
        <div className="content-stretch flex gap-[12px] items-start pl-[16px] relative size-full">
          <PersonCard />
          <PersonCard1 />
          <PersonCard2 />
        </div>
      </div>
    </div>
  );
}

function NetworkingSection() {
  return (
    <div className="content-stretch flex flex-col gap-[12px] items-start relative shrink-0 w-full" data-name="networking-section">
      <SectionHeader1 />
      <ScrollTrack />
    </div>
  );
}

function ChevronRight2() {
  return (
    <div className="relative shrink-0 size-[12px]" data-name="chevron-right">
      <svg className="absolute block inset-0 size-full" fill="none" height="12" preserveAspectRatio="none" viewBox="0 0 12 12" width="12">
        <g id="chevron-right">
          <path d="M4.5 9L7.5 6L4.5 3" id="Vector" stroke="#E8634D" strokeLinecap="round" strokeWidth="2" />
        </g>
      </svg>
    </div>
  );
}

function Frame31() {
  return (
    <div className="content-stretch flex gap-[4px] items-center px-[8px] py-[6px] relative shrink-0" data-name="Frame">
      <p className="[word-break:break-word] font-['Geist:SemiBold',sans-serif] font-semibold leading-[normal] relative shrink-0 text-[#e8634d] text-[13px] whitespace-nowrap">All Meetings</p>
      <ChevronRight2 />
    </div>
  );
}

function SectionHeader2() {
  return (
    <div className="relative shrink-0 w-full" data-name="section-header">
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex items-center justify-between pb-[4px] pt-[12px] px-[16px] relative size-full">
          <p className="[word-break:break-word] font-['Outfit:Bold',sans-serif] font-bold leading-[normal] relative shrink-0 text-[#1b2340] text-[18px] whitespace-nowrap">My Appointments</p>
          <Frame31 />
        </div>
      </div>
    </div>
  );
}

function Frame32() {
  return (
    <div className="bg-[rgba(232,99,77,0.08)] content-stretch flex flex-col items-center px-[8px] py-[6px] relative rounded-[6px] shrink-0" data-name="Frame">
      <p className="[word-break:break-word] font-['Geist:Bold',sans-serif] font-bold leading-[normal] relative shrink-0 text-[#e8634d] text-[12px] whitespace-nowrap">3:30 PM</p>
    </div>
  );
}

function Avatar4() {
  return (
    <div className="content-stretch flex flex-col items-center justify-center overflow-clip relative rounded-[18px] shrink-0 size-[36px]" data-name="avatar">
      <div className="flex-[1_0_0] min-h-px relative w-full" data-name="avatar-img">
        <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgAvatarImg4} />
      </div>
    </div>
  );
}

function Frame33() {
  return (
    <div className="[word-break:break-word] content-stretch flex flex-[1_0_0] flex-col gap-[2px] items-start leading-[normal] min-w-px relative whitespace-nowrap" data-name="Frame">
      <p className="font-['Geist:Bold',sans-serif] font-bold relative shrink-0 text-[#1b2340] text-[13px]">Meeting with Aris Thorne</p>
      <p className="font-['Geist:Regular',sans-serif] font-normal min-w-full overflow-hidden relative shrink-0 text-[#525a70] text-[12px] text-ellipsis w-[min-content]">Topic: API Integration Review</p>
    </div>
  );
}

function MeetingCard() {
  return (
    <div className="bg-white relative rounded-[8px] shrink-0 w-full" data-name="meeting-card-0">
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex gap-[12px] items-center p-[12px] relative size-full">
          <Frame32 />
          <Avatar4 />
          <Frame33 />
        </div>
      </div>
    </div>
  );
}

function AppointmentsList() {
  return (
    <div className="relative shrink-0 w-full" data-name="appointments-list">
      <div className="content-stretch flex flex-col items-start px-[16px] relative size-full">
        <MeetingCard />
      </div>
    </div>
  );
}

function AppointmentsSection() {
  return (
    <div className="content-stretch flex flex-col gap-[12px] items-start relative shrink-0 w-full" data-name="appointments-section">
      <SectionHeader2 />
      <AppointmentsList />
    </div>
  );
}

function MessageSquare() {
  return (
    <div className="relative shrink-0 size-[18px]" data-name="message-square">
      <svg className="absolute block inset-0 size-full" fill="none" height="18" preserveAspectRatio="none" viewBox="0 0 18 18" width="18">
        <g id="message-square">
          <path d={svgPaths.p1ff538f0} id="Vector" stroke="#E8634D" strokeLinecap="round" strokeWidth="2" />
        </g>
      </svg>
    </div>
  );
}

function Frame34() {
  return (
    <div className="bg-[rgba(232,99,77,0.08)] content-stretch flex items-center justify-center relative rounded-[18px] shrink-0 size-[36px]" data-name="Frame">
      <MessageSquare />
    </div>
  );
}

function Frame35() {
  return (
    <div className="[word-break:break-word] content-stretch flex flex-[1_0_0] flex-col gap-[2px] items-start leading-[normal] min-w-px relative whitespace-nowrap" data-name="Frame">
      <p className="font-['Outfit:Bold',sans-serif] font-bold relative shrink-0 text-[#1b2340] text-[14px]">3 New Messages</p>
      <p className="font-['Geist:Regular',sans-serif] font-normal min-w-full overflow-hidden relative shrink-0 text-[#525a70] text-[12px] text-ellipsis w-[min-content]">{`Claire: "Hey Sarah, let's catch up after..."`}</p>
    </div>
  );
}

function ArrowRight() {
  return (
    <div className="relative shrink-0 size-[16px]" data-name="arrow-right">
      <svg className="absolute block inset-0 size-full" fill="none" height="16" preserveAspectRatio="none" viewBox="0 0 16 16" width="16">
        <g id="arrow-right">
          <path d={svgPaths.p3bfa7a00} id="Vector" stroke="#E8634D" strokeLinecap="round" strokeWidth="2" />
        </g>
      </svg>
    </div>
  );
}

function MessagesBanner() {
  return (
    <div className="bg-white relative rounded-[8px] shrink-0 w-full" data-name="messages-banner">
      <div aria-hidden className="absolute border border-[#e8634d] border-solid inset-0 pointer-events-none rounded-[8px]" />
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex gap-[12px] items-center p-[12px] relative size-full">
          <Frame34 />
          <Frame35 />
          <ArrowRight />
        </div>
      </div>
    </div>
  );
}

function MessagesPreviewSection() {
  return (
    <div className="relative shrink-0 w-full" data-name="messages-preview-section">
      <div className="content-stretch flex flex-col items-start px-[16px] relative size-full">
        <MessagesBanner />
      </div>
    </div>
  );
}

function ScrollContent() {
  return (
    <div className="content-stretch flex flex-col gap-[20px] items-start pb-[90px] pt-[20px] relative shrink-0 w-full" data-name="scroll-content">
      <GreetingSection />
      <UpNextSection />
      <ScheduleSection />
      <NetworkingSection />
      <AppointmentsSection />
      <MessagesPreviewSection />
    </div>
  );
}

function Home() {
  return (
    <div className="relative shrink-0 size-[20px]" data-name="home">
      <svg className="absolute block inset-0 size-full" fill="none" height="20" preserveAspectRatio="none" viewBox="0 0 20 20" width="20">
        <g id="home">
          <path d={svgPaths.p2046d6b0} id="Vector" stroke="#E8634D" strokeLinecap="round" strokeWidth="2" />
        </g>
      </svg>
    </div>
  );
}

function Frame36() {
  return (
    <div className="content-stretch flex flex-col items-center justify-center relative shrink-0 size-[24px]" data-name="Frame">
      <Home />
    </div>
  );
}

function NavTabHome() {
  return (
    <div className="content-stretch flex flex-[1_0_0] flex-col gap-[4px] items-center justify-center min-w-px relative" data-name="nav-tab-Home">
      <Frame36 />
      <p className="[word-break:break-word] font-['Geist:Bold',sans-serif] font-bold leading-[normal] relative shrink-0 text-[#e8634d] text-[10px] whitespace-nowrap">Home</p>
    </div>
  );
}

function Calendar() {
  return (
    <div className="relative shrink-0 size-[20px]" data-name="calendar">
      <svg className="absolute block inset-0 size-full" fill="none" height="20" preserveAspectRatio="none" viewBox="0 0 20 20" width="20">
        <g id="calendar">
          <path d={svgPaths.p376ce800} id="Vector" stroke="#8F96A8" strokeLinecap="round" strokeWidth="2" />
        </g>
      </svg>
    </div>
  );
}

function Frame37() {
  return (
    <div className="content-stretch flex flex-col items-center justify-center relative shrink-0 size-[24px]" data-name="Frame">
      <Calendar />
    </div>
  );
}

function NavTabAgenda() {
  return (
    <div className="content-stretch flex flex-[1_0_0] flex-col gap-[4px] items-center justify-center min-w-px relative" data-name="nav-tab-Agenda">
      <Frame37 />
      <p className="[word-break:break-word] font-['Geist:Medium',sans-serif] font-medium leading-[normal] relative shrink-0 text-[#8f96a8] text-[10px] whitespace-nowrap">Agenda</p>
    </div>
  );
}

function Search() {
  return (
    <div className="relative shrink-0 size-[20px]" data-name="search">
      <svg className="absolute block inset-0 size-full" fill="none" height="20" preserveAspectRatio="none" viewBox="0 0 20 20" width="20">
        <g id="search">
          <path d={svgPaths.p1615880} id="Vector" stroke="#8F96A8" strokeLinecap="round" strokeWidth="2" />
        </g>
      </svg>
    </div>
  );
}

function Frame38() {
  return (
    <div className="content-stretch flex flex-col items-center justify-center relative shrink-0 size-[24px]" data-name="Frame">
      <Search />
    </div>
  );
}

function NavTabDiscover() {
  return (
    <div className="content-stretch flex flex-[1_0_0] flex-col gap-[4px] items-center justify-center min-w-px relative" data-name="nav-tab-Discover">
      <Frame38 />
      <p className="[word-break:break-word] font-['Geist:Medium',sans-serif] font-medium leading-[normal] relative shrink-0 text-[#8f96a8] text-[10px] whitespace-nowrap">Discover</p>
    </div>
  );
}

function Frame39() {
  return (
    <div className="relative shrink-0 size-[24px]" data-name="Frame">
      <svg className="absolute block inset-0 size-full" fill="none" height="24" preserveAspectRatio="none" viewBox="0 0 24 24" width="24">
        <g id="Frame">
          <g id="message-square">
            <path d={svgPaths.p223d480} id="Vector" stroke="#8F96A8" strokeLinecap="round" strokeWidth="2" />
          </g>
          <circle cx="21" cy="3" fill="#E8634D" id="Ellipse" r="3" />
        </g>
      </svg>
    </div>
  );
}

function NavTabMessages() {
  return (
    <div className="content-stretch flex flex-[1_0_0] flex-col gap-[4px] items-center justify-center min-w-px relative" data-name="nav-tab-Messages">
      <Frame39 />
      <p className="[word-break:break-word] font-['Geist:Medium',sans-serif] font-medium leading-[normal] relative shrink-0 text-[#8f96a8] text-[10px] whitespace-nowrap">Messages</p>
    </div>
  );
}

function Users() {
  return (
    <div className="relative shrink-0 size-[20px]" data-name="users">
      <svg className="absolute block inset-0 size-full" fill="none" height="20" preserveAspectRatio="none" viewBox="0 0 20 20" width="20">
        <g id="users">
          <path d={svgPaths.p1165c980} id="Vector" stroke="#8F96A8" strokeLinecap="round" strokeWidth="2" />
        </g>
      </svg>
    </div>
  );
}

function Frame40() {
  return (
    <div className="content-stretch flex flex-col items-center justify-center relative shrink-0 size-[24px]" data-name="Frame">
      <Users />
    </div>
  );
}

function NavTabNetwork() {
  return (
    <div className="content-stretch flex flex-[1_0_0] flex-col gap-[4px] items-center justify-center min-w-px relative" data-name="nav-tab-Network">
      <Frame40 />
      <p className="[word-break:break-word] font-['Geist:Medium',sans-serif] font-medium leading-[normal] relative shrink-0 text-[#8f96a8] text-[10px] whitespace-nowrap">Network</p>
    </div>
  );
}

function BottomNavigation() {
  return (
    <div className="absolute bg-white bottom-0 content-stretch flex h-[72px] items-center left-0 px-[8px] right-0" data-name="bottom-navigation">
      <div aria-hidden className="absolute border-[#efe8e1] border-solid border-t inset-0 pointer-events-none" />
      <NavTabHome />
      <NavTabAgenda />
      <NavTabDiscover />
      <NavTabMessages />
      <NavTabNetwork />
    </div>
  );
}

export default function EventlinkMobileHome() {
  return (
    <div className="bg-[#fdf8f3] content-stretch flex flex-col items-start relative size-full" data-name="eventlink-mobile-home">
      <StatusBar />
      <Header />
      <ScrollContent />
      <BottomNavigation />
    </div>
  );
}