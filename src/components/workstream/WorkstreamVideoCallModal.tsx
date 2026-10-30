import React, { useState, useEffect, useRef } from 'react';
import { 
  Video, VideoOff, Mic, MicOff, Monitor, PhoneOff, ShieldCheck, 
  Sparkles, MessageSquare, Maximize2, Minimize2, Check, Lock, 
  User, Volume2, Info, FileText, Send, Radio
} from 'lucide-react';
import { WorkstreamItem } from './types';
import { UserAccount } from '../../types';
import { DEFAULT_AVATAR } from '../../constants';

interface WorkstreamVideoCallModalProps {
  isOpen: boolean;
  order: WorkstreamItem;
  currentUser?: UserAccount | null;
  partner?: UserAccount;
  onClose: () => void;
  onLogRequirement: (requirementText: string) => void;
  onMissedCall: () => void;
}

export const WorkstreamVideoCallModal: React.FC<WorkstreamVideoCallModalProps> = ({
  isOpen,
  order,
  currentUser,
  partner,
  onClose,
  onLogRequirement,
  onMissedCall
}) => {
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [meetingNote, setMeetingNote] = useState('');
  const [loggedNotes, setLoggedNotes] = useState<string[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenShareVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  // Call timer effect
  useEffect(() => {
    if (!isOpen) {
      setCallDuration(0);
      return;
    }

    const timer = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen]);

  // Request browser WebRTC media stream
  useEffect(() => {
    if (!isOpen) {
      stopMediaTracks();
      return;
    }

    async function initWebRTC() {
      try {
        setMediaError(null);
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
          });
          mediaStreamRef.current = stream;
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
        }
      } catch (err: any) {
        console.warn('WebRTC getUserMedia error or permission denied:', err);
        setMediaError('Browser camera/microphone permission required. Virtual WebRTC meeting stream active.');
      }
    }

    initWebRTC();

    return () => {
      stopMediaTracks();
    };
  }, [isOpen]);

  const stopMediaTracks = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }
  };

  const toggleMic = () => {
    setIsMicOn(prev => {
      const next = !prev;
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getAudioTracks().forEach(track => {
          track.enabled = next;
        });
      }
      return next;
    });
  };

  const toggleVideo = () => {
    setIsVideoOn(prev => {
      const next = !prev;
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getVideoTracks().forEach(track => {
          track.enabled = next;
        });
      }
      return next;
    });
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
        screenStreamRef.current = null;
      }
      setIsScreenSharing(false);
    } else {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
          const displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: false
          });
          screenStreamRef.current = displayStream;
          if (screenShareVideoRef.current) {
            screenShareVideoRef.current.srcObject = displayStream;
          }
          displayStream.getVideoTracks()[0].onended = () => {
            setIsScreenSharing(false);
          };
          setIsScreenSharing(true);
        }
      } catch (err) {
        console.warn('Screen share cancelled or unsupported:', err);
      }
    }
  };

  const handleLogRequirementSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!meetingNote.trim()) return;
    const cleanNote = meetingNote.trim();
    onLogRequirement(cleanNote);
    setLoggedNotes(prev => [...prev, cleanNote]);
    setMeetingNote('');
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  // MINIMIZED FLOATING CALL WIDGET (Picture in Picture mode)
  if (isMinimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white rounded-2xl p-4 shadow-2xl border border-slate-700 w-80 animate-in slide-in-from-bottom-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
            <span className="text-xs font-bold font-mono tracking-wider text-emerald-400">
              {formatDuration(callDuration)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button 
              onClick={() => setIsMinimized(false)}
              className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
              title="Expand Meeting View"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button 
              onClick={onClose}
              className="p-1.5 hover:bg-rose-900/50 rounded-lg text-rose-400 transition cursor-pointer"
              title="End Meeting"
            >
              <PhoneOff className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <img 
              src={partner?.avatar || DEFAULT_AVATAR} 
              alt={partner?.name || 'Participant'} 
              className="w-9 h-9 rounded-full object-cover border border-emerald-500"
              onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_AVATAR; }}
            />
            <div className="overflow-hidden">
              <h5 className="text-xs font-bold truncate">{partner?.name || 'Project Collaborator'}</h5>
              <p className="text-[10px] text-slate-400 truncate"></p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 pt-2 border-t border-slate-800">
          <button
            onClick={toggleMic}
            className={`p-2 rounded-xl transition cursor-pointer ${isMicOn ? 'bg-slate-800 hover:bg-slate-700 text-white' : 'bg-rose-600 text-white'}`}
          >
            {isMicOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          </button>
          <button
            onClick={toggleVideo}
            className={`p-2 rounded-xl transition cursor-pointer ${isVideoOn ? 'bg-slate-800 hover:bg-slate-700 text-white' : 'bg-rose-600 text-white'}`}
          >
            {isVideoOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
          </button>
          <button
            onClick={toggleScreenShare}
            className={`p-2 rounded-xl transition cursor-pointer ${isScreenSharing ? 'bg-emerald-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'}`}
          >
            <Monitor className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // FULL SCREEN / MODAL VIEW
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-6xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* MEETING HEADER */}
        <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Video className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight">WorkPerHour Meeting Room</h3>
                <span className="px-2.5 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-bold rounded-full flex items-center gap-1">
                  <Lock className="w-3 h-3 text-emerald-400" />
                  <span></span>
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Order #{order.id} • Meeting Room: <span className="font-mono text-slate-300">MEET-PRJ-{order.id}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="px-3 py-1.5 bg-slate-800/80 rounded-xl border border-slate-700/60 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span className="text-xs font-mono font-bold text-emerald-400">{formatDuration(callDuration)}</span>
            </div>

            <button
              onClick={() => setIsMinimized(true)}
              className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition cursor-pointer"
              title="Minimize to Picture-in-Picture"
            >
              <Minimize2 className="w-4 h-4" />
            </button>

            <button
              onClick={onClose}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer"
            >
              <PhoneOff className="w-4 h-4" />
              <span>Leave Room</span>
            </button>
            <button
              onClick={() => {
                onMissedCall();
                onClose();
              }}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <span>Test Missed Call</span>
            </button>
          </div>
        </div>

        {/* PITCH BANNER FOR PROJECT PROTECTION */}
        <div className="bg-gradient-to-r from-emerald-950/80 via-slate-900 to-indigo-950/80 border-b border-emerald-800/40 px-6 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 text-emerald-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-medium">
              "Use our secure meeting rooms to ensure all project requirements are logged and protected under our Escrow Guarantee."
            </span>
          </div>
          <span className="px-2.5 py-1 bg-emerald-900/60 text-emerald-300 border border-emerald-700/50 rounded-lg text-[10px] font-bold tracking-wide uppercase shrink-0">
            Escrow Protection Active
          </span>
        </div>

        {/* MAIN BODY: VIDEO GRID (LEFT 3 COLS) + REQUIREMENT LOG SIDEBAR (RIGHT 1 COL) */}
        <div className="grid grid-cols-1 lg:grid-cols-4 flex-1 overflow-hidden">
          
          {/* VIDEO CONTAINER */}
          <div className="lg:col-span-3 bg-slate-950 p-4 sm:p-6 flex flex-col justify-between relative overflow-y-auto">
            
            {mediaError && (
              <div className="mb-4 p-3 bg-amber-950/60 border border-amber-800/50 rounded-2xl text-amber-300 text-xs flex items-center gap-2">
                <Info className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{mediaError}</span>
              </div>
            )}

            {/* SCREEN SHARE OR VIDEO GRID */}
            {isScreenSharing ? (
              <div className="relative rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 h-[380px] sm:h-[420px] flex items-center justify-center">
                <video 
                  ref={screenShareVideoRef} 
                  autoPlay 
                  playsInline 
                  className="w-full h-full object-contain"
                />
                <div className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur-sm px-3 py-1.5 rounded-xl border border-slate-700 text-white text-xs font-bold flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-emerald-400 animate-pulse" />
                  <span>Sharing Desktop Screen</span>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-[380px] sm:h-[420px]">
                {/* LOCAL USER STREAM */}
                <div className="relative rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 flex items-center justify-center group">
                  {isVideoOn ? (
                    <video 
                      ref={localVideoRef} 
                      autoPlay 
                      playsInline 
                      muted 
                      className="w-full h-full object-cover transform -scale-x-100"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-20 h-20 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center overflow-hidden">
                        <img 
                          src={currentUser?.avatar || DEFAULT_AVATAR} 
                          alt="You" 
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_AVATAR; }}
                        />
                      </div>
                      <span className="text-xs font-medium text-slate-400">Camera Turned Off</span>
                    </div>
                  )}

                  <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-sm px-3 py-1 rounded-xl border border-slate-700/80 text-white text-xs font-semibold flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-indigo-400" />
                    <span>You ({currentUser?.name || 'Self'})</span>
                  </div>

                  {!isMicOn && (
                    <div className="absolute top-3 right-3 bg-rose-900/90 text-white p-1.5 rounded-lg border border-rose-700">
                      <MicOff className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>

                {/* REMOTE PARTNER STREAM */}
                <div className="relative rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 flex items-center justify-center group">
                  <div className="flex flex-col items-center gap-3">
                    <div className="relative">
                      <div className="w-24 h-24 rounded-full bg-slate-800 border-2 border-emerald-500/60 flex items-center justify-center overflow-hidden shadow-lg shadow-emerald-500/10">
                        <img 
                          src={partner?.avatar || DEFAULT_AVATAR} 
                          alt={partner?.name || 'Partner'} 
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_AVATAR; }}
                        />
                      </div>
                      <span className="absolute bottom-1 right-1 w-4 h-4 bg-emerald-500 border-2 border-slate-900 rounded-full" />
                    </div>
                    <div className="text-center">
                      <h4 className="text-sm font-bold text-white">{partner?.name || 'Project Collaborator'}</h4>
                      <p className="text-[11px] text-emerald-400 font-medium flex items-center justify-center gap-1 mt-0.5">
                        <Radio className="w-3 h-3 animate-pulse text-emerald-400" />
                        <span>Connected</span>
                      </p>
                    </div>
                  </div>

                  <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-sm px-3 py-1 rounded-xl border border-slate-700/80 text-white text-xs font-semibold flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{partner?.name || 'Collaborator'}</span>
                  </div>
                </div>
              </div>
            )}

            {/* CALL CONTROL BAR */}
            <div className="pt-6 flex items-center justify-center gap-3">
              <button
                onClick={toggleMic}
                className={`p-3.5 rounded-2xl transition cursor-pointer flex items-center gap-2 font-bold text-xs ${
                  isMicOn 
                    ? 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700' 
                    : 'bg-rose-600 text-white border border-rose-500'
                }`}
                title={isMicOn ? 'Mute Microphone' : 'Unmute Microphone'}
              >
                {isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                <span className="hidden sm:inline">{isMicOn ? 'Mute Mic' : 'Mic Off'}</span>
              </button>

              <button
                onClick={toggleVideo}
                className={`p-3.5 rounded-2xl transition cursor-pointer flex items-center gap-2 font-bold text-xs ${
                  isVideoOn 
                    ? 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700' 
                    : 'bg-rose-600 text-white border border-rose-500'
                }`}
                title={isVideoOn ? 'Turn Camera Off' : 'Turn Camera On'}
              >
                {isVideoOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                <span className="hidden sm:inline">{isVideoOn ? 'Camera On' : 'Camera Off'}</span>
              </button>

              <button
                onClick={toggleScreenShare}
                className={`p-3.5 rounded-2xl transition cursor-pointer flex items-center gap-2 font-bold text-xs ${
                  isScreenSharing 
                    ? 'bg-emerald-600 text-white border border-emerald-500' 
                    : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
                }`}
                title="Share Screen"
              >
                <Monitor className="w-5 h-5 text-emerald-400" />
                <span className="hidden sm:inline">{isScreenSharing ? 'Stop Share' : 'Screen Share'}</span>
              </button>
            </div>
          </div>

          {/* RIGHT SIDEBAR: IN-MEETING REQUIREMENT LOGGING */}
          <div className="bg-slate-900 border-t lg:border-t-0 lg:border-l border-slate-800 p-5 flex flex-col justify-between space-y-4 overflow-y-auto">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-white font-bold text-xs uppercase tracking-wider pb-3 border-b border-slate-800">
                <FileText className="w-4 h-4 text-emerald-400" />
                <span>Log Project Requirements</span>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                Log key agreements discussed during this meeting. Anything submitted here is recorded directly into the Workstream thread and protected under <strong className="text-slate-200 font-semibold">Escrow Guarantee</strong>.
              </p>

              {/* LOGGED NOTES STREAM */}
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {loggedNotes.length === 0 ? (
                  <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl text-[11px] text-slate-500 text-center italic">
                    No notes logged yet during this meeting.
                  </div>
                ) : (
                  loggedNotes.map((note, idx) => (
                    <div key={idx} className="p-3 bg-emerald-950/40 border border-emerald-800/50 rounded-xl text-xs text-emerald-200 space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-emerald-400 font-bold uppercase">
                        <span>Logged Requirement #{idx + 1}</span>
                        <Check className="w-3 h-3 text-emerald-400" />
                      </div>
                      <p className="text-slate-200">{note}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* REQUIREMENT FORM */}
            <form onSubmit={handleLogRequirementSubmit} className="space-y-2.5 pt-4 border-t border-slate-800">
              <textarea
                value={meetingNote}
                onChange={(e) => setMeetingNote(e.target.value)}
                placeholder="Type agreed project requirement or task decision..."
                className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-2xl p-3 text-xs text-white placeholder-slate-500 resize-none focus:outline-none transition"
                rows={3}
              />
              <button
                type="submit"
                disabled={!meetingNote.trim()}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-sm"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Log to Workstream</span>
              </button>
            </form>
          </div>

        </div>

      </div>
    </div>
  );
};
