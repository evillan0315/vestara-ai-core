import { useRef, useState, useCallback } from 'react';

export interface AudioRecorderState {
  recording: boolean;
  duration: number;
  error: string | null;
  supported: boolean;
}

export function useAudioRecorder() {
  const [state, setState] = useState<AudioRecorderState>({
    recording: false,
    duration: 0,
    error: null,
    supported: typeof navigator !== 'undefined' && 'mediaDevices' in navigator,
  });

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTime = useRef(0);

  const startRecording = useCallback(async () => {
    if (!state.supported) {
      setState((s) => ({ ...s, error: 'Audio recording not supported in this browser' }));
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorder.current = recorder;
      chunks.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timer.current) {
          clearInterval(timer.current);
          timer.current = null;
        }
      };

      recorder.start(100);
      startTime.current = Date.now();
      timer.current = setInterval(() => {
        setState((s) => ({ ...s, duration: Date.now() - startTime.current }));
      }, 100);

      setState((s) => ({ ...s, recording: true, error: null, duration: 0 }));
    } catch {
      setState((s) => ({ ...s, error: 'Microphone access denied' }));
    }
  }, [state.supported]);

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorder.current;
      if (!recorder || recorder.state === 'inactive') {
        setState((s) => ({ ...s, recording: false }));
        resolve(null);
        return;
      }

      recorder.onstop = () => {
        const blob = new Blob(chunks.current, { type: 'audio/webm' });
        mediaRecorder.current = null;
        chunks.current = [];
        if (timer.current) {
          clearInterval(timer.current);
          timer.current = null;
        }
        setState((s) => ({ ...s, recording: false, duration: 0 }));
        resolve(blob);
      };

      recorder.stop();
    });
  }, []);

  return { state, startRecording, stopRecording };
}
