const $ = (id) => document.getElementById(id);

let audioContext = null;
let audioBuffer = null;
let originalSamples = new Float32Array();
let filteredSamples = new Float32Array();
let sampleRate = 44100;
let duration = 0;
let mediaRecorder = null;
let recordedChunks = [];

// Initialize audio context
function getAudioContext() {
    if (!audioContext) {
        audioContext = new (
            window.AudioContext || window.webkitAudioContext
        )();
    }

    if (audioContext.state === "suspended") {
        audioContext.resume();
    }

    return audioContext;
}

// Display status messages
function setStatus(message) {
    $("status").textContent = message;
}

// Prepare canvas for drawing
function prepareCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.max(1, rect.width * dpr);
    canvas.height = Math.max(1, rect.height * dpr);

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = "#04132d";
    ctx.fillRect(0, 0, rect.width, rect.height);

    return {
        ctx,
        width: rect.width,
        height: rect.height
    };
}

// Draw graph axes and signal
function drawGraph(
    canvas,
    data,
    color,
    xLabel,
    yLabel,
    minY = -1,
    maxY = 1
) {
    const { ctx, width, height } = prepareCanvas(canvas);

    const left = 42;
    const right = 10;
    const top = 12;
    const bottom = 30;

    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;

    ctx.strokeStyle = "#17385f";
    ctx.fillStyle = "#b9d5fb";
    ctx.lineWidth = 1;
    ctx.font = "10px Arial";

    for (let i = 0; i <= 4; i++) {
        const x = left + (plotWidth * i) / 4;
        const y = top + (plotHeight * i) / 4;

        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, top + plotHeight);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(left + plotWidth, y);
        ctx.stroke();

        ctx.fillText(
            (maxY - ((maxY - minY) * i) / 4).toFixed(1),
            2,
            y + 3
        );
    }

    ctx.textAlign = "center";
    ctx.fillText(xLabel, left + plotWidth / 2, height - 5);

    ctx.save();
    ctx.translate(12, top + plotHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();

    if (!data || data.length < 2) return;

    ctx.beginPath();

    const step = Math.max(
        1,
        Math.floor(data.length / Math.max(1, plotWidth))
    );

    let started = false;

    for (let i = 0; i < data.length; i += step) {
        const x = left + (i / (data.length - 1)) * plotWidth;

        const value = Math.max(minY, Math.min(maxY, data[i]));

        const y =
            top + ((maxY - value) / (maxY - minY)) * plotHeight;

        if (!started) {
            ctx.moveTo(x, y);
            started = true;
        } else {
            ctx.lineTo(x, y);
        }
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.stroke();
}

// Reduce samples for faster plotting
function downsample(data, maxPoints = 1500) {
    if (!data.length) return [];

    const step = Math.max(1, Math.floor(data.length / maxPoints));
    const result = [];

    for (let i = 0; i < data.length; i += step) {
        result.push(data[i]);
    }

    return result;
}

// Calculate RMS, peak amplitude and zero crossings
function calculateFeatures(data) {
    let sumSquares = 0;
    let peak = 0;
    let crossings = 0;

    for (let i = 0; i < data.length; i++) {
        sumSquares += data[i] * data[i];
        peak = Math.max(peak, Math.abs(data[i]));

        if (
            i > 0 &&
            ((data[i] >= 0) !== (data[i - 1] >= 0))
        ) {
            crossings++;
        }
    }

    return {
        rms: Math.sqrt(sumSquares / Math.max(1, data.length)),
        peak,
        zcr: crossings / Math.max(duration, 0.001)
    };
}

// Plot original and filtered waveforms
function drawWaveforms() {
    drawGraph(
        $("wave"),
        downsample(originalSamples),
        "#168cff",
        "Time (s)",
        "Amplitude"
    );

    drawGraph(
        $("originalCompare"),
        downsample(originalSamples),
        "#168cff",
        "Time (s)",
        "Amplitude"
    );

    drawGraph(
        $("filteredCompare"),
        downsample(filteredSamples),
        "#12e6a4",
        "Time (s)",
        "Amplitude"
    );
}

// FFT: convert time-domain samples into frequency-domain magnitudes
function calculateFFT(data) {
    if (data.length < 32) return null;

    const n = Math.min(
        2048,
        2 ** Math.floor(Math.log2(data.length))
    );

    const start = Math.max(0, data.length - n);
    const samples = data.slice(start, start + n);
    const magnitudes = new Float32Array(n / 2);

    for (let k = 0; k < n / 2; k++) {
        let real = 0;
        let imaginary = 0;

        for (let i = 0; i < n; i++) {
            const windowValue =
                0.5 - 0.5 * Math.cos(
                    (2 * Math.PI * i) / (n - 1)
                );

            const value = samples[i] * windowValue;
            const angle = (2 * Math.PI * k * i) / n;

            real += value * Math.cos(angle);
            imaginary -= value * Math.sin(angle);
        }

        magnitudes[k] =
            Math.sqrt(real * real + imaginary * imaginary) / n;
    }

    let peakIndex = 1;

    for (let i = 2; i < magnitudes.length; i++) {
        if (magnitudes[i] > magnitudes[peakIndex]) {
            peakIndex = i;
        }
    }

    return {
        magnitudes,
        dominantFrequency: (peakIndex * sampleRate) / n
    };
}

// Display FFT spectrum
function drawFFT() {
    const result = calculateFFT(originalSamples);

    if (!result) {
        setStatus("Audio is too short for FFT analysis.");
        return;
    }

    $("dominant").textContent =
        Math.round(result.dominantFrequency) + " Hz";

    const magnitudes = Array.from(result.magnitudes);

    drawGraph(
        $("fft"),
        magnitudes,
        "#bd55ff",
        "Frequency bin",
        "Magnitude",
        0,
        Math.max(...magnitudes) * 1.1 || 1
    );
}

// Display an energy-based spectrogram
function drawSpectrogram(data) {
    const { ctx, width, height } = prepareCanvas(
        $("spectrogram")
    );

    if (!data.length) return;

    const left = 35;
    const top = 10;
    const plotWidth = width - 45;
    const plotHeight = height - 35;

    const columns = 180;
    const rows = 60;
    const columnSize = Math.max(
        1,
        Math.floor(data.length / columns)
    );

    for (let x = 0; x < columns; x++) {
        for (let y = 0; y < rows; y++) {
            const start =
                x * columnSize +
                Math.floor((y * columnSize) / rows);

            const value = Math.abs(data[start] || 0);
            const intensity = Math.min(1, value * 5);
            const hue = 240 - intensity * 240;

            ctx.fillStyle =
                `hsl(${hue}, 100%, ${15 + intensity * 45}%)`;

            ctx.fillRect(
                left + (x * plotWidth) / columns,
                top + plotHeight -
                    ((y + 1) * plotHeight) / rows,
                plotWidth / columns + 1,
                plotHeight / rows + 1
            );
        }
    }
}

// Draw theoretical first-order filter response
function drawFilterResponse() {
    const cutoff = Number($("cutoff").value);
    const type = $("filterType").value;

    $("cutoffValue").textContent = cutoff + " Hz";
    $("fcText").textContent =
        "Cutoff Frequency: " + cutoff + " Hz";

    const response = [];

    for (let i = 0; i < 200; i++) {
        const frequency = 20 * Math.pow(1000, i / 199);
        let gain;

        if (type === "lowpass") {
            gain = 1 / Math.sqrt(
                1 + Math.pow(frequency / cutoff, 2)
            );
        } else if (type === "highpass") {
            const ratio = frequency / cutoff;

            gain = ratio / Math.sqrt(1 + ratio * ratio);
        } else {
            const ratio = frequency / cutoff;

            gain = ratio / Math.sqrt(
                (1 + ratio * ratio) *
                (1 + 1 / (ratio * ratio))
            ) * 2;
        }

        response.push(Math.min(1, gain));
    }

    drawGraph(
        $("response"),
        response,
        "#168cff",
        "Frequency bins",
        "Gain",
        0,
        1
    );
}

// Apply a digital audio filter
async function applyFilter() {
    if (!audioBuffer) return;

    const offline = new OfflineAudioContext(
        audioBuffer.numberOfChannels,
        audioBuffer.length,
        audioBuffer.sampleRate
    );

    const source = offline.createBufferSource();
    const filter = offline.createBiquadFilter();

    source.buffer = audioBuffer;
    filter.type = $("filterType").value;

    filter.frequency.value = Math.min(
        Number($("cutoff").value),
        audioBuffer.sampleRate / 2 - 1
    );

    filter.Q.value = 0.707;

    source.connect(filter);
    filter.connect(offline.destination);
    source.start();

    const filteredBuffer = await offline.startRendering();

    filteredSamples = new Float32Array(
        filteredBuffer.getChannelData(0)
    );

    drawWaveforms();
}

// Analyze uploaded or recorded audio
async function analyzeAudio() {
    if (!audioBuffer) {
        setStatus("Upload or record an audio file first.");
        return;
    }

    setStatus("Analyzing audio...");

    sampleRate = audioBuffer.sampleRate;
    duration = audioBuffer.duration;

    originalSamples = new Float32Array(
        audioBuffer.getChannelData(0)
    );

    const features = calculateFeatures(originalSamples);

    $("duration").textContent = duration.toFixed(2) + " s";
    $("rms").textContent = features.rms.toFixed(3);
    $("peak").textContent = features.peak.toFixed(3);
    $("zcr").textContent = Math.round(features.zcr) + " /s";

    $("fileMeta").textContent =
        "Duration: " + duration.toFixed(2) +
        " s | Sample Rate: " + sampleRate + " Hz";

    drawWaveforms();
    drawFFT();
    drawSpectrogram(originalSamples);
    drawFilterResponse();

    await applyFilter();

    $("animalName").textContent = "Model Not Connected";

    $("predictionNote").textContent =
        "A trained animal classification model is required.";

    $("confidence").textContent =
        "No AI prediction available.";

    setStatus("Analysis complete.");
}

// Upload audio file
$("audioFile").addEventListener("change", async (event) => {
    const file = event.target.files[0];

    if (!file) return;

    try {
        setStatus("Loading audio...");

        audioBuffer = await getAudioContext().decodeAudioData(
            await file.arrayBuffer()
        );

        $("fileName").textContent = file.name;

        await analyzeAudio();
    } catch (error) {
        console.error(error);
        setStatus("Unable to read this file. Try WAV or MP3.");
    }
});

// Analyze button
$("analyzeBtn").addEventListener("click", analyzeAudio);

// Update filter response and filtered signal
$("cutoff").addEventListener("input", async () => {
    drawFilterResponse();

    if (audioBuffer) {
        await applyFilter();
    }
});

$("filterType").addEventListener("change", async () => {
    drawFilterResponse();

    if (audioBuffer) {
        await applyFilter();
    }
});

// Play original audio
$("playOriginal").addEventListener("click", () => {
    if (!audioBuffer) {
        setStatus("Upload audio first.");
        return;
    }

    const source = getAudioContext().createBufferSource();

    source.buffer = audioBuffer;
    source.connect(getAudioContext().destination);
    source.start();
});

// Play filtered audio
$("playFiltered").addEventListener("click", async () => {
    if (!audioBuffer) {
        setStatus("Upload audio first.");
        return;
    }

    await applyFilter();

    const buffer = getAudioContext().createBuffer(
        1,
        filteredSamples.length,
        sampleRate
    );

    buffer.copyToChannel(filteredSamples, 0);

    const source = getAudioContext().createBufferSource();

    source.buffer = buffer;
    source.connect(getAudioContext().destination);
    source.start();
});

// Record audio from microphone
$("recordBtn").addEventListener("click", async () => {
    try {
        const stream =
            await navigator.mediaDevices.getUserMedia({
                audio: true
            });

        recordedChunks = [];

        mediaRecorder = new MediaRecorder(stream);

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = async () => {
            try {
                const blob = new Blob(recordedChunks, {
                    type: mediaRecorder.mimeType
                });

                audioBuffer =
                    await getAudioContext().decodeAudioData(
                        await blob.arrayBuffer()
                    );

                $("fileName").textContent =
                    "Microphone Recording";

                await analyzeAudio();
            } catch (error) {
                console.error(error);

                setStatus(
                    "Recording could not be decoded. Try uploading WAV."
                );
            }

            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();

        $("recordBtn").disabled = true;
        $("stopBtn").disabled = false;

        setStatus("Recording...");

    } catch (error) {
        setStatus(
            "Allow microphone access and use HTTPS or localhost."
        );
    }
});

// Stop microphone recording
$("stopBtn").addEventListener("click", () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();

        $("recordBtn").disabled = false;
        $("stopBtn").disabled = true;
    }
});

// Animal reference buttons
document.querySelectorAll(".samples button").forEach(button => {
    button.addEventListener("click", () => {
        $("animalName").textContent = button.dataset.animal;

        $("predictionNote").textContent =
            "Manual reference selection, not an AI prediction.";

        $("confidence").textContent =
            "Confidence: Not available";
    });
});

// Navigation tabs
document.querySelectorAll(".tabs button").forEach(button => {
    button.addEventListener("click", () => {
        document.querySelectorAll(".tabs button").forEach(item => {
            item.classList.remove("active");
        });

        button.classList.add("active");

        document
            .getElementById(button.dataset.target)
            .scrollIntoView({
                behavior: "smooth",
                block: "center"
            });
    });
});

// Redraw charts when screen size changes
window.addEventListener("resize", () => {
    if (audioBuffer) {
        drawWaveforms();
        drawFFT();
        drawSpectrogram(originalSamples);
    }

    drawFilterResponse();
});

// Initial filter graph
drawFilterResponse();
