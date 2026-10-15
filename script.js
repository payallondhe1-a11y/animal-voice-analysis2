/* AnimalSound Lab
   Browser-side signal analysis: waveform, Hann-windowed radix-2 FFT,
   spectral peak, RMS, zero-crossing rate, and a theoretical RC low-pass response.
   IMPORTANT: this does not contain a trained animal-classification model. */

"use strict";

const $ = (id) => document.getElementById(id);

const upload = $("audioUpload");
const fileName = $("fileName");
const audioSection = $("audioSection");
const audioPlayer = $("audioPlayer");
const audioMetadata = $("audioMetadata");
const resultsSection = $("resultsSection");
const analyzeButton = $("analyzeButton");
const segmentSeconds = $("segmentSeconds");
const startSeconds = $("startSeconds");
const statusMessage = $("statusMessage");

let audioContext = null;
let audioBuffer = null;
let objectUrl = null;
let latestAnalysis = null;

upload.addEventListener("change", handleUpload);
analyzeButton.addEventListener("click", analyzeCurrentSegment);

window.addEventListener("resize", () => {
  if (latestAnalysis) {
    drawWaveform(
      latestAnalysis.segment,
      latestAnalysis.sampleRate,
      latestAnalysis.startTime
    );

    drawSpectrum(
      latestAnalysis.frequencies,
      latestAnalysis.magnitudes
    );
  }

  drawFilterResponse(Number($("cutoffSlider").value));
});

$("cutoffSlider").addEventListener("input", (event) => {
  const cutoff = Number(event.target.value);

  $("cutoffLabel").textContent = `${cutoff} Hz`;

  drawFilterResponse(cutoff);
});

drawFilterResponse(Number($("cutoffSlider").value));


async function handleUpload() {
  const file = upload.files && upload.files[0];

  if (!file) return;

  clearResults();

  fileName.textContent = `Selected: ${file.name}`;
  setStatus("Reading audio…");
  analyzeButton.disabled = true;

  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
  }

  objectUrl = URL.createObjectURL(file);
  audioPlayer.src = objectUrl;
  audioSection.classList.remove("hidden");

  try {
    const bytes = await file.arrayBuffer();

    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
      throw new Error(
        "This browser does not support the Web Audio API."
      );
    }

    if (!audioContext) {
      audioContext = new AudioContextClass();
    }

    audioBuffer = await audioContext.decodeAudioData(bytes.slice(0));

    if (!audioBuffer.length || !Number.isFinite(audioBuffer.duration)) {
      throw new Error(
        "The decoded audio file appears to be empty."
      );
    }

    const duration = audioBuffer.duration;

    $("durationResult").textContent = duration.toFixed(2);

    $("sampleRateResult").textContent =
      Math.round(audioBuffer.sampleRate).toLocaleString();

    audioMetadata.textContent =
      `${audioBuffer.numberOfChannels} channel(s) · ` +
      `${Math.round(audioBuffer.sampleRate).toLocaleString()} ` +
      `samples/second · ${duration.toFixed(2)} seconds`;

    startSeconds.max = Math.max(0, duration - 0.01).toFixed(2);
    startSeconds.value = "0";

    resultsSection.classList.remove("hidden");
    analyzeButton.disabled = false;

    setStatus(
      "Audio loaded. Choose a segment and select Analyze segment."
    );

    analyzeCurrentSegment();

  } catch (error) {
    console.error(error);

    audioBuffer = null;
    analyzeButton.disabled = true;

    setStatus(
      error.message ||
      "Could not decode this file. Try a standard WAV or MP3 recording.",
      true
    );
  }
}


function clearResults() {
  latestAnalysis = null;

  resultsSection.classList.add("hidden");

  $("frequencyResult").textContent = "—";
  $("rmsResult").textContent = "—";
  $("zcrResult").textContent = "—";
  $("peakResult").textContent = "—";
  $("samplesResult").textContent = "—";
}


function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error", isError);
}


