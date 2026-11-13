"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Compass,
  Lightbulb,
  LocateFixed,
  PartyPopper,
  PenTool,
  Play,
  Sparkles,
} from "lucide-react";

interface TutorialOverlayProps {
  isOpen: boolean;
  onToggle: (open: boolean) => void;
  isWelcomeOpen: boolean;
  hasUsedLocationTool: boolean;
  hasMarkedField: boolean;
  hasGeneratedPlan: boolean;
  onEnterFromWelcome: () => void;
  onSearchLocation: (query: string) => void;
  onLocateMe: () => void;
  onFlyToCoords: (lat: number, lng: number) => void;
  onStartDrawing: () => void;
  onQuickDemoField: () => void;
}

interface TourStepConfig {
  id: string;
  target: string;
  title: string;
  description: string;
  tip: string;
}

const TOUR_STEPS: TourStepConfig[] = [
  {
    id: "welcome",
    target: "welcome-cta",
    title: "1. Welcome — Enter the 3D Earth",
    description:
      "Welcome to TerraPulse Agri! Behind this title is a live interactive 3D Earth powered by NASA satellites. Click View 3D Earth or press Next → to begin.",
    tip: "Clicking Next → will automatically transition into the 3D Earth so the guided tour continues smoothly.",
  },
  {
    id: "location",
    target: "location-search",
    title: "2. Four Ways to Find Your Farm Location",
    description:
      "Type your village or town name in the search bar, click the GPS target icon next to Go to use your device location, or spin & zoom the 3D Earth below.",
    tip: "Have land coordinates or want to jump to a region now? Try a quick shortcut below:",
  },
  {
    id: "views",
    target: "view-switcher",
    title: "3. Switch Between 3D Earth & 2D Satellite Map",
    description:
      "Explore the planet in 3D Earth view, or click 2D Map (or zoom in close to the ground) for clear overhead satellite photos of your fields.",
    tip: "In 2D Map view, you can also toggle NASA NDVI Vegetation & Soil Moisture layers in the top-right corner.",
  },
  {
    id: "mark-field",
    target: "mark-field-btn",
    title: "4. Mark Your Field Boundary",
    description:
      "Click Mark My Field to open drawing mode on the satellite map. Tap 3 or 4 corners around the edge of your land and press Finish Land.",
    tip: "Want to test the crop planner right now without drawing? Try a sample parcel below:",
  },
  {
    id: "plan-steps",
    target: "step-progress",
    title: "5. Answer 3 Simple Questions → Get Your Crop Plan",
    description:
      "Once your field is marked, enter your Water Supply, Last Crop Planted, and Main Goal (More Money, Healthy Land, or Save Water) to receive a simple 1-Year Planting Plan.",
    tip: "Use these 3 step tabs in the top bar anytime to jump back and change your answers or compare crop plans.",
  },
  {
    id: "practice",
    target: "quick-practice",
    title: '6. Interactive "Quick Practice" Checklist',
    description:
      "Put your new skills into action! This live drawer tracks your 4 steps—entering the 3D Earth, finding your location, marking your land, and generating your crop plan.",
    tip: "You can replay this spotlight tour anytime by clicking Guided Tour in the top bar or Start Guided Tour inside the checklist!",
  },
];

const QUICK_REGIONS = [
  { label: "Nile Delta", query: "Nile Delta, Egypt" },
  { label: "Fresno, CA", query: "Fresno, California" },
  { label: "Punjab", query: "Ludhiana, Punjab" },
];

interface SpotlightBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

