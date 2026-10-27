import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  BellOff,
  Bluetooth,
  Calendar as CalendarIcon,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clipboard,
  Clock,
  Copy,
  CornerDownLeft,
  Cpu,
  ExternalLink,
  FileText,
  FolderOpen,
  Gauge,
  Globe,
  Headphones,
  Image as ImageIcon,
  Keyboard,
  Link2,
  ListTodo,
  Lock,
  MessageSquareQuote,
  Mic,
  MicOff,
  Minus,
  Monitor,
  Moon,
  Music,
  Pause,
  Phone,
  Pin,
  Play,
  Plus,
  RotateCcw,
  Search,
  Send,
  Settings,
  ShieldAlert,
  SkipBack,
  SkipForward,
  Sparkles,
  Speaker,
  Square,
  Sun,
  Terminal,
  Timer,
  Trash2,
  Upload,
  Video,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import { BotCanvas } from './components/BotCanvas';
import { IslandSurface } from './components/IslandSurface';
import {
  BotColorName,
  BotForm,
  BotShapeName,
  COLORS,
  paletteFor,
  SHAPES,
} from './core/bot';
import { CalendarEvent, parseEventLine } from './core/calendar';
import { parseLrc, SAMPLE_TRACKS } from './core/lrc';
import {
  DEFAULT_POMODORO_CONFIG,
  formatTimerMs,
  Phase,
  phaseLabel,
} from './core/pomodoro';

type PageId =
  | 'call'
  | 'music'
  | 'notifications'
  | 'focus'
  | 'reminders'
  | 'shelf'
  | 'calendar'
  | 'usage';

interface ReminderItem {
  id: number;
  title: string;
  doneAt?: number;
}

interface ClipItem {
  id: number;
  kind: 'text' | 'code' | 'link' | 'image' | 'file';
  content: string;
  subtitle?: string;
  app: string;
  age: string;
  pinned: boolean;
  gradient?: string;
}

interface ShelfFileItem {
  id: number;
  name: string;
  kind: 'image' | 'pdf' | 'code' | 'archive';
  size: string;
  accentRgb: [number, number, number];
  previewGradient?: string;
}

interface NotificationItem {
  id: number;
  app: string;
  title: string;
  body: string;
  time: string;
  seen: boolean;
  actions: string[];
}

interface PeekAlert {
  id: string;
  kind:
    | 'charging'
    | 'low-battery'
    | 'volume'
    | 'brightness'
    | 'capslock'
    | 'earbuds'
    | 'meeting'
    | 'agent-ask'
    | 'assistant-done';
  title: string;
  subtitle?: string;
  valueText?: string;
  level?: number;
  accentColor: string;
  codeLine?: string;
  project?: string;
  agentName?: 'Claude Code' | 'Codex';
  meetingUrl?: string;
  answeredState?: 'allowed' | 'always' | 'denied';
}

interface ChatTurn {
  id: number;
  userText: string;
  steps: string[];
  commandCard?: {
    purpose: string;
    command: string;
    riskLabel: string;
    riskLevel: 'amber' | 'red';
    status: 'pending' | 'running' | 'done' | 'denied';
    durationText?: string;
    logs?: string[];
  };
  replyText: string;
  timestamp: string;
}

