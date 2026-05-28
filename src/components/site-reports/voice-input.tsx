"use client";

/**
 * Phase 2.4 dev-01 — VoiceInput.
 *
 * Web Speech API wrapper. Used inside CaptureFlow's caption +
 * narration fields. Falls back to a "not supported" notice when
 * the browser lacks the API.
 */

import * as React from "react";

interface SpeechRecognitionLike {
  start: () => void;
  stop: () => void;
  abort: () => void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface VoiceInputProps {
  value: string;
  onChange: (next: string) => void;
  lang?: string;
  placeholder?: string;
  className?: string;
}

export function VoiceInput({ value, onChange, lang = "en-US", placeholder, className }: VoiceInputProps) {
  const Ctor = React.useMemo(getRecognitionCtor, []);
  const [listening, setListening] = React.useState(false);
  const recogRef = React.useRef<SpeechRecognitionLike | null>(null);

  React.useEffect(() => {
    return () => recogRef.current?.abort();
  }, []);

  function toggle() {
    if (!Ctor) return;
    if (listening) {
      recogRef.current?.stop();
      setListening(false);
      return;
    }
    const recog = new Ctor();
    recog.continuous = true;
    recog.interimResults = true;
    recog.lang = lang;
    recog.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      onChange(text.trim());
    };
    recog.onerror = () => setListening(false);
    recog.onend = () => setListening(false);
    recog.start();
    recogRef.current = recog;
    setListening(true);
  }

  return (
    <div className={`voice-input${className ? ` ${className}` : ""}`}>
      <textarea
        className="textarea"
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <button
        type="button"
        className={`vi-mic${listening ? " is-on" : ""}`}
        onClick={toggle}
        disabled={!Ctor}
        title={Ctor ? "Toggle dictation" : "Speech recognition not supported"}
      >
        {listening ? "● Listening" : "🎙 Dictate"}
      </button>
    </div>
  );
}
