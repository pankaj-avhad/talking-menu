// Plays the agent's voice on the call page, on the audio thread. Chunks of
// 24 kHz 16-bit PCM play in order, resampled to the output rate. Marks queued
// between chunks are echoed back once the audio before them has played, as
// Twilio does, so the relay knows what the caller has heard. "clear" drops
// everything queued and echoes the dropped marks.

const SOURCE_RATE = 24000

class PcmPlayer extends AudioWorkletProcessor {
  constructor() {
    super()
    /** @type {({ samples: Float32Array } | { mark: string })[]} */
    this.queue = []
    this.position = 0
    this.step = SOURCE_RATE / sampleRate
    this.playing = false
    this.port.onmessage = ({ data }) => {
      if (data.type === "audio") {
        const pcm = new Int16Array(data.pcm)
        const samples = new Float32Array(pcm.length)
        for (let i = 0; i < pcm.length; i++) samples[i] = pcm[i] / 0x8000
        this.queue.push({ samples })
      } else if (data.type === "mark") {
        this.queue.push({ mark: data.name })
      } else if (data.type === "clear") {
        const marks = this.queue.filter((q) => "mark" in q).map((q) => q.mark)
        this.queue = []
        this.position = 0
        this.port.postMessage({ type: "cleared", marks })
      }
    }
  }

  echoMarks() {
    while (this.queue.length > 0 && "mark" in this.queue[0]) {
      this.port.postMessage({ type: "mark", name: this.queue.shift().mark })
    }
  }

  process(_inputs, outputs) {
    const out = outputs[0][0]
    let played = false
    for (let i = 0; i < out.length; i++) {
      this.echoMarks()
      const head = this.queue[0]
      if (!head) {
        out[i] = 0
        continue
      }
      const index = Math.floor(this.position)
      const frac = this.position - index
      const a = head.samples[index]
      const b = index + 1 < head.samples.length ? head.samples[index + 1] : a
      out[i] = a + (b - a) * frac
      played = true
      this.position += this.step
      if (this.position >= head.samples.length) {
        this.position -= head.samples.length
        this.queue.shift()
      }
    }
    this.echoMarks()
    if (played !== this.playing) {
      this.playing = played
      this.port.postMessage({ type: "playing", playing: played })
    }
    return true
  }
}

registerProcessor("pcm-player", PcmPlayer)