export default function App() {
  // ── Clock & Top Bar State ──
  const [nowDate, setNowDate] = useState(() => new Date());
  const [use24Hour, setUse24Hour] = useState(true);
  const [barOpacity, setBarOpacity] = useState(0.18); // 0 = glass, 1 = solid black
  const [hangingCompact, setHangingCompact] = useState(false);
  const [openOnHover, setOpenOnHover] = useState(true);

  useEffect(() => {
    const id = setInterval(() => setNowDate(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Island Presentation State ──
  // 'compact' | 'peek' | 'voice' | 'expanded'
  const [isHovered, setIsHovered] = useState(false);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activePage, setActivePage] = useState<PageId>('music');
  const [nudgeCount, setNudgeCount] = useState(0);
  const hoverTimerRef = useRef<number | null>(null);
  const leaveTimerRef = useRef<number | null>(null);

  // ── Live Activities & Privacy State ──
  const [dnd, setDnd] = useState(false);
  const [callActive, setCallActive] = useState(false);
  const [callMuted, setCallMuted] = useState(false);
  const [callSeconds, setCallSeconds] = useState(75);
  const [callService, setCallService] = useState<'Google Meet' | 'WhatsApp'>('Google Meet');
  const [screenRecording, setScreenRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [privacyDots, setPrivacyDots] = useState({
    camera: false,
    microphone: false,
    screenShare: false,
  });

  useEffect(() => {
    if (!callActive) return;
    const id = setInterval(() => setCallSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [callActive]);

  useEffect(() => {
    if (!screenRecording) {
      setRecordSeconds(0);
      return;
    }
    const id = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [screenRecording]);

  // ── Music & Synced Lyrics State ──
  const [trackIndex, setTrackIndex] = useState(0);
  const currentTrack = SAMPLE_TRACKS[trackIndex];
  const [isPlaying, setIsPlaying] = useState(true);
  const [trackPosMs, setTrackPosMs] = useState(8200);
  const [lyricsMode, setLyricsMode] = useState(false);
  const [audioOutputMode, setAudioOutputMode] = useState(false);
  const [volume, setVolume] = useState(74);
  const [selectedOutput, setSelectedOutput] = useState<'speakers' | 'airbuds' | 'hdmi'>('airbuds');

  const parsedLyrics = useMemo(() => parseLrc(currentTrack.lrc), [currentTrack]);

  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => {
      setTrackPosMs((prev) => {
        if (prev + 250 >= currentTrack.durationMs) {
          return 0;
        }
        return prev + 250;
      });
    }, 250);
    return () => clearInterval(id);
  }, [isPlaying, currentTrack.durationMs]);

  const activeLyricIndex = useMemo(() => {
    let idx = 0;
    for (let i = 0; i < parsedLyrics.length; i++) {
      if (parsedLyrics[i].timeMs <= trackPosMs) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [parsedLyrics, trackPosMs]);

  // ── Focus (Pomodoro) State ──
  const [pomoConfig, setPomoConfig] = useState(DEFAULT_POMODORO_CONFIG);
  const [pomoPhase, setPomoPhase] = useState<Phase>(Phase.Idle);
  const [pomoRunning, setPomoRunning] = useState(false);
  const [pomoRemainingMs, setPomoRemainingMs] = useState(
    DEFAULT_POMODORO_CONFIG.focusMinutes * 60_000
  );
  const [pomoDurationMs, setPomoDurationMs] = useState(
    DEFAULT_POMODORO_CONFIG.focusMinutes * 60_000
  );

  useEffect(() => {
    if (!pomoRunning) return;
    const id = setInterval(() => {
      setPomoRemainingMs((prev) => {
        if (prev <= 1000) {
          const nextPhase =
            pomoPhase === Phase.Focus ? Phase.ShortBreak : Phase.Focus;
          const nextDur =
            (nextPhase === Phase.Focus
              ? pomoConfig.focusMinutes
              : pomoConfig.shortBreakMinutes) * 60_000;
          setPomoPhase(nextPhase);
          setPomoDurationMs(nextDur);
          return nextDur;
        }
        return prev - 1000;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [pomoRunning, pomoPhase, pomoConfig]);

  // ── Reminders State ──
  const [reminders, setReminders] = useState<ReminderItem[]>([
    { id: 1, title: 'Review zbus D-Bus interface signatures for isled 1.4' },
    { id: 2, title: 'Test Vulkan shader compilation on Intel Arc GPU' },
    { id: 3, title: 'Send release notes for GNOME Shell 50 & 51 support' },
  ]);
  const [newReminderText, setNewReminderText] = useState('');
  const [editingReminderId, setEditingReminderId] = useState<number | null>(null);
  const [editingReminderText, setEditingReminderText] = useState('');

  const toggleReminder = (id: number) => {
    setReminders((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, doneAt: r.doneAt ? undefined : Date.now() } : r
      )
    );
    setTimeout(() => {
      setReminders((prev) =>
        prev.filter((r) => !(r.id === id && r.doneAt && Date.now() - r.doneAt >= 850))
      );
    }, 900);
  };

  // ── Shelf (Clipboard + Files Tray) State ──
  const [shelfTab, setShelfTab] = useState<'clipboard' | 'files'>('clipboard');
  const [clipFilter, setClipFilter] = useState<'all' | 'text' | 'link' | 'image' | 'file'>('all');
  const [clipSearchOpen, setClipSearchOpen] = useState(false);
  const [clipSearch, setClipSearch] = useState('');
  const [copiedClipId, setCopiedClipId] = useState<number | null>(null);
  const [clips, setClips] = useState<ClipItem[]>([
    {
      id: 1,
      kind: 'code',
      content: 'systemctl --user status isled\njournalctl --user -u isled -f',
      app: 'Terminal',
      age: '2m',
      pinned: true,
    },
    {
      id: 2,
      kind: 'link',
      content: 'https://github.com/zickrian/isle/releases/tag/v1.4.0',
      subtitle: 'github.com',
      app: 'Firefox',
      age: '14m',
      pinned: true,
    },
    {
      id: 3,
      kind: 'text',
      content: 'Size uses one spring for growing and shrinking: stiffness 155, damping 18.',
      app: 'Text Editor',
      age: '28m',
      pinned: false,
    },
    {
      id: 4,
      kind: 'image',
      content: 'wayland-notch-screenshot.png',
      subtitle: '1920 × 1080 · 312 KB',
      app: 'Screenshot',
      age: '1h',
      pinned: false,
      gradient: 'linear-gradient(135deg, #312e81 0%, #0284c7 50%, #10b981 100%)',
    },
  ]);

  const [shelfFiles, setShelfFiles] = useState<ShelfFileItem[]>([
    {
      id: 101,
      name: 'product-spec.pdf',
      kind: 'pdf',
      size: '420 KB',
      accentRgb: [1, 0.27, 0.23],
      previewGradient: 'linear-gradient(135deg, #7f1d1d, #ef4444)',
    },
    {
      id: 102,
      name: 'clouds-wallpaper.png',
      kind: 'image',
      size: '2.4 MB',
      accentRgb: [0.18, 0.78, 0.68],
      previewGradient: 'linear-gradient(135deg, #0f766e, #38bdf8)',
    },
    {
      id: 103,
      name: 'isle-1.4.0-x86_64.tar.gz',
      kind: 'archive',
      size: '7.5 MB',
      accentRgb: [1, 0.62, 0.04],
      previewGradient: 'linear-gradient(135deg, #78350f, #f59e0b)',
    },
  ]);
  const [copiedFileId, setCopiedFileId] = useState<number | null>(null);
  const [shelfCornerGlow, setShelfCornerGlow] = useState<[number, number, number] | null>(null);
  const [isDraggingOverShelf, setIsDraggingOverShelf] = useState(false);

  // ── Notifications State ──
  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: 1,
      app: 'GitHub',
      title: 'zickrian/isle · Pull Request #48',
      body: 'feat(whisper): offload ggml-vulkan matrix multiplication on AMD RDNA3',
      time: '3m ago',
      seen: false,
      actions: ['Reply', 'Mark as read'],
    },
    {
      id: 2,
      app: 'Telegram',
      title: 'Aris Pratama',
      body: 'Joined the design sync call — link is in the calendar invite!',
      time: '18m ago',
      seen: false,
      actions: ['Reply', 'Mark as read'],
    },
    {
      id: 3,
      app: 'System',
      title: 'Battery Charge Limit Active',
      body: 'Charging stops at 80% as configured by Isle Assistant.',
      time: '1h ago',
      seen: true,
      actions: ['Keep at 80%'],
    },
  ]);

  const unseenCount = useMemo(
    () => notifications.filter((n) => !n.seen).length,
    [notifications]
  );

  // ── Calendar & World Clocks State ──
  const todayIso = useMemo(() => {
    const y = nowDate.getFullYear();
    const m = (nowDate.getMonth() + 1).toString().padStart(2, '0');
    const d = nowDate.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [nowDate]);

  const [selectedDateIso, setSelectedDateIso] = useState(todayIso);
  const [calInput, setCalInput] = useState('');
  const [showWorldClocksDetail, setShowWorldClocksDetail] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>(() => [
    {
      id: 1,
      title: 'GNOME Shell Extension Architecture Sync',
      date: todayIso,
      start: '14:00',
      end: '14:45',
      source: 'desktop',
      meetingUrl: 'https://meet.google.com/isle-gnome-sync',
      meetingProvider: 'Google Meet',
    },
    {
      id: 2,
      title: 'Release v1.4.0 Package Signing',
      date: todayIso,
      start: '17:30',
      end: '18:00',
      source: 'isle',
    },
    {
      id: 3,
      title: 'Dinner with Sara',
      date: todayIso,
      start: '20:00',
      source: 'isle',
    },
  ]);

  // ── AI Usage State ──
  const [usageProviderIdx, setUsageProviderIdx] = useState(0);
  const usageProviders = [
    {
      id: 'claude',
      name: 'Claude',
      plan: 'Max 5x',
      color: '#d97757',
      updated: 'Updated just now',
      limits: [
        { label: '5-hour window', reset: 'Resets in 2h 14m', percent: 42 },
        { label: 'Weekly limit', reset: 'Resets Thu 09:00', percent: 68 },
      ],
    },
    {
      id: 'chatgpt',
      name: 'ChatGPT',
      plan: 'Plus · Codex',
      color: '#10a37f',
      updated: 'Updated 1m ago',
      limits: [
        { label: '5-hour window', reset: 'Resets in 3h 40m', percent: 24 },
        { label: 'Weekly limit', reset: 'Resets Sun 00:00', percent: 51 },
      ],
    },
  ];

  // ── Bot & Voice Assistant State ──
  const [botShape, setBotShape] = useState<BotShapeName>('squircle');
  const [botColor, setBotColor] = useState<BotColorName>('cloud');
  const [botGlowMode, setBotGlowMode] = useState<'match' | 'classic'>('match');
  const [botForm, setBotForm] = useState<BotForm>('listening');
  const [botGesture, setBotGesture] = useState<{
    type: 'nod' | 'shake' | 'hop';
    id: number;
  } | null>(null);
  const [voiceInputMode, setVoiceInputMode] = useState<'listening' | 'typing'>('listening');
  const [voiceQuery, setVoiceQuery] = useState('');
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([
    {
      id: 1,
      userText: 'Install htop and check how much RAM is free',
      steps: [
        'Checked /etc/os-release (Ubuntu 24.04 LTS)',
        'Checked which htop → not installed',
        'Read free -h → 11.4 GiB available of 16.0 GiB',
      ],
      commandCard: {
        purpose: 'Install htop interactive process viewer',
        command: 'sudo apt install -y htop',
        riskLabel: 'Needs your password',
        riskLevel: 'amber',
        status: 'done',
        durationText: '4.2s',
      },
      replyText:
        'htop 3.3.0 is installed and ready. You have 11.4 GiB of available memory (28% used).',
      timestamp: '19:30',
    },
  ]);

  const activeTurn = chatHistory[chatHistory.length - 1];

  // Simulate gentle voice modulation when listening in voice assistant
  useEffect(() => {
    if (!voiceOpen || voiceInputMode !== 'listening' || botForm !== 'listening') {
      setVoiceLevel(0);
      return;
    }
    const id = setInterval(() => {
      setVoiceLevel(0.15 + Math.random() * 0.45);
    }, 140);
    return () => clearInterval(id);
  }, [voiceOpen, voiceInputMode, botForm]);

  // ── Peek Alert State ──
  const [activeAlert, setActiveAlert] = useState<PeekAlert | null>(null);
  const alertTimeoutRef = useRef<number | null>(null);

  const triggerAlert = (alert: PeekAlert, durationMs = 3600) => {
    if (alertTimeoutRef.current) window.clearTimeout(alertTimeoutRef.current);
    setPinnedOpen(false);
    setIsHovered(false);
    setVoiceOpen(false);
    setActiveAlert(alert);
    if (durationMs > 0) {
      alertTimeoutRef.current = window.setTimeout(() => {
        setActiveAlert(null);
      }, durationMs);
    }
  };

  // Keyboard shortcuts: Super+I / Alt+I for Voice Assistant, Super+V / Alt+V for Clipboard, Esc to close
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.altKey) && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        setActiveAlert(null);
        setPinnedOpen(false);
        setVoiceOpen((v) => !v);
        setBotForm('listening');
      } else if ((e.metaKey || e.altKey) && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        setActiveAlert(null);
        setVoiceOpen(false);
        setActivePage('shelf');
        setShelfTab('clipboard');
        setClipSearchOpen(true);
        setPinnedOpen(true);
      } else if (e.key === 'Escape') {
        if (voiceOpen) setVoiceOpen(false);
        else if (activeAlert) setActiveAlert(null);
        else if (pinnedOpen || isHovered) {
          setPinnedOpen(false);
          setIsHovered(false);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [voiceOpen, activeAlert, pinnedOpen, isHovered]);

  // Mark notifications seen when opening Notifications page
  useEffect(() => {
    if ((isHovered || pinnedOpen) && activePage === 'notifications') {
      setNotifications((prev) => prev.map((n) => ({ ...n, seen: true })));
    }
  }, [isHovered, pinnedOpen, activePage]);

  // Determine current island presentation & dimensions per docs/product-spec.md
  const topBarHeight = hangingCompact ? 26 : 32;
  const isExpanded = isHovered || pinnedOpen;

  const presentation = useMemo(() => {
    if (voiceOpen) {
      const h = chatExpanded ? 390 : activeTurn?.commandCard ? 236 : 118;
      return {
        mode: 'voice' as const,
        width: 600,
        height: topBarHeight + h,
        radius: 30,
        shoulder: 20,
      };
    }
    if (isExpanded) {
      const isWideLyrics = activePage === 'music' && lyricsMode;
      return {
        mode: 'expanded' as const,
        width: isWideLyrics ? 720 : 600,
        height: topBarHeight + 168,
        radius: 32,
        shoulder: 22,
      };
    }
    if (activeAlert) {
      const isAgentAsk = activeAlert.kind === 'agent-ask';
      return {
        mode: 'peek' as const,
        width: isAgentAsk ? 410 : 356,
        height: topBarHeight + (isAgentAsk ? 104 : 58),
        radius: 22,
        shoulder: 13,
      };
    }

    // Compact (Closed) presentation
    const hasActivity =
      callActive ||
      screenRecording ||
      isPlaying ||
      pomoPhase !== Phase.Idle ||
      unseenCount > 0;
    const hasPrivacy =
      privacyDots.camera || privacyDots.microphone || privacyDots.screenShare;
    const baseW = hangingCompact
      ? hasActivity
        ? 256
        : 164
      : hasActivity
      ? 236
      : 148;
    return {
      mode: 'compact' as const,
      width: baseW + (hasPrivacy ? 22 : 0),
      height: hangingCompact ? topBarHeight + 28 : topBarHeight,
      radius: hangingCompact ? 16 : 10,
      shoulder: hangingCompact ? 10 : 7,
    };
  }, [
    voiceOpen,
    chatExpanded,
    activeTurn,
    isExpanded,
    activePage,
    lyricsMode,
    activeAlert,
    topBarHeight,
    hangingCompact,
    callActive,
    screenRecording,
    isPlaying,
    pomoPhase,
    unseenCount,
    privacyDots,
  ]);

  // Determine surface tint (cover wash on lyrics, corner glow on file drop, flowing aura on voice assistant)
  const surfaceTint = useMemo(() => {
    if (voiceOpen) {
      return {
        style: 'aura' as const,
        rgb: currentTrack.tintRgb,
        aura: paletteFor(botColor, botGlowMode).glow,
      };
    }
    if (shelfCornerGlow && isExpanded && activePage === 'shelf') {
      return {
        style: 'glow' as const,
        rgb: shelfCornerGlow,
        aura: paletteFor(botColor, botGlowMode).glow,
      };
    }
    if (isExpanded && activePage === 'music' && lyricsMode) {
      return {
        style: 'wash' as const,
        rgb: currentTrack.tintRgb,
        aura: paletteFor(botColor, botGlowMode).glow,
      };
    }
    return {
      style: 'none' as const,
      rgb: currentTrack.tintRgb,
      aura: paletteFor(botColor, botGlowMode).glow,
    };
  }, [
    voiceOpen,
    shelfCornerGlow,
    isExpanded,
    activePage,
    lyricsMode,
    currentTrack.tintRgb,
    botColor,
    botGlowMode,
  ]);

  const handleIslandMouseEnter = () => {
    if (leaveTimerRef.current) window.clearTimeout(leaveTimerRef.current);
    if (voiceOpen || activeAlert) return;
    if (!openOnHover) return;
    hoverTimerRef.current = window.setTimeout(() => {
      setIsHovered(true);
    }, 120);
  };

  const handleIslandMouseLeave = () => {
    if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    if (pinnedOpen || isDraggingOverShelf) return;
    leaveTimerRef.current = window.setTimeout(() => {
      setIsHovered(false);
    }, 280);
  };

  const formatClock = (date: Date) => {
    const h = date.getHours();
    const m = date.getMinutes().toString().padStart(2, '0');
    if (use24Hour) return `${h.toString().padStart(2, '0')}:${m}`;
    const h12 = h % 12 || 12;
    return `${h12}:${m}`;
  };

  const formatHeaderDate = (date: Date) =>
    date.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });

  const handleSendVoicePrompt = (promptText: string) => {
    const q = promptText.trim();
    if (!q) return;
    setVoiceQuery('');
    setBotForm('thinking');

    const lower = q.toLowerCase();
    const newId = Date.now();

    if (lower.includes('install') || lower.includes('pasang') || lower.includes('update')) {
      const pkg = lower.includes('libreoffice')
        ? 'libreoffice'
        : lower.includes('vlc')
        ? 'vlc'
        : lower.includes('ffmpeg')
        ? 'ffmpeg'
        : 'neovim';
      setTimeout(() => setBotForm('asking'), 450);
      setChatHistory((prev) => [
        ...prev,
        {
          id: newId,
          userText: q,
          steps: [
            'Checked /etc/os-release (Ubuntu 24.04 LTS)',
            `Checked apt-cache policy ${pkg} → candidate found`,
          ],
          commandCard: {
            purpose: `Install ${pkg} via APT package manager`,
            command: `sudo apt install -y ${pkg}`,
            riskLabel: 'Needs your password',
            riskLevel: 'amber',
            status: 'pending',
          },
          replyText: `Ready to install ${pkg}. Approve the command below to run it in a background systemd unit.`,
          timestamp: formatClock(new Date()),
        },
      ]);
    } else if (lower.includes('remind') || lower.includes('ingatkan')) {
      const reminderTitle = q.replace(/^(remind me to|ingatkan saya untuk)\s+/i, '');
      setReminders((prev) => [{ id: Date.now(), title: reminderTitle }, ...prev]);
      setTimeout(() => {
        setBotForm('reply');
        setBotGesture({ type: 'nod', id: Date.now() });
      }, 400);
      setChatHistory((prev) => [
        ...prev,
        {
          id: newId,
          userText: q,
          steps: [`Added "${reminderTitle}" to ~/.local/share/isle/reminders.json`],
          replyText: `Added "${reminderTitle}" to your Reminders list.`,
          timestamp: formatClock(new Date()),
        },
      ]);
    } else if (lower.includes('play') || lower.includes('music') || lower.includes('jazz')) {
      setIsPlaying(true);
      setTrackIndex((i) => (i + 1) % SAMPLE_TRACKS.length);
      setTrackPosMs(0);
      setTimeout(() => {
        setBotForm('reply');
        setBotGesture({ type: 'hop', id: Date.now() });
      }, 400);
      setChatHistory((prev) => [
        ...prev,
        {
          id: newId,
          userText: q,
          steps: [
            'Found active MPRIS player: org.mpris.MediaPlayer2.spotify',
            'Switched track and started playback',
          ],
          replyText: `Playing "${SAMPLE_TRACKS[(trackIndex + 1) % SAMPLE_TRACKS.length].title}" on Spotify with synced lyrics ready.`,
          timestamp: formatClock(new Date()),
        },
      ]);
    } else {
      setTimeout(() => {
        setBotForm('reply');
        setBotGesture({ type: 'nod', id: Date.now() });
      }, 500);
      setChatHistory((prev) => [
        ...prev,
        {
          id: newId,
          userText: q,
          steps: [
            'Checked system load & active windows via GNOME Shell D-Bus',
            'Verified thermal & memory pressure (0% swap used)',
          ],
          replyText:
            'Your GNOME desktop is running smoothly at 60 Hz. isled is using 9.8 MB resident memory with 0% idle CPU.',
          timestamp: formatClock(new Date()),
        },
      ]);
    }
  };

  const handleRunCommandCard = (turnId: number) => {
    setBotForm('running');
    setBotGesture({ type: 'nod', id: Date.now() });
    setChatHistory((prev) =>
      prev.map((t) =>
        t.id === turnId && t.commandCard
          ? {
              ...t,
              commandCard: {
                ...t.commandCard,
                status: 'running',
                logs: [
                  'Reading package lists... Done',
                  'Unpacking & setting up package (systemd transient unit)...',
                ],
              },
            }
          : t
      )
    );
    setTimeout(() => {
      setBotForm('success');
      setChatHistory((prev) =>
        prev.map((t) =>
          t.id === turnId && t.commandCard
            ? {
                ...t,
                commandCard: {
                  ...t.commandCard,
                  status: 'done',
                  durationText: '2.1s',
                },
                replyText:
                  'Verified installation (--version returned 0). Everything is installed and ready.',
              }
            : t
        )
      );
    }, 1800);
  };

  const handleDenyCommandCard = (turnId: number) => {
    setBotForm('reply');
    setBotGesture({ type: 'shake', id: Date.now() });
    setChatHistory((prev) =>
      prev.map((t) =>
        t.id === turnId && t.commandCard
          ? {
              ...t,
              commandCard: {
                ...t.commandCard,
                status: 'denied',
              },
              replyText: 'Command denied. Nothing was changed on your system.',
            }
          : t
      )
    );
  };

  const handleDropSampleFile = () => {
    setActiveAlert(null);
    setVoiceOpen(false);
    setActivePage('shelf');
    setShelfTab('files');
    setPinnedOpen(true);
    if (shelfFiles.length >= 6) return;
    const palette: [number, number, number][] = [
      [0.19, 0.82, 0.35],
      [0.04, 0.52, 1],
      [0.67, 0.56, 1],
    ];
    const pick = palette[shelfFiles.length % palette.length];
    const nextFile: ShelfFileItem = {
      id: Date.now(),
      name: `wayland-trace-${shelfFiles.length + 1}.log`,
      kind: 'code',
      size: '84 KB',
      accentRgb: pick,
      previewGradient: 'linear-gradient(135deg, #1e1b4b, #4338ca)',
    };
    setShelfFiles((prev) => [nextFile, ...prev]);
    setShelfCornerGlow(pick);
    setTimeout(() => setShelfCornerGlow(null), 2200);
  };

  // Pages list per docs/product-spec.md
  const pages: { id: PageId; label: string; icon: React.ReactNode; badge?: boolean }[] = [
    ...(callActive
      ? [
          {
            id: 'call' as const,
            label: 'Call',
            icon: <Phone className="w-3.5 h-3.5 text-[#30d158]" />,
          },
        ]
      : []),
    { id: 'music', label: 'Music', icon: <Music className="w-3.5 h-3.5" /> },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: <Bell className="w-3.5 h-3.5" />,
      badge: unseenCount > 0,
    },
    { id: 'focus', label: 'Focus', icon: <Timer className="w-3.5 h-3.5" /> },
    {
      id: 'reminders',
      label: 'Reminders',
      icon: <ListTodo className="w-3.5 h-3.5" />,
    },
    { id: 'shelf', label: 'Shelf', icon: <FolderOpen className="w-3.5 h-3.5" /> },
    {
      id: 'calendar',
      label: 'Calendar',
      icon: <CalendarIcon className="w-3.5 h-3.5" />,
    },
    { id: 'usage', label: 'Usage', icon: <Gauge className="w-3.5 h-3.5" /> },
  ];

  // Calendar grid helper
  const calendarDays = useMemo(() => {
    const year = nowDate.getFullYear();
    const month = nowDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const startOffset = (firstDay.getDay() + 6) % 7; // Monday first
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: { day: number | null; iso: string; hasEvent: boolean }[] = [];
    for (let i = 0; i < startOffset; i++) {
      cells.push({ day: null, iso: `pad-${i}`, hasEvent: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const mStr = (month + 1).toString().padStart(2, '0');
      const dStr = d.toString().padStart(2, '0');
      const iso = `${year}-${mStr}-${dStr}`;
      const hasEvent = events.some((e) => e.date === iso);
      cells.push({ day: d, iso, hasEvent });
    }
    return cells;
  }, [nowDate, events]);

  const selectedDayEvents = useMemo(
    () => events.filter((e) => e.date === selectedDateIso),
    [events, selectedDateIso]
  );

  // Focus ring progress
  const focusProgress = useMemo(() => {
    if (pomoPhase === Phase.Idle || pomoDurationMs <= 0) return 0;
    return Math.max(0, Math.min(1, 1 - pomoRemainingMs / pomoDurationMs));
  }, [pomoPhase, pomoRemainingMs, pomoDurationMs]);

  return (
    <div
      className="relative w-screen h-screen overflow-hidden flex flex-col justify-between select-none"
      style={{
        background:
          'radial-gradient(circle at 50% 0%, #1e293b 0%, #0f172a 42%, #090d16 100%)',
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!isDraggingOverShelf) {
          setIsDraggingOverShelf(true);
          setActivePage('shelf');
          setShelfTab('files');
          setPinnedOpen(true);
        }
      }}
      onDragLeave={() => setIsDraggingOverShelf(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingOverShelf(false);
        handleDropSampleFile();
      }}
    >
      {/* Subtle Desktop Wallpaper Ambient Light */}
      <div
        className="pointer-events-none absolute inset-0 opacity-35"
        style={{
          backgroundImage:
            'radial-gradient(650px circle at 20% 25%, rgba(56, 189, 248, 0.14), transparent 70%), radial-gradient(750px circle at 80% 20%, rgba(139, 92, 246, 0.14), transparent 70%)',
        }}
      />

      {/* ── GNOME TOP BAR ── */}
      <header
        className="relative z-40 w-full flex items-center justify-between px-3.5 text-[13px] font-medium text-white transition-colors"
        style={{
          height: topBarHeight,
          backgroundColor: `rgba(0, 0, 0, ${barOpacity})`,
          textShadow: barOpacity < 0.5 ? '0 1px 3px rgba(0,0,0,0.55)' : 'none',
        }}
      >
        {/* Left: GNOME Activities pill & active app label */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setPinnedOpen((p) => !p);
              setVoiceOpen(false);
              setActiveAlert(null);
            }}
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-full hover:bg-white/15 transition"
            title="Toggle Isle Expanded View"
          >
            <span className="w-3.5 h-2 rounded-full bg-white inline-block" />
            <span className="w-1.5 h-1.5 rounded-full bg-white/50 inline-block" />
          </button>
          <span className="text-white/85 hidden sm:inline">Isle Desktop</span>
        </div>

        {/* Center: ISLE NOTCH ISLAND */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center">
          <IslandSurface
            width={presentation.width}
            height={presentation.height}
            radius={presentation.radius}
            shoulder={presentation.shoulder}
            topInset={barOpacity > 0.92 ? topBarHeight : 0}
            tintStyle={surfaceTint.style}
            tintRgb={surfaceTint.rgb}
            auraColors={surfaceTint.aura}
            voiceLevel={voiceLevel}
            nudgeTrigger={nudgeCount}
            onMouseEnter={handleIslandMouseEnter}
            onMouseLeave={handleIslandMouseLeave}
            onClick={() => {
              if (presentation.mode === 'compact') {
                setPinnedOpen(true);
              } else if (presentation.mode === 'peek' && activeAlert) {
                if (activeAlert.kind === 'meeting') {
                  setActivePage('calendar');
                  setActiveAlert(null);
                  setPinnedOpen(true);
                } else if (activeAlert.kind !== 'agent-ask') {
                  setActiveAlert(null);
                  setPinnedOpen(true);
                }
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              if (activeAlert) {
                setActiveAlert(null);
              } else if (isExpanded) {
                setPinnedOpen(false);
                setIsHovered(false);
              } else {
                setIsPlaying((p) => !p);
              }
            }}
          >
            {/* 1. COMPACT PRESENTATION */}
            {presentation.mode === 'compact' && (
              <div className="w-full h-full flex items-center justify-between px-3.5 gap-2.5">
                {/* Left slot */}
                <div className="w-6 flex items-center justify-start shrink-0">
                  {screenRecording ? (
                    <span className="w-2.5 h-2.5 rounded-full bg-[#ff453a] animate-pulse" />
                  ) : callActive ? (
                    <Phone className="w-3.5 h-3.5 text-[#30d158]" />
                  ) : pomoPhase !== Phase.Idle ? (
                    <svg className="w-4 h-4 -rotate-90" viewBox="0 0 20 20">
                      <circle
                        cx="10"
                        cy="10"
                        r="7"
                        fill="none"
                        stroke="rgba(255,255,255,0.22)"
                        strokeWidth="2.4"
                      />
                      <circle
                        cx="10"
                        cy="10"
                        r="7"
                        fill="none"
                        stroke={pomoPhase === Phase.Focus ? '#ffffff' : '#30d158'}
                        strokeWidth="2.4"
                        strokeDasharray={44}
                        strokeDashoffset={44 * (1 - focusProgress)}
                        strokeLinecap="round"
                      />
                    </svg>
                  ) : isPlaying ? (
                    <div
                      className="w-4 h-4 rounded-[5px] shrink-0 shadow-inner"
                      style={{
                        background: `linear-gradient(135deg, ${currentTrack.coverGradient[0]}, ${currentTrack.coverGradient[1]})`,
                      }}
                    />
                  ) : unseenCount > 0 ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  ) : null}
                </div>

                {/* Center: Clock or Call/Recording timer */}
                <div className="flex items-center gap-1.5 tnum font-semibold text-[15px] tracking-tight whitespace-nowrap">
                  {dnd && <Moon className="w-3.5 h-3.5 text-white/85 fill-white/85" />}
                  {screenRecording ? (
                    <span className="text-[#ff453a]">
                      {formatTimerMs(recordSeconds * 1000)}
                    </span>
                  ) : callActive ? (
                    <span className="text-[#30d158]">
                      {formatTimerMs(callSeconds * 1000)}
                    </span>
                  ) : (
                    <span>{formatClock(nowDate)}</span>
                  )}
                  {pomoPhase !== Phase.Idle && isPlaying && (
                    <span
                      className={`ml-1 ${
                        pomoPhase === Phase.Focus ? 'text-white/90' : 'text-[#30d158]'
                      }`}
                    >
                      {formatTimerMs(pomoRemainingMs)}
                    </span>
                  )}
                </div>

                {/* Right slot: muted mic, dancing music bars, timer, or privacy dots */}
                <div className="flex items-center justify-end gap-1.5 min-w-[24px] shrink-0">
                  {callActive && callMuted ? (
                    <MicOff className="w-3.5 h-3.5 text-[#ff453a]" />
                  ) : isPlaying ? (
                    <div className="flex items-end gap-[2px] h-3.5">
                      <span
                        className="w-[2.5px] bg-white rounded-full"
                        style={{ animation: 'isleBarDance1 0.75s ease-in-out infinite' }}
                      />
                      <span
                        className="w-[2.5px] bg-white rounded-full"
                        style={{ animation: 'isleBarDance2 0.65s ease-in-out infinite' }}
                      />
                      <span
                        className="w-[2.5px] bg-white rounded-full"
                        style={{ animation: 'isleBarDance3 0.85s ease-in-out infinite' }}
                      />
                      <span
                        className="w-[2.5px] bg-white rounded-full"
                        style={{ animation: 'isleBarDance4 0.7s ease-in-out infinite' }}
                      />
                    </div>
                  ) : pomoPhase !== Phase.Idle ? (
                    <span className="text-[12px] font-semibold tnum text-white/80">
                      {formatTimerMs(pomoRemainingMs)}
                    </span>
                  ) : null}

                  {/* Privacy Dots */}
                  {(privacyDots.camera ||
                    privacyDots.microphone ||
                    privacyDots.screenShare) && (
                    <div className="flex items-center gap-1 pl-0.5">
                      {privacyDots.camera && (
                        <span
                          className="w-[7px] h-[7px] rounded-full bg-[#34c759]"
                          title="Camera in use"
                        />
                      )}
                      {privacyDots.microphone && (
                        <span
                          className="w-[7px] h-[7px] rounded-full bg-[#ff9f0a]"
                          title="Microphone in use"
                        />
                      )}
                      {privacyDots.screenShare && (
                        <span
                          className="w-[7px] h-[7px] rounded-full bg-[#0a84ff]"
                          title="Screen sharing active"
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 2. PEEK (ALERT) PRESENTATION */}
            {presentation.mode === 'peek' && activeAlert && (
              <div className="w-full h-full flex flex-col justify-end pb-3 px-4">
                {activeAlert.kind === 'agent-ask' ? (
                  <div className="flex items-start gap-3.5 pt-2">
                    <div className="relative shrink-0">
                      <BotCanvas
                        size={44}
                        shape={botShape}
                        color={botColor}
                        glowMode={botGlowMode}
                        form={
                          activeAlert.answeredState === 'allowed' ||
                          activeAlert.answeredState === 'always'
                            ? 'success'
                            : activeAlert.answeredState === 'denied'
                            ? 'error'
                            : 'asking'
                        }
                        gestureTrigger={botGesture}
                      />
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          activeAlert.answeredState === 'allowed' ||
                          activeAlert.answeredState === 'always'
                            ? 'bg-[#30d158] text-black'
                            : activeAlert.answeredState === 'denied'
                            ? 'bg-[#ff453a] text-white'
                            : 'bg-[#ff9f0a] text-black'
                        }`}
                      >
                        {activeAlert.answeredState === 'allowed' ||
                        activeAlert.answeredState === 'always'
                          ? '✓'
                          : activeAlert.answeredState === 'denied'
                          ? '✕'
                          : '!'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13.5px] font-semibold truncate">
                          {activeAlert.title}
                        </span>
                        <span className="text-[11px] text-white/50 shrink-0">
                          {activeAlert.agentName}
                        </span>
                      </div>
                      {activeAlert.codeLine && (
                        <div className="mt-1 px-2.5 py-1 rounded-md bg-white/10 font-mono text-[11.5px] text-white/90 truncate">
                          {activeAlert.codeLine}
                        </div>
                      )}
                      {activeAlert.answeredState ? (
                        <div className="mt-2 text-[12px] font-semibold">
                          {activeAlert.answeredState === 'allowed' && (
                            <span className="text-[#30d158]">Allowed</span>
                          )}
                          {activeAlert.answeredState === 'always' && (
                            <span className="text-[#30d158]">Always allowed here</span>
                          )}
                          {activeAlert.answeredState === 'denied' && (
                            <span className="text-[#ff453a]">Denied</span>
                          )}
                        </div>
                      ) : (
                        <div className="mt-2 flex items-center justify-end gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setBotGesture({ type: 'shake', id: Date.now() });
                              setActiveAlert({
                                ...activeAlert,
                                answeredState: 'denied',
                              });
                              setTimeout(() => setActiveAlert(null), 850);
                            }}
                            className="px-3 py-1 rounded-full bg-[#2c2c2e] hover:bg-[#3a3a3c] text-[12px] font-semibold transition"
                          >
                            Deny
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setBotGesture({ type: 'hop', id: Date.now() });
                              setActiveAlert({
                                ...activeAlert,
                                answeredState: 'allowed',
                              });
                              setTimeout(() => setActiveAlert(null), 850);
                            }}
                            className="px-3 py-1 rounded-full bg-[#2c2c2e] hover:bg-[#3a3a3c] text-[12px] font-semibold transition"
                          >
                            Allow
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setBotGesture({ type: 'hop', id: Date.now() });
                              setActiveAlert({
                                ...activeAlert,
                                answeredState: 'always',
                              });
                              setTimeout(() => setActiveAlert(null), 850);
                            }}
                            className="px-3 py-1 rounded-full bg-white text-black hover:bg-white/85 text-[12px] font-semibold transition"
                          >
                            Always
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-inner"
                        style={{ backgroundColor: activeAlert.accentColor }}
                      >
                        {activeAlert.kind === 'charging' && (
                          <Zap className="w-4 h-4 text-white fill-white" />
                        )}
                        {activeAlert.kind === 'low-battery' && (
                          <Zap className="w-4 h-4 text-white" />
                        )}
                        {activeAlert.kind === 'volume' && (
                          <Volume2 className="w-4 h-4 text-white" />
                        )}
                        {activeAlert.kind === 'brightness' && (
                          <Sun className="w-4 h-4 text-white" />
                        )}
                        {activeAlert.kind === 'capslock' && (
                          <Keyboard className="w-4 h-4 text-white" />
                        )}
                        {activeAlert.kind === 'earbuds' && (
                          <Headphones className="w-4 h-4 text-white" />
                        )}
                        {activeAlert.kind === 'meeting' && (
                          <Video className="w-4 h-4 text-white" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-semibold truncate">
                          {activeAlert.title}
                        </div>
                        {activeAlert.subtitle && (
                          <div className="text-[11.5px] text-white/55 truncate">
                            {activeAlert.subtitle}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right side of Peek Alert */}
                    <div className="flex items-center gap-2.5 shrink-0">
                      {activeAlert.level !== undefined && (
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-[5px] rounded-full bg-white/20 overflow-hidden">
                            <div
                              className="h-full bg-white rounded-full transition-all duration-150"
                              style={{ width: `${activeAlert.level}%` }}
                            />
                          </div>
                          <span className="text-[12px] font-semibold tnum w-8 text-right">
                            {activeAlert.level}%
                          </span>
                        </div>
                      )}
                      {activeAlert.valueText && activeAlert.level === undefined && (
                        <span
                          className="text-[18px] font-semibold tnum"
                          style={{ color: activeAlert.accentColor }}
                        >
                          {activeAlert.valueText}
                        </span>
                      )}
                      {activeAlert.kind === 'meeting' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveAlert(null);
                            setCallService('Google Meet');
                            setCallActive(true);
                            setCallSeconds(1);
                            setActivePage('call');
                            setPinnedOpen(true);
                          }}
                          className="px-3.5 py-1 rounded-full bg-[#0a84ff] hover:bg-[#2b95ff] text-white text-[12px] font-semibold transition"
                        >
                          Join
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 3. VOICE ASSISTANT PRESENTATION */}
            {presentation.mode === 'voice' && (
              <div
                className="w-full h-full flex flex-col justify-between px-4 pb-3.5"
                style={{ paddingTop: topBarHeight + 6 }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Optional Expanded Conversation History */}
                {chatExpanded && (
                  <div className="flex-1 flex flex-col min-h-0 mb-2 border-b border-white/10 pb-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[12px] font-semibold text-white/45">
                        Conversation · ~/.local/share/isle/chat.json
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() =>
                            setChatHistory([
                              {
                                id: Date.now(),
                                userText: '',
                                steps: [],
                                replyText: 'Started a new conversation. How can I help?',
                                timestamp: formatClock(new Date()),
                              },
                            ])
                          }
                          className="p-1 rounded-full bg-white/10 hover:bg-white/20 text-white/80"
                          title="Start new conversation (+)"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setChatExpanded(false)}
                          className="p-1 rounded-full bg-white/10 hover:bg-white/20 text-white/80"
                          title="Collapse conversation"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto no-scrollbar space-y-2.5 pr-1">
                      {chatHistory.map((turn) => (
                        <div key={turn.id} className="space-y-1.5">
                          {turn.userText && (
                            <div className="flex justify-end">
                              <div className="px-3 py-1.5 rounded-2xl bg-white/12 text-[12.5px] max-w-[80%]">
                                {turn.userText}
                              </div>
                            </div>
                          )}
                          {turn.steps.length > 0 && (
                            <div className="pl-2 space-y-0.5">
                              {turn.steps.map((st, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-center gap-1.5 text-[11px] text-white/45"
                                >
                                  <Check className="w-3 h-3 text-white/45" />
                                  <span>{st}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="text-[12.5px] text-white/90 leading-snug">
                            {turn.replyText}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Active Assistant Row */}
                <div className="flex items-start gap-3">
                  <div
                    onClick={() =>
                      setBotGesture({
                        type: 'hop',
                        id: Date.now(),
                      })
                    }
                    className="cursor-pointer"
                    title="Click the bot to hop"
                  >
                    <BotCanvas
                      size={38}
                      shape={botShape}
                      color={botColor}
                      glowMode={botGlowMode}
                      form={botForm}
                      voiceLevel={voiceLevel}
                      gestureTrigger={botGesture}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        onClick={() => setChatExpanded((c) => !c)}
                        className="flex items-center gap-1 text-[12px] text-white/50 hover:text-white/80 transition truncate"
                      >
                        <ChevronUp className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">
                          {activeTurn?.userText || 'How can I help? (English or Indonesian)'}
                        </span>
                      </button>
                      <span className="text-[11px] text-white/40 shrink-0">
                        Claude Code · Sonnet
                      </span>
                    </div>

                    <div className="text-[14px] font-medium text-white/95 mt-0.5 leading-snug">
                      {botForm === 'listening' && voiceInputMode === 'listening'
                        ? 'Listening on this computer (whisper.cpp · Vulkan)...'
                        : activeTurn?.replyText}
                    </div>

                    {/* Quick Idea Chips */}
                    {!activeTurn?.commandCard && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        {[
                          'Install LibreOffice',
                          'Play some jazz on Spotify',
                          'Remind me to review PR #48',
                          'Why is my laptop slow?',
                        ].map((idea) => (
                          <button
                            key={idea}
                            onClick={() => handleSendVoicePrompt(idea)}
                            className="px-2.5 py-0.5 rounded-full bg-white/8 hover:bg-white/15 border border-white/10 text-[11.5px] font-semibold text-white/85 transition"
                          >
                            {idea}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Command Approval Card (sudo / package manager) */}
                    {activeTurn?.commandCard && (
                      <div className="mt-2.5 space-y-2">
                        <div className="px-3 py-2 rounded-[10px] bg-white/8 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[12px] font-semibold text-white/90">
                              {activeTurn.commandCard.purpose}
                            </span>
                            {activeTurn.commandCard.status === 'done' && (
                              <span className="text-[11px] font-semibold text-[#30d158] tnum">
                                ✓ {activeTurn.commandCard.durationText}
                              </span>
                            )}
                            {activeTurn.commandCard.status === 'denied' && (
                              <span className="text-[11px] font-semibold text-white/50">
                                Denied
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-[12px] text-white flex items-center gap-1.5">
                            <span className="text-white/45">$</span>
                            <span className="text-[#ffb340] font-semibold">sudo</span>
                            <span>
                              {activeTurn.commandCard.command.replace(/^sudo\s+/, '')}
                            </span>
                          </div>
                          {activeTurn.commandCard.logs &&
                            activeTurn.commandCard.status === 'running' && (
                              <div className="pt-1 font-mono text-[11px] text-white/45 space-y-0.5">
                                {activeTurn.commandCard.logs.map((l, i) => (
                                  <div key={i}>{l}</div>
                                ))}
                              </div>
                            )}
                        </div>

                        {activeTurn.commandCard.status === 'pending' && (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-[12px] font-medium text-[#ffb340]">
                              <ShieldAlert className="w-3.5 h-3.5" />
                              <span>{activeTurn.commandCard.riskLabel}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleDenyCommandCard(activeTurn.id)}
                                className="px-3 py-1 rounded-full bg-[#2c2c2e] hover:bg-[#3a3a3c] text-[12px] font-semibold flex items-center gap-1.5"
                              >
                                <span>Deny</span>
                                <span className="text-[10px] text-white/45">esc</span>
                              </button>
                              <button
                                onClick={() => handleRunCommandCard(activeTurn.id)}
                                className="px-3.5 py-1 rounded-full bg-white text-black hover:bg-white/85 text-[12px] font-semibold flex items-center gap-1.5"
                              >
                                <span>Run</span>
                                <CornerDownLeft className="w-3 h-3 text-black/50" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right Action Button: Keyboard toggle or Close */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() =>
                        setVoiceInputMode((m) =>
                          m === 'listening' ? 'typing' : 'listening'
                        )
                      }
                      className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition"
                      title="Switch between voice and keyboard input"
                    >
                      {voiceInputMode === 'listening' ? (
                        <Keyboard className="w-4 h-4" />
                      ) : (
                        <Mic className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => setVoiceOpen(false)}
                      className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition"
                      title="Close assistant (Esc)"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Typed Request Pill Field */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendVoicePrompt(voiceQuery);
                  }}
                  className="mt-2 flex items-center gap-2 bg-white/8 border border-white/12 rounded-full pl-3.5 pr-1 py-1"
                >
                  <input
                    type="text"
                    value={voiceQuery}
                    onFocus={() => {
                      setVoiceInputMode('typing');
                      setBotForm('typing');
                    }}
                    onChange={(e) => setVoiceQuery(e.target.value)}
                    placeholder="Ask Isle Assistant to play music, install packages, or add a reminder..."
                    className="flex-1 bg-transparent text-[13px] text-white placeholder:text-white/45 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="w-7 h-7 rounded-full bg-white text-black hover:bg-white/85 flex items-center justify-center transition shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            )}

            {/* 4. EXPANDED ISLAND PRESENTATION */}
            {presentation.mode === 'expanded' && (
              <div
                className="w-full h-full flex flex-col justify-between"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header Row inside Top Bar level */}
                <div
                  className="w-full flex items-center justify-between px-6 shrink-0"
                  style={{ height: topBarHeight }}
                >
                  {/* Page Tabs */}
                  <div className="flex items-center gap-0.5">
                    {pages.map((p) => {
                      const active = activePage === p.id;
                      return (
                        <button
                          key={p.id}
                          onClick={() => setActivePage(p.id)}
                          className={`relative flex items-center px-2.5 py-1 rounded-full text-[12.5px] font-semibold transition-all duration-150 ${
                            active
                              ? 'bg-white/12 text-white'
                              : 'text-white/75 hover:bg-white/6 hover:text-white'
                          }`}
                        >
                          {p.icon}
                          {active && <span className="ml-1.5">{p.label}</span>}
                          {p.badge && (
                            <span className="ml-1 w-1.5 h-1.5 rounded-full bg-[#ff453a]" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Header Right Status: Recording pill, Call pill, Mic Assistant, Clock, Settings gear */}
                  <div className="flex items-center gap-2">
                    {screenRecording && (
                      <button
                        onClick={() => setScreenRecording(false)}
                        className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#ff453a]/25 hover:bg-[#ff453a]/40 text-[#ff6961] text-[11.5px] font-bold tnum"
                        title="Click to stop recording"
                      >
                        <span className="w-2 h-2 rounded-full bg-[#ff453a]" />
                        <span>{formatTimerMs(recordSeconds * 1000)}</span>
                      </button>
                    )}
                    {callActive && activePage !== 'call' && (
                      <button
                        onClick={() => setActivePage('call')}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#30d158]/20 text-[#30d158] text-[11.5px] font-semibold tnum"
                      >
                        <Phone className="w-3 h-3" />
                        <span>{formatTimerMs(callSeconds * 1000)}</span>
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setPinnedOpen(false);
                        setIsHovered(false);
                        setVoiceOpen(true);
                      }}
                      className="p-1 rounded-full text-white/65 hover:text-white hover:bg-white/10 transition"
                      title="Open Voice Assistant (Super+I)"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                    </button>
                    <div className="text-[12.5px] tnum flex items-center gap-1.5">
                      <span className="text-white/75">{formatHeaderDate(nowDate)}</span>
                      <span className="font-semibold">{formatClock(nowDate)}</span>
                    </div>
                    <button
                      onClick={() => setSettingsOpen(true)}
                      className="p-1 rounded-full text-white/65 hover:text-white hover:bg-white/10 transition"
                      title="Isle Settings"
                    >
                      <Settings className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Page Body (600/720 × 168) */}
                <div className="flex-1 px-7 pt-1.5 pb-3.5 overflow-hidden flex flex-col justify-center">
                  {/* PAGE: CALL */}
                  {activePage === 'call' && (
                    <div className="flex items-center justify-between gap-6 h-full">
                      {/* Left: Live Call Window Preview (Clutter.Clone equivalent) */}
                      <div className="relative group w-[212px] h-[126px] rounded-[14px] bg-[#1c1c1e] border border-white/10 overflow-hidden shrink-0 flex flex-col justify-between p-3">
                        <div
                          className="absolute inset-0 opacity-65"
                          style={{
                            background:
                              'radial-gradient(circle at 30% 30%, #1d4ed8, #0f172a 75%)',
                          }}
                        />
                        <div className="relative z-10 flex items-center justify-between">
                          <span className="px-2 py-0.5 rounded-full bg-black/50 text-[10.5px] font-medium text-white/90">
                            Aris Pratama
                          </span>
                          <span className="w-2 h-2 rounded-full bg-[#30d158]" />
                        </div>
                        {/* Simulated live participant waveform */}
                        <div className="relative z-10 flex items-center justify-center gap-1 my-auto">
                          <div className="w-9 h-9 rounded-full bg-white/15 border border-white/25 flex items-center justify-center text-sm font-bold">
                            AP
                          </div>
                          <div className="w-9 h-9 rounded-full bg-emerald-500/25 border border-emerald-400/40 flex items-center justify-center text-sm font-bold">
                            You
                          </div>
                        </div>
                        <div className="relative z-10 text-[10.5px] text-white/65 truncate">
                          Wayland compositor frame clone · 60 fps
                        </div>
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                          <span className="p-2 rounded-full bg-black/70 text-white">
                            <ExternalLink className="w-4 h-4" />
                          </span>
                        </div>
                      </div>

                      {/* Right: Call Details & FaceTime-style Round Controls */}
                      <div className="flex-1 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-md bg-[#30d158]/20 text-[#30d158] flex items-center justify-center">
                              <Video className="w-3.5 h-3.5" />
                            </span>
                            <span className="text-[17px] font-semibold tracking-tight">
                              {callService}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-[13px]">
                            <span className="text-white/55">Video call</span>
                            <span className="text-white/35">·</span>
                            <span className="text-[#30d158] font-semibold tnum">
                              {formatTimerMs(callSeconds * 1000)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="flex flex-col items-center gap-1">
                            <button
                              onClick={() => setCallMuted((m) => !m)}
                              className={`w-10 h-10 rounded-full flex items-center justify-center transition ${
                                callMuted
                                  ? 'bg-white text-black'
                                  : 'bg-[#2c2c2e] hover:bg-[#3a3a3c] text-white'
                              }`}
                            >
                              {callMuted ? (
                                <MicOff className="w-4 h-4" />
                              ) : (
                                <Mic className="w-4 h-4" />
                              )}
                            </button>
                            <span className="text-[11px] text-white/60">
                              {callMuted ? 'Muted' : 'Mute'}
                            </span>
                          </div>

                          <div className="flex flex-col items-center gap-1">
                            <button
                              onClick={() => {
                                setPinnedOpen(false);
                                setIsHovered(false);
                              }}
                              className="w-10 h-10 rounded-full bg-[#2c2c2e] hover:bg-[#3a3a3c] text-white flex items-center justify-center transition"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </button>
                            <span className="text-[11px] text-white/60">Open</span>
                          </div>

                          <div className="flex flex-col items-center gap-1">
                            <button
                              onClick={() => {
                                setCallActive(false);
                                setActivePage('music');
                              }}
                              className="w-10 h-10 rounded-full bg-[#ff453a]/25 hover:bg-[#ff453a] text-[#ff453a] hover:text-white flex items-center justify-center transition"
                            >
                              <Phone className="w-4 h-4 rotate-[135deg]" />
                            </button>
                            <span className="text-[11px] text-white/60">End</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* PAGE: MUSIC (+ SYNCED LYRICS & VOLUME/OUTPUTS) */}
                  {activePage === 'music' && (
                    <div className="h-full flex items-center">
                      {audioOutputMode ? (
                        <div className="w-full space-y-2.5">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => setVolume((v) => (v > 0 ? 0 : 74))}
                              className="p-1.5 rounded-full bg-[#2c2c2e] hover:bg-[#3a3a3c]"
                            >
                              {volume === 0 ? (
                                <VolumeX className="w-4 h-4" />
                              ) : (
                                <Volume2 className="w-4 h-4" />
                              )}
                            </button>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              value={volume}
                              onChange={(e) => setVolume(Number(e.target.value))}
                              className="flex-1 accent-white h-1.5 bg-white/20 rounded-lg cursor-pointer"
                            />
                            <span className="text-[12px] font-semibold tnum w-10 text-right text-white/85">
                              {volume}%
                            </span>
                            <button
                              onClick={() => setAudioOutputMode(false)}
                              className="px-2.5 py-1 rounded-full bg-white/15 text-[11.5px] font-semibold"
                            >
                              Back
                            </button>
                          </div>

                          <div className="grid grid-cols-3 gap-2">
                            {[
                              {
                                id: 'airbuds' as const,
                                name: 'AirBuds Pro',
                                detail: 'Bluetooth · 70%',
                                icon: <Headphones className="w-4 h-4" />,
                              },
                              {
                                id: 'speakers' as const,
                                name: 'Speakers',
                                detail: 'Built-in Audio',
                                icon: <Speaker className="w-4 h-4" />,
                              },
                              {
                                id: 'hdmi' as const,
                                name: 'LG UltraFine',
                                detail: 'DisplayPort',
                                icon: <Monitor className="w-4 h-4" />,
                              },
                            ].map((out) => (
                              <button
                                key={out.id}
                                onClick={() => setSelectedOutput(out.id)}
                                className={`flex items-center justify-between px-3 py-2 rounded-xl text-left transition ${
                                  selectedOutput === out.id
                                    ? 'bg-[#1c1c1e] border border-white/15'
                                    : 'hover:bg-[#1c1c1e]/60'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  {out.icon}
                                  <div className="min-w-0">
                                    <div className="text-[12.5px] font-semibold truncate">
                                      {out.name}
                                    </div>
                                    <div className="text-[11px] text-white/50 truncate">
                                      {out.detail}
                                    </div>
                                  </div>
                                </div>
                                {selectedOutput === out.id && (
                                  <Check className="w-3.5 h-3.5 text-[#30d158] shrink-0" />
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : lyricsMode ? (
                        /* Synced Lyrics Layout (720px wide) */
                        <div className="w-full h-full flex items-center gap-6">
                          {/* Left Column (232px) */}
                          <div className="w-[232px] shrink-0 flex flex-col justify-between h-full py-0.5">
                            <div className="flex items-center gap-3">
                              <div
                                className="w-14 h-14 rounded-xl shrink-0 shadow-md"
                                style={{
                                  background: `linear-gradient(135deg, ${currentTrack.coverGradient[0]}, ${currentTrack.coverGradient[1]}, ${currentTrack.coverGradient[2]})`,
                                }}
                              />
                              <div className="min-w-0">
                                <div className="text-[14.5px] font-bold tracking-tight truncate">
                                  {currentTrack.title}
                                </div>
                                <div className="text-[12px] text-white/60 truncate">
                                  {currentTrack.artist}
                                </div>
                              </div>
                            </div>

                            {/* Scrubber */}
                            <div className="flex items-center gap-2 text-[11px] tnum text-white/60">
                              <span>{formatTimerMs(trackPosMs)}</span>
                              <div
                                onClick={(e) => {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  const ratio = Math.max(
                                    0,
                                    Math.min(1, (e.clientX - rect.left) / rect.width)
                                  );
                                  setTrackPosMs(ratio * currentTrack.durationMs);
                                }}
                                className="flex-1 h-1.5 rounded-full bg-white/20 cursor-pointer overflow-hidden"
                              >
                                <div
                                  className="h-full bg-white rounded-full"
                                  style={{
                                    width: `${
                                      (trackPosMs / currentTrack.durationMs) * 100
                                    }%`,
                                  }}
                                />
                              </div>
                              <span>
                                -{formatTimerMs(currentTrack.durationMs - trackPosMs)}
                              </span>
                            </div>

                            {/* Controls */}
                            <div className="flex items-center justify-between">
                              <button
                                onClick={() => setLyricsMode(false)}
                                className="p-1.5 rounded-full bg-white/20 text-white"
                                title="Hide Synced Lyrics"
                              >
                                <MessageSquareQuote className="w-4 h-4" />
                              </button>
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => {
                                    setTrackIndex(
                                      (i) =>
                                        (i - 1 + SAMPLE_TRACKS.length) %
                                        SAMPLE_TRACKS.length
                                    );
                                    setTrackPosMs(0);
                                  }}
                                  className="p-1 rounded-full hover:bg-white/10"
                                >
                                  <SkipBack className="w-4 h-4 fill-white" />
                                </button>
                                <button
                                  onClick={() => setIsPlaying((p) => !p)}
                                  className="p-1.5 rounded-full bg-white/15 hover:bg-white/25"
                                >
                                  {isPlaying ? (
                                    <Pause className="w-4 h-4 fill-white" />
                                  ) : (
                                    <Play className="w-4 h-4 fill-white" />
                                  )}
                                </button>
                                <button
                                  onClick={() => {
                                    setTrackIndex((i) => (i + 1) % SAMPLE_TRACKS.length);
                                    setTrackPosMs(0);
                                  }}
                                  className="p-1 rounded-full hover:bg-white/10"
                                >
                                  <SkipForward className="w-4 h-4 fill-white" />
                                </button>
                              </div>
                              <button
                                onClick={() => setAudioOutputMode(true)}
                                className="p-1.5 rounded-full hover:bg-white/10 text-white/75"
                                title="Volume & Outputs"
                              >
                                <Speaker className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Right Column: Synced LRCLIB Lines */}
                          <div className="flex-1 h-full overflow-y-auto no-scrollbar flex flex-col justify-center space-y-1.5 pr-2">
                            {parsedLyrics.map((line, idx) => {
                              const dist = idx - activeLyricIndex;
                              if (Math.abs(dist) > 2) return null;
                              const isCurrent = dist === 0;
                              return (
                                <button
                                  key={idx}
                                  onClick={() => setTrackPosMs(line.timeMs)}
                                  className={`text-left transition-all duration-200 ${
                                    isCurrent
                                      ? 'text-[17.5px] font-bold text-white scale-100'
                                      : dist < 0
                                      ? 'text-[13.5px] font-semibold text-white/30'
                                      : 'text-[14.5px] font-semibold text-white/55 hover:text-white/80'
                                  }`}
                                >
                                  {line.text === '' ? (
                                    <span className="inline-flex items-center gap-1.5 py-1">
                                      <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                                      <span className="w-2 h-2 rounded-full bg-white/70 animate-pulse" />
                                      <span className="w-2 h-2 rounded-full bg-white/40 animate-pulse" />
                                    </span>
                                  ) : (
                                    line.text
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        /* Standard Now-Playing Card (600px wide) */
                        <div className="w-full flex items-center gap-5">
                          {/* 104px Album Cover with App Badge */}
                          <div className="relative w-[104px] h-[104px] shrink-0">
                            <div
                              className="w-full h-full rounded-2xl shadow-lg"
                              style={{
                                background: `linear-gradient(135deg, ${currentTrack.coverGradient[0]}, ${currentTrack.coverGradient[1]}, ${currentTrack.coverGradient[2]})`,
                              }}
                            />
                            <span className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-full bg-black border border-white/15 text-[10px] font-semibold text-[#30d158]">
                              {currentTrack.app}
                            </span>
                          </div>

                          <div className="flex-1 min-w-0 flex flex-col justify-between h-[104px]">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-[17px] font-semibold tracking-tight truncate">
                                  {currentTrack.title}
                                </div>
                                <div className="text-[13px] text-white/55 truncate">
                                  {currentTrack.artist} — {currentTrack.album}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => setLyricsMode(true)}
                                  className="p-1.5 rounded-full hover:bg-white/12 text-white/80 hover:text-white transition"
                                  title="Synced Lyrics (LRCLIB)"
                                >
                                  <MessageSquareQuote className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setAudioOutputMode(true)}
                                  className="p-1.5 rounded-full hover:bg-white/12 text-white/80 hover:text-white transition"
                                  title="Volume & Output Device"
                                >
                                  <Headphones className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            {/* Scrubber */}
                            <div className="flex items-center gap-2.5 text-[12px] tnum text-white/60">
                              <span className="w-9">{formatTimerMs(trackPosMs)}</span>
                              <div
                                onClick={(e) => {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  const ratio = Math.max(
                                    0,
                                    Math.min(1, (e.clientX - rect.left) / rect.width)
                                  );
                                  setTrackPosMs(ratio * currentTrack.durationMs);
                                }}
                                className="flex-1 h-1.5 rounded-full bg-white/20 cursor-pointer overflow-hidden"
                              >
                                <div
                                  className="h-full bg-white rounded-full transition-all duration-150"
                                  style={{
                                    width: `${
                                      (trackPosMs / currentTrack.durationMs) * 100
                                    }%`,
                                  }}
                                />
                              </div>
                              <span className="w-10 text-right">
                                -{formatTimerMs(currentTrack.durationMs - trackPosMs)}
                              </span>
                            </div>

                            {/* Transport */}
                            <div className="flex items-center justify-center gap-6">
                              <button
                                onClick={() => {
                                  setTrackIndex(
                                    (i) =>
                                      (i - 1 + SAMPLE_TRACKS.length) %
                                      SAMPLE_TRACKS.length
                                  );
                                  setTrackPosMs(0);
                                }}
                                className="p-1.5 rounded-full hover:bg-white/12 transition"
                              >
                                <SkipBack className="w-4 h-4 fill-white" />
                              </button>
                              <button
                                onClick={() => setIsPlaying((p) => !p)}
                                className="p-2 rounded-full bg-white/15 hover:bg-white/25 transition"
                              >
                                {isPlaying ? (
                                  <Pause className="w-4 h-4 fill-white" />
                                ) : (
                                  <Play className="w-4 h-4 fill-white" />
                                )}
                              </button>
                              <button
                                onClick={() => {
                                  setTrackIndex((i) => (i + 1) % SAMPLE_TRACKS.length);
                                  setTrackPosMs(0);
                                }}
                                className="p-1.5 rounded-full hover:bg-white/12 transition"
                              >
                                <SkipForward className="w-4 h-4 fill-white" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* PAGE: NOTIFICATIONS */}
                  {activePage === 'notifications' && (
                    <div className="h-full flex flex-col justify-between">
                      <div className="flex items-center justify-between pb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-semibold text-white/60">
                            Notifications
                          </span>
                          {dnd && (
                            <span className="text-[11.5px] text-white/45">
                              · Do Not Disturb is on
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setDnd((d) => !d)}
                            className={`p-1.5 rounded-full transition ${
                              dnd
                                ? 'bg-[#5e5ce6] text-white'
                                : 'bg-[#2c2c2e] text-white/65 hover:text-white'
                            }`}
                            title="Toggle Do Not Disturb"
                          >
                            {dnd ? (
                              <Moon className="w-3.5 h-3.5 fill-white" />
                            ) : (
                              <Bell className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            disabled={notifications.length === 0}
                            onClick={() => setNotifications([])}
                            className="px-3 py-1 rounded-full bg-[#2c2c2e] hover:bg-[#3a3a3c] disabled:opacity-40 text-[12px] font-semibold transition"
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      {notifications.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center">
                          <BellOff className="w-5 h-5 text-white/35 mb-1" />
                          <div className="text-[14px] font-semibold">
                            No notifications
                          </div>
                          <div className="text-[12px] text-white/50">
                            You're all caught up
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 overflow-y-auto no-scrollbar space-y-1">
                          {notifications.map((n) => (
                            <div
                              key={n.id}
                              className="group flex items-center justify-between gap-2.5 px-2.5 py-1.5 rounded-[10px] hover:bg-white/6 transition"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="w-5 h-5 rounded-[6px] bg-[#2c2c2e] flex items-center justify-center text-[10px] font-bold shrink-0">
                                  {n.app[0]}
                                </span>
                                <span className="text-[13px] font-semibold shrink-0">
                                  {n.title}
                                </span>
                                <span className="text-[13px] text-white/55 truncate">
                                  {n.body}
                                </span>
                              </div>
                              <div className="shrink-0 flex items-center gap-1.5">
                                <span className="text-[12px] text-white/45 group-hover:hidden">
                                  {n.time}
                                </span>
                                <div className="hidden group-hover:flex items-center gap-1.5">
                                  {n.actions.map((act) => (
                                    <button
                                      key={act}
                                      onClick={() =>
                                        setNotifications((prev) =>
                                          prev.filter((item) => item.id !== n.id)
                                        )
                                      }
                                      className="px-2.5 py-0.5 rounded-full bg-[#2c2c2e] hover:bg-[#3a3a3c] text-[11px] font-semibold"
                                    >
                                      {act}
                                    </button>
                                  ))}
                                  <button
                                    onClick={() =>
                                      setNotifications((prev) =>
                                        prev.filter((item) => item.id !== n.id)
                                      )
                                    }
                                    className="p-1 rounded-full bg-[#3a3a3c] hover:bg-[#4a4a4e]"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* PAGE: FOCUS (POMODORO) */}
                  {activePage === 'focus' && (
                    <div className="h-full flex items-center justify-between gap-6">
                      {/* Left: 104px Clockwise Ring */}
                      <div className="relative w-[104px] h-[104px] flex items-center justify-center shrink-0">
                        <svg className="w-full h-full -rotate-90" viewBox="0 0 104 104">
                          <circle
                            cx="52"
                            cy="52"
                            r="44"
                            fill="none"
                            stroke="rgba(255,255,255,0.14)"
                            strokeWidth="6"
                          />
                          <circle
                            cx="52"
                            cy="52"
                            r="44"
                            fill="none"
                            stroke={
                              pomoPhase === Phase.ShortBreak ||
                              pomoPhase === Phase.LongBreak
                                ? '#30d158'
                                : '#ffffff'
                            }
                            strokeWidth="6"
                            strokeDasharray={276.46}
                            strokeDashoffset={276.46 * (1 - focusProgress)}
                            strokeLinecap="round"
                            className="transition-all duration-300"
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-[22px] font-semibold tnum tracking-tight">
                            {formatTimerMs(pomoRemainingMs)}
                          </span>
                          <span className="text-[11.5px] font-medium text-white/55">
                            {phaseLabel(pomoPhase)}
                          </span>
                        </div>
                      </div>

                      {/* Middle: Work & Break Steppers */}
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 bg-[#1c1c1e] rounded-full pl-3.5 pr-1.5 py-1">
                          <span className="text-[12px] font-medium text-white/55 w-11">
                            Work
                          </span>
                          <span className="text-[15px] font-semibold tnum w-7 text-right pr-1">
                            {pomoConfig.focusMinutes}
                          </span>
                          <button
                            onClick={() => {
                              const next = Math.max(1, pomoConfig.focusMinutes - 5);
                              setPomoConfig({ ...pomoConfig, focusMinutes: next });
                              if (pomoPhase === Phase.Idle) {
                                setPomoRemainingMs(next * 60_000);
                                setPomoDurationMs(next * 60_000);
                              }
                            }}
                            className="p-1.5 rounded-full hover:bg-white/10 text-white/80"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              const next = Math.min(180, pomoConfig.focusMinutes + 5);
                              setPomoConfig({ ...pomoConfig, focusMinutes: next });
                              if (pomoPhase === Phase.Idle) {
                                setPomoRemainingMs(next * 60_000);
                                setPomoDurationMs(next * 60_000);
                              }
                            }}
                            className="p-1.5 rounded-full hover:bg-white/10 text-white/80"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="flex items-center gap-2 bg-[#1c1c1e] rounded-full pl-3.5 pr-1.5 py-1">
                          <span className="text-[12px] font-medium text-white/55 w-11">
                            Break
                          </span>
                          <span className="text-[15px] font-semibold tnum w-7 text-right pr-1">
                            {pomoConfig.shortBreakMinutes}
                          </span>
                          <button
                            onClick={() =>
                              setPomoConfig({
                                ...pomoConfig,
                                shortBreakMinutes: Math.max(
                                  1,
                                  pomoConfig.shortBreakMinutes - 1
                                ),
                              })
                            }
                            className="p-1.5 rounded-full hover:bg-white/10 text-white/80"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() =>
                              setPomoConfig({
                                ...pomoConfig,
                                shortBreakMinutes: Math.min(
                                  60,
                                  pomoConfig.shortBreakMinutes + 1
                                ),
                              })
                            }
                            className="p-1.5 rounded-full hover:bg-white/10 text-white/80"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Right: Start / Pause / Resume pill + Reset */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => {
                            if (pomoPhase === Phase.Idle) {
                              setPomoPhase(Phase.Focus);
                              const dur = pomoConfig.focusMinutes * 60_000;
                              setPomoDurationMs(dur);
                              setPomoRemainingMs(dur);
                              setPomoRunning(true);
                              setDnd(true);
                            } else {
                              setPomoRunning((r) => !r);
                            }
                          }}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#2c2c2e] hover:bg-[#3a3a3c] text-[14px] font-semibold transition"
                        >
                          {pomoRunning ? (
                            <>
                              <Pause className="w-4 h-4 fill-white" />
                              <span>Pause</span>
                            </>
                          ) : (
                            <>
                              <Play className="w-4 h-4 fill-white" />
                              <span>
                                {pomoPhase === Phase.Idle ? 'Start' : 'Resume'}
                              </span>
                            </>
                          )}
                        </button>
                        {pomoPhase !== Phase.Idle && (
                          <button
                            onClick={() => {
                              setPomoRunning(false);
                              setPomoPhase(Phase.Idle);
                              const dur = pomoConfig.focusMinutes * 60_000;
                              setPomoDurationMs(dur);
                              setPomoRemainingMs(dur);
                              setDnd(false);
                            }}
                            className="p-2.5 rounded-full bg-[#2c2c2e] hover:bg-[#3a3a3c] transition"
                            title="Reset Pomodoro Timer"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* PAGE: REMINDERS */}
                  {activePage === 'reminders' && (
                    <div className="h-full flex flex-col justify-between">
                      <div className="flex items-center justify-between h-6">
                        <span className="text-[17px] font-semibold text-[#ff9f0a] tracking-tight">
                          Reminders
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[17px] font-semibold text-[#ff9f0a] tnum">
                            {reminders.filter((r) => !r.doneAt).length}
                          </span>
                        </div>
                      </div>

                      <div className="flex-1 overflow-y-auto no-scrollbar space-y-1 pt-1">
                        {reminders.map((r) => {
                          const isDone = Boolean(r.doneAt);
                          return (
                            <div
                              key={r.id}
                              className="group flex items-center gap-2.5 min-h-[24px] border-b border-white/10 pb-1"
                            >
                              <button
                                onClick={() => toggleReminder(r.id)}
                                className={`w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center shrink-0 transition ${
                                  isDone
                                    ? 'border-[#ff9f0a]'
                                    : 'border-white/35 hover:border-white/65'
                                }`}
                              >
                                {isDone && (
                                  <span className="w-2.5 h-2.5 rounded-full bg-[#ff9f0a]" />
                                )}
                              </button>

                              {editingReminderId === r.id ? (
                                <input
                                  type="text"
                                  autoFocus
                                  value={editingReminderText}
                                  onChange={(e) =>
                                    setEditingReminderText(e.target.value)
                                  }
                                  onBlur={() => {
                                    if (editingReminderText.trim()) {
                                      setReminders((prev) =>
                                        prev.map((item) =>
                                          item.id === r.id
                                            ? {
                                                ...item,
                                                title: editingReminderText.trim(),
                                              }
                                            : item
                                        )
                                      );
                                    }
                                    setEditingReminderId(null);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') e.currentTarget.blur();
                                    if (e.key === 'Escape') setEditingReminderId(null);
                                  }}
                                  className="flex-1 bg-transparent text-[13.5px] text-white focus:outline-none"
                                />
                              ) : (
                                <span
                                  onClick={() => {
                                    setEditingReminderId(r.id);
                                    setEditingReminderText(r.title);
                                  }}
                                  className={`flex-1 text-[13.5px] cursor-text truncate transition ${
                                    isDone
                                      ? 'line-through text-white/40'
                                      : 'text-white'
                                  }`}
                                >
                                  {r.title}
                                </span>
                              )}

                              <button
                                onClick={() =>
                                  setReminders((prev) =>
                                    prev.filter((item) => item.id !== r.id)
                                  )
                                }
                                className="opacity-0 group-hover:opacity-100 p-0.5 rounded-full text-white/50 hover:text-white transition"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}

                        {/* Faint "New Reminder" row */}
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (!newReminderText.trim()) return;
                            setReminders((prev) => [
                              ...prev,
                              { id: Date.now(), title: newReminderText.trim() },
                            ]);
                            setNewReminderText('');
                          }}
                          className="flex items-center gap-2.5 min-h-[24px] pt-0.5"
                        >
                          <span className="w-4 h-4 rounded-full border-[1.5px] border-white/15 shrink-0" />
                          <input
                            type="text"
                            value={newReminderText}
                            onChange={(e) => setNewReminderText(e.target.value)}
                            placeholder="New Reminder"
                            className="flex-1 bg-transparent text-[13.5px] text-white placeholder:text-white/40 focus:outline-none"
                          />
                        </form>
                      </div>
                    </div>
                  )}

                  {/* PAGE: SHELF (CLIPBOARD + FILES TRAY) */}
                  {activePage === 'shelf' && (
                    <div className="h-full flex flex-col justify-between">
                      {/* Top Segmented Control Bar */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center bg-[#1c1c1e] p-0.5 rounded-full">
                          <button
                            onClick={() => setShelfTab('clipboard')}
                            className={`px-3 py-0.5 rounded-full text-[12px] font-semibold transition ${
                              shelfTab === 'clipboard'
                                ? 'bg-[#3a3a3c] text-white shadow'
                                : 'text-white/60 hover:text-white'
                            }`}
                          >
                            Clipboard
                          </button>
                          <button
                            onClick={() => setShelfTab('files')}
                            className={`px-3 py-0.5 rounded-full text-[12px] font-semibold transition ${
                              shelfTab === 'files'
                                ? 'bg-[#3a3a3c] text-white shadow'
                                : 'text-white/60 hover:text-white'
                            }`}
                          >
                            Files ({shelfFiles.length}/6)
                          </button>
                        </div>

                        {shelfTab === 'clipboard' ? (
                          <div className="flex items-center gap-1.5">
                            <div className="flex items-center bg-[#1c1c1e] p-0.5 rounded-full">
                              {(
                                [
                                  { id: 'all', icon: <Clipboard className="w-3 h-3" /> },
                                  { id: 'text', icon: <FileText className="w-3 h-3" /> },
                                  { id: 'link', icon: <Link2 className="w-3 h-3" /> },
                                  {
                                    id: 'image',
                                    icon: <ImageIcon className="w-3 h-3" />,
                                  },
                                ] as const
                              ).map((f) => (
                                <button
                                  key={f.id}
                                  onClick={() => setClipFilter(f.id)}
                                  className={`p-1 rounded-full transition ${
                                    clipFilter === f.id
                                      ? 'bg-[#3a3a3c] text-white'
                                      : 'text-white/50 hover:text-white'
                                  }`}
                                  title={`Filter: ${f.id}`}
                                >
                                  {f.icon}
                                </button>
                              ))}
                            </div>

                            {clipSearchOpen ? (
                              <input
                                type="text"
                                autoFocus
                                value={clipSearch}
                                onChange={(e) => setClipSearch(e.target.value)}
                                onBlur={() => {
                                  if (!clipSearch) setClipSearchOpen(false);
                                }}
                                placeholder="Search clips..."
                                className="w-32 bg-[#1c1c1e] text-[12px] px-2.5 py-1 rounded-full focus:outline-none"
                              />
                            ) : (
                              <button
                                onClick={() => setClipSearchOpen(true)}
                                className="p-1.5 rounded-full bg-[#2c2c2e] hover:bg-[#3a3a3c]"
                                title="Search clipboard (Super+V)"
                              >
                                <Search className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-[12px] text-white/55">
                              {shelfFiles.length} of 6 · click to copy, or drop files
                            </span>
                            <button
                              onClick={handleDropSampleFile}
                              disabled={shelfFiles.length >= 6}
                              className="px-2.5 py-0.5 rounded-full bg-[#2c2c2e] hover:bg-[#3a3a3c] disabled:opacity-40 text-[11.5px] font-semibold flex items-center gap-1"
                            >
                              <Upload className="w-3 h-3" />
                              <span>Drop file</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Shelf Content */}
                      {shelfTab === 'clipboard' ? (
                        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-1">
                          {clips
                            .filter((c) =>
                              clipFilter === 'all'
                                ? true
                                : clipFilter === 'text'
                                ? c.kind === 'text' || c.kind === 'code'
                                : c.kind === clipFilter
                            )
                            .filter((c) =>
                              clipSearch
                                ? c.content
                                    .toLowerCase()
                                    .includes(clipSearch.toLowerCase())
                                : true
                            )
                            .sort((a, b) => Number(b.pinned) - Number(a.pinned))
                            .map((clip) => (
                              <div
                                key={clip.id}
                                onClick={() => {
                                  navigator.clipboard?.writeText(clip.content).catch(() => {});
                                  setCopiedClipId(clip.id);
                                  setTimeout(() => setCopiedClipId(null), 900);
                                }}
                                style={
                                  clip.kind === 'image' && clip.gradient
                                    ? { background: clip.gradient }
                                    : undefined
                                }
                                className="group relative w-[132px] h-[94px] rounded-[12px] bg-[#1c1c1e] hover:bg-[#242426] p-2 flex flex-col justify-between shrink-0 cursor-pointer overflow-hidden border border-white/5"
                              >
                                <div className="flex items-center justify-between text-[11px] text-white/55">
                                  <span className="font-semibold text-white/80 truncate">
                                    {clip.app}
                                  </span>
                                  <span>{clip.age}</span>
                                </div>

                                <div className="min-w-0">
                                  {clip.kind === 'code' ? (
                                    <div className="font-mono text-[10.5px] text-white/90 line-clamp-3 leading-tight">
                                      {clip.content}
                                    </div>
                                  ) : clip.kind === 'link' ? (
                                    <div>
                                      <div className="text-[12px] font-bold truncate">
                                        {clip.subtitle}
                                      </div>
                                      <div className="text-[11px] text-white/55 truncate">
                                        {clip.content}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="text-[11.5px] text-white/90 line-clamp-3 leading-tight">
                                      {clip.content}
                                    </div>
                                  )}
                                </div>

                                {/* Hover Pin & Remove actions */}
                                <div
                                  onClick={(e) => e.stopPropagation()}
                                  className="absolute top-1.5 right-1.5 hidden group-hover:flex items-center gap-1"
                                >
                                  <button
                                    onClick={() =>
                                      setClips((prev) =>
                                        prev.map((item) =>
                                          item.id === clip.id
                                            ? { ...item, pinned: !item.pinned }
                                            : item
                                        )
                                      )
                                    }
                                    className={`p-1 rounded-full ${
                                      clip.pinned
                                        ? 'bg-[#ff9f0a] text-black'
                                        : 'bg-[#3a3a3c] text-white'
                                    }`}
                                    title="Pin item"
                                  >
                                    <Pin className="w-2.5 h-2.5" />
                                  </button>
                                  <button
                                    onClick={() =>
                                      setClips((prev) =>
                                        prev.filter((item) => item.id !== clip.id)
                                      )
                                    }
                                    className="p-1 rounded-full bg-[#3a3a3c] text-white"
                                  >
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                </div>

                                {/* Copied feedback overlay */}
                                {copiedClipId === clip.id && (
                                  <div className="absolute inset-0 bg-[#1c1c1e]/95 flex flex-col items-center justify-center">
                                    <Check className="w-4 h-4 text-[#30d158]" />
                                    <span className="text-[11.5px] font-bold mt-1">
                                      Copied
                                    </span>
                                  </div>
                                )}
                              </div>
                            ))}
                        </div>
                      ) : (
                        /* Files Tray (up to 6 tiles) */
                        <div className="grid grid-cols-6 gap-2 pt-1">
                          {shelfFiles.map((file) => (
                            <div
                              key={file.id}
                              onClick={() => {
                                setCopiedFileId(file.id);
                                setTimeout(() => setCopiedFileId(null), 900);
                              }}
                              className="relative flex flex-col items-center p-1.5 rounded-[14px] hover:bg-[#1c1c1e] cursor-pointer transition"
                            >
                              <div
                                className="relative w-[52px] h-[52px] rounded-[12px] flex items-center justify-center shadow"
                                style={{ background: file.previewGradient }}
                              >
                                <FileText className="w-5 h-5 text-white/90" />
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShelfFiles((prev) =>
                                      prev.filter((f) => f.id !== file.id)
                                    );
                                  }}
                                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#3a3a3c] hover:bg-[#5a5a5e] border border-black flex items-center justify-center"
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                                {copiedFileId === file.id && (
                                  <div className="absolute inset-0 rounded-[12px] bg-black/75 flex items-center justify-center text-[10px] font-bold text-[#30d158]">
                                    Copied
                                  </div>
                                )}
                              </div>
                              <span className="text-[11px] text-center leading-tight mt-1 line-clamp-2">
                                {file.name}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* PAGE: CALENDAR & WORLD CLOCKS */}
                  {activePage === 'calendar' && (
                    <div className="h-full flex items-center gap-5">
                      {/* Left: Month Calendar Widget (196px) */}
                      <div className="w-[196px] shrink-0 flex flex-col justify-between h-full">
                        <div className="flex items-center justify-between">
                          <button
                            onClick={() => setSelectedDateIso(todayIso)}
                            className="flex items-center gap-1.5 px-1 py-0.5 rounded hover:bg-white/8"
                          >
                            <span className="text-[11.5px] font-bold text-[#ff453a] uppercase">
                              {nowDate.toLocaleDateString('en-US', { month: 'long' })}
                            </span>
                            <span className="text-[11.5px] font-semibold text-white/50 tnum">
                              {nowDate.getFullYear()}
                            </span>
                          </button>
                          <button
                            onClick={() =>
                              setShowWorldClocksDetail((w) => !w)
                            }
                            className={`p-1 rounded-full transition ${
                              showWorldClocksDetail
                                ? 'bg-white/20 text-white'
                                : 'text-white/60 hover:text-white'
                            }`}
                            title="Toggle World Clocks"
                          >
                            <Globe className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="grid grid-cols-7 text-center text-[9.5px] font-semibold text-white/50">
                          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                            <span key={i}>{d}</span>
                          ))}
                        </div>

                        <div className="grid grid-cols-7 gap-y-0.5 text-center">
                          {calendarDays.slice(0, 35).map((cell) => {
                            if (!cell.day) {
                              return <span key={cell.iso} className="h-[18px]" />;
                            }
                            const isToday = cell.iso === todayIso;
                            const isSelected = cell.iso === selectedDateIso;
                            return (
                              <button
                                key={cell.iso}
                                onClick={() => setSelectedDateIso(cell.iso)}
                                className={`mx-auto w-[19px] h-[19px] rounded-full text-[10.5px] font-semibold tnum flex flex-col items-center justify-center relative transition ${
                                  isToday
                                    ? 'bg-[#ff453a] text-white font-bold'
                                    : isSelected
                                    ? 'bg-white/22 text-white'
                                    : 'text-white/85 hover:bg-white/12'
                                }`}
                              >
                                <span>{cell.day}</span>
                                {cell.hasEvent && (
                                  <span className="w-[3px] h-[3px] rounded-full bg-white/80 absolute -bottom-0.5" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Right: Day Agenda or World Clocks */}
                      <div className="flex-1 h-full flex flex-col justify-between min-w-0">
                        {showWorldClocksDetail ? (
                          <div className="space-y-1.5 my-auto">
                            {[
                              { city: 'New York', tz: 'America/New_York', meta: 'EDT' },
                              { city: 'London', tz: 'Europe/London', meta: 'BST' },
                              { city: 'Jakarta', tz: 'Asia/Jakarta', meta: 'WIB' },
                              { city: 'Tokyo', tz: 'Asia/Tokyo', meta: 'JST' },
                            ].map((wc) => (
                              <div
                                key={wc.city}
                                className="flex items-center justify-between px-3 py-1 rounded-[7px] bg-white/7"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-[12.5px] font-semibold">
                                    {wc.city}
                                  </span>
                                  <span className="text-[11px] text-white/50">
                                    {wc.meta}
                                  </span>
                                </div>
                                <span className="text-[12.5px] font-semibold tnum">
                                  {nowDate.toLocaleTimeString('en-GB', {
                                    timeZone: wc.tz,
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <>
                            {/* Natural Language Event Input ("Dinner 8:00 pm") */}
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                const parsed = parseEventLine(calInput);
                                if (!parsed) return;
                                setEvents((prev) => [
                                  ...prev,
                                  {
                                    id: Date.now(),
                                    title: parsed.title,
                                    date: selectedDateIso,
                                    start: parsed.start,
                                    end: parsed.end,
                                    source: 'isle',
                                  },
                                ]);
                                setCalInput('');
                              }}
                            >
                              <input
                                type="text"
                                value={calInput}
                                onChange={(e) => setCalInput(e.target.value)}
                                placeholder="Add event: e.g. Dinner 8:00 pm or Standup 9:00-9:15"
                                className="w-full bg-[#1c1c1e] focus:bg-[#2c2c2e] text-[12px] text-white placeholder:text-white/45 px-3 py-1 rounded-full focus:outline-none"
                              />
                            </form>

                            {/* Day's Events */}
                            <div className="flex-1 overflow-y-auto no-scrollbar space-y-1 my-1">
                              {selectedDayEvents.length === 0 ? (
                                <div className="text-[12.5px] text-white/50 pt-2">
                                  No events on {selectedDateIso}
                                </div>
                              ) : (
                                selectedDayEvents.map((ev) => {
                                  const isDesktop = ev.source === 'desktop';
                                  return (
                                    <div
                                      key={ev.id}
                                      className={`group flex items-center justify-between px-2 py-1 rounded-[7px] ${
                                        isDesktop
                                          ? 'bg-[#0a84ff]/18'
                                          : 'bg-[#ff9f0a]/18'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span
                                          className={`w-[3px] h-4 rounded-full shrink-0 ${
                                            isDesktop
                                              ? 'bg-[#0a84ff]'
                                              : 'bg-[#ff9f0a]'
                                          }`}
                                        />
                                        <span className="text-[12.5px] font-semibold truncate">
                                          {ev.title}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        {ev.meetingUrl && (
                                          <button
                                            onClick={() => {
                                              setCallService('Google Meet');
                                              setCallActive(true);
                                              setCallSeconds(1);
                                              setActivePage('call');
                                            }}
                                            className="px-2 py-0.5 rounded-full bg-[#0a84ff] text-[10.5px] font-semibold"
                                          >
                                            Join
                                          </button>
                                        )}
                                        <span className="text-[11px] text-white/65 tnum">
                                          {ev.start
                                            ? ev.end
                                              ? `${ev.start}–${ev.end}`
                                              : ev.start
                                            : 'All day'}
                                        </span>
                                        {ev.source === 'isle' && (
                                          <button
                                            onClick={() =>
                                              setEvents((prev) =>
                                                prev.filter(
                                                  (item) => item.id !== ev.id
                                                )
                                              )
                                            }
                                            className="opacity-0 group-hover:opacity-100 text-white/50 hover:text-white"
                                          >
                                            <X className="w-3 h-3" />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>

                            {/* Bottom World Clocks Strip */}
                            <div
                              onClick={() => setShowWorldClocksDetail(true)}
                              className="flex items-center justify-between pt-1 border-t border-white/10 text-[11px] cursor-pointer hover:text-white"
                            >
                              {[
                                { city: 'NYC', tz: 'America/New_York' },
                                { city: 'LON', tz: 'Europe/London' },
                                { city: 'JKT', tz: 'Asia/Jakarta' },
                                { city: 'TYO', tz: 'Asia/Tokyo' },
                              ].map((c) => (
                                <div key={c.city} className="flex items-center gap-1">
                                  <span className="text-white/50 font-medium">
                                    {c.city}
                                  </span>
                                  <span className="font-semibold tnum">
                                    {nowDate.toLocaleTimeString('en-GB', {
                                      timeZone: c.tz,
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* PAGE: AI USAGE */}
                  {activePage === 'usage' && (
                    <div className="h-full flex items-center justify-between gap-4">
                      {(() => {
                        const provider = usageProviders[usageProviderIdx];
                        return (
                          <>
                            <div className="flex-1 space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="w-2.5 h-2.5 rounded-full"
                                    style={{ backgroundColor: provider.color }}
                                  />
                                  <span className="text-[15px] font-bold tracking-tight">
                                    {provider.name}
                                  </span>
                                  <span className="px-2 py-0.5 rounded-full bg-white/10 text-[11px] font-semibold text-white/75">
                                    {provider.plan}
                                  </span>
                                </div>
                                <span className="text-[11px] text-white/50">
                                  {provider.updated}
                                </span>
                              </div>

                              <div className="space-y-2.5">
                                {provider.limits.map((lim) => (
                                  <div key={lim.label} className="space-y-1">
                                    <div className="flex items-center justify-between text-[12.5px]">
                                      <div className="flex items-center gap-2">
                                        <span className="font-semibold">
                                          {lim.label}
                                        </span>
                                        <span className="text-[11px] text-white/50">
                                          {lim.reset}
                                        </span>
                                      </div>
                                      <span
                                        className={`font-bold tnum ${
                                          lim.percent >= 80
                                            ? 'text-[#ff453a]'
                                            : 'text-white'
                                        }`}
                                      >
                                        {lim.percent}%
                                      </span>
                                    </div>
                                    <div className="w-full h-[5px] rounded-full bg-white/10 overflow-hidden">
                                      <div
                                        className="h-full rounded-full transition-all duration-300"
                                        style={{
                                          width: `${lim.percent}%`,
                                          backgroundColor:
                                            lim.percent >= 80
                                              ? '#ff453a'
                                              : provider.color,
                                        }}
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Widget stack provider dots */}
                            <div className="flex flex-col items-center gap-2 pl-2">
                              {usageProviders.map((p, idx) => (
                                <button
                                  key={p.id}
                                  onClick={() => setUsageProviderIdx(idx)}
                                  className={`w-2 h-2 rounded-full transition ${
                                    usageProviderIdx === idx
                                      ? 'bg-white scale-125'
                                      : 'bg-white/30 hover:bg-white/60'
                                  }`}
                                  title={`Switch to ${p.name}`}
                                />
                              ))}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
            )}
          </IslandSurface>
        </div>

        {/* Right: GNOME System Status Icons */}
        <div className="flex items-center gap-2.5 text-white/90">
          {screenRecording && (
            <button
              onClick={() => setScreenRecording(false)}
              className="px-2 py-0.5 rounded-full bg-[#d61f2d] text-white text-[11px] font-semibold flex items-center gap-1"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              <span>REC</span>
            </button>
          )}
          <div className="flex items-center gap-2 px-2 py-0.5 rounded-full hover:bg-white/15 cursor-pointer transition">
            <Wifi className="w-3.5 h-3.5" />
            <Bluetooth className="w-3.5 h-3.5" />
            <Volume2 className="w-3.5 h-3.5" />
            <span className="text-[12px] tnum font-medium">86%</span>
          </div>
        </div>
      </header>

      {/* ── INTERACTIVE GNOME WORKSPACE & ISLE SIMULATOR CONTROLS ── */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-end pb-7 px-6 pointer-events-none">
        {/* Floating Bot Look & Architecture Showcase Card */}
        <div className="pointer-events-auto w-full max-w-4xl rounded-3xl bg-[#11131a]/85 backdrop-blur-xl border border-white/10 shadow-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-3.5">
            <div className="flex items-center gap-3.5">
              <BotCanvas
                size={46}
                shape={botShape}
                color={botColor}
                glowMode={botGlowMode}
                form={botForm}
                voiceLevel={voiceLevel}
                gestureTrigger={botGesture}
              />
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-bold tracking-tight text-white">
                    Isle — Notch Island for GNOME Shell 46–51
                  </h1>
                  <span className="px-2 py-0.5 rounded-full bg-white/10 text-[11px] font-mono text-white/80">
                    v1.4.0 · isled D-Bus
                  </span>
                </div>
                <p className="text-xs text-white/60 mt-0.5">
                  Hover or click the black notch at the top of the screen to open the island, or trigger desktop events below.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setActiveAlert(null);
                  setPinnedOpen(false);
                  setVoiceOpen((v) => !v);
                  setBotForm('listening');
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white text-black hover:bg-white/90 text-xs font-semibold transition shadow"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Voice Assistant (Alt+I)</span>
              </button>
              <button
                onClick={() => setSettingsOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-xs font-semibold transition"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Settings</span>
              </button>
            </div>
          </div>

          {/* Interactive Desktop Event Triggers */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            {/* Column 1: Peek Alerts */}
            <div className="rounded-2xl bg-white/[0.04] border border-white/8 p-3.5 space-y-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-white/45">
                Trigger Notch Alerts (Peek)
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() =>
                    triggerAlert(
                      {
                        id: 'claude-hook',
                        kind: 'agent-ask',
                        title: 'isle-daemon needs permission',
                        agentName: 'Claude Code',
                        codeLine: 'cargo test --workspace --all-targets',
                        accentColor: '#d97757',
                      },
                      0
                    )
                  }
                  className="px-2.5 py-1.5 rounded-xl bg-[#d97757]/20 hover:bg-[#d97757]/30 border border-[#d97757]/30 font-semibold text-white transition"
                >
                  Claude Code Approval Hook
                </button>
                <button
                  onClick={() =>
                    triggerAlert(
                      {
                        id: 'meeting-soon',
                        kind: 'meeting',
                        title: 'Weekly sync in 5 min',
                        subtitle: '14:00 – 14:45 · Google Meet',
                        accentColor: '#0a84ff',
                        meetingUrl: 'https://meet.google.com/isle-gnome-sync',
                      },
                      8000
                    )
                  }
                  className="px-2.5 py-1.5 rounded-xl bg-[#0a84ff]/20 hover:bg-[#0a84ff]/30 border border-[#0a84ff]/30 font-semibold text-white transition"
                >
                  Meeting Join Alert
                </button>
                <button
                  onClick={() =>
                    triggerAlert({
                      id: 'charging',
                      kind: 'charging',
                      title: 'Charging',
                      subtitle: 'Charger connected',
                      valueText: '76%',
                      accentColor: '#30d158',
                    })
                  }
                  className="px-2.5 py-1.5 rounded-xl bg-white/8 hover:bg-white/15 font-medium transition"
                >
                  Charging (76%)
                </button>
                <button
                  onClick={() =>
                    triggerAlert({
                      id: 'low-bat',
                      kind: 'low-battery',
                      title: 'Low Battery',
                      subtitle: 'Plug in your charger soon',
                      valueText: '10%',
                      accentColor: '#ff453a',
                    })
                  }
                  className="px-2.5 py-1.5 rounded-xl bg-white/8 hover:bg-white/15 font-medium transition"
                >
                  Low Battery (10%)
                </button>
                <button
                  onClick={() => {
                    const nextVol = volume >= 100 ? 100 : Math.min(100, volume + 15);
                    if (nextVol === 100) setNudgeCount((n) => n + 1);
                    setVolume(nextVol);
                    triggerAlert(
                      {
                        id: 'vol',
                        kind: 'volume',
                        title: 'Volume',
                        subtitle: 'AirBuds Pro',
                        level: nextVol,
                        accentColor: '#2c2c2e',
                      },
                      1800
                    );
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-white/8 hover:bg-white/15 font-medium transition"
                >
                  Volume + Rubber-Band Nudge
                </button>
                <button
                  onClick={() =>
                    triggerAlert({
                      id: 'earbuds',
                      kind: 'earbuds',
                      title: 'AirBuds Pro',
                      subtitle: 'Connected',
                      valueText: '70%',
                      accentColor: '#30d158',
                    })
                  }
                  className="px-2.5 py-1.5 rounded-xl bg-white/8 hover:bg-white/15 font-medium transition"
                >
                  Earbuds Connected
                </button>
              </div>
            </div>

            {/* Column 2: Live Activities & Pages */}
            <div className="rounded-2xl bg-white/[0.04] border border-white/8 p-3.5 space-y-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-white/45">
                Live Activities & Quick Pages
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => {
                    const next = !callActive;
                    setCallActive(next);
                    if (next) {
                      setCallSeconds(1);
                      setActivePage('call');
                      setPinnedOpen(true);
                    }
                  }}
                  className={`px-2.5 py-1.5 rounded-xl font-semibold transition ${
                    callActive
                      ? 'bg-[#30d158] text-black'
                      : 'bg-white/8 hover:bg-white/15 text-white'
                  }`}
                >
                  {callActive ? 'End Active Call' : 'Start Live Call'}
                </button>
                <button
                  onClick={() => {
                    setActivePage('music');
                    setLyricsMode(true);
                    setPinnedOpen(true);
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-white/8 hover:bg-white/15 font-medium transition"
                >
                  Synced Lyrics (720px)
                </button>
                <button
                  onClick={handleDropSampleFile}
                  className="px-2.5 py-1.5 rounded-xl bg-white/8 hover:bg-white/15 font-medium transition"
                >
                  Drop File on Shelf
                </button>
                <button
                  onClick={() =>
                    setPrivacyDots((p) => ({
                      camera: !p.camera,
                      microphone: !p.microphone,
                      screenShare: false,
                    }))
                  }
                  className={`px-2.5 py-1.5 rounded-xl font-medium transition ${
                    privacyDots.camera
                      ? 'bg-[#ff9f0a]/25 border border-[#ff9f0a]/50 text-[#ff9f0a]'
                      : 'bg-white/8 hover:bg-white/15'
                  }`}
                >
                  Privacy Dots (Cam/Mic)
                </button>
                <button
                  onClick={() => setScreenRecording((r) => !r)}
                  className={`px-2.5 py-1.5 rounded-xl font-medium transition ${
                    screenRecording
                      ? 'bg-[#ff453a] text-white'
                      : 'bg-white/8 hover:bg-white/15'
                  }`}
                >
                  {screenRecording ? 'Stop Screen Rec' : 'Screen Recording'}
                </button>
              </div>
            </div>

            {/* Column 3: Bot Shape & Color Customizer */}
            <div className="rounded-2xl bg-white/[0.04] border border-white/8 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-white/45">
                  Bot Character (8 Shapes · 11 Colors)
                </span>
                <span className="text-[11px] text-white/60">
                  {SHAPES[botShape].label} · {COLORS[botColor].label}
                </span>
              </div>

              {/* Shapes */}
              <div className="flex flex-wrap gap-1">
                {(Object.keys(SHAPES) as BotShapeName[]).map((sh) => (
                  <button
                    key={sh}
                    onClick={() => setBotShape(sh)}
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-medium transition ${
                      botShape === sh
                        ? 'bg-white text-black font-semibold'
                        : 'bg-white/8 hover:bg-white/15 text-white/75'
                    }`}
                  >
                    {SHAPES[sh].label}
                  </button>
                ))}
              </div>

              {/* Colors */}
              <div className="flex items-center gap-1.5 pt-0.5">
                {(Object.keys(COLORS) as BotColorName[]).map((cKey) => (
                  <button
                    key={cKey}
                    onClick={() => setBotColor(cKey)}
                    style={{ backgroundColor: COLORS[cKey].body }}
                    className={`w-4 h-4 rounded-full transition-transform ${
                      botColor === cKey
                        ? 'scale-125 ring-2 ring-white ring-offset-1 ring-offset-black'
                        : 'opacity-75 hover:opacity-100'
                    }`}
                    title={COLORS[cKey].label}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ── ISLE SETTINGS MODAL (gnome-extension/prefs.js equivalent) ── */}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-3xl bg-[#1c1c1e] border border-white/12 shadow-2xl p-6 space-y-5 text-sm"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h2 className="text-base font-bold">Isle Preferences</h2>
                <p className="text-xs text-white/55">
                  org.gnome.shell.extensions.isle
                </p>
              </div>
              <button
                onClick={() => setSettingsOpen(false)}
                className="p-1.5 rounded-full bg-white/10 hover:bg-white/20"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Top Bar Glass-to-Black Slider */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="font-semibold">Top bar opacity (Glass to Black)</div>
                  <div className="text-xs text-white/50">
                    All the way to black, the shoulders curve out of the bar's lower edge
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={barOpacity}
                  onChange={(e) => setBarOpacity(Number(e.target.value))}
                  className="w-28 accent-white"
                />
              </div>

              {/* Compact Position */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">Closed island hangs below top bar</div>
                  <div className="text-xs text-white/50">
                    164 × (P + 28) with 10px concave shoulders instead of inside the bar
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={hangingCompact}
                  onChange={(e) => setHangingCompact(e.target.checked)}
                  className="w-4 h-4 accent-[#0a84ff]"
                />
              </div>

              {/* Open on pointer rest */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">Open when pointer rests on notch (120 ms)</div>
                  <div className="text-xs text-white/50">
                    Passing over it on the way elsewhere leaves it closed
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={openOnHover}
                  onChange={(e) => setOpenOnHover(e.target.checked)}
                  className="w-4 h-4 accent-[#0a84ff]"
                />
              </div>

              {/* 24-hour clock */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">24-hour clock</div>
                  <div className="text-xs text-white/50">
                    Tabular figures ("tnum") so digits never jump
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={use24Hour}
                  onChange={(e) => setUse24Hour(e.target.checked)}
                  className="w-4 h-4 accent-[#0a84ff]"
                />
              </div>

              {/* Bot Glow Mode */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">Assistant Aura Glow</div>
                  <div className="text-xs text-white/50">
                    Match the bot's color palette or use classic violet/blue/cyan
                  </div>
                </div>
                <div className="flex items-center bg-[#2c2c2e] p-0.5 rounded-full text-xs">
                  <button
                    onClick={() => setBotGlowMode('match')}
                    className={`px-3 py-1 rounded-full font-semibold ${
                      botGlowMode === 'match' ? 'bg-white text-black' : 'text-white/70'
                    }`}
                  >
                    Match Bot
                  </button>
                  <button
                    onClick={() => setBotGlowMode('classic')}
                    className={`px-3 py-1 rounded-full font-semibold ${
                      botGlowMode === 'classic' ? 'bg-white text-black' : 'text-white/70'
                    }`}
                  >
                    Classic
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
