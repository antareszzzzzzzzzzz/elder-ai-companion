/**
 * Speech Services — STT (語音辨識) + TTS (語音合成)
 * 移植自 elder-care-app，支援 AWS Transcribe WebSocket + Web Speech API fallback
 */

const STT_WS_URL = import.meta.env.VITE_STT_WS_URL || 'ws://localhost:8001/ws/transcribe';

// ============ STT (Speech-to-Text) ============

interface STTCallbacks {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (err: Error) => void;
}

class AWSTranscribeSTT {
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private recognition: any = null;
  private onPartial: ((text: string) => void) | null = null;
  private onFinal: ((text: string) => void) | null = null;
  private onError: ((err: Error) => void) | null = null;

  async start(callbacks: STTCallbacks) {
    await this.stop();
    this.onPartial = callbacks.onPartial;
    this.onFinal = callbacks.onFinal;
    this.onError = callbacks.onError;

    try {
      this.ws = new WebSocket(STT_WS_URL);

      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'fallback') {
          this.ws?.close();
          this._startFallback();
          return;
        }
        if (data.type === 'partial' && this.onPartial) {
          this.onPartial(data.transcript);
        }
        if (data.type === 'final' && this.onFinal) {
          this.onFinal(data.transcript);
        }
      };

      this.ws.onerror = () => {
        this._startFallback();
      };

      this.ws.onopen = async () => {
        await this._startAudioCapture();
      };
    } catch {
      this._startFallback();
    }
  }

  private async _startAudioCapture() {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });

      this.audioContext = new AudioContext({ sampleRate: 16000 });
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);

      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      this.processor.onaudioprocess = (e) => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          const inputData = e.inputBuffer.getChannelData(0);
          const pcm = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            const s = Math.max(-1, Math.min(1, inputData[i]));
            pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }
          this.ws.send(pcm.buffer);
        }
      };

      source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);
    } catch (err) {
      if (this.onError) this.onError(err as Error);
    }
  }

  private _startFallback() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      if (this.onError) this.onError(new Error('Speech recognition not supported'));
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.lang = 'zh-TW';
    this.recognition.interimResults = true;
    this.recognition.continuous = true;

    this.recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      if (interimTranscript && this.onPartial) this.onPartial(interimTranscript);
      if (finalTranscript && this.onFinal) this.onFinal(finalTranscript);
    };

    this.recognition.onerror = (event: any) => {
      if (event.error !== 'no-speech' && this.onError) {
        this.onError(new Error(event.error));
      }
    };

    this.recognition.start();
  }

  async stop() {
    if (this.recognition) {
      this.recognition.stop();
      this.recognition = null;
    }
    if (this.processor) {
      this.processor.disconnect();
      this.processor.onaudioprocess = null;
      this.processor = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.close();
    }
    this.audioContext = null;
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// ============ TTS (Text-to-Speech) ============

class TTSService {
  private audioElement = new Audio();

  /**
   * 播放語音：優先使用 Polly base64 音訊，fallback 到 Web Speech API
   */
  play(audioBase64: string | null | undefined, text: string) {
    if (audioBase64) {
      const audioUrl = `data:audio/mp3;base64,${audioBase64}`;
      this.audioElement.src = audioUrl;
      this.audioElement.play().catch(() => {
        this._fallbackSpeak(text);
      });
    } else {
      this._fallbackSpeak(text);
    }
  }

  private _fallbackSpeak(text: string) {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-TW';
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  }

  stop() {
    this.audioElement.pause();
    this.audioElement.currentTime = 0;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }
}

export const sttService = new AWSTranscribeSTT();
export const ttsService = new TTSService();
