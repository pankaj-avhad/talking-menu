// Microphone capture for the call page, on the audio thread. Averages the
// input down to 24 kHz, converts it to 16-bit PCM and posts 40 ms chunks,
// with their loudness for the level meter, to the page.

const TARGET_RATE = 24000
const CHUNK = 960 // 40 ms at 24 kHz

class MicCapture extends AudioWorkletProcessor {
  constructor() {
    super()
    // Input samples per output sample: 2 at 48 kHz, 1.8375 at 44.1 kHz.
    this.step = sampleRate / TARGET_RATE
    this.phase = 0
    this.sum = 0
    this.count = 0
    this.last = 0
    this.chunk = new Int16Array(CHUNK)
    this.filled = 0
    this.energy = 0
  }

  process(inputs) {
    const input = inputs[0] && inputs[0][0]
    if (!input) return true
    for (let i = 0; i < input.length; i++) {
      this.sum += input[i]
      this.count++
      this.phase += 1
      while (this.phase >= this.step) {
        this.phase -= this.step
        const value = this.count > 0 ? this.sum / this.count : this.last
        this.last = value
        this.sum = 0
        this.count = 0
        const sample = Math.max(-1, Math.min(1, value))
        this.chunk[this.filled++] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
        this.energy += sample * sample
        if (this.filled === CHUNK) {
          const level = Math.sqrt(this.energy / CHUNK)
          this.port.postMessage({ pcm: this.chunk.buffer, level }, [this.chunk.buffer])
          this.chunk = new Int16Array(CHUNK)
          this.filled = 0
          this.energy = 0
        }
      }
    }
    return true
  }
}

registerProcessor("mic-capture", MicCapture)