export default function TutorialOverlay({
  isOpen,
  onToggle,
  isWelcomeOpen,
  hasUsedLocationTool,
  hasMarkedField,
  hasGeneratedPlan,
  onEnterFromWelcome,
  onSearchLocation,
  onLocateMe,
  onFlyToCoords,
  onStartDrawing,
  onQuickDemoField,
}: TutorialOverlayProps) {
  const [stepIndex, setStepIndex] = useState<number>(0);
  const [spotlight, setSpotlight] = useState<SpotlightBox | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number }>({
    top: 88,
    left: 24,
  });
  const [isChecklistCollapsed, setIsChecklistCollapsed] = useState<boolean>(false);
  const [showCoordsBox, setShowCoordsBox] = useState<boolean>(false);
  const [latInput, setLatInput] = useState<string>("30.8225");
  const [lngInput, setLngInput] = useState<string>("31.0187");
  const [coordError, setCoordError] = useState<string | null>(null);
  const [tipNotice, setTipNotice] = useState<string | null>(null);

  const popoverRef = useRef<HTMLDivElement | null>(null);
  const prevOpenRef = useRef<boolean>(false);

  // Sync start step when tour opens (Step 1 on Welcome screen, Step 2 once inside globe)
  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      setStepIndex(isWelcomeOpen ? 0 : 1);
      setTipNotice(null);
      setShowCoordsBox(false);
    }
    prevOpenRef.current = isOpen;
  }, [isOpen, isWelcomeOpen]);

  // Expand Quick Practice drawer automatically during Step 6 so the spotlight shows all 4 tasks
  useEffect(() => {
    if (isOpen && stepIndex === 5) {
      setIsChecklistCollapsed(false);
    }
  }, [isOpen, stepIndex]);

  const currentStep = TOUR_STEPS[stepIndex] ?? TOUR_STEPS[0];
  const minStepIndex = isWelcomeOpen ? 0 : 1;

  const measureAndPosition = useCallback(() => {
    if (!isOpen || typeof window === "undefined") return;

    const targetEl = document.querySelector(
      `[data-tour="${currentStep.target}"]`
    ) as HTMLElement | null;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cardEl = popoverRef.current;
    const cardW = cardEl ? cardEl.offsetWidth : Math.min(370, vw - 32);
    const cardH = cardEl ? cardEl.offsetHeight : 300;
    const margin = 16;

    if (!targetEl) {
      setSpotlight(null);
      setPopoverPos({
        top: Math.max(margin, Math.round((vh - cardH) / 2)),
        left: Math.max(margin, Math.round((vw - cardW) / 2)),
      });
      return;
    }

    const rect = targetEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      setSpotlight(null);
      setPopoverPos({
        top: Math.max(margin, Math.round((vh - cardH) / 2)),
        left: Math.max(margin, Math.round((vw - cardW) / 2)),
      });
      return;
    }

    const pad = 8;
    const box: SpotlightBox = {
      top: Math.max(4, rect.top - pad),
      left: Math.max(4, rect.left - pad),
      width: Math.min(vw - 8, rect.width + pad * 2),
      height: Math.min(vh - 8, rect.height + pad * 2),
    };
    setSpotlight(box);

    const boxBottom = box.top + box.height;
    const boxRight = box.left + box.width;

    let top = margin;
    let left = margin;

    if (currentStep.target === "quick-practice") {
      // Position cleanly to the left of the bottom-right Quick Practice box (like Screenshot 3)
      const leftSpace = box.left - cardW - 18;
      if (leftSpace >= margin) {
        left = leftSpace;
        top = Math.max(
          margin,
          Math.min(vh - cardH - margin, box.top + box.height - cardH)
        );
      } else {
        left = Math.max(margin, Math.min(vw - cardW - margin, box.left));
        top = Math.max(margin, box.top - cardH - 14);
      }
    } else if (box.top > vh * 0.52) {
      // Bottom area target (Welcome CTA) — prefer below if fits, else above
      if (boxBottom + 14 + cardH <= vh - margin) {
        top = boxBottom + 14;
      } else {
        top = Math.max(margin, box.top - cardH - 14);
      }
      left = Math.max(
        margin,
        Math.min(vw - cardW - margin, box.left + box.width / 2 - cardW / 2)
      );
    } else {
      // Top bar / header targets — place cleanly below the spotlight
      top = Math.min(vh - cardH - margin, boxBottom + 14);
      if (boxRight > vw - cardW * 0.45) {
        left = Math.max(margin, Math.min(vw - cardW - margin, boxRight - cardW));
      } else {
        left = Math.max(
          margin,
          Math.min(vw - cardW - margin, box.left + box.width / 2 - cardW / 2)
        );
      }
    }

    setPopoverPos({ top: Math.round(top), left: Math.round(left) });
  }, [currentStep.target, isOpen]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    measureAndPosition();
    const raf = requestAnimationFrame(measureAndPosition);
    const t1 = window.setTimeout(measureAndPosition, 80);
    const t2 = window.setTimeout(measureAndPosition, 260);
    const t3 = window.setTimeout(measureAndPosition, 560);

    window.addEventListener("resize", measureAndPosition);
    window.addEventListener("scroll", measureAndPosition, true);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.removeEventListener("resize", measureAndPosition);
      window.removeEventListener("scroll", measureAndPosition, true);
    };
  }, [isOpen, stepIndex, isWelcomeOpen, showCoordsBox, measureAndPosition]);

  const handleNext = useCallback(() => {
    setTipNotice(null);
    if (stepIndex === 0 && isWelcomeOpen) {
      onEnterFromWelcome();
      setStepIndex(1);
      return;
    }
    if (stepIndex < TOUR_STEPS.length - 1) {
      setStepIndex((i) => i + 1);
    } else {
      onToggle(false);
    }
  }, [isWelcomeOpen, onEnterFromWelcome, onToggle, stepIndex]);

  const handleBack = useCallback(() => {
    setTipNotice(null);
    if (stepIndex > minStepIndex) {
      setStepIndex((i) => i - 1);
    }
  }, [minStepIndex, stepIndex]);

  // Keyboard support: ArrowLeft / ArrowRight / Escape (as shown in "Use ← → keys")
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handleBack();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onToggle(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleBack, handleNext, isOpen, onToggle]);

  const handleQuickRegion = (label: string, query: string) => {
    onSearchLocation(query);
    setTipNotice(`Flying map to ${label}!`);
  };

  const handleCoordsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = Number(latInput.trim());
    const lng = Number(lngInput.trim());
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      setCoordError("Lat -90..90, Lng -180..180");
      return;
    }
    setCoordError(null);
    onFlyToCoords(lat, lng);
    setTipNotice(`Moved to (${lat.toFixed(3)}°, ${lng.toFixed(3)}°)!`);
  };

  const practiceItems = [
    {
      id: "enter-earth",
      label: "Enter the 3D Earth view",
      done: !isWelcomeOpen,
    },
    {
      id: "find-location",
      label: "Find a location (Search, GPS, or 2D/3D switch)",
      done: hasUsedLocationTool,
    },
    {
      id: "mark-field",
      label: "Mark your field corners (or load Demo Field)",
      done: hasMarkedField,
    },
    {
      id: "generate-plan",
      label: "Generate your 1-Year Crop Plan",
      done: hasGeneratedPlan,
    },
  ];
  const completedCount = practiceItems.filter((item) => item.done).length;
  const showQuickPracticeDrawer = !isWelcomeOpen || (isOpen && stepIndex === 5);

  return (
    <>
      {/* 1. Bottom-Right "Quick Practice: X/4 completed" Live Checklist Drawer */}
      {showQuickPracticeDrawer && (
        <aside
          data-tour="quick-practice"
          aria-label="Quick Practice Checklist"
          className="fixed bottom-4 right-4 z-[460] w-72 sm:w-80 rounded-2xl bg-[#0D1318]/95 backdrop-blur-xl border border-white/15 shadow-2xl overflow-hidden text-[#F2F7F4]"
        >
          <button
            type="button"
            onClick={() => setIsChecklistCollapsed((c) => !c)}
            aria-expanded={!isChecklistCollapsed}
            className="w-full px-3.5 py-2.5 bg-gradient-to-r from-[#14291E] via-[#12221B] to-[#0E171D] border-b border-white/10 flex items-center justify-between gap-2 text-left"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#A3E4B7] shrink-0" />
              <span className="text-xs font-bold text-[#F2F7F4]">
                Quick Practice: {completedCount}/4 completed
              </span>
            </div>
            {isChecklistCollapsed ? (
              <ChevronUp className="w-4 h-4 text-[#8A9B93]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[#8A9B93]" />
            )}
          </button>

          {!isChecklistCollapsed && (
            <div className="p-3 space-y-2">
              <ul className="space-y-1.5">
                {practiceItems.map((item) => (
                  <li
                    key={item.id}
                    className={`flex items-start gap-2 text-xs transition ${
                      item.done
                        ? "text-[#A3E4B7] line-through opacity-80"
                        : "text-[#C7D4CD]"
                    }`}
                  >
                    {item.done ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#A3E4B7] shrink-0 mt-0.5" />
                    ) : (
                      <Circle className="w-3.5 h-3.5 text-[#64766E] shrink-0 mt-0.5" />
                    )}
                    <span className="leading-snug">{item.label}</span>
                  </li>
                ))}
              </ul>

              {completedCount === 4 && (
                <div className="rounded-xl bg-[#A3E4B7]/12 border border-[#A3E4B7]/40 px-2.5 py-1.5 text-[11px] font-semibold text-[#A3E4B7] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  All 4 steps completed! Ready to farm smarter.
                </div>
              )}

              <div className="pt-1 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => {
                    setStepIndex(1);
                    onToggle(true);
                  }}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#131E26] hover:bg-[#192832] border border-[#A3E4B7]/30 text-[11px] font-bold text-[#A3E4B7] transition"
                >
                  <Play className="w-3 h-3" />
                  Start Guided Tour
                </button>
              </div>
            </div>
          )}
        </aside>
      )}

      {/* 2. Glowing Spotlight Cutout Overlay */}
      {isOpen && spotlight && (
        <div
          aria-hidden="true"
          className="fixed z-[520] rounded-2xl pointer-events-none transition-all duration-300 ease-out"
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
            boxShadow:
              "0 0 0 9999px rgba(7, 11, 14, 0.72), 0 0 0 2px #A3E4B7, 0 0 28px 6px rgba(163, 228, 183, 0.42)",
          }}
        />
      )}

      {/* Dim backdrop fallback if spotlight target isn't mounted */}
      {isOpen && !spotlight && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-[520] bg-[#070B0E]/72 pointer-events-none"
        />
      )}

      {/* 3. Positioned Guided Tour Popover Card */}
      {isOpen && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={`Guided Tour ${currentStep.title}`}
          style={{
            top: popoverPos.top,
            left: popoverPos.left,
          }}
          className="fixed z-[530] w-[calc(100vw-2rem)] max-w-[372px] rounded-2xl bg-[#0E161C] border border-white/15 shadow-2xl text-[#F2F7F4] p-4 space-y-3 transition-all duration-300 ease-out"
        >
          {/* Top Row: Progress Dots & Skip Tour */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5" aria-label="Tour progress">
              {TOUR_STEPS.map((st, idx) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => {
                    if (idx === 0 && !isWelcomeOpen) return;
                    setTipNotice(null);
                    setStepIndex(idx);
                  }}
                  aria-label={`Go to step ${idx + 1}`}
                  className={`h-1.5 rounded-full transition-all ${
                    idx === stepIndex
                      ? "w-5 bg-[#A3E4B7]"
                      : idx < stepIndex
                        ? "w-1.5 bg-[#A3E4B7]/55"
                        : "w-1.5 bg-white/25 hover:bg-white/40"
                  }`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => onToggle(false)}
              className="text-[11px] font-semibold text-[#8A9B93] hover:text-[#F2F7F4] transition"
            >
              Skip Tour
            </button>
          </div>

          {/* Step Pill + Mini Farmer Badge */}
          <div className="flex items-center gap-2">
            <MiniFarmerIcon />
            <span className="px-2.5 py-0.5 rounded-md bg-[#A3E4B7]/15 border border-[#A3E4B7]/35 text-[10px] font-bold uppercase tracking-[0.14em] text-[#A3E4B7]">
              STEP {stepIndex + 1} OF {TOUR_STEPS.length}
            </span>
          </div>

          {/* Title & Description */}
          <div className="space-y-1.5">
            <h3 className="text-sm sm:text-base font-bold text-[#F2F7F4] leading-snug">
              {currentStep.title}
            </h3>
            <p className="text-xs text-[#C7D4CD] leading-relaxed">
              {currentStep.description}
            </p>
          </div>

          {/* Tip Callout Box (matching 💡 box in screenshots) */}
          <div className="rounded-xl bg-[#142029] border border-[#A3E4B7]/25 p-2.5 space-y-2">
            <div className="flex items-start gap-2">
              <Lightbulb className="w-3.5 h-3.5 text-[#A3E4B7] shrink-0 mt-0.5" />
              <p className="text-[11px] text-[#DCE6E0] leading-snug">
                {currentStep.tip}
              </p>
            </div>

            {/* Interactive shortcuts inside Step 2 tip box */}
            {currentStep.id === "location" && (
              <div className="space-y-1.5 pt-1">
                <div className="flex flex-wrap gap-1">
                  {QUICK_REGIONS.map((region) => (
                    <button
                      key={region.label}
                      type="button"
                      onClick={() => handleQuickRegion(region.label, region.query)}
                      className="px-2 py-0.5 rounded-full bg-[#0D1318] border border-white/15 hover:border-[#A3E4B7]/60 text-[10px] font-semibold text-[#F2F7F4] transition"
                    >
                      {region.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      onLocateMe();
                      setTipNotice("Requesting device GPS...");
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#0D1318] border border-sky-400/35 text-[10px] font-semibold text-sky-300 transition"
                  >
                    <LocateFixed className="w-2.5 h-2.5" />
                    GPS
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCoordsBox((v) => !v)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#0D1318] border border-amber-300/35 text-[10px] font-semibold text-amber-200 transition"
                  >
                    <Compass className="w-2.5 h-2.5" />
                    Lat/Lng
                  </button>
                </div>

                {showCoordsBox && (
                  <form onSubmit={handleCoordsSubmit} className="space-y-1">
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        aria-label="Latitude"
                        value={latInput}
                        onChange={(e) => setLatInput(e.target.value)}
                        placeholder="Lat"
                        className="w-full px-2 py-1 rounded-lg bg-[#0B1015] border border-white/15 text-[10px] text-[#F2F7F4] focus:outline-none focus:ring-1 focus:ring-[#A3E4B7]"
                      />
                      <input
                        type="text"
                        aria-label="Longitude"
                        value={lngInput}
                        onChange={(e) => setLngInput(e.target.value)}
                        placeholder="Lng"
                        className="w-full px-2 py-1 rounded-lg bg-[#0B1015] border border-white/15 text-[10px] text-[#F2F7F4] focus:outline-none focus:ring-1 focus:ring-[#A3E4B7]"
                      />
                      <button
                        type="submit"
                        className="px-2.5 py-1 rounded-lg bg-white text-[#070B0E] text-[10px] font-bold shrink-0"
                      >
                        Go
                      </button>
                    </div>
                    {coordError && (
                      <p className="text-[10px] text-rose-400">{coordError}</p>
                    )}
                  </form>
                )}

                {tipNotice && (
                  <p className="text-[10px] font-semibold text-[#A3E4B7]">
                    {tipNotice}
                  </p>
                )}
              </div>
            )}

            {/* Direct actions inside Step 4 tip box */}
            {currentStep.id === "mark-field" && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onToggle(false);
                    onQuickDemoField();
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#0D1318] border border-white/15 hover:border-[#A3E4B7]/60 text-[10px] font-semibold text-[#F2F7F4] transition"
                >
                  <Sparkles className="w-3 h-3 text-[#A3E4B7]" />
                  Try Demo Field
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onToggle(false);
                    onStartDrawing();
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#A3E4B7] text-[#070B0E] text-[10px] font-bold transition"
                >
                  <PenTool className="w-3 h-3" />
                  Mark My Field Now
                </button>
              </div>
            )}
          </div>

          {/* Bottom Navigation Bar: ← Back | Use ← → keys | Next → */}
          <div className="pt-1 flex items-center justify-between gap-2">
            <button
              type="button"
              disabled={stepIndex <= minStepIndex}
              onClick={handleBack}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#9DB0A7] hover:text-[#F2F7F4] disabled:opacity-30 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </button>

            <span className="text-[10px] text-[#64766E] font-medium select-none">
              Use &larr; &rarr; keys
            </span>

            {stepIndex < TOUR_STEPS.length - 1 ? (
              <button
                type="button"
                onClick={handleNext}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-white hover:bg-[#A3E4B7] text-[#070B0E] text-xs font-bold shadow-md transition"
              >
                Next
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleNext}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#A3E4B7] hover:bg-white text-[#070B0E] text-xs font-bold shadow-md transition"
              >
                Finish Tour
                <PartyPopper className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function MiniFarmerIcon() {
  return (
    <div className="w-6 h-6 rounded-full bg-[#13251D] border border-[#A3E4B7]/50 flex items-center justify-center overflow-hidden shrink-0">
      <svg viewBox="0 0 64 64" className="w-5 h-5" aria-hidden="true">
        <ellipse cx="32" cy="21" rx="22" ry="5.5" fill="#FBBF24" />
        <path d="M19 20 C19 10, 45 10, 45 20 Z" fill="#F59E0B" />
        <rect x="19" y="17.5" width="26" height="3" rx="1.5" fill="#10B981" />
        <circle cx="32" cy="31" r="11" fill="#FDBA74" />
        <circle cx="28" cy="30" r="1.5" fill="#1E293B" />
        <circle cx="36" cy="30" r="1.5" fill="#1E293B" />
        <path
          d="M27.5 34.5 Q32 38.5 36.5 34.5"
          fill="none"
          stroke="#7C2D12"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path d="M16 58 C16 45, 48 45, 48 58 Z" fill="#F2F7F4" />
        <rect x="21" y="51" width="22" height="8" rx="2" fill="#10B981" />
      </svg>
    </div>
  );
}
