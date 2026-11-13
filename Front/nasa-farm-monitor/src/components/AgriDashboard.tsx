"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  ArrowRight,
  Crosshair,
  Globe2,
  HelpCircle,
  Home,
  Layers,
  LocateFixed,
  Map as MapIcon,
  PenTool,
  Satellite,
  Search,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { altitudeToZoom, zoomToAltitude } from "@/lib/view";
import FarmPlannerModal from "@/components/FarmPlannerModal";
import TutorialOverlay from "@/components/TutorialOverlay";
import type { FlyToTarget } from "@/components/FarmMap";
import type { GlobePovTarget } from "@/components/Globe3D";
import {
  createFarmField,
  exportFieldsToGeoJSON,
} from "@/lib/geo";
import {
  fetchNasaPowerData,
  getNasaGibsLayers,
  getPastDateISO,
} from "@/lib/nasa";
import type {
  BaseMapId,
  FarmField,
  FarmerGroundInputs,
  LatLngPoint,
  NasaGibsLayerId,
  NasaPowerResponse,
} from "@/types/farm";

const FarmMap = dynamic(() => import("@/components/FarmMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[#070B0E] text-[#8A9B93] gap-2">
      <Satellite className="w-8 h-8 animate-pulse text-[#A3E4B7]" />
      <span className="text-sm font-medium">
        Loading Interactive Satellite Map...
      </span>
    </div>
  ),
});

const Globe3D = dynamic(() => import("@/components/Globe3D"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#070B0E] text-[#8A9B93] gap-2">
      <Globe2 className="w-9 h-9 animate-pulse text-[#A3E4B7]" />
      <span className="text-sm font-medium">Loading 3D Earth...</span>
    </div>
  ),
});

type ViewMode = "globe" | "map";
type PlannerStep = "idle" | "inputs" | "plans";

const DEFAULT_FARM_CENTER: LatLngPoint = [30.8225, 31.0187];

const DEFAULT_GROUND_INPUTS: FarmerGroundInputs = {
  waterTier: "moderate",
  waterM3PerHa: 4000,
  lastCrop: "Wheat",
  priority: "profit",
};