function analyzeCurrentSegment() {
  if (!audioBuffer) return;

  try {
    const sampleRate = audioBuffer.sampleRate;

    const startTime = Math.max(
      0,
      Number(startSeconds.value) || 0
    );

    const requestedLength = Math.max(
      0.05,
      Number(segmentSeconds.value) || 0.5
    );

    if (startTime >= audioBuffer.duration) {
      throw new Error(
        "Start time must be before the end of the recording."
      );
    }

    const startIndex = Math.floor(startTime * sampleRate);

    const endIndex = Math.min(
      audioBuffer.length,
      startIndex + Math.floor(requestedLength * sampleRate)
    );

    if (endIndex - startIndex < 16) {
      throw new Error(
        "This segment is too short to analyze."
      );
    }

    // Combine all channels into a mono signal.
    const mono = new Float32Array(endIndex - startIndex);

    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      const channel = audioBuffer.getChannelData(ch);

      for (let i = startIndex; i < endIndex; i++) {
        mono[i - startIndex] +=
          channel[i] / audioBuffer.numberOfChannels;
      }
    }

    // Remove the mean (DC component).
    removeMean(mono);

    const rms = calculateRMS(mono);
    const peak = calculatePeak(mono);
    const zcr = calculateZCR(mono);

    const spectrum = performFFT(mono, sampleRate);

    const strongest = findStrongestPeak(
      spectrum.frequencies,
      spectrum.magnitudes,
      sampleRate / 2
    );

    latestAnalysis = {
      segment: mono,
      sampleRate,
      startTime,
      frequencies: spectrum.frequencies,
      magnitudes: spectrum.magnitudes
    };

    drawWaveform(mono, sampleRate, startTime);

    drawSpectrum(
      spectrum.frequencies,
      spectrum.magnitudes
    );

    $("rmsResult").textContent = rms.toFixed(4);
    $("peakResult").textContent = peak.toFixed(4);
    $("zcrResult").textContent = zcr.toFixed(4);
    $("samplesResult").textContent = mono.length.toLocaleString();

    $("frequencyResult").textContent =
      strongest.frequency > 0
        ? strongest.frequency.toFixed(1)
        : "No clear peak";

    setStatus(
      rms < 0.0005
        ? "Analysis complete, but this segment is extremely quiet. Try another segment or a clearer recording."
        : "Analysis complete. The peak is the strongest spectral component, not necessarily the animal's fundamental pitch."
    );

  } catch (error) {
    setStatus(
      error.message || "Unable to analyze this segment.",
      true
    );
  }
}


function removeMean(signal) {
  let mean = 0;

  for (let i = 0; i < signal.length; i++) {
    mean += signal[i];
  }

  mean /= signal.length || 1;

  for (let i = 0; i < signal.length; i++) {
    signal[i] -= mean;
  }
}


function calculateRMS(signal) {
  if (!signal.length) return 0;

  let sum = 0;

  for (const value of signal) {
    sum += value * value;
  }

  return Math.sqrt(sum / signal.length);
}


function calculatePeak(signal) {
  let peak = 0;

  for (const value of signal) {
    peak = Math.max(peak, Math.abs(value));
  }

  return peak;
}


function calculateZCR(signal) {
  if (signal.length < 2) return 0;

  let crossings = 0;

  for (let i = 1; i < signal.length; i++) {
    if (
      (signal[i] >= 0 && signal[i - 1] < 0) ||
      (signal[i] < 0 && signal[i - 1] >= 0)
    ) {
      crossings++;
    }
  }

  return crossings / (signal.length - 1);
}


// Radix-2 Cooley–Tukey FFT.
// Returns a single-sided magnitude spectrum.
function performFFT(signal, sampleRate) {
  let n = 1;

  while (n * 2 <= signal.length && n < 32768) {
    n *= 2;
  }

  if (n < 16) {
    throw new Error(
      "Need at least 16 samples for FFT analysis."
    );
  }

  // Use a centered portion of the selected audio window.
  const offset = Math.floor((signal.length - n) / 2);

  const real = new Float64Array(n);
  const imag = new Float64Array(n);

  // Apply a Hann window to reduce spectral leakage.
  for (let i = 0; i < n; i++) {
    const hann =
      0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));

    real[i] = signal[offset + i] * hann;
  }

  fftInPlace(real, imag);

  const bins = Math.floor(n / 2) + 1;

  const frequencies = new Float64Array(bins);
  const magnitudes = new Float64Array(bins);

  for (let k = 0; k < bins; k++) {
    frequencies[k] = (k * sampleRate) / n;

    magnitudes[k] = Math.hypot(real[k], imag[k]) / n;

    if (k > 0 && k < n / 2) {
      magnitudes[k] *= 2;
    }
  }

  return {
    frequencies,
    magnitudes
  };
}