export default function AgriDashboard() {
  // Clean entry: no pre-loaded sample plots so the farmer starts by marking their own land
  const [fields, setFields] = useState<FarmField[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);

  // Guided 4-stage workflow & interactive tour state
  const [plannerStep, setPlannerStep] = useState<PlannerStep>("idle");
  const [isPlannerOpen, setIsPlannerOpen] = useState<boolean>(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState<boolean>(true);
  const [hasUsedLocationTool, setHasUsedLocationTool] =
    useState<boolean>(false);
  const [groundInputs, setGroundInputs] =
    useState<FarmerGroundInputs>(DEFAULT_GROUND_INPUTS);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [draftPoints, setDraftPoints] = useState<LatLngPoint[]>([]);

  // Map & NASA GIBS overlay state
  const [baseMap, setBaseMap] = useState<BaseMapId>("satellite");
  const [gibsLayer, setGibsLayer] = useState<NasaGibsLayerId>("none");
  const [gibsDate, setGibsDate] = useState<string>("2026-11-01");
  const [maxGibsDate, setMaxGibsDate] = useState<string>("2026-11-10");
  const [gibsOpacity, setGibsOpacity] = useState<number>(0.72);
  const [showLayerPanel, setShowLayerPanel] = useState<boolean>(false);
  const [flyToTarget, setFlyToTarget] = useState<FlyToTarget | null>(null);

  // Welcome hero overlay & 3D globe <-> 2D Leaflet map handoff
  const [isWelcomeOpen, setIsWelcomeOpen] = useState<boolean>(true);
  const [globePovTarget, setGlobePovTarget] = useState<GlobePovTarget | null>(
    null
  );
  const [viewMode, setViewMode] = useState<ViewMode>("globe");
  const [mapView, setMapView] = useState<{ center: LatLngPoint; zoom: number }>({
    center: DEFAULT_FARM_CENTER,
    zoom: 15,
  });
  const [globeView, setGlobeView] = useState<{
    center: LatLngPoint;
    altitude: number;
  }>({
    center: DEFAULT_FARM_CENTER,
    altitude: 2.55,
  });

  const pendingFlyRef = useRef<FlyToTarget | null>(null);
  const viewModeRef = useRef<ViewMode>("globe");
  const globePovRef = useRef<{ center: LatLngPoint; altitude: number } | null>(
    null
  );
  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  const enterMap = useCallback((center: LatLngPoint, zoom: number) => {
    const pending = pendingFlyRef.current;
    pendingFlyRef.current = null;
    setMapView({ center, zoom });
    setFlyToTarget(pending ? { ...pending, key: Date.now() } : null);
    setViewMode("map");
  }, []);

  const enterGlobe = useCallback((center: LatLngPoint, zoom: number) => {
    const altitude = Math.max(zoomToAltitude(zoom), 0.9);
    setFlyToTarget(null);
    globePovRef.current = { center, altitude };
    setGlobeView({ center, altitude });
    setViewMode("globe");
  }, []);

  /** Fly to a location in whichever view is active (globe flies in, then hands off). */
  const flyTo = useCallback((center: LatLngPoint, zoom: number) => {
    const target: FlyToTarget = { center, zoom, key: Date.now() };
    if (viewModeRef.current === "globe") pendingFlyRef.current = target;
    setFlyToTarget(target);
  }, []);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);

  // NASA POWER state
  const [nasaData, setNasaData] = useState<NasaPowerResponse | null>(null);
  const [isLoadingNasa, setIsLoadingNasa] = useState(false);

  // Hydrate dynamic GIBS date bounds cleanly on client mount
  useEffect(() => {
    setGibsDate(getPastDateISO(10));
    setMaxGibsDate(getPastDateISO(2));
  }, []);

  const fieldsRef = useRef(fields);
  useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);

  const selectedField = useMemo(
    () => fields.find((f) => f.id === selectedFieldId) ?? null,
    [fields, selectedFieldId]
  );

  // Fetch NASA POWER data whenever the marked field centroid changes
  const centroidKey = selectedField
    ? `${selectedField.centroid[0].toFixed(4)},${selectedField.centroid[1].toFixed(4)}`
    : null;

  useEffect(() => {
    if (!centroidKey) {
      setNasaData(null);
      return;
    }
    const [lat, lng] = centroidKey.split(",").map(Number);

    let cancelled = false;
    setIsLoadingNasa(true);

    fetchNasaPowerData(lat, lng).then((res) => {
      if (!cancelled) {
        setNasaData(res);
        setIsLoadingNasa(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [centroidKey]);

  const gibsLayers = useMemo(() => getNasaGibsLayers(gibsDate), [gibsDate]);

  const handleEnterFromWelcome = useCallback(() => {
    const targetCenter =
      fieldsRef.current.find((f) => f.id === selectedFieldId)?.centroid ??
      DEFAULT_FARM_CENTER;
    setIsWelcomeOpen(false);
    setViewMode("globe");
    setIsTutorialOpen(true);
    setGlobePovTarget({
      center: targetCenter,
      altitude: 1.45,
      durationMs: 1400,
      autoRotate: true,
      key: Date.now(),
    });
  }, [selectedFieldId]);

  const handleReturnToWelcome = useCallback(() => {
    const targetCenter =
      fieldsRef.current.find((f) => f.id === selectedFieldId)?.centroid ??
      DEFAULT_FARM_CENTER;
    setIsDrawing(false);
    setDraftPoints([]);
    setIsPlannerOpen(false);
    setIsTutorialOpen(true);
    setFlyToTarget(null);
    setGlobeView({ center: targetCenter, altitude: 2.55 });
    setViewMode("globe");
    setIsWelcomeOpen(true);
    setGlobePovTarget({
      center: targetCenter,
      altitude: 2.55,
      durationMs: 1200,
      autoRotate: true,
      key: Date.now(),
    });
  }, [selectedFieldId]);

  const handleSelectField = useCallback(
    (id: string) => {
      setSelectedFieldId(id);
      const target = fieldsRef.current.find((f) => f.id === id);
      if (target) flyTo(target.centroid, 15);
    },
    [flyTo]
  );

  const handleGlobeViewChange = useCallback(
    (center: LatLngPoint, altitude: number) => {
      globePovRef.current = { center, altitude };
    },
    []
  );

  const handleStartDrawing = useCallback(() => {
    setIsPlannerOpen(false);
    setDraftPoints([]);
    setIsDrawing(true);
    if (viewModeRef.current === "globe") {
      const pov = globePovRef.current;
      const sel = fieldsRef.current.find((f) => f.id === selectedFieldId);
      const center: LatLngPoint =
        pov && pov.altitude < 0.6
          ? pov.center
          : sel?.centroid ?? globeView.center;
      flyTo(
        center,
        pov && pov.altitude < 0.6
          ? Math.max(altitudeToZoom(pov.altitude), 15)
          : 16
      );
    }
  }, [flyTo, globeView.center, selectedFieldId]);

  const handleAddDraftPoint = useCallback((point: LatLngPoint) => {
    setDraftPoints((prev) => [...prev, point]);
  }, []);

  const handleUndoDraftPoint = useCallback(() => {
    setDraftPoints((prev) => prev.slice(0, -1));
  }, []);

  const handleClearDraft = useCallback(() => {
    setDraftPoints([]);
  }, []);

  const handleFinishDrawing = useCallback(() => {
    if (draftPoints.length < 3) return;
    const newField = createFarmField(
      "My Farm Field",
      "Wheat",
      draftPoints,
      fieldsRef.current.length
    );
    setFields([newField]);
    setSelectedFieldId(newField.id);
    setIsDrawing(false);
    setDraftPoints([]);
    setPlannerStep("inputs");
    setIsPlannerOpen(true);
  }, [draftPoints]);

  const handleCancelDrawing = useCallback(() => {
    setIsDrawing(false);
    setDraftPoints([]);
  }, []);

  const handleQuickDemoField = useCallback(() => {
    const base =
      viewModeRef.current === "globe"
        ? globePovRef.current?.center ?? globeView.center
        : mapView.center;
    const dLat = 0.0032;
    const dLng = 0.004;
    const corners: LatLngPoint[] = [
      [base[0] + dLat, base[1] - dLng],
      [base[0] + dLat, base[1] + dLng],
      [base[0] - dLat, base[1] + dLng],
      [base[0] - dLat, base[1] - dLng],
    ];
    const demoField = createFarmField("Sample Farm Field", "Wheat", corners, 0);
    setFields([demoField]);
    setSelectedFieldId(demoField.id);
    setIsDrawing(false);
    setDraftPoints([]);
    setPlannerStep("inputs");
    setIsPlannerOpen(true);
  }, [globeView.center, mapView.center]);

  const handleUpdateFieldName = useCallback(
    (name: string) => {
      if (!selectedFieldId) return;
      setFields((prev) =>
        prev.map((f) => (f.id === selectedFieldId ? { ...f, name } : f))
      );
    },
    [selectedFieldId]
  );

  const handleExportGeoJSON = useCallback(() => {
    exportFieldsToGeoJSON(fieldsRef.current);
  }, []);

  const runLocationSearch = useCallback(
    async (rawQuery: string) => {
      const q = rawQuery.trim();
      if (!q) return;

      setHasUsedLocationTool(true);
      setSearchQuery(q);
      setIsSearching(true);
      setSearchMessage(null);

      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
            q
          )}`
        );
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const lat = parseFloat(data[0].lat);
          const lon = parseFloat(data[0].lon);
          flyTo([lat, lon], 14);
        } else {
          setSearchMessage("Location not found. Try a village or city name.");
        }
      } catch {
        setSearchMessage("Search unavailable right now.");
      } finally {
        setIsSearching(false);
      }
    },
    [flyTo]
  );

  const handleSearchLocation = (e: React.FormEvent) => {
    e.preventDefault();
    void runLocationSearch(searchQuery);
  };

  const handleFlyToCoords = useCallback(
    (lat: number, lng: number) => {
      setHasUsedLocationTool(true);
      setSearchMessage(null);
      flyTo([lat, lng], 15);
    },
    [flyTo]
  );

  const handleLocateMe = useCallback(() => {
    setHasUsedLocationTool(true);
    if (!navigator.geolocation) {
      setSearchMessage("GPS is not supported by your browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        flyTo([pos.coords.latitude, pos.coords.longitude], 16);
      },
      () => {
        setSearchMessage("Could not access your GPS location.");
      }
    );
  }, [flyTo]);

  const activeHeaderStep: 1 | 2 | 3 =
    !selectedField || isDrawing || plannerStep === "idle"
      ? 1
      : plannerStep === "inputs"
        ? 2
        : 3;

  return (
    <div className="relative h-dvh w-screen flex flex-col bg-[#070B0E] text-[#F2F7F4] overflow-hidden">
      {/* Top Navigation Bar (Guided 3-Step Flow Header — No Sidebar) */}
      <header
        className={`shrink-0 bg-[#0B1015]/95 backdrop-blur-xl border-white/10 px-4 flex items-center justify-between gap-3 z-20 transition-all duration-500 ease-out ${
          isWelcomeOpen
            ? "-translate-y-full opacity-0 pointer-events-none h-0 border-0 overflow-hidden"
            : "translate-y-0 opacity-100 h-14 border-b"
        }`}
      >
        {/* Left: Brand + Home */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-xl bg-[#A3E4B7]/15 border border-[#A3E4B7]/30 text-[#A3E4B7] flex items-center justify-center shadow-sm">
            <Satellite className="w-4 h-4" />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-sm font-bold text-[#F2F7F4] leading-tight">
              TerraPulse Agri
            </h1>
            <p className="text-[10px] text-[#8A9B93] font-medium">
              NASA Crop Planner
            </p>
          </div>
          <button
            type="button"
            onClick={handleReturnToWelcome}
            title="Return to Welcome Home"
            className="ml-1 inline-flex items-center gap-1 px-3 py-1 rounded-full border border-white/10 bg-[#121A21] hover:bg-[#19242E] text-[#F2F7F4] text-xs font-medium transition"
          >
            <Home className="w-3.5 h-3.5 text-[#A3E4B7]" />
            <span className="hidden xl:inline">Home</span>
          </button>
          <button
            type="button"
            onClick={() => setIsTutorialOpen(true)}
            title="Start Guided Tour"
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full border border-[#A3E4B7]/35 bg-[#A3E4B7]/10 hover:bg-[#A3E4B7]/20 text-[#A3E4B7] text-xs font-semibold transition"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Guided Tour</span>
          </button>
        </div>

        {/* Center-Left: 3-Step Workflow Progress Indicator (Tablet & Desktop) */}
        <nav
          data-tour="step-progress"
          aria-label="Farm planning steps"
          className="hidden md:flex items-center gap-1 px-2 py-1 rounded-full bg-[#111920] border border-white/[0.08] text-[11px] font-semibold shrink-0"
        >
          <span
            className={`px-2 py-0.5 rounded-full transition ${
              activeHeaderStep === 1
                ? "bg-[#A3E4B7]/20 text-[#A3E4B7]"
                : "text-[#8A9B93]"
            }`}
          >
            1. Mark<span className="hidden xl:inline"> Field</span>
          </span>
          <span className="text-white/20">&rsaquo;</span>
          <button
            type="button"
            disabled={!selectedField}
            onClick={() => {
              if (!selectedField) return;
              setPlannerStep("inputs");
              setIsPlannerOpen(true);
            }}
            className={`px-2 py-0.5 rounded-full transition disabled:opacity-45 ${
              activeHeaderStep === 2
                ? "bg-[#A3E4B7]/20 text-[#A3E4B7]"
                : "text-[#8A9B93] hover:text-[#F2F7F4]"
            }`}
          >
            2. <span className="hidden xl:inline">Farm </span>Inputs
          </button>
          <span className="text-white/20">&rsaquo;</span>
          <button
            type="button"
            disabled={!selectedField}
            onClick={() => {
              if (!selectedField) return;
              setPlannerStep("plans");
              setIsPlannerOpen(true);
            }}
            className={`px-2 py-0.5 rounded-full transition disabled:opacity-45 ${
              activeHeaderStep === 3
                ? "bg-[#A3E4B7]/20 text-[#A3E4B7]"
                : "text-[#8A9B93] hover:text-[#F2F7F4]"
            }`}
          >
            3. Crop Plan
          </button>
        </nav>

        {/* Location Search */}
        <form
          data-tour="location-search"
          onSubmit={handleSearchLocation}
          className="flex-1 max-w-sm flex items-center gap-1.5"
        >
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-[#8A9B93] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search village, region, or farm..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#121A21] border border-white/10 text-[#F2F7F4] placeholder:text-[#64766E] rounded-full focus:bg-[#162028] focus:outline-none focus:ring-2 focus:ring-[#A3E4B7]/40 transition"
            />
          </div>
          <button
            type="submit"
            disabled={isSearching}
            className="px-3 py-1.5 text-xs font-semibold bg-[#162028] hover:bg-[#1E2B35] border border-white/10 text-[#F2F7F4] rounded-full transition disabled:opacity-50"
          >
            {isSearching ? "..." : "Go"}
          </button>
          <button
            type="button"
            onClick={handleLocateMe}
            title="Jump to my current location"
            className="p-1.5 rounded-full border border-white/10 bg-[#121A21] hover:bg-[#19242E] text-[#A3E4B7] transition"
          >
            <LocateFixed className="w-4 h-4" />
          </button>
        </form>

        {/* Primary Action: Mark My Field */}
        <div className="flex items-center gap-2 shrink-0">
          {searchMessage && (
            <span className="text-[11px] text-rose-400 hidden xl:inline">
              {searchMessage}
            </span>
          )}
          <button
            data-tour="mark-field-btn"
            type="button"
            onClick={isDrawing ? handleCancelDrawing : handleStartDrawing}
            className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold shadow-sm transition ${
              isDrawing
                ? "bg-amber-400 hover:bg-amber-300 text-[#070B0E]"
                : "bg-white hover:bg-[#A3E4B7] text-[#070B0E]"
            }`}
          >
            {isDrawing ? (
              <>
                <Crosshair className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Drawing Active</span>
              </>
            ) : (
              <>
                <PenTool className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Mark My Field</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Full-Screen Interactive Globe / 2D Map Stage (No Sidebar Dashboard) */}
      <main className="relative flex-1 w-full h-full min-h-0 overflow-hidden bg-[#070B0E]">
        {/* Persistent 3D Globe Layer with cross-fade & zoom transition */}
        <div
          className={`absolute inset-0 transition-all duration-500 ease-out ${
            viewMode === "globe"
              ? "opacity-100 scale-100 z-10 pointer-events-auto"
              : "opacity-0 scale-110 z-0 pointer-events-none"
          }`}
        >
          <Globe3D
            isActive={viewMode === "globe"}
            fields={fields}
            selectedFieldId={selectedFieldId}
            onSelectField={handleSelectField}
            initialView={globeView}
            flyToTarget={flyToTarget}
            povTarget={globePovTarget}
            onZoomIntoMap={enterMap}
            onViewChange={handleGlobeViewChange}
          />
        </div>

        {/* Persistent 2D Leaflet Map Layer with cross-fade & scale transition */}
        <div
          className={`absolute inset-0 transition-all duration-500 ease-in-out ${
            viewMode === "map"
              ? "opacity-100 scale-100 z-20 pointer-events-auto"
              : "opacity-0 scale-95 z-0 pointer-events-none"
          }`}
        >
          <FarmMap
            isActive={viewMode === "map"}
            fields={fields}
            selectedFieldId={selectedFieldId}
            onSelectField={handleSelectField}
            isDrawing={isDrawing}
            draftPoints={draftPoints}
            onAddDraftPoint={handleAddDraftPoint}
            onUndoDraftPoint={handleUndoDraftPoint}
            onClearDraft={handleClearDraft}
            onFinishDrawing={handleFinishDrawing}
            onCancelDrawing={handleCancelDrawing}
            baseMap={baseMap}
            gibsLayer={gibsLayer}
            gibsDate={gibsDate}
            gibsOpacity={gibsOpacity}
            flyToTarget={flyToTarget}
            initialView={mapView}
            onZoomOutToGlobe={enterGlobe}
          />
        </div>

        {/* 3D Earth / 2D Map Toggle */}
        <div
          data-tour="view-switcher"
          className={`absolute top-3 left-1/2 -translate-x-1/2 z-[450] flex items-center gap-1 p-1 rounded-full bg-[#0D1318]/90 backdrop-blur-xl border border-white/10 shadow-xl transition-opacity ${
            isWelcomeOpen
              ? "opacity-0 pointer-events-none duration-500"
              : "opacity-100 duration-700"
          }`}
        >
          <button
            type="button"
            disabled={isDrawing}
            onClick={() => {
              if (viewMode === "globe") return;
              setHasUsedLocationTool(true);
              enterGlobe(selectedField?.centroid ?? mapView.center, 3);
            }}
            aria-pressed={viewMode === "globe"}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition disabled:opacity-40 ${
              viewMode === "globe"
                ? "bg-white text-[#070B0E]"
                : "text-[#8A9B93] hover:text-[#F2F7F4]"
            }`}
          >
            <Globe2 className="w-3.5 h-3.5" />
            3D Earth
          </button>
          <button
            type="button"
            onClick={() => {
              if (viewMode === "map") return;
              setHasUsedLocationTool(true);
              const pov = globePovRef.current;
              if (pov && pov.altitude < 0.6) {
                flyTo(
                  pov.center,
                  Math.max(altitudeToZoom(pov.altitude), 12)
                );
              } else if (selectedField) {
                flyTo(selectedField.centroid, 15);
              } else {
                enterMap(globeView.center, 15);
              }
            }}
            aria-pressed={viewMode === "map"}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition ${
              viewMode === "map"
                ? "bg-white text-[#070B0E]"
                : "text-[#8A9B93] hover:text-[#F2F7F4]"
            }`}
          >
            <MapIcon className="w-3.5 h-3.5" />
            2D Map
          </button>
        </div>

        {/* Floating Bottom Guidance Bar — Stage 2 (Bottom-Left away from Quick Practice) */}
        {!isWelcomeOpen && !isDrawing && !selectedField && !isTutorialOpen && (
          <div className="absolute bottom-4 left-4 z-[450] w-[calc(100%-2rem)] max-w-lg px-4 py-3 rounded-2xl bg-[#0D1318]/92 backdrop-blur-xl border border-white/10 shadow-2xl flex flex-wrap items-center justify-between gap-2.5">
            <div className="min-w-[180px] flex-1">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#A3E4B7]">
                Step 1 of 3 &bull; Find &amp; Mark Your Land
              </div>
              <p className="text-xs text-[#C7D4CD] mt-0.5">
                {viewMode === "globe"
                  ? "Find your region by search, GPS, or globe—then mark your field."
                  : "Pan to your land parcel, then tap Mark My Field."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleQuickDemoField}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-white/15 bg-[#121A21] hover:bg-[#19242E] text-xs font-semibold text-[#C7D4CD] transition"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#A3E4B7]" />
                Demo Field
              </button>
              <button
                type="button"
                onClick={handleStartDrawing}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white hover:bg-[#A3E4B7] text-[#070B0E] text-xs font-bold transition"
              >
                <PenTool className="w-3.5 h-3.5" />
                Mark My Field
              </button>
            </div>
          </div>
        )}

        {/* Floating Bottom Field Bar — Bottom-Left away from Quick Practice */}
        {!isWelcomeOpen &&
          !isDrawing &&
          selectedField &&
          !isPlannerOpen &&
          !isTutorialOpen && (
            <div className="absolute bottom-4 left-4 z-[450] w-[calc(100%-2rem)] max-w-md px-4 py-3 rounded-2xl bg-[#0D1318]/92 backdrop-blur-xl border border-[#A3E4B7]/35 shadow-2xl flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#A3E4B7]">
                  Marked Field Ready
                </div>
                <div className="text-xs sm:text-sm font-bold text-[#F2F7F4]">
                  {selectedField.name} &bull;{" "}
                  <span className="text-[#A3E4B7]">
                    {selectedField.areaHectares.toFixed(2)} ha
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleStartDrawing}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-white/10 bg-[#121A21] hover:bg-[#19242E] text-xs font-semibold text-[#C7D4CD] transition"
                >
                  <PenTool className="w-3.5 h-3.5" />
                  Mark New Field
                </button>
                <button
                  type="button"
                  onClick={() => setIsPlannerOpen(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white hover:bg-[#A3E4B7] text-[#070B0E] text-xs font-bold transition"
                >
                  {plannerStep === "plans"
                    ? "Open Crop Plan"
                    : "Open Crop Plan / Inputs"}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

        {/* Floating NASA Layers & Base Map Control (Top Right) — 2D map only */}
        {viewMode === "map" && (
          <div className="absolute top-3 right-3 z-[400] flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={() => setShowLayerPanel((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#0D1318]/92 backdrop-blur-xl border border-white/10 shadow-lg text-xs font-semibold text-[#F2F7F4] hover:border-[#A3E4B7]/40 transition"
            >
              <Layers className="w-3.5 h-3.5 text-[#A3E4B7]" />
              NASA &amp; Map Layers
            </button>

            {showLayerPanel && (
              <div className="w-64 bg-[#0D1318]/92 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-3 space-y-3 text-[#F2F7F4]">
                {/* Base Map Toggle */}
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#8A9B93] mb-1.5 flex items-center gap-1">
                    <MapIcon className="w-3 h-3" />
                    Base Map
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setBaseMap("satellite")}
                      className={`py-1.5 rounded-xl text-xs font-semibold border transition ${
                        baseMap === "satellite"
                          ? "bg-white text-[#070B0E] border-white"
                          : "bg-[#121A21] text-[#8A9B93] border-white/10 hover:text-[#F2F7F4]"
                      }`}
                    >
                      Satellite
                    </button>
                    <button
                      type="button"
                      onClick={() => setBaseMap("street")}
                      className={`py-1.5 rounded-xl text-xs font-semibold border transition ${
                        baseMap === "street"
                          ? "bg-white text-[#070B0E] border-white"
                          : "bg-[#121A21] text-[#8A9B93] border-white/10 hover:text-[#F2F7F4]"
                      }`}
                    >
                      Street Map
                    </button>
                  </div>
                </div>

                {/* NASA GIBS Satellite Overlays */}
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#8A9B93] mb-1.5 flex items-center gap-1">
                    <Satellite className="w-3 h-3 text-sky-400" />
                    NASA GIBS Overlay
                  </div>
                  <div className="space-y-1">
                    {gibsLayers.map((layer) => (
                      <button
                        key={layer.id}
                        type="button"
                        onClick={() => setGibsLayer(layer.id)}
                        className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-medium border transition ${
                          gibsLayer === layer.id
                            ? "bg-[#A3E4B7]/15 border-[#A3E4B7]/50 text-[#A3E4B7] font-semibold"
                            : "bg-[#121A21] border-white/[0.08] text-[#C7D4CD] hover:border-white/20"
                        }`}
                      >
                        {layer.shortLabel}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Overlay Date & Opacity */}
                {gibsLayer !== "none" && (
                  <div className="pt-2 border-t border-white/10 space-y-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-[#8A9B93] mb-1">
                        Satellite Pass Date
                      </label>
                      <input
                        type="date"
                        value={gibsDate}
                        max={maxGibsDate}
                        onChange={(e) => setGibsDate(e.target.value)}
                        className="w-full text-xs px-2 py-1 rounded-lg border border-white/10 bg-[#121A21] text-[#F2F7F4] focus:outline-none focus:ring-1 focus:ring-[#A3E4B7]"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-[10px] font-semibold text-[#8A9B93] mb-1">
                        <span className="inline-flex items-center gap-1">
                          <SlidersHorizontal className="w-3 h-3" />
                          Overlay Opacity
                        </span>
                        <span>{Math.round(gibsOpacity * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0.15}
                        max={1}
                        step={0.05}
                        value={gibsOpacity}
                        onChange={(e) =>
                          setGibsOpacity(parseFloat(e.target.value))
                        }
                        className="w-full accent-[#A3E4B7]"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Interactive Spotlight Guided Tour & Quick Practice Checklist */}
      <TutorialOverlay
        isOpen={isTutorialOpen}
        onToggle={setIsTutorialOpen}
        isWelcomeOpen={isWelcomeOpen}
        hasUsedLocationTool={hasUsedLocationTool}
        hasMarkedField={Boolean(selectedField)}
        hasGeneratedPlan={plannerStep === "plans"}
        onEnterFromWelcome={handleEnterFromWelcome}
        onSearchLocation={(q) => void runLocationSearch(q)}
        onLocateMe={handleLocateMe}
        onFlyToCoords={handleFlyToCoords}
        onStartDrawing={handleStartDrawing}
        onQuickDemoField={handleQuickDemoField}
      />

      {/* Stage 3 & Stage 4 Modal: Farmer Ground-Truth Inputs -> Generated Crop Cycle Plans */}
      {selectedField && plannerStep !== "idle" && (
        <FarmPlannerModal
          isOpen={isPlannerOpen}
          step={plannerStep}
          field={selectedField}
          inputs={groundInputs}
          onChangeInputs={setGroundInputs}
          onUpdateFieldName={handleUpdateFieldName}
          onGeneratePlans={() => setPlannerStep("plans")}
          onBackToInputs={() => setPlannerStep("inputs")}
          onMinimizeToMap={() => setIsPlannerOpen(false)}
          onRedrawField={handleStartDrawing}
          onExportGeoJSON={handleExportGeoJSON}
          nasaData={nasaData}
          isLoadingNasa={isLoadingNasa}
        />
      )}

      {/* Stage 1: Welcome Home Screen Overlay — NOVA aesthetic */}
      <section
        aria-label="Welcome to TerraPulse Agri"
        aria-hidden={!isWelcomeOpen}
        className={`fixed inset-0 z-[500] flex flex-col items-center justify-center px-6 text-center transition-all duration-700 ease-out ${
          isWelcomeOpen
            ? "opacity-100 scale-100 pointer-events-auto"
            : "opacity-0 scale-105 pointer-events-none"
        }`}
        style={{
          background:
            "radial-gradient(circle at center, rgba(7, 11, 14, 0.22) 0%, rgba(7, 11, 14, 0.84) 100%)",
        }}
      >
        <div className="max-w-2xl mx-auto flex flex-col items-center gap-5">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#10181F]/80 border border-white/10 text-[#A3E4B7] text-[11px] font-semibold tracking-[0.2em] uppercase backdrop-blur-md">
            <span className="w-1.5 h-1.5 rounded-full bg-[#A3E4B7] animate-pulse" />
            System Status &bull; NASA Earth Observation
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-[#F2F7F4] drop-shadow-lg leading-[1.06]">
            EXPLORE.
            <br />
            MONITOR.
            <br />
            <span className="text-[#A3E4B7]">CULTIVATE.</span>
          </h1>

          <p className="text-sm sm:text-base md:text-lg text-[#9DB0A7] max-w-xl leading-relaxed drop-shadow">
            Welcome to{" "}
            <span className="text-[#F2F7F4] font-semibold">TerraPulse Agri</span>{" "}
            — mark your farm boundary on the 3D Earth, enter your water supply
            &amp; last crop, and get personalized NASA-backed crop rotation
            plans.
          </p>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <button
              data-tour="welcome-cta"
              type="button"
              onClick={handleEnterFromWelcome}
              className="group inline-flex items-center gap-2.5 px-7 py-3.5 rounded-full bg-white hover:bg-[#A3E4B7] text-[#070B0E] text-xs sm:text-sm font-bold uppercase tracking-[0.14em] shadow-2xl transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-[#A3E4B7]/60"
            >
              <Globe2 className="w-4 h-4" />
              View 3D Earth
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