function fftInPlace(real, imag) {
  const n = real.length;

  if ((n & (n - 1)) !== 0) {
    throw new Error(
      "FFT length must be a power of two."
    );
  }

  // Bit-reversal permutation.
  let j = 0;

  for (let i = 1; i < n; i++) {
    let bit = n >> 1;

    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }

    j ^= bit;

    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }

  // FFT butterfly calculations.
  for (let size = 2; size <= n; size *= 2) {
    const angle = (-2 * Math.PI) / size;

    const wStepR = Math.cos(angle);
    const wStepI = Math.sin(angle);

    for (let base = 0; base < n; base += size) {
      let wr = 1;
      let wi = 0;

      for (let k = 0; k < size / 2; k++) {
        const even = base + k;
        const odd = even + size / 2;

        const tr =
          wr * real[odd] - wi * imag[odd];

        const ti =
          wr * imag[odd] + wi * real[odd];

        real[odd] = real[even] - tr;
        imag[odd] = imag[even] - ti;

        real[even] += tr;
        imag[even] += ti;

        const nextWr = wr * wStepR - wi * wStepI;

        wi = wr * wStepI + wi * wStepR;
        wr = nextWr;
      }
    }
  }
}


function findStrongestPeak(
  frequencies,
  magnitudes,
  maxFrequency
) {
  let best = 1;

  const limit = Math.min(
    frequencies.length - 1,
    Math.floor(maxFrequency / (frequencies[1] || 1))
  );

  for (let i = 2; i <= limit; i++) {
    if (magnitudes[i] > magnitudes[best]) {
      best = i;
    }
  }

  if (best <= 0 || !Number.isFinite(magnitudes[best])) {
    return {
      frequency: 0,
      magnitude: 0
    };
  }

  // Parabolic interpolation improves the estimate between FFT bins.
  let delta = 0;

  if (best > 1 && best < magnitudes.length - 1) {
    const left = Math.log(magnitudes[best - 1] + 1e-12);
    const center = Math.log(magnitudes[best] + 1e-12);
    const right = Math.log(magnitudes[best + 1] + 1e-12);

    const denominator = left - 2 * center + right;

    if (Math.abs(denominator) > 1e-12) {
      delta = 0.5 * (left - right) / denominator;
    }

    delta = Math.max(-0.5, Math.min(0.5, delta));
  }

  return {
    frequency:
      (best + delta) * (frequencies[1] || 0),
    magnitude: magnitudes[best]
  };
}


function setupCanvas(canvas, height = 260) {
  const rect = canvas.getBoundingClientRect();

  const dpr = Math.max(
    1,
    window.devicePixelRatio || 1
  );

  const width = Math.max(
    300,
    Math.floor(rect.width)
  );

  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);

  const ctx = canvas.getContext("2d");

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  return {
    ctx,
    width,
    height
  };
}


function drawAxes(ctx, width, height, yLabel, xLabel) {
  const left = 52;
  const right = 18;
  const top = 20;
  const bottom = 38;

  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = "#fbfcff";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "#e4e9f1";
  ctx.lineWidth = 1;

  ctx.fillStyle = "#657086";
  ctx.font = "11px system-ui, sans-serif";

  for (let i = 0; i <= 4; i++) {
    const y =
      top + ((height - top - bottom) * i) / 4;

    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(width - right, y);
    ctx.stroke();
  }

  ctx.save();

  ctx.translate(15, height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.fillText(yLabel, 0, 0);

  ctx.restore();

  ctx.textAlign = "center";

  ctx.fillText(
    xLabel,
    (left + width - right) / 2,
    height - 9
  );

  return {
    left,
    right,
    top,
    bottom,
    plotW: width - left - right,
    plotH: height - top - bottom
  };
}


function drawWaveform(signal, sampleRate, startTime) {
  const {
    ctx,
    width,
    height
  } = setupCanvas($("waveformCanvas"));

  const a = drawAxes(
    ctx,
    width,
    height,
    "Amplitude",
    "Time (seconds)"
  );

  const maxAbs = Math.max(
    0.001,
    calculatePeak(signal)
  );

  const points = Math.min(
    Math.floor(a.plotW),
    signal.length
  );

  ctx.strokeStyle = "#6c63ff";
  ctx.lineWidth = 1.5;
  ctx.beginPath();

  for (let x = 0; x < points; x++) {
    const first = Math.floor(
      (x * signal.length) / points
    );

    const last = Math.max(
      first + 1,
      Math.floor(((x + 1) * signal.length) / points)
    );

    let min = 1;
    let max = -1;

    for (
      let i = first;
      i < Math.min(last, signal.length);
      i++
    ) {
      min = Math.min(min, signal[i]);
      max = Math.max(max, signal[i]);
    }

    const y1 =
      a.top + ((1 - max / maxAbs) * a.plotH) / 2;

    const y2 =
      a.top + ((1 - min / maxAbs) * a.plotH) / 2;

    const px = a.left + x;

    if (x === 0) {
      ctx.moveTo(px, y1);
    }

    ctx.lineTo(px, y2);
  }

  ctx.stroke();

  ctx.fillStyle = "#657086";
  ctx.font = "11px system-ui, sans-serif";
  ctx.textAlign = "left";

  ctx.fillText(
    `${startTime.toFixed(2)} s`,
    a.left,
    height - 23
  );

  ctx.textAlign = "right";

  ctx.fillText(
    `${(startTime + signal.length / sampleRate).toFixed(2)} s`,
    width - a.right,
    height - 23
  );
}


function drawSpectrum(frequencies, magnitudes) {
  const {
    ctx,
    width,
    height
  } = setupCanvas($("fftCanvas"));

  const a = drawAxes(
    ctx,
    width,
    height,
    "Relative magnitude",
    "Frequency (Hz)"
  );

  const maxFrequency = Math.min(
    10000,
    frequencies[frequencies.length - 1] || 0
  );

  const maxMagnitude = Math.max(
    1e-12,
    ...Array.from(magnitudes).filter(
      (_, i) => frequencies[i] <= maxFrequency
    )
  );

  const maxIndex = Math.max(
    1,
    Math.min(
      frequencies.length - 1,
      Math.floor(maxFrequency / (frequencies[1] || 1))
    )
  );

  ctx.strokeStyle = "#00a8cc";
  ctx.lineWidth = 1.5;
  ctx.beginPath();

  for (let i = 0; i <= maxIndex; i++) {
    const x =
      a.left + (frequencies[i] / maxFrequency) * a.plotW;

    const y =
      a.top + (1 - magnitudes[i] / maxMagnitude) * a.plotH;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();

  ctx.fillStyle = "#657086";
  ctx.font = "11px system-ui, sans-serif";
  ctx.textAlign = "center";

  for (let f = 0; f <= maxFrequency; f += maxFrequency / 5) {
    const x =
      a.left + (f / maxFrequency) * a.plotW;

    ctx.fillText(`${Math.round(f)}`, x, height - 23);
  }
}


function drawFilterResponse(cutoff) {
  const canvas = $("filterCanvas");

  if (!canvas) return;

  const {
    ctx,
    width,
    height
  } = setupCanvas(canvas, 250);

  const a = drawAxes(
    ctx,
    width,
    height,
    "Gain (dB)",
    "Frequency (Hz)"
  );

  const minDb = -40;

  ctx.strokeStyle = "#6c63ff";
  ctx.lineWidth = 2;
  ctx.beginPath();

  for (let i = 0; i <= a.plotW; i++) {
    const f = Math.max(
      1,
      (i / a.plotW) * 5000
    );

    const gain =
      20 * Math.log10(
        1 / Math.sqrt(1 + (f / cutoff) ** 2)
      );

    const clipped = Math.max(minDb, gain);

    const y =
      a.top +
      ((0 - clipped) / (0 - minDb)) * a.plotH;

    const x = a.left + i;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();

  const xCutoff =
    a.left + (cutoff / 5000) * a.plotW;

  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = "#d97706";

  ctx.beginPath();
  ctx.moveTo(xCutoff, a.top);
  ctx.lineTo(xCutoff, a.top + a.plotH);
  ctx.stroke();

  ctx.setLineDash([]);

  ctx.fillStyle = "#b45309";
  ctx.font = "11px system-ui, sans-serif";
  ctx.textAlign = "left";

  ctx.fillText(
    `fc = ${cutoff} Hz (about −3 dB)`,
    Math.min(xCutoff + 6, width - 160),
    a.top + 14
  );
}


window.addEventListener("beforeunload", () => {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
  }

  if (audioContext && audioContext.state !== "closed") {
    audioContext.close();
  }
});

console.log(
  "AnimalSound Lab ready: waveform + Hann-windowed FFT + RC low-pass response."
);
